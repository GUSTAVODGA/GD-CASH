// Pendência ⇄ despesa: a relação sobrevive.
//
// Assimetria corrigida aqui: dívida grava `meta.source='debt'` + `debtPayment`,
// gasto fixo grava `meta.source='fixed-payment'` + `fixedPayment`, e a
// pendência não gravava nada. Concluir com "Registrar gasto" criava uma
// despesa manual comum: apagar essa despesa depois deixava a pendência
// concluída para sempre, sem lastro nenhum, e o app não sabia mais que as duas
// coisas eram a mesma.
//
// Modelo (sem coleção nova — a pendência tem no máximo uma despesa):
//
//   despesa    meta.source='pendencia', meta.pendenciaId=<id>
//   pendência  despesaId=<id da despesa>
//
// A natureza continua CONSUMO: `source` diz de onde veio, não o que é.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

const AGORA = '2026-06-15T12:00:00';

const PENDENCIA = () => ({
  id: 'pend-1', title: 'Pendência Teste', category: 'Casa', status: 'concluida',
  estimatedValue: 150, deadline: '2026-06-20', completedAt: '2026-06-15',
});
const DESPESA = () => ({
  id: 'exp-1', date: '2026-06-15', amount: 150, category: 'Casa',
  description: 'Pendência Teste', meta: { source: 'pendencia', pendenciaId: 'pend-1' },
});

/** Cenário já vinculado: pendência concluída + despesa que a lastreia. */
function vinculado() {
  const carregado = carregarApp({ agora: AGORA });
  const D = baseVazia();
  const p = PENDENCIA(); p.despesaId = 'exp-1';
  D.pendencias = [p];
  D.expenses = [DESPESA()];
  carregado.app.D = D;
  return carregado;
}

const pend = app => app.D.pendencias[0];

// ══ NATUREZA E RÓTULO ════════════════════════════════════════════════════

test('despesa de pendência continua sendo consumo', () => {
  const { ctx } = vinculado();
  assert.equal(ctx._movementNature(DESPESA()), 'consumo');
});

test('o rótulo nomeia a origem sem criar natureza nova', () => {
  const { ctx } = vinculado();
  assert.equal(ctx._movementTypeLabel(DESPESA()), 'Gasto de pendência');
});

test('a despesa de pendência entra no caixa e no consumo como qualquer gasto', () => {
  const { ctx, app } = vinculado();
  const res = ctx._monthMovementSummary(0);
  assert.equal(res.totalCashOut, 150);
  assert.equal(res.consumo, 150);
  assert.equal(res.debtPayments, 0);
  assert.equal(res.assetAcquisition, 0);

  // Idêntico ao equivalente manual: só o `meta` difere.
  const manual = carregarApp({ agora: AGORA });
  const D = baseVazia();
  D.expenses = [{ id: 'exp-1', date: '2026-06-15', amount: 150, category: 'Casa', description: 'Pendência Teste' }];
  manual.app.D = D;
  assert.equal(JSON.stringify(manual.ctx._monthMovementSummary(0)), JSON.stringify(res));
  assert.ok(app.D.pendencias.length === 1);
});

// ── PRECEDÊNCIA DA ORIGEM ────────────────────────────────────────────────
// `source='pendencia'` é origem canônica como 'debt' e 'fixed-payment':
// enquanto o vínculo existir, nenhum override manual muda a natureza.

test('override manual não transforma gasto de pendência em aquisição', () => {
  const { ctx } = vinculado();
  const e = { ...DESPESA(), patrimonioId: 'pat-1', meta: { source: 'pendencia', pendenciaId: 'pend-1', nature: 'asset-acquisition' } };
  assert.equal(ctx._movementNature(e), 'consumo', 'o override venceu a origem');
});

test('nenhum override, válido ou inválido, vence a origem pendência', () => {
  const { ctx } = vinculado();
  ['asset-acquisition', 'debt-payment', 'income-extra', 'transfer', 'xpto', '', null, 42].forEach(n => {
    const e = { ...DESPESA(), meta: { source: 'pendencia', pendenciaId: 'pend-1', nature: n } };
    assert.equal(ctx._movementNature(e), 'consumo', `nature=${JSON.stringify(n)} venceu a origem`);
  });
});

test('a origem pendência tem a mesma precedência estrutural do gasto fixo', () => {
  const { ctx } = vinculado();
  const comOverride = src => ctx._movementNature({ ...DESPESA(), meta: { source: src, nature: 'asset-acquisition' } });
  assert.equal(comOverride('pendencia'), 'consumo');
  assert.equal(comOverride('fixed-payment'), 'consumo');
});

test('o formulário não oferece reclassificação para despesa de pendência', () => {
  const { ctx } = vinculado();
  assert.equal(ctx._expIsReclassificavel(DESPESA()), false);
  // Mesmo tratamento das outras origens canônicas; gasto manual segue livre.
  assert.equal(ctx._expIsReclassificavel({ ...DESPESA(), meta: { source: 'fixed-payment' } }), false);
  assert.equal(ctx._expIsReclassificavel({ id: 'x', amount: 10, date: '2026-06-01' }), true);
});

test('proteger a natureza não vira painel somente leitura', () => {
  // Dívida e venda têm outro registro canônico e por isso são apresentadas.
  // A pendência não tem: o lançamento continua editável e excluível.
  const { ctx } = vinculado();
  assert.equal(ctx._movementEditPolicy(DESPESA()).origemEstrutural, null);
  assert.equal(ctx._edicaoSomenteLeitura(DESPESA()), false);
});


// ══ RECONCILIAÇÃO: EXCLUIR A DESPESA ═════════════════════════════════════

test('excluir a despesa reabre a pendência', () => {
  const { ctx, app } = vinculado();
  app.D.expenses = [];
  assert.equal(ctx.reconcilePendencias(), true);
  assert.equal(pend(app).status, 'aberta');
  assert.equal(pend(app).despesaId, undefined);
  assert.equal(pend(app).completedAt, undefined);
});

test('a pendência reaberta volta aos compromissos em aberto', () => {
  const { ctx, app } = vinculado();
  assert.equal(ctx._obrigacoesEmAberto().filter(o => o.origem === 'pendencia').length, 0);
  app.D.expenses = [];
  ctx.reconcilePendencias();
  const obr = ctx._obrigacoesEmAberto().filter(o => o.origem === 'pendencia');
  assert.equal(obr.length, 1, 'não voltou, ou voltou duplicada');
  assert.equal(obr[0].id, 'pend-1');
  assert.equal(obr[0].valorSugerido, 150);
});

test('pendência reaberta sem valor estimado não vira compromisso', () => {
  const { ctx, app } = vinculado();
  pend(app).estimatedValue = 0;
  app.D.expenses = [];
  ctx.reconcilePendencias();
  assert.equal(pend(app).status, 'aberta');
  assert.equal(ctx._obrigacoesEmAberto().filter(o => o.origem === 'pendencia').length, 0);
});

test('reconciliar é idempotente: rodar duas vezes não muda mais nada', () => {
  const { ctx, app } = vinculado();
  app.D.expenses = [];
  assert.equal(ctx.reconcilePendencias(), true);
  const depoisDaPrimeira = JSON.stringify(app.D);
  assert.equal(ctx.reconcilePendencias(), false);
  assert.equal(JSON.stringify(app.D), depoisDaPrimeira);
});

test('com a despesa viva, reconciliar não toca em nada', () => {
  const { ctx, app } = vinculado();
  const antes = JSON.stringify(app.D);
  assert.equal(ctx.reconcilePendencias(), false);
  assert.equal(JSON.stringify(app.D), antes);
  assert.equal(pend(app).status, 'concluida');
});

test('o reconciliador NUNCA apaga dinheiro', () => {
  const { ctx, app } = vinculado();
  app.D.pendencias = [];               // pendência sumiu; a despesa continua
  ctx.reconcilePendencias();
  assert.equal(app.D.expenses.length, 1, 'o reconciliador removeu uma despesa');
  assert.equal(app.D.expenses[0].amount, 150);
});

test('reconciliar não mexe em dívida, fixo nem patrimônio', () => {
  const { ctx, app } = vinculado();
  app.D.debts = [{ id: 'd1', tipo: 'emprestimo', titulo: 'T', valorOriginal: 1000, valorParcela: 100, parcelasTotal: 10, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' }];
  app.D.debtPayments = [{ id: 'p1', debtId: 'd1', expenseId: 'exp-d', valor: 100, data: '2026-02-10' }];
  app.D.fixedPayments = [{ fixedId: 'f1', cycle: '2026-06', expenseId: 'exp-f', paidDate: '2026-06-10' }];
  const antesDebt = JSON.stringify(app.D.debtPayments);
  const antesFixo = JSON.stringify(app.D.fixedPayments);
  app.D.expenses = [];
  ctx.reconcilePendencias();
  assert.equal(JSON.stringify(app.D.debtPayments), antesDebt);
  assert.equal(JSON.stringify(app.D.fixedPayments), antesFixo);
  assert.equal(ctx._debtSaldo(app.D.debts[0]), 900);
});

// ══ INVARIANTES ══════════════════════════════════════════════════════════

test('INVARIANTE: uma pendência tem no máximo uma despesa vinculada', () => {
  const { app } = vinculado();
  const ligadas = app.D.expenses.filter(e => e.meta && e.meta.source === 'pendencia' && e.meta.pendenciaId === 'pend-1');
  assert.equal(ligadas.length, 1);
  assert.equal(typeof pend(app).despesaId, 'string');
});

test('INVARIANTE: o vínculo aponta para os dois lados', () => {
  const { app } = vinculado();
  const e = app.D.expenses[0];
  assert.equal(e.meta.pendenciaId, pend(app).id);
  assert.equal(pend(app).despesaId, e.id);
});

test('INVARIANTE: nenhum marcador de dívida ou fixo é criado pelo fluxo', () => {
  const { app } = vinculado();
  assert.equal(app.D.debtPayments.length, 0);
  assert.equal(app.D.fixedPayments.length, 0);
});

test('INVARIANTE: pendência concluída com despesa viva nunca fica órfã', () => {
  const { ctx, app } = vinculado();
  ctx.reconcilePendencias();
  app.D.pendencias.forEach(p => {
    if (p.status === 'concluida' && p.despesaId) {
      assert.ok(app.D.expenses.some(e => e.id === p.despesaId), 'conclusão sem lastro');
    }
  });
});

// ══ LEGADO ═══════════════════════════════════════════════════════════════

test('pendência concluída sem vínculo (legado) fica exatamente como está', () => {
  const carregado = carregarApp({ agora: AGORA });
  const D = baseVazia();
  D.pendencias = [PENDENCIA()];                     // sem despesaId
  D.expenses = [{ id: 'exp-legado', date: '2026-06-15', amount: 150, category: 'Casa', description: 'Pendência Teste' }];
  carregado.app.D = D;
  const antes = JSON.stringify(D);
  assert.equal(carregado.ctx.reconcilePendencias(), false);
  assert.equal(JSON.stringify(D), antes, 'o legado foi adivinhado por descrição/valor/data');
  assert.equal(D.pendencias[0].status, 'concluida');
});

test('despesa legada não ganha rótulo de pendência', () => {
  const { ctx } = vinculado();
  assert.equal(ctx._movementTypeLabel({ id: 'x', date: '2026-06-15', amount: 150, category: 'Casa', description: 'Pendência Teste' }), 'Gasto');
});

test('base sem pendências não quebra o reconciliador', () => {
  const carregado = carregarApp({ agora: AGORA });
  carregado.app.D = baseVazia();
  assert.equal(carregado.ctx.reconcilePendencias(), false);
  carregado.app.D.pendencias = undefined;
  assert.equal(carregado.ctx.reconcilePendencias(), false);
});

test('_pendDespesaVinculada devolve a despesa viva, ou null', () => {
  const { ctx, app } = vinculado();
  assert.equal(ctx._pendDespesaVinculada(pend(app)).id, 'exp-1');
  assert.equal(ctx._pendDespesaVinculada({ id: 'x' }), null);
  assert.equal(ctx._pendDespesaVinculada(null), null);
  app.D.expenses = [];
  assert.equal(ctx._pendDespesaVinculada(pend(app)), null);
});
