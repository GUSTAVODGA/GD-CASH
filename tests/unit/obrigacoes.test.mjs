// _obrigacoesEmAberto — resolvedor único de compromissos em aberto.
//
// Reúne três origens que continuam SEPARADAS no dado (dívidas, gastos fixos e
// pendências) numa lista derivada. O que estes testes protegem:
//
//   1. a agregação não inventa nem esconde compromisso;
//   2. cada item preserva sua ORIGEM e a ação canônica futura — simplificar a
//      UX não pode virar unificação de dados;
//   3. o valor de pendência é marcado como estimativa, para que nenhum
//      consumidor apresente um total estimado como se fosse exato;
//   4. o resolvedor é puramente derivado: não escreve, não persiste, não cacheia.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import {
  baseVazia, dividaRedonda, dividaComParcelaResidual,
  fixoTeste, baixaDeFixo, pendenciaTeste,
} from './_fixtures.mjs';

// Relógio em 15/06/2026: um fixo com vencimento no dia 10 já está atrasado no
// ciclo corrente, e um com vencimento no dia 28 ainda está a vencer.
const AGORA = '2026-06-15T12:00:00';
const CICLO = '2026-06';

function cenario(patch = {}, agora = AGORA) {
  const carregado = carregarApp({ agora });
  carregado.app.D = Object.assign(baseVazia(), patch);
  return carregado;
}

// ── Agregação das três origens ────────────────────────────────────────────

test('agrega dívidas, fixos e pendências numa lista só', () => {
  const { ctx } = cenario({
    debts: [dividaComParcelaResidual()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens.length, 3);
  mesmoConteudo([...new Set(itens.map(i => i.origem))].sort(), ['divida', 'fixo', 'pendencia']);
});

test('cada item preserva a origem e a ação canônica correspondente', () => {
  const { ctx } = cenario({
    debts: [dividaComParcelaResidual()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  const porOrigem = Object.fromEntries(ctx._obrigacoesEmAberto().map(i => [i.origem, i.acao]));
  assert.equal(porOrigem.divida, 'debt-pay');
  assert.equal(porOrigem.fixo, 'fixed-baixa');
  assert.equal(porOrigem.pendencia, 'pendencia-concluir');
});

test('lista vazia quando não há nenhuma obrigação', () => {
  const { ctx } = cenario();
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

// ── Dívidas ───────────────────────────────────────────────────────────────

test('dívida ativa com saldo entra, com o valor restante do compromisso', () => {
  const { ctx } = cenario({ debts: [dividaComParcelaResidual()] });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, 'divida');
  assert.equal(itens[0].id, 'divida-residual');
  assert.equal(itens[0].valorSugerido, 200);
  assert.equal(itens[0].valorEhEstimativa, false);
  assert.equal(itens[0].subtitulo, 'Parcela 1/33');
});

test('dívida quitada não entra', () => {
  const divida = dividaRedonda();                    // 1200 no total
  const { ctx } = cenario({
    debts: [divida],
    debtPayments: [{ id: 'pg', debtId: divida.id, valor: 1200, data: '2026-05-01' }],
  });
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

test('dívida pausada ou cancelada não entra', () => {
  for (const status of ['pausada', 'cancelada']) {
    const { ctx } = cenario({ debts: [dividaRedonda({ status })] });
    mesmoConteudo(ctx._obrigacoesEmAberto(), [], `status ${status} entrou na lista`);
  }
});

test('uma dívida gera no máximo um compromisso, mesmo com muitas parcelas vencidas', () => {
  // 33 parcelas, seis já vencidas e nenhuma paga: ainda assim, um único item.
  const { ctx } = cenario({ debts: [dividaComParcelaResidual()] });
  const daDivida = ctx._obrigacoesEmAberto().filter(i => i.origem === 'divida');
  assert.equal(daDivida.length, 1);
  assert.equal(daDivida[0].vencimento, '2026-01-10', 'deve ser o mais antigo pendente');
});

test('duas dívidas geram dois compromissos, um de cada', () => {
  const { ctx } = cenario({
    debts: [dividaComParcelaResidual(), dividaRedonda({ id: 'd2', titulo: 'Parcelamento Teste' })],
  });
  const daDivida = ctx._obrigacoesEmAberto().filter(i => i.origem === 'divida');
  assert.equal(daDivida.length, 2);
  assert.equal(new Set(daDivida.map(i => i.id)).size, 2);
});

test('pagamento parcial reduz o valor sugerido da dívida', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = cenario({
    debts: [divida],
    debtPayments: [{ id: 'pg', debtId: divida.id, valor: 50, data: '2026-06-01' }],
  });
  assert.equal(ctx._obrigacoesEmAberto()[0].valorSugerido, 150);
});

// ── Gastos fixos ──────────────────────────────────────────────────────────

test('fixo a vencer (pending) entra e não é marcado como atrasado', () => {
  const { ctx } = cenario({ fixedExpenses: [fixoTeste({ dueDay: 28 })] });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, 'fixo');
  assert.equal(itens[0].atrasada, false);
  assert.equal(itens[0].vencimento, '2026-06-28');
  assert.equal(itens[0].valorEhEstimativa, false);
});

test('fixo vencido (overdue) entra e é marcado como atrasado', () => {
  const { ctx } = cenario({ fixedExpenses: [fixoTeste({ dueDay: 10 })] });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens.length, 1);
  assert.equal(itens[0].atrasada, true);
  assert.equal(itens[0].vencimento, '2026-06-10');
});

test('fixo já pago no ciclo (paid) não entra', () => {
  const f = fixoTeste();
  const { ctx } = cenario({
    fixedExpenses: [f],
    fixedPayments: [baixaDeFixo(f.id, CICLO)],
  });
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

test('baixa em OUTRO ciclo não tira o fixo da lista do ciclo corrente', () => {
  const f = fixoTeste();
  const { ctx } = cenario({
    fixedExpenses: [f],
    fixedPayments: [baixaDeFixo(f.id, '2026-05')],
  });
  assert.equal(ctx._obrigacoesEmAberto().length, 1);
});

test('fixo pausado não entra', () => {
  const { ctx } = cenario({ fixedExpenses: [fixoTeste({ paused: true })] });
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

test('fixo pré-existente (vencimento anterior à adoção) não entra', () => {
  // since no futuro do vencimento do ciclo → fxState devolve 'preexisting'.
  const { ctx } = cenario({ fixedExpenses: [fixoTeste({ dueDay: 10, since: '2026-07-01' })] });
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

// ── Pendências ────────────────────────────────────────────────────────────

test('pendência aberta com valor entra', () => {
  const { ctx } = cenario({ pendencias: [pendenciaTeste()] });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, 'pendencia');
  assert.equal(itens[0].valorSugerido, 250);
});

test('INVARIANTE: valor de pendência é sempre marcado como estimativa', () => {
  const { ctx } = cenario({
    debts: [dividaComParcelaResidual()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  for (const item of ctx._obrigacoesEmAberto()) {
    assert.equal(item.valorEhEstimativa, item.origem === 'pendencia',
      `${item.origem} marcou estimativa de forma incorreta`);
  }
});

test('pendência concluída não entra', () => {
  const { ctx } = cenario({ pendencias: [pendenciaTeste({ status: 'concluida' })] });
  mesmoConteudo(ctx._obrigacoesEmAberto(), []);
});

test('pendência sem valor não entra — não é pagável', () => {
  for (const valor of [null, 0, undefined]) {
    const { ctx } = cenario({ pendencias: [pendenciaTeste({ estimatedValue: valor })] });
    mesmoConteudo(ctx._obrigacoesEmAberto(), [], `estimatedValue=${valor} entrou`);
  }
});

test('pendência com prazo vencido é marcada como atrasada', () => {
  const { ctx } = cenario({ pendencias: [pendenciaTeste({ deadline: '2026-06-01' })] });
  assert.equal(ctx._obrigacoesEmAberto()[0].atrasada, true);
});

test('pendência sem prazo não é atrasada e fica sem vencimento', () => {
  const { ctx } = cenario({ pendencias: [pendenciaTeste({ deadline: null })] });
  const item = ctx._obrigacoesEmAberto()[0];
  assert.equal(item.atrasada, false);
  assert.equal(item.vencimento, '');
});

// ── Ordenação ─────────────────────────────────────────────────────────────

test('atrasadas vêm primeiro', () => {
  const { ctx } = cenario({
    fixedExpenses: [
      fixoTeste({ id: 'f-futuro', name: 'Fixo A Vencer', dueDay: 28 }),
      fixoTeste({ id: 'f-atrasado', name: 'Fixo Atrasado', dueDay: 10 }),
    ],
  });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens[0].id, 'f-atrasado');
  assert.equal(itens[1].id, 'f-futuro');
});

test('dentro do mesmo grupo, ordena por vencimento crescente', () => {
  const { ctx } = cenario({
    fixedExpenses: [
      fixoTeste({ id: 'f-28', name: 'Fixo Vinte e Oito', dueDay: 28 }),
      fixoTeste({ id: 'f-20', name: 'Fixo Vinte', dueDay: 20 }),
      fixoTeste({ id: 'f-25', name: 'Fixo Vinte e Cinco', dueDay: 25 }),
    ],
  });
  mesmoConteudo(ctx._obrigacoesEmAberto().map(i => i.id), ['f-20', 'f-25', 'f-28']);
});

test('empate de vencimento é resolvido pelo título', () => {
  const { ctx } = cenario({
    fixedExpenses: [
      fixoTeste({ id: 'f-z', name: 'Zebra Teste', dueDay: 20 }),
      fixoTeste({ id: 'f-a', name: 'Abacate Teste', dueDay: 20 }),
    ],
  });
  mesmoConteudo(ctx._obrigacoesEmAberto().map(i => i.id), ['f-a', 'f-z']);
});

test('item sem vencimento vai depois dos que têm, no mesmo grupo', () => {
  const { ctx } = cenario({
    fixedExpenses: [fixoTeste({ id: 'f-28', name: 'Fixo Teste', dueDay: 28 })],
    pendencias: [pendenciaTeste({ id: 'p-sem-prazo', title: 'Aaa Sem Prazo', deadline: null })],
  });
  const itens = ctx._obrigacoesEmAberto();
  assert.equal(itens[0].id, 'f-28', 'com vencimento vem primeiro mesmo com título posterior');
  assert.equal(itens[1].id, 'p-sem-prazo');
});

// ── Pureza: derivado, sem escrita e sem cache ─────────────────────────────

test('INVARIANTE: não escreve nada em D', () => {
  const { ctx, app } = cenario({
    debts: [dividaComParcelaResidual()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  const antes = JSON.stringify(app.D);
  ctx._obrigacoesEmAberto();
  ctx._obrigacoesEmAberto();
  assert.equal(JSON.stringify(app.D), antes, 'o resolvedor alterou o estado');
});

test('INVARIANTE: não chama save()', () => {
  const { ctx } = cenario({
    debts: [dividaComParcelaResidual()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  let gravou = 0;
  const original = ctx.save;
  ctx.save = () => { gravou++; };
  try { ctx._obrigacoesEmAberto(); } finally { ctx.save = original; }
  assert.equal(gravou, 0);
});

test('INVARIANTE: não cria coleção nova em D', () => {
  const { ctx, app } = cenario({ fixedExpenses: [fixoTeste()] });
  const chavesAntes = Object.keys(app.D).sort();
  ctx._obrigacoesEmAberto();
  mesmoConteudo(Object.keys(app.D).sort(), chavesAntes);
});

test('INVARIANTE: sem cache — a chamada seguinte reflete o estado novo', () => {
  const { ctx, app } = cenario({ fixedExpenses: [fixoTeste()] });
  assert.equal(ctx._obrigacoesEmAberto().length, 1);

  // Dá baixa no fixo: a próxima chamada já não pode trazê-lo.
  app.D.fixedPayments.push(baixaDeFixo('fixo-teste', CICLO));
  assert.equal(ctx._obrigacoesEmAberto().length, 0, 'resultado veio de cache');

  // Acrescenta uma pendência: aparece imediatamente.
  app.D.pendencias.push(pendenciaTeste());
  assert.equal(ctx._obrigacoesEmAberto().length, 1);
});

test('INVARIANTE: devolve um array novo a cada chamada', () => {
  const { ctx } = cenario({ fixedExpenses: [fixoTeste()] });
  const a = ctx._obrigacoesEmAberto();
  const b = ctx._obrigacoesEmAberto();
  assert.equal(a === b, false, 'devolveu a mesma referência — risco de mutação compartilhada');
  mesmoConteudo(a.map(i => i.id), ['fixo-teste']);
  mesmoConteudo(b.map(i => i.id), ['fixo-teste']);
});

test('coleções ausentes não quebram o resolvedor', () => {
  const carregado = carregarApp({ agora: AGORA });
  carregado.app.D = { platforms: [], dailyIncome: {}, expenses: [], debts: [], debtPayments: [] };
  mesmoConteudo(carregado.ctx._obrigacoesEmAberto(), []);
});
