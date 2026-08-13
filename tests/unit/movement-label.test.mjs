// _movementTypeLabel — rótulo humano do TIPO de uma movimentação.
//
// Só apresentação: Recentes e Pesquisa deixam de chamar toda saída de "Gasto"
// enquanto o resto do app já separa consumo de dívida e de aquisição. O rótulo
// deriva de `_movementNature` e da metadata estrutural que já existe — não é
// uma segunda classificação financeira.
//
// O que estes testes protegem:
//
//   1. os seis rótulos combinados do produto;
//   2. a origem estrutural vence o override manual (dívida não vira aquisição);
//   3. `fixed-payment` continua CONSUMO para o motor, mas diz "Gasto fixo" na
//      lista — é a origem que muda, não a natureza;
//   4. rotular não altera o lançamento nem D.
import test from 'node:test';
import { assert } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

const AGORA = '2026-06-15T12:00:00';

function cenario() {
  const carregado = carregarApp({ agora: AGORA });
  carregado.app.D = baseVazia();
  return carregado;
}

const gastoManual = () => ({ id: 'e1', date: '2026-06-14', amount: 45, category: 'Alimentação', description: 'Mercado Teste' });
const pagamentoDivida = () => ({ id: 'e2', date: '2026-06-15', amount: 200, category: 'Dívidas', description: 'Parcela Teste', meta: { source: 'debt', debtId: 'd1', parcelNo: 1 } });
const baixaFixo = () => ({ id: 'e3', date: '2026-06-10', amount: 99.9, category: 'Contas', description: 'Internet Teste', meta: { source: 'fixed-payment', fixedId: 'f1', cycle: '2026-06' } });
const aquisicao = () => ({ id: 'e4', date: '2026-06-14', amount: 8000, category: 'Outros', description: 'Compra Bem Teste', patrimonioId: 'p1', meta: { nature: 'asset-acquisition' } });
const receitaOperacional = () => ({ id: 'i1', date: '2026-06-14', amount: 250, status: 'paid', platformId: 'p1', note: 'Corrida Teste' });
const vendaBem = () => ({ id: 'i2', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda de Veículo Teste', meta: { source: 'asset-sale', saleId: 's1', vehicleId: 'v1' } });

// ── Os seis rótulos combinados ────────────────────────────────────────────

test('gasto manual → "Gasto"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(gastoManual()), 'Gasto');
});

test('pagamento de dívida → "Pagamento de dívida"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(pagamentoDivida()), 'Pagamento de dívida');
});

test('baixa de gasto fixo → "Gasto fixo"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(baixaFixo()), 'Gasto fixo');
});

test('aquisição de patrimônio → "Aquisição de patrimônio"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(aquisicao()), 'Aquisição de patrimônio');
});

test('receita operacional → "Receita"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(receitaOperacional()), 'Receita');
});

test('venda de patrimônio → "Venda de patrimônio"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(vendaBem()), 'Venda de patrimônio');
});

// ── Coerência com o motor ─────────────────────────────────────────────────

test('o rótulo do fixo muda, mas a natureza continua consumo', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel(baixaFixo()), 'Gasto fixo');
  assert.equal(ctx._movementNature(baixaFixo()), 'consumo', 'o motor mudou de opinião');
});

test('origem estrutural vence override: dívida marcada como aquisição continua dívida', () => {
  const { ctx } = cenario();
  const e = { ...pagamentoDivida(), meta: { source: 'debt', debtId: 'd1', nature: 'asset-acquisition' } };
  assert.equal(ctx._movementTypeLabel(e), 'Pagamento de dívida');
  assert.equal(ctx._movementNature(e), 'debt-payment');
});

test('venda com plataforma cravada por engano ainda é venda', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel({ ...vendaBem(), platformId: 'p1' }), 'Venda de patrimônio');
});

test('movimento de reserva não vira "Gasto"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel({ type: 'dep', amount: 100 }), 'Reserva');
  assert.equal(ctx._movementTypeLabel({ type: 'ret', amount: 100 }), 'Reserva');
});

// ── Robustez e pureza ─────────────────────────────────────────────────────

test('entrada inválida cai no rótulo neutro, sem estourar', () => {
  const { ctx } = cenario();
  [undefined, null, 'x', 42].forEach(v => assert.equal(ctx._movementTypeLabel(v), 'Gasto'));
});

test('despesa sem meta e sem categoria continua "Gasto"', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementTypeLabel({ id: 'x', amount: 10, date: '2026-06-01' }), 'Gasto');
});

test('INVARIANTE: rotular não altera o lançamento', () => {
  const { ctx } = cenario();
  const item = pagamentoDivida();
  const antes = JSON.stringify(item);
  ctx._movementTypeLabel(item);
  assert.equal(JSON.stringify(item), antes);
});

test('INVARIANTE: rotular não escreve em D', () => {
  const { ctx, app } = cenario();
  app.D.expenses.push(gastoManual(), pagamentoDivida(), baixaFixo(), aquisicao());
  app.D.incomeItems.push(receitaOperacional(), vendaBem());
  const antes = JSON.stringify(app.D);
  app.D.expenses.forEach(e => ctx._movementTypeLabel(e));
  app.D.incomeItems.forEach(i => ctx._movementTypeLabel(i));
  assert.equal(JSON.stringify(app.D), antes);
});

test('INVARIANTE: rotular não muda nenhum agregado do mês', () => {
  const { ctx, app } = cenario();
  app.D.expenses.push(gastoManual(), pagamentoDivida(), baixaFixo(), aquisicao());
  app.D.incomeItems.push(receitaOperacional(), vendaBem());
  const antes = JSON.stringify(ctx._monthMovementSummary(0));
  app.D.expenses.forEach(e => ctx._movementTypeLabel(e));
  app.D.incomeItems.forEach(i => ctx._movementTypeLabel(i));
  assert.equal(JSON.stringify(ctx._monthMovementSummary(0)), antes);
});
