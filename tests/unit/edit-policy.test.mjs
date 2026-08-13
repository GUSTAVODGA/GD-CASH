// _movementEditPolicy — fonte única de "o que o formulário genérico pode mudar".
//
// A regra de produto é: a mesma operação não é mantida em dois lugares à mão.
// Um pagamento de dívida guarda o valor DUAS vezes (na despesa e no marcador
// `debtPayments`, que é o lido por `_debtPagoCents`); uma venda de patrimônio
// depende de `platformId: null` para ficar fora da receita operacional. Editar
// esses campos por um formulário genérico muda um lado só.
//
// O que estes testes protegem:
//
//   1. origem estrutural (debt, asset-sale) é reconhecida e travada;
//   2. baixa de gasto fixo NÃO é travada — o marcador não copia valor e o
//      fluxo já sincroniza ciclo/data;
//   3. lançamento manual (receita, gasto, aquisição) segue totalmente editável;
//   4. a política diz para onde mandar o usuário, sem espalhar `if (meta.source)`.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

const AGORA = '2026-06-15T12:00:00';

function cenario() {
  const carregado = carregarApp({ agora: AGORA });
  carregado.app.D = baseVazia();
  return carregado;
}

const despesaDivida = (extra = {}) => ({
  id: 'exp-div', date: '2026-06-15', amount: 200, category: 'Dívidas',
  description: 'Parcela Teste', meta: { source: 'debt', debtId: 'divida-x', parcelNo: 1, ...extra },
});
const despesaFixo = () => ({
  id: 'exp-fix', date: '2026-06-10', amount: 99.9, category: 'Contas',
  description: 'Internet Teste', meta: { source: 'fixed-payment', fixedId: 'fixo-x', cycle: '2026-06' },
});
const vendaVeiculo = () => ({
  id: 'inc-venda', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null,
  note: 'Venda de Veículo Teste', meta: { source: 'asset-sale', saleId: 'sale-1', vehicleId: 'veh-teste' },
});
const gastoManual = () => ({ id: 'exp-man', date: '2026-06-14', amount: 45, category: 'Alimentação', description: 'Mercado Teste' });
const aquisicaoManual = () => ({
  id: 'exp-aq', date: '2026-06-14', amount: 8000, category: 'Outros', description: 'Compra Bem Teste',
  patrimonioId: 'pat-teste', meta: { nature: 'asset-acquisition' },
});
const receitaManual = () => ({ id: 'inc-man', date: '2026-06-14', amount: 250, status: 'paid', platformId: 'p1', note: 'Corrida Teste' });

// ── Origem estrutural travada ─────────────────────────────────────────────

test('pagamento de dívida: nada que mude a verdade financeira é editável', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(despesaDivida());
  assert.equal(p.origemEstrutural, 'debt');
  assert.equal(p.podeEditarValor, false);
  assert.equal(p.podeEditarData, false);
  assert.equal(p.podeEditarTipo, false);
  assert.equal(p.podeEditarNatureza, false);
  assert.equal(p.podeEditarVinculo, false);
  assert.equal(p.podeEditarPlataforma, false);
});

test('pagamento de dívida aponta para o detalhe da própria dívida', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(despesaDivida());
  mesmoConteudo({ tipo: p.destinoCanonico.tipo, id: p.destinoCanonico.id }, { tipo: 'divida', id: 'divida-x' });
  assert.equal(p.titulo, 'Pagamento de dívida');
  assert.match(p.explicacao, /controlados pela dívida/);
  assert.equal(p.ctaLabel, 'Abrir dívida');
});

test('venda de patrimônio: entrada travada, incluindo a plataforma', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(vendaVeiculo());
  assert.equal(p.origemEstrutural, 'asset-sale');
  assert.equal(p.podeEditarPlataforma, false, 'a venda poderia virar receita operacional');
  assert.equal(p.podeEditarValor, false);
  assert.equal(p.podeEditarData, false);
  assert.equal(p.podeEditarTipo, false);
  assert.equal(p.podeEditarNatureza, false);
  assert.equal(p.titulo, 'Venda de patrimônio');
  assert.equal(p.ctaLabel, 'Abrir patrimônio');
});

test('venda aponta para o veículo ou para o patrimônio, conforme o vínculo', () => {
  const { ctx } = cenario();
  const veic = ctx._movementEditPolicy(vendaVeiculo());
  mesmoConteudo({ tipo: veic.destinoCanonico.tipo, id: veic.destinoCanonico.id }, { tipo: 'veiculo', id: 'veh-teste' });

  const bem = ctx._movementEditPolicy({
    ...vendaVeiculo(), meta: { source: 'asset-sale', saleId: 'sale-2', patrimonioId: 'pat-teste' },
  });
  mesmoConteudo({ tipo: bem.destinoCanonico.tipo, id: bem.destinoCanonico.id }, { tipo: 'patrimonio', id: 'pat-teste' });
});

test('venda sem vínculo continua travada, só sem destino', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy({ ...vendaVeiculo(), meta: { source: 'asset-sale', saleId: 'sale-3' } });
  assert.equal(p.origemEstrutural, 'asset-sale');
  assert.equal(p.destinoCanonico, null);
});

// ── O que NÃO é travado ───────────────────────────────────────────────────

test('baixa de gasto fixo continua editável — o marcador não copia valor', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(despesaFixo());
  assert.equal(p.origemEstrutural, null);
  assert.equal(p.podeEditarValor, true);
  assert.equal(p.podeEditarData, true);
  assert.equal(ctx._edicaoSomenteLeitura(despesaFixo()), false);
});

test('gasto manual segue totalmente editável', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(gastoManual());
  assert.equal(p.origemEstrutural, null);
  assert.equal(p.podeEditarValor, true);
  assert.equal(p.podeEditarNatureza, true);
});

test('aquisição manual não regride: continua editável', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(aquisicaoManual());
  assert.equal(p.origemEstrutural, null, 'meta.nature não é origem estrutural');
  assert.equal(p.podeEditarValor, true);
  assert.equal(p.podeEditarVinculo, true);
});

test('receita operacional segue editável', () => {
  const { ctx } = cenario();
  const p = ctx._movementEditPolicy(receitaManual());
  assert.equal(p.origemEstrutural, null);
  assert.equal(p.podeEditarPlataforma, true);
});

// ── Robustez ──────────────────────────────────────────────────────────────

test('entrada inválida cai na política livre, sem estourar', () => {
  const { ctx } = cenario();
  [undefined, null, 'x', 42, {}].forEach(v => {
    assert.equal(ctx._movementEditPolicy(v).origemEstrutural, null);
    assert.equal(ctx._edicaoSomenteLeitura(v), false);
  });
});

test('meta sem source não trava nada', () => {
  const { ctx } = cenario();
  assert.equal(ctx._movementEditPolicy({ id: 'x', amount: 10, meta: { debtId: 'd' } }).origemEstrutural, null);
});

test('INVARIANTE: consultar a política não altera o lançamento', () => {
  const { ctx } = cenario();
  const item = despesaDivida();
  const antes = JSON.stringify(item);
  ctx._movementEditPolicy(item);
  ctx._edicaoSomenteLeitura(item);
  assert.equal(JSON.stringify(item), antes);
});

test('INVARIANTE: consultar a política não escreve em D', () => {
  const { ctx, app } = cenario();
  app.D.expenses.push(despesaDivida());
  app.D.incomeItems.push(vendaVeiculo());
  const antes = JSON.stringify(app.D);
  ctx._movementEditPolicy(app.D.expenses[0]);
  ctx._movementEditPolicy(app.D.incomeItems[0]);
  assert.equal(JSON.stringify(app.D), antes);
});

test('a política é a mesma para o mesmo registro, venha de onde vier', () => {
  const { ctx } = cenario();
  const item = despesaDivida();
  const a = ctx._movementEditPolicy(item);
  const b = ctx._movementEditPolicy(item);
  mesmoConteudo(
    { v: a.podeEditarValor, d: a.podeEditarData, o: a.origemEstrutural },
    { v: b.podeEditarValor, d: b.podeEditarData, o: b.origemEstrutural },
  );
});
