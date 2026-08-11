// _obrigacoesResumo — agregado derivado da lista de compromissos em aberto.
//
// É a fonte única de contagem/soma para qualquer superfície que resuma
// compromissos (a folha e a faixa do "+"). O que estes testes protegem:
//
//   1. o agregado é derivado da lista recebida — não consulta D nem recalcula
//      regra financeira por conta própria;
//   2. `temEstimativa` propaga a incerteza da pendência para cima, de modo que
//      nenhuma superfície apresente um total estimado como exato;
//   3. contagem de atrasados e soma batem exatamente com a lista;
//   4. os textos derivados ("4 compromissos", "cerca de R$ ...") saem daqui e
//      não são reescritos em cada tela.
import test from 'node:test';
import { assert } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import {
  baseVazia, dividaRedonda, fixoTeste, pendenciaTeste,
} from './_fixtures.mjs';

const AGORA = '2026-06-15T12:00:00';

function cenario(patch = {}, agora = AGORA) {
  const carregado = carregarApp({ agora });
  carregado.app.D = Object.assign(baseVazia(), patch);
  return carregado;
}

// Itens sintéticos no formato do resolvedor, para exercitar o agregado isolado
// da coleta (o agregado não pode depender de como a lista foi montada).
function item(extra = {}) {
  return {
    origem: 'fixo', id: 'x', titulo: 'Item', subtitulo: '',
    valorSugerido: 10, valorEhEstimativa: false,
    vencimento: '2026-06-20', atrasada: false, acao: 'fixed-baixa',
    ...extra,
  };
}

// ── Forma do agregado ─────────────────────────────────────────────────────

test('lista vazia devolve agregado zerado, não nulo', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([]);
  assert.equal(r.quantidade, 0);
  assert.equal(r.atrasados, 0);
  assert.equal(r.total, 0);
  assert.equal(r.temEstimativa, false);
});

test('entrada inválida não quebra o agregado', () => {
  const { ctx } = cenario();
  [undefined, null, 'x', 42].forEach(v => {
    const r = ctx._obrigacoesResumo(v);
    assert.equal(r.quantidade, 0);
    assert.equal(r.total, 0);
  });
});

test('conta itens e soma os valores sugeridos', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([
    item({ valorSugerido: 99.9 }),
    item({ valorSugerido: 100 }),
    item({ valorSugerido: 129.9 }),
  ]);
  assert.equal(r.quantidade, 3);
  assert.equal(r.total, 329.8);
});

test('soma em centavos: não acumula erro de ponto flutuante', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([
    item({ valorSugerido: 0.1 }), item({ valorSugerido: 0.2 }),
    item({ valorSugerido: 0.3 }), item({ valorSugerido: 10.15 }),
  ]);
  assert.equal(r.total, 10.75);
});

test('valor ausente ou não numérico conta como zero', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([
    item({ valorSugerido: 50 }),
    item({ valorSugerido: undefined }),
    item({ valorSugerido: null }),
  ]);
  assert.equal(r.quantidade, 3, 'item sem valor continua sendo um compromisso');
  assert.equal(r.total, 50);
});

// ── Atrasados ─────────────────────────────────────────────────────────────

test('conta somente os itens marcados como atrasados', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([
    item({ atrasada: true }), item({ atrasada: true }),
    item({ atrasada: false }), item(),
  ]);
  assert.equal(r.quantidade, 4);
  assert.equal(r.atrasados, 2);
});

test('sem atraso nenhum, atrasados é 0 (e não undefined)', () => {
  const { ctx } = cenario();
  assert.equal(ctx._obrigacoesResumo([item(), item()]).atrasados, 0);
});

test('todos atrasados: atrasados iguala quantidade', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([item({ atrasada: true }), item({ atrasada: true })]);
  assert.equal(r.atrasados, r.quantidade);
});

// ── Honestidade do total ──────────────────────────────────────────────────

test('temEstimativa é falso quando todos os valores são devidos', () => {
  const { ctx } = cenario();
  assert.equal(ctx._obrigacoesResumo([item(), item()]).temEstimativa, false);
});

test('uma única estimativa contamina o agregado inteiro', () => {
  const { ctx } = cenario();
  const r = ctx._obrigacoesResumo([
    item(), item(), item({ origem: 'pendencia', valorEhEstimativa: true }),
  ]);
  assert.equal(r.temEstimativa, true, 'total com pendência não pode ser apresentado como exato');
});

test('texto do total sinaliza a estimativa com "cerca de"', () => {
  const { ctx } = cenario();
  const comEstimativa = ctx._obrigacoesResumo([item({ valorSugerido: 329.8, valorEhEstimativa: true })]);
  const semEstimativa = ctx._obrigacoesResumo([item({ valorSugerido: 329.8 })]);
  assert.match(ctx._obrigacoesTotalTexto(comEstimativa), /^cerca de R\$/);
  assert.equal(/cerca de/.test(ctx._obrigacoesTotalTexto(semEstimativa)), false);
  // O número é o mesmo nos dois — o que muda é a asserção de exatidão.
  assert.equal(
    ctx._obrigacoesTotalTexto(comEstimativa).replace('cerca de ', ''),
    ctx._obrigacoesTotalTexto(semEstimativa),
  );
});

test('contagem em português: singular e plural', () => {
  const { ctx } = cenario();
  assert.equal(ctx._obrigacoesContagemTexto(ctx._obrigacoesResumo([item()])), '1 compromisso');
  assert.equal(ctx._obrigacoesContagemTexto(ctx._obrigacoesResumo([item(), item()])), '2 compromissos');
  assert.equal(ctx._obrigacoesContagemTexto(ctx._obrigacoesResumo([])), '0 compromissos');
});

// ── Integração com o resolvedor ───────────────────────────────────────────

test('resume o que o resolvedor devolve, sem consultar D por fora', () => {
  const { ctx } = cenario({
    debts: [dividaRedonda()],
    fixedExpenses: [fixoTeste()],
    pendencias: [pendenciaTeste()],
  });
  const itens = ctx._obrigacoesEmAberto();
  const r = ctx._obrigacoesResumo(itens);
  assert.equal(r.quantidade, itens.length);
  assert.equal(r.atrasados, itens.filter(i => i.atrasada).length);
  assert.equal(r.temEstimativa, true, 'a pendência traz estimativa para o agregado');
  // 100 (parcela) + 99,90 (fixo) + 250 (pendência estimada)
  assert.equal(r.total, 449.9);
});

test('INVARIANTE: agregar não muda a lista nem os itens', () => {
  const { ctx } = cenario();
  const itens = [item({ valorSugerido: 10 }), item({ valorSugerido: 20, atrasada: true })];
  const copia = JSON.stringify(itens);
  ctx._obrigacoesResumo(itens);
  assert.equal(JSON.stringify(itens), copia);
  assert.equal(itens.length, 2);
});

test('INVARIANTE: agregar não escreve em D', () => {
  const { ctx, app } = cenario({ fixedExpenses: [fixoTeste()], pendencias: [pendenciaTeste()] });
  const antes = JSON.stringify(app.D);
  ctx._obrigacoesResumo(ctx._obrigacoesEmAberto());
  assert.equal(JSON.stringify(app.D), antes);
});

test('INVARIANTE: sem cache — o agregado acompanha a lista corrente', () => {
  const { ctx, app } = cenario({ fixedExpenses: [fixoTeste()] });
  assert.equal(ctx._obrigacoesResumo(ctx._obrigacoesEmAberto()).quantidade, 1);
  app.D.pendencias.push(pendenciaTeste());
  assert.equal(ctx._obrigacoesResumo(ctx._obrigacoesEmAberto()).quantidade, 2);
});
