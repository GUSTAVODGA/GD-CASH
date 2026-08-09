// monthAggregate × _monthMovementSummary — a promessa de que a Fase C
// decompôs o caixa SEM alterar o caixa. Se estes testes caírem, a separação
// entre caixa e consumo passou a mover dinheiro, que é a pior regressão
// possível neste app.
//
// Também cobre as bordas de calendário (fim de mês, virada de ano, fevereiro,
// 29/02 bissexto), porque `monthDates()` deriva do relógio e é o recorte de
// onde a Home e a aba Mês tiram todos os números.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { INSTANTES } from './_clock.mjs';
import { cenarioNaturezas, baseVazia } from './_fixtures.mjs';

function comCenario(agora, dados) {
  const carregado = carregarApp({ agora });
  carregado.app.D = dados;
  return carregado;
}

test('INVARIANTE: totalCashIn do resumo = receitas do agregado do mês', () => {
  const { ctx } = comCenario('2026-03-15T12:00:00', cenarioNaturezas());
  const agregado = ctx.monthAggregate(0);
  const resumo = ctx._monthMovementSummary(0);
  assert.equal(resumo.totalCashIn, agregado.receitas);
});

test('INVARIANTE: totalCashOut do resumo = gastos do agregado do mês', () => {
  const { ctx } = comCenario('2026-03-15T12:00:00', cenarioNaturezas());
  const agregado = ctx.monthAggregate(0);
  const resumo = ctx._monthMovementSummary(0);
  assert.equal(resumo.totalCashOut, agregado.gastos);
});

test('INVARIANTE: cashResult = líquido do agregado', () => {
  const { ctx } = comCenario('2026-03-15T12:00:00', cenarioNaturezas());
  assert.equal(ctx._monthMovementSummary(0).cashResult, ctx.monthAggregate(0).liquido);
});

test('INVARIANTE: consumo nunca excede o total que saiu do caixa', () => {
  const { ctx } = comCenario('2026-03-15T12:00:00', cenarioNaturezas());
  const r = ctx._monthMovementSummary(0);
  assert.equal(r.consumo <= r.totalCashOut, true);
});

test('recorte é o mês civil, não uma janela móvel', () => {
  const dados = baseVazia();
  dados.expenses = [
    { id: 'ante', date: '2026-02-28', amount: 10, category: 'Categoria A' },
    { id: 'prim', date: '2026-03-01', amount: 20, category: 'Categoria A' },
    { id: 'ult',  date: '2026-03-31', amount: 30, category: 'Categoria A' },
    { id: 'pos',  date: '2026-04-01', amount: 40, category: 'Categoria A' },
  ];
  const { ctx } = comCenario('2026-03-15T12:00:00', dados);
  assert.equal(ctx.monthAggregate(0).gastos, 50); // só 01/03 e 31/03
});

test('data com horário não escapa do mês por shift de fuso', () => {
  const dados = baseVazia();
  dados.expenses = [
    { id: 'x', date: '2026-03-31T23:30:00', amount: 15, category: 'Categoria A' },
  ];
  const { ctx } = comCenario('2026-03-15T12:00:00', dados);
  assert.equal(ctx.monthAggregate(0).gastos, 15);
});

// ── Bordas de calendário ──────────────────────────────────────────────────

test('BORDA fim de mês (31/03): monthDates cobre o mês inteiro', () => {
  const { ctx } = comCenario(INSTANTES.fimDeMes31, baseVazia());
  const dias = ctx.monthDates(0);
  assert.equal(dias.length, 31);
  assert.equal(dias[0], '2026-03-01');
  assert.equal(dias.at(-1), '2026-03-31');
});

test('BORDA fim de mês (31/03): mês anterior é fevereiro, não 03/03', () => {
  // Proteção contra overflow de setMonth: sem fixar o dia 1, 31/03 − 1 mês
  // resolveria para 03/03. O recorte tem de ser fevereiro inteiro.
  const { ctx } = comCenario(INSTANTES.fimDeMes31, baseVazia());
  const dias = ctx.monthDates(-1);
  assert.equal(dias[0], '2026-02-01');
  assert.equal(dias.at(-1), '2026-02-28');
  assert.equal(dias.length, 28);
});

test('BORDA fim de mês (30/04): mês seguinte é maio inteiro', () => {
  const { ctx } = comCenario(INSTANTES.fimDeMes30, baseVazia());
  const dias = ctx.monthDates(1);
  assert.equal(dias[0], '2026-05-01');
  assert.equal(dias.at(-1), '2026-05-31');
});

test('BORDA virada de ano (31/12): mês seguinte é janeiro do ano seguinte', () => {
  const { ctx } = comCenario(INSTANTES.viradaDeAno, baseVazia());
  assert.equal(ctx.todayStr(), '2026-12-31');
  const dias = ctx.monthDates(1);
  assert.equal(dias[0], '2027-01-01');
  assert.equal(dias.at(-1), '2027-01-31');
});

test('BORDA virada de ano (01/01): mês anterior é dezembro do ano anterior', () => {
  const { ctx } = comCenario(INSTANTES.primeiroDoAno, baseVazia());
  const dias = ctx.monthDates(-1);
  assert.equal(dias[0], '2026-12-01');
  assert.equal(dias.at(-1), '2026-12-31');
});

test('BORDA fevereiro comum tem 28 dias', () => {
  const { ctx } = comCenario(INSTANTES.fevereiroComum, baseVazia());
  const dias = ctx.monthDates(0);
  assert.equal(dias.length, 28);
  assert.equal(dias.at(-1), '2027-02-28');
});

test('BORDA 29/02 em ano bissexto: fevereiro tem 29 dias e o dia existe', () => {
  const { ctx } = comCenario(INSTANTES.bissexto29Fev, baseVazia());
  assert.equal(ctx.todayStr(), '2028-02-29');
  const dias = ctx.monthDates(0);
  assert.equal(dias.length, 29);
  assert.equal(dias.at(-1), '2028-02-29');
});

test('BORDA 29/02: mês anterior e seguinte não escorregam', () => {
  const { ctx } = comCenario(INSTANTES.bissexto29Fev, baseVazia());
  assert.equal(ctx.monthDates(-1)[0], '2028-01-01');
  assert.equal(ctx.monthDates(-1).at(-1), '2028-01-31');
  assert.equal(ctx.monthDates(1)[0], '2028-03-01');
  assert.equal(ctx.monthDates(1).at(-1), '2028-03-31');
});

test('BORDA 01/03 de ano bissexto: mês anterior fecha em 29/02', () => {
  const { ctx } = comCenario(INSTANTES.bissexto01Mar, baseVazia());
  const dias = ctx.monthDates(-1);
  assert.equal(dias.length, 29);
  assert.equal(dias.at(-1), '2028-02-29');
});

test('INVARIANTE: monthDates é contíguo, ordenado e sem repetição', () => {
  for (const agora of Object.values(INSTANTES)) {
    const { ctx } = comCenario(agora, baseVazia());
    for (const off of [-1, 0, 1]) {
      const dias = ctx.monthDates(off);
      assert.equal(new Set(dias).size, dias.length, `dias repetidos em ${agora} off=${off}`);
      const ordenado = [...dias].sort();
      mesmoConteudo(dias, ordenado, `fora de ordem em ${agora} off=${off}`);
      assert.equal(dias.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), true);
    }
  }
});

test('semana sempre tem 7 dias começando na segunda', () => {
  for (const agora of Object.values(INSTANTES)) {
    const { ctx } = comCenario(agora, baseVazia());
    const semana = ctx.weekDates(0);
    assert.equal(semana.length, 7);
    const primeiro = ctx.parseDate(semana[0]);
    assert.equal(primeiro.getDay(), 1, `semana de ${agora} não começa na segunda`);
  }
});
