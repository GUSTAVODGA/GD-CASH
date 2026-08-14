// Calendário da dívida: progresso financeiro ≠ progresso cronológico.
//
// Defeito corrigido aqui: `_debtDueDate` datava a parcela k como
// `dataInicio + período·(k−1)`, e k vinha de `_debtParcelasPagas`, que conta
// DINHEIRO — incluindo `amortizadoInicial`. Consequência: uma entrada paga
// antes do cadastro consumia vencimentos que nunca aconteceram. Numa dívida
// semanal de R$ 200 com R$ 2.000 de entrada, o app pulava dez sextas-feiras e
// anunciava o próximo pagamento para outubro.
//
// Modelo adotado:
//
//   amortizadoInicial     dinheiro → reduz saldo, entra em "já pago",
//                         NÃO move vencimento;
//   parcelasPagasAntes    tempo    → declara quantas parcelas já haviam
//                         vencido no cadastro; posiciona a grade;
//   debtPayments          dinheiro do app → quitam parcelas na ordem e, com
//                         isso, avançam a grade contratual.
//
// A grade é sempre `dataInicio + período·i` — nunca é reancorada na data em
// que um pagamento foi feito. Pagar atrasado quita a parcela vencida; não
// empurra as seguintes.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

const AGORA = '2026-08-10T12:00:00';   // segunda-feira, entre 07/08 e 14/08

// Caso real reproduzido com aritmética equivalente e nomes neutros:
// total 6500, parcela 200, entrada de 2000, semanal a partir de sexta 07/08.
const SEMANAL = () => ({
  id: 'd1', tipo: 'emprestimo', titulo: 'Dívida Teste', credor: 'Banco Teste',
  valorOriginal: 6500, valorParcela: 200, parcelasTotal: 33,
  amortizadoInicial: 2000, parcelasPagasAntes: 0,
  dataInicio: '2026-08-07', periodicidade: 'semanal', status: 'ativa',
});
const PAGAMENTO = (valor, data) => ({ id: 'p-' + data + '-' + valor, debtId: 'd1', parcelNo: null, expenseId: 'e-' + data, valor, data });
const DESPESA = (valor, data) => ({ id: 'e-' + data, date: data, amount: valor, category: 'Dívidas', description: 'Parcela Teste', meta: { source: 'debt', debtId: 'd1' } });

function cenario(debt, pagamentos) {
  const carregado = carregarApp({ agora: AGORA });
  const D = baseVazia();
  D.debts = [debt];
  D.debtPayments = (pagamentos || []).map(p => PAGAMENTO(p.valor, p.data));
  D.expenses = (pagamentos || []).map(p => DESPESA(p.valor, p.data));
  carregado.app.D = D;
  return { ...carregado, debt };
}

const proximos = (ctx, debt, n) => ctx._debtProjectVencimentos(debt, { maxItems: n }).map(v => v.dueDate);

// ══ O TESTE QUE FALHA NO CÓDIGO ANTERIOR ═════════════════════════════════

test('CASO REAL: entrada anterior não consome semanas — 07 → 14 → 21 → 28 → 04/09', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const st = ctx._debtState(debt);

  // Financeiro intocado.
  assert.equal(st.saldo, 4300, 'o saldo mudou');
  assert.equal(st.pago, 2200, 'o total pago mudou');
  assert.equal(st.parcelasPagas, 11);
  assert.equal(st.parcelasTotal, 33);
  assert.equal(st.proximaNo, 12);

  // Calendário correto.
  assert.equal(st.proximaVenc, '2026-08-14');
  assert.notEqual(st.proximaVenc, '2026-10-23', 'voltou a projetar em outubro');
  mesmoConteudo(proximos(ctx, debt, 4), ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']);
});

test('CASO REAL: a grade não duplica despesa nem pagamento', () => {
  const { ctx, app, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const antes = JSON.stringify(app.D);
  ctx._debtState(debt);
  ctx._debtProjectVencimentos(debt, { maxItems: 10 });
  assert.equal(JSON.stringify(app.D), antes, 'projetar alterou os dados');
  assert.equal(app.D.expenses.length, 1);
  assert.equal(app.D.debtPayments.length, 1);
});

test('a entrada sozinha (sem pagamento do app) aponta para o primeiro vencimento', () => {
  const { ctx, debt } = cenario(SEMANAL(), []);
  const st = ctx._debtState(debt);
  assert.equal(st.saldo, 4500);
  assert.equal(st.proximaVenc, '2026-08-07', 'a entrada empurrou o calendário');
});

test('atravessa o mês corretamente: 28/08 → 04/09', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }, { valor: 200, data: '2026-08-14' }, { valor: 200, data: '2026-08-21' }]);
  mesmoConteudo(proximos(ctx, debt, 2), ['2026-08-28', '2026-09-04']);
});

test('o dia da semana nunca deriva — toda projeção cai numa sexta', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const dias = proximos(ctx, debt, 12).map(iso => new Date(iso + 'T12:00:00').getDay());
  assert.equal(dias.length, 12);
  assert.deepEqual([...new Set(dias)], [5], 'alguma parcela saiu da sexta-feira');
});

// ══ DÍVIDA CADASTRADA JÁ EM ANDAMENTO ════════════════════════════════════

test('parcelasPagasAntes declara o tempo transcorrido e reposiciona a grade', () => {
  // Mesmos R$ 2.000, agora declarados como 10 parcelas já vencidas: a âncora
  // "Primeiro vencimento" passa a ser o vencimento da parcela 11.
  const { ctx, debt } = cenario({ ...SEMANAL(), parcelasPagasAntes: 10 }, [{ valor: 200, data: '2026-08-07' }]);
  const st = ctx._debtState(debt);
  assert.equal(st.saldo, 4300, 'o financeiro mudou junto com o calendário');
  assert.equal(st.pago, 2200);
  assert.equal(st.proximaVenc, '2026-10-23');
});

test('declaração maior que o dinheiro: deslocamento zero, grade contratual pura', () => {
  // Entrada contraditória: diz que 20 parcelas venceram, mas o dinheiro só
  // cobre 10. O deslocamento satura em 0 — a grade nunca anda para trás — e
  // `dataInicio` volta a ser o vencimento da parcela 1, como numa dívida sem
  // amortização. O formulário não produz esse estado (ele deriva
  // `amortizadoInicial` da própria contagem, em `salvarDivida`); o teste existe
  // para fixar o comportamento diante de dado editado à mão.
  const { ctx, debt } = cenario({ ...SEMANAL(), parcelasPagasAntes: 20 }, []);
  assert.equal(ctx._debtParcelasSemCalendario(debt), 0);
  assert.equal(ctx._debtDueDate(debt, 1), '2026-08-07');
  assert.equal(ctx._debtState(debt).proximaNo, 11);
  assert.equal(ctx._debtState(debt).proximaVenc, '2026-10-16');
});

test('contagem vinda do formulário sempre zera o deslocamento', () => {
  // `salvarDivida` faz amortizadoInicial = valorParcela × pagasAntes, então
  // parcelasDeAmort === parcelasPagasAntes e o fantasma é sempre 0.
  for (const p of [1, 5, 10, 32]) {
    const { ctx, debt } = cenario({ ...SEMANAL(), parcelasPagasAntes: p, amortizadoInicial: 200 * p }, []);
    assert.equal(ctx._debtParcelasSemCalendario(debt), 0, `deslocamento inesperado com ${p} parcelas`);
    assert.equal(ctx._debtDueDate(debt, 1), '2026-08-07');
  }
});

test('sem amortização anterior o deslocamento é zero (grade de sempre)', () => {
  const { ctx, debt } = cenario({ ...SEMANAL(), amortizadoInicial: 0 }, []);
  assert.equal(ctx._debtParcelasSemCalendario(debt), 0);
  mesmoConteudo(proximos(ctx, debt, 3), ['2026-08-07', '2026-08-14', '2026-08-21']);
});

// ══ A GRADE NÃO DERIVA ═══════════════════════════════════════════════════

test('pagamento ATRASADO não reancora: pagar em 18/08 a parcela de 14/08 mantém 21/08', () => {
  const { ctx, debt } = cenario(SEMANAL(), [
    { valor: 200, data: '2026-08-07' },
    { valor: 200, data: '2026-08-18' },   // a parcela de 14/08, paga com atraso
  ]);
  const st = ctx._debtState(debt);
  assert.equal(st.proximaVenc, '2026-08-21', 'a grade seguiu a data do pagamento');
  assert.notEqual(st.proximaVenc, '2026-08-25');
});

test('pagamento ADIANTADO não reancora: pagar em 02/08 a parcela de 07/08 mantém 14/08', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-02' }]);
  assert.equal(ctx._debtState(debt).proximaVenc, '2026-08-14');
});

test('pagamento PARCIAL não avança a data — a parcela continua sendo a mesma', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 120, data: '2026-08-07' }]);
  const st = ctx._debtState(debt);
  assert.equal(st.proximaNo, 11);
  assert.equal(st.proximaVenc, '2026-08-07');
  assert.equal(st.proximaValor, 80, 'o restante deixou de pertencer à parcela certa');
});

test('parcial + complemento fecha a parcela e só então avança', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 120, data: '2026-08-07' }, { valor: 80, data: '2026-08-09' }]);
  const st = ctx._debtState(debt);
  assert.equal(st.proximaNo, 12);
  assert.equal(st.proximaVenc, '2026-08-14');
});

test('ANTECIPAÇÃO: pagar 3 parcelas de uma vez avança 3 períodos, sem derivar', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 600, data: '2026-08-07' }]);
  const st = ctx._debtState(debt);
  assert.equal(st.parcelasPagas, 13);
  assert.equal(st.proximaVenc, '2026-08-28');
  mesmoConteudo(proximos(ctx, debt, 3), ['2026-08-28', '2026-09-04', '2026-09-11']);
});

test('múltiplos pagamentos avulsos mantêm a grade ancorada em dataInicio', () => {
  const { ctx, debt } = cenario(SEMANAL(), [
    { valor: 200, data: '2026-08-07' }, { valor: 200, data: '2026-08-11' },
    { valor: 200, data: '2026-08-19' }, { valor: 200, data: '2026-08-20' },
  ]);
  // Quatro parcelas quitadas → a quinta da grade: 07/08 + 4 semanas.
  assert.equal(ctx._debtState(debt).proximaVenc, '2026-09-04');
});

// ══ OUTRAS FREQUÊNCIAS — SEM REGRESSÃO ═══════════════════════════════════

const PARA_FREQ = (freq, dataInicio, amort) => ({
  ...SEMANAL(), periodicidade: freq, dataInicio, amortizadoInicial: amort, parcelasPagasAntes: 0,
});

test('mensal: clampa dia curto e ignora a amortização no calendário', () => {
  const semAmort = cenario(PARA_FREQ('mensal', '2026-01-31', 0), []);
  mesmoConteudo(proximos(semAmort.ctx, semAmort.debt, 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
  const comAmort = cenario(PARA_FREQ('mensal', '2026-01-31', 2000), []);
  mesmoConteudo(proximos(comAmort.ctx, comAmort.debt, 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('quinzenal: +14 dias, com e sem amortização', () => {
  const semAmort = cenario(PARA_FREQ('quinzenal', '2026-01-31', 0), []);
  mesmoConteudo(proximos(semAmort.ctx, semAmort.debt, 3), ['2026-01-31', '2026-02-14', '2026-02-28']);
  const comAmort = cenario(PARA_FREQ('quinzenal', '2026-01-31', 2000), []);
  mesmoConteudo(proximos(comAmort.ctx, comAmort.debt, 3), ['2026-01-31', '2026-02-14', '2026-02-28']);
});

test('anual: +1 ano, com e sem amortização', () => {
  const semAmort = cenario(PARA_FREQ('anual', '2026-01-31', 0), []);
  mesmoConteudo(proximos(semAmort.ctx, semAmort.debt, 3), ['2026-01-31', '2027-01-31', '2028-01-31']);
  const comAmort = cenario(PARA_FREQ('anual', '2026-01-31', 2000), []);
  mesmoConteudo(proximos(comAmort.ctx, comAmort.debt, 3), ['2026-01-31', '2027-01-31', '2028-01-31']);
});

test('mensal declarado em andamento continua na grade histórica', () => {
  const { ctx, debt } = cenario({ ...PARA_FREQ('mensal', '2026-01-31', 2000), parcelasPagasAntes: 10 }, []);
  assert.equal(ctx._debtState(debt).proximaVenc, '2026-11-30');
});

// ══ COMPATIBILIDADE COM DADO ANTIGO ══════════════════════════════════════

test('dívida antiga sem o campo: normaliza para 0, sem migração', () => {
  const bruta = { ...SEMANAL() };
  delete bruta.parcelasPagasAntes;
  const { ctx, app } = cenario(bruta, []);
  assert.equal(app.D.debts[0].parcelasPagasAntes, undefined, 'o dado foi reescrito em disco');
  assert.equal(ctx._debtParcelasSemCalendario(app.D.debts[0]), 10);
  assert.equal(ctx._debtState(app.D.debts[0]).proximaVenc, '2026-08-07');
});

test('normalizeDebt preserva a contagem declarada e rejeita lixo', () => {
  const { ctx } = cenario(SEMANAL(), []);
  assert.equal(ctx._normDebt({ parcelasPagasAntes: 7 }).parcelasPagasAntes, 7);
  assert.equal(ctx._normDebt({ parcelasPagasAntes: -3 }).parcelasPagasAntes, 0);
  assert.equal(ctx._normDebt({ parcelasPagasAntes: '4' }).parcelasPagasAntes, 4);
  assert.equal(ctx._normDebt({}).parcelasPagasAntes, 0);
});

test('sem dataInicio a projeção não inventa data', () => {
  const { ctx, debt } = cenario({ ...SEMANAL(), dataInicio: '' }, []);
  assert.equal(ctx._debtDueDate(debt, 1), '');
  assert.equal(ctx._debtState(debt).proximaVenc, '');
});

// ══ INVARIANTES ══════════════════════════════════════════════════════════

test('INVARIANTE: a matemática financeira não depende do calendário', () => {
  const a = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const b = cenario({ ...SEMANAL(), parcelasPagasAntes: 10 }, [{ valor: 200, data: '2026-08-07' }]);
  for (const campo of ['saldo', 'pago', 'progress', 'parcelasPagas', 'parcelasTotal', 'proximaNo', 'proximaValor']) {
    assert.equal(
      ctxVal(a, campo), ctxVal(b, campo),
      `${campo} mudou junto com o calendário`
    );
  }
  function ctxVal(c, campo) { return c.ctx._debtState(c.debt)[campo]; }
});

test('INVARIANTE: datar não altera a dívida nem D', () => {
  const { ctx, app, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const antes = JSON.stringify(app.D);
  for (let k = 1; k <= 33; k++) ctx._debtDueDate(debt, k);
  ctx._debtParcelasSemCalendario(debt);
  assert.equal(JSON.stringify(app.D), antes);
});

test('INVARIANTE: a grade é uniforme — todo intervalo consecutivo tem 7 dias', () => {
  const { ctx, debt } = cenario(SEMANAL(), [{ valor: 200, data: '2026-08-07' }]);
  const ds = proximos(ctx, debt, 15).map(iso => new Date(iso + 'T12:00:00'));
  for (let i = 1; i < ds.length; i++) {
    assert.equal((ds[i] - ds[i - 1]) / 86400000, 7, `intervalo irregular na posição ${i}`);
  }
});
