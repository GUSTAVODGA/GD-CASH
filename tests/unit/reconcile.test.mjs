// Reconciliação de marcadores de pagamento (dívidas e gastos fixos).
//
// Os marcadores (`debtPayments`, `fixedPayments`) apontam para uma despesa
// real. Quando a despesa é excluída, o marcador tem de sumir junto — senão a
// dívida continua "paga" sem que exista dinheiro correspondente. O risco
// simétrico é a reconciliação apagar de mais e destruir pagamento legítimo.
//
// Estes testes travam os dois lados: não duplicar e não apagar dinheiro real.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia, dividaRedonda } from './_fixtures.mjs';

function cenario(dados, agora = '2026-06-15T12:00:00') {
  const carregado = carregarApp({ agora });
  carregado.app.D = dados;
  return carregado;
}

function comDividaEPagamento() {
  const d = baseVazia();
  d.debts = [dividaRedonda()];
  d.expenses = [
    { id: 'exp-pg', date: '2026-06-10', amount: 100, category: 'Categoria C', meta: { source: 'debt' } },
  ];
  d.debtPayments = [
    { id: 'mk-1', debtId: 'divida-redonda', expenseId: 'exp-pg', valor: 100, data: '2026-06-10' },
  ];
  return d;
}

// ── dívidas ───────────────────────────────────────────────────────────────

test('marcador íntegro sobrevive à reconciliação', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  const mudou = ctx.reconcileDebtPayments();
  assert.equal(mudou, false);
  assert.equal(app.D.debtPayments.length, 1);
});

test('INVARIANTE: reconciliar é idempotente — não duplica nem remove em série', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  ctx.reconcileDebtPayments();
  const primeira = JSON.stringify(app.D.debtPayments);
  ctx.reconcileDebtPayments();
  ctx.reconcileDebtPayments();
  assert.equal(JSON.stringify(app.D.debtPayments), primeira);
});

test('excluída a despesa, o marcador órfão é removido', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  app.D.expenses = [];                       // simula exclusão da despesa
  const mudou = ctx.reconcileDebtPayments();
  assert.equal(mudou, true);
  assert.equal(app.D.debtPayments.length, 0);
});

test('INVARIANTE: removido o marcador, a amortização é revertida', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  const divida = app.D.debts[0];
  assert.equal(ctx._debtSaldo(divida), 1100);   // 1200 − 100

  app.D.expenses = [];
  ctx.reconcileDebtPayments();
  assert.equal(ctx._debtSaldo(divida), 1200);   // dinheiro que não existe não amortiza
  assert.equal(ctx._debtParcelasPagas(divida), 0);
});

test('marcador de dívida inexistente é removido', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  app.D.debts = [];
  assert.equal(ctx.reconcileDebtPayments(), true);
  assert.equal(app.D.debtPayments.length, 0);
});

test('pagamento sem despesa vinculada (avulso) é preservado', () => {
  // Marcador sem expenseId representa amortização registrada sem despesa —
  // não pode ser confundido com órfão.
  const dados = baseVazia();
  dados.debts = [dividaRedonda()];
  dados.debtPayments = [{ id: 'mk-avulso', debtId: 'divida-redonda', valor: 100, data: '2026-06-10' }];
  const { ctx, app } = cenario(dados);
  assert.equal(ctx.reconcileDebtPayments(), false);
  assert.equal(app.D.debtPayments.length, 1);
  assert.equal(ctx._debtSaldo(app.D.debts[0]), 1100);
});

test('coleção ausente ou corrompida é normalizada sem estourar', () => {
  const dados = baseVazia();
  delete dados.debtPayments;
  const { ctx, app } = cenario(dados);
  assert.equal(ctx.reconcileDebtPayments(), false);
  mesmoConteudo(app.D.debtPayments, []);
});

test('INVARIANTE: reconciliação nunca inventa marcador', () => {
  const dados = comDividaEPagamento();
  const { ctx, app } = cenario(dados);
  const antes = app.D.debtPayments.length;
  ctx.reconcileDebtPayments();
  assert.equal(app.D.debtPayments.length <= antes, true);
});

// ── gastos fixos ──────────────────────────────────────────────────────────

function comFixoEBaixa() {
  const d = baseVazia();
  d.fixedExpenses = [{ id: 'fix-1', name: 'Assinatura Teste', amount: 30, category: 'Categoria D', dueDay: 10, since: '2026-01-01' }];
  d.expenses = [{ id: 'exp-fix', date: '2026-06-10', amount: 30, category: 'Categoria D', meta: { source: 'fixed-payment' } }];
  d.fixedPayments = [{ id: 'fp-1', fixedId: 'fix-1', expenseId: 'exp-fix', cycle: '2026-06' }];
  return d;
}

test('baixa de fixo íntegra sobrevive', () => {
  const { ctx, app } = cenario(comFixoEBaixa());
  assert.equal(ctx.reconcileFixedPayments(), false);
  assert.equal(app.D.fixedPayments.length, 1);
});

test('excluída a despesa, a baixa do fixo é desfeita', () => {
  const { ctx, app } = cenario(comFixoEBaixa());
  app.D.expenses = [];
  assert.equal(ctx.reconcileFixedPayments(), true);
  assert.equal(app.D.fixedPayments.length, 0);
});

test('excluído o fixo, a baixa órfã some', () => {
  const { ctx, app } = cenario(comFixoEBaixa());
  app.D.fixedExpenses = [];
  assert.equal(ctx.reconcileFixedPayments(), true);
  assert.equal(app.D.fixedPayments.length, 0);
});

test('INVARIANTE: reconciliar fixos é idempotente', () => {
  const { ctx, app } = cenario(comFixoEBaixa());
  ctx.reconcileFixedPayments();
  const primeira = JSON.stringify(app.D.fixedPayments);
  ctx.reconcileFixedPayments();
  assert.equal(JSON.stringify(app.D.fixedPayments), primeira);
});

test('INVARIANTE: reconciliação não toca nas despesas reais', () => {
  // O dinheiro é a despesa; o marcador é só o vínculo. Reconciliar remove
  // vínculo, nunca lançamento.
  const dados = comDividaEPagamento();
  dados.fixedExpenses = comFixoEBaixa().fixedExpenses;
  dados.fixedPayments = comFixoEBaixa().fixedPayments;
  dados.expenses.push(comFixoEBaixa().expenses[0]);
  const { ctx, app } = cenario(dados);

  const despesasAntes = JSON.stringify(app.D.expenses);
  app.D.debts = [];
  app.D.fixedExpenses = [];
  ctx.reconcileDebtPayments();
  ctx.reconcileFixedPayments();

  assert.equal(JSON.stringify(app.D.expenses), despesasAntes, 'a reconciliação alterou despesas');
  assert.equal(app.D.debtPayments.length, 0);
  assert.equal(app.D.fixedPayments.length, 0);
});
