// Dívida: alocação de pagamentos, saldo, atraso e capital na rua.
import test from 'node:test';
import assert from 'node:assert/strict';

import { estadoDaDivida, SITUACAO } from '../src/core/debt.js';

const DIVIDA = {
  id: 'div_1',
  clienteId: 'cli_1',
  baseCents: 100000,        // R$ 1.000 emprestados
  jurosPercentual: 20,      // → R$ 1.200 a receber
  periodicidade: 'mensal',
  parcelas: 10,             // → 10 × R$ 120
  primeiroVencimento: '2026-01-10',
};

let sequencia = 0;
function pagamento(valorCents, data, parcelaNumero = null) {
  sequencia += 1;
  return { id: `pag_${sequencia}`, dividaId: 'div_1', valorCents, data, parcelaNumero, criadoEm: sequencia };
}

test('dívida sem pagamento: tudo em aberto, capital todo na rua', () => {
  const e = estadoDaDivida(DIVIDA, [], '2026-01-01');
  assert.equal(e.totalCents, 120000);
  assert.equal(e.recebidoCents, 0);
  assert.equal(e.saldoCents, 120000);
  assert.equal(e.capitalNaRuaCents, 100000);
  assert.equal(e.jurosAReceberCents, 20000);
  assert.deepEqual(e.contagem, { total: 10, pagas: 0, pendentes: 10, atrasadas: 0 });
  assert.equal(e.proximoVencimento, '2026-01-10');
  assert.equal(e.quitada, false);
});

test('parcela quitada abate saldo, caixa e capital na rua, cada um na sua medida', () => {
  const e = estadoDaDivida(DIVIDA, [pagamento(12000, '2026-01-10')], '2026-01-11');

  assert.equal(e.recebidoCents, 12000);
  assert.equal(e.saldoCents, 108000, 'a receber cai pelo valor cheio da parcela');
  // A parcela é 1/10 da dívida: recuperou 1/10 do principal e 1/10 do juro.
  assert.equal(e.capitalRecuperadoCents, 10000);
  assert.equal(e.capitalNaRuaCents, 90000, 'na rua cai só o principal');
  assert.equal(e.jurosRecebidoCents, 2000);
  assert.equal(e.contagem.pagas, 1);
  assert.equal(e.contagem.pendentes, 9);
  assert.equal(e.proximoVencimento, '2026-02-10');
  assert.equal(e.parcelas[0].situacao, SITUACAO.PAGA);
  assert.equal(e.parcelas[0].quitadaEm, '2026-01-10');
});

test('pagamento parcial deixa a parcela em aberto com o restante certo', () => {
  const e = estadoDaDivida(DIVIDA, [pagamento(5000, '2026-01-10')], '2026-01-10');
  assert.equal(e.parcelas[0].pagoCents, 5000);
  assert.equal(e.parcelas[0].restanteCents, 7000);
  assert.equal(e.parcelas[0].parcial, true);
  assert.equal(e.parcelas[0].situacao, SITUACAO.HOJE);
  assert.equal(e.contagem.pagas, 0);
  assert.equal(e.saldoCents, 115000);
});

test('pagamento maior que a parcela transborda para as seguintes', () => {
  const e = estadoDaDivida(DIVIDA, [pagamento(30000, '2026-01-10')], '2026-01-10');
  assert.equal(e.contagem.pagas, 2);
  assert.equal(e.parcelas[2].pagoCents, 6000);
  assert.equal(e.parcelas[2].restanteCents, 6000);
  assert.equal(e.saldoCents, 90000);
  assert.equal(e.creditoCents, 0);
});

test('pagamento dirigido quita a parcela escolhida sem tocar nas anteriores', () => {
  const e = estadoDaDivida(DIVIDA, [pagamento(12000, '2026-05-10', 5)], '2026-05-11');
  assert.equal(e.parcelas[4].situacao, SITUACAO.PAGA);
  assert.equal(e.parcelas[0].situacao, SITUACAO.ATRASADA, 'a primeira continua atrasada');
  assert.equal(e.contagem.pagas, 1);
  assert.equal(e.contagem.atrasadas, 4, 'parcelas 1 a 4 venceram e seguem abertas');
  assert.equal(e.proximaParcela.numero, 1, 'a próxima cobrança é a mais antiga em aberto');
});

test('pagamento dirigido transborda para a frente, e o excedente vira crédito', () => {
  const e = estadoDaDivida(DIVIDA, [pagamento(30000, '2026-09-10', 9)], '2026-09-11');
  assert.equal(e.parcelas[8].situacao, SITUACAO.PAGA);
  assert.equal(e.parcelas[9].situacao, SITUACAO.PAGA);
  assert.equal(e.recebidoCents, 30000);
  assert.equal(e.aplicadoCents, 24000);
  assert.equal(e.creditoCents, 6000, 'sobrou depois da última parcela');
  assert.equal(e.saldoCents, 96000);
});

test('pagamentos são aplicados em ordem cronológica, não na ordem de cadastro', () => {
  const tarde = pagamento(12000, '2026-02-10');
  const cedo = pagamento(12000, '2026-01-10');
  const e = estadoDaDivida(DIVIDA, [tarde, cedo], '2026-02-11');
  assert.equal(e.parcelas[0].quitadaEm, '2026-01-10');
  assert.equal(e.parcelas[1].quitadaEm, '2026-02-10');
});

test('atraso é contado pela data de hoje, e as pendentes incluem as atrasadas', () => {
  const e = estadoDaDivida(DIVIDA, [], '2026-03-15');
  assert.equal(e.contagem.atrasadas, 3, 'jan, fev e mar já venceram');
  assert.equal(e.contagem.pendentes, 10);
  assert.equal(e.atrasadoCents, 36000);
  assert.equal(e.emAtraso, true);
  assert.equal(e.parcelas[0].diasDeAtraso, 64);
});

test('parcela que vence hoje não é atraso', () => {
  const e = estadoDaDivida(DIVIDA, [], '2026-01-10');
  assert.equal(e.parcelas[0].situacao, SITUACAO.HOJE);
  assert.equal(e.contagem.atrasadas, 0);
  assert.equal(e.atrasadoCents, 0);
  assert.equal(e.venceHojeCents, 12000);
});

test('dívida quitada zera saldo, atraso e capital na rua', () => {
  const pagamentos = Array.from({ length: 10 }, (_, i) => pagamento(12000, '2026-01-10'));
  const e = estadoDaDivida(DIVIDA, pagamentos, '2027-01-01');
  assert.equal(e.quitada, true);
  assert.equal(e.saldoCents, 0);
  assert.equal(e.atrasadoCents, 0);
  assert.equal(e.capitalNaRuaCents, 0, 'o principal voltou por inteiro');
  assert.equal(e.jurosRecebidoCents, 20000);
  assert.equal(e.proximoVencimento, null);
  assert.equal(e.contagem.pagas, 10);
  assert.equal(e.contagem.pendentes, 0);
});

test('INVARIANTE: capital na rua + capital recuperado é sempre a base', () => {
  const cenarios = [[], [pagamento(1, '2026-01-10')], [pagamento(57345, '2026-01-10')],
    [pagamento(119999, '2026-01-10')], [pagamento(120000, '2026-01-10')]];
  for (const pagamentos of cenarios) {
    const e = estadoDaDivida(DIVIDA, pagamentos, '2026-06-01');
    assert.equal(e.capitalNaRuaCents + e.capitalRecuperadoCents, e.baseCents);
    assert.equal(e.capitalRecuperadoCents + e.jurosRecebidoCents, e.aplicadoCents);
    assert.equal(e.saldoCents, e.parcelas.reduce((t, p) => t + p.restanteCents, 0));
    assert.ok(e.capitalNaRuaCents <= e.saldoCents, 'na rua nunca passa do a receber');
  }
});

test('dívida com parcela residual continua fechando na conta', () => {
  const divida = { ...DIVIDA, jurosPercentual: 15, parcelas: 7 };
  const e = estadoDaDivida(divida, [pagamento(115000, '2026-01-10')], '2026-01-11');
  assert.equal(e.totalCents, 115000);
  assert.equal(e.quitada, true);
  assert.equal(e.creditoCents, 0, 'o pagamento cheio cobre a parcela residual sem sobrar');
  assert.equal(e.parcelas[6].valorCents, 16432);
});
