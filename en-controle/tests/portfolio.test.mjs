// Panorama: os quatro conceitos financeiros, e a fronteira entre eles.
import test from 'node:test';
import assert from 'node:assert/strict';

import { panorama, estadoDoCliente, TIPO_CAIXA } from '../src/core/portfolio.js';

const CLIENTE = { id: 'cli_1', nome: 'Cliente Teste', telefone: '', endereco: '', observacoes: '' };
const OUTRO = { id: 'cli_2', nome: 'Outro Cliente', telefone: '', endereco: '', observacoes: '' };

const DIVIDA = {
  id: 'div_1', clienteId: 'cli_1',
  baseCents: 100000, jurosPercentual: 20,
  periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
};

function dados(extra = {}) {
  return {
    clientes: [CLIENTE], dividas: [DIVIDA], pagamentos: [], caixa: [],
    ...extra,
  };
}

const APORTE = { id: 'cx_1', tipo: TIPO_CAIXA.APORTE, valorCents: 200000, data: '2026-01-01', criadoEm: 1 };

test('os quatro números não são o mesmo número', () => {
  const p = panorama(dados({ caixa: [APORTE] }), '2026-01-01');

  assert.equal(p.emCaixaCents, 100000, 'aporte de 2.000 menos 1.000 emprestados');
  assert.equal(p.naRuaCents, 100000, 'só o principal está na rua');
  assert.equal(p.aReceberCents, 120000, 'a receber inclui os juros');
  assert.equal(p.atrasadoCents, 0, 'nada venceu ainda');

  assert.notEqual(p.naRuaCents, p.aReceberCents, 'na rua é principal; a receber é principal + juro');
  assert.equal(p.aReceberCents - p.naRuaCents, 20000, 'a diferença é o lucro ainda não realizado');
});

test('emprestar tira do caixa e põe na rua, sem mexer no patrimônio', () => {
  const semDivida = panorama({ clientes: [CLIENTE], dividas: [], pagamentos: [], caixa: [APORTE] }, '2026-01-01');
  assert.equal(semDivida.emCaixaCents, 200000);
  assert.equal(semDivida.naRuaCents, 0);

  const comDivida = panorama(dados({ caixa: [APORTE] }), '2026-01-01');
  assert.equal(comDivida.emCaixaCents + comDivida.naRuaCents, 200000, 'patrimônio preservado');
});

test('receber move dinheiro da rua para o caixa, e o juro aparece como ganho', () => {
  const pagamentos = [{ id: 'pag_1', dividaId: 'div_1', valorCents: 12000, data: '2026-01-10', parcelaNumero: null, criadoEm: 1 }];
  const p = panorama(dados({ pagamentos, caixa: [APORTE] }), '2026-01-11');

  assert.equal(p.emCaixaCents, 112000, '2.000 − 1.000 + 120 recebidos');
  assert.equal(p.naRuaCents, 90000);
  assert.equal(p.aReceberCents, 108000);
  assert.equal(p.jurosRecebidoCents, 2000);

  // Patrimônio = aportes + juro realizado.
  assert.equal(p.emCaixaCents + p.naRuaCents, 200000 + p.jurosRecebidoCents);
});

test('sem aporte registrado, o caixa fica negativo — e isso é a verdade, não um bug', () => {
  const p = panorama(dados(), '2026-01-01');
  assert.equal(p.emCaixaCents, -100000, 'o dinheiro saiu e a origem dele não foi registrada');
  assert.equal(p.naRuaCents, 100000);
});

test('retirada sai do caixa e não volta como dívida', () => {
  const caixa = [APORTE, { id: 'cx_2', tipo: TIPO_CAIXA.RETIRADA, valorCents: 50000, data: '2026-01-02', criadoEm: 2 }];
  const p = panorama(dados({ caixa }), '2026-01-01');
  assert.equal(p.emCaixaCents, 50000);
  assert.equal(p.naRuaCents, 100000, 'retirada não muda o que está na rua');
  assert.equal(p.aReceberCents, 120000);
});

test('atrasado é uma fatia do a receber, nunca uma quinta grandeza', () => {
  const p = panorama(dados({ caixa: [APORTE] }), '2026-03-15');
  assert.equal(p.atrasadoCents, 36000, 'três parcelas venceram');
  assert.equal(p.aReceberCents, 120000);
  assert.ok(p.atrasadoCents < p.aReceberCents);
  assert.equal(p.agenda.atrasadas.length, 3);
  assert.equal(p.agenda.hoje.length, 0);
  assert.equal(p.agenda.proximas.length, 7);
});

test('a agenda separa hoje, atrasado e o que ainda vem, em ordem de vencimento', () => {
  const p = panorama(dados(), '2026-02-10');
  assert.equal(p.agenda.atrasadas.length, 1);
  assert.equal(p.agenda.atrasadas[0].vencimento, '2026-01-10');
  assert.equal(p.agenda.hoje.length, 1);
  assert.equal(p.agenda.hoje[0].vencimento, '2026-02-10');
  assert.equal(p.venceHojeCents, 12000);

  const datas = p.agenda.proximas.map(i => i.vencimento);
  assert.deepEqual(datas, [...datas].sort(), 'próximas vêm em ordem de vencimento');
  assert.equal(p.agenda.proximas[0].vencimento, '2026-03-10');
  assert.equal(p.agenda.proximas[0].clienteNome, 'Cliente Teste');
});

test('parcela quitada some da agenda', () => {
  const pagamentos = [{ id: 'pag_1', dividaId: 'div_1', valorCents: 12000, data: '2026-01-10', parcelaNumero: null, criadoEm: 1 }];
  const p = panorama(dados({ pagamentos }), '2026-02-10');
  assert.equal(p.agenda.atrasadas.length, 0);
  assert.equal(p.agenda.hoje.length, 1);
});

test('vários clientes e várias dívidas somam sem se misturar', () => {
  const segunda = { ...DIVIDA, id: 'div_2', clienteId: 'cli_2', baseCents: 50000, jurosPercentual: 10, parcelas: 5 };
  const p = panorama({ clientes: [CLIENTE, OUTRO], dividas: [DIVIDA, segunda], pagamentos: [], caixa: [] }, '2026-01-01');

  assert.equal(p.naRuaCents, 150000);
  assert.equal(p.aReceberCents, 120000 + 55000);
  assert.equal(p.contagem.dividas, 2);
  assert.equal(p.contagem.dividasAbertas, 2);
  assert.equal(p.contagem.clientes, 2);

  const doCliente = estadoDoCliente(CLIENTE, p);
  assert.equal(doCliente.aReceberCents, 120000, 'a ficha do cliente vê só as dívidas dele');
  assert.equal(doCliente.contagem.dividas, 1);
});

test('um cliente pode ter várias dívidas ao mesmo tempo', () => {
  const outraDoMesmo = { ...DIVIDA, id: 'div_3', baseCents: 30000, jurosPercentual: 15, parcelas: 3, primeiroVencimento: '2026-02-01' };
  const p = panorama({ clientes: [CLIENTE], dividas: [DIVIDA, outraDoMesmo], pagamentos: [], caixa: [] }, '2026-01-01');

  const estado = estadoDoCliente(CLIENTE, p);
  assert.equal(estado.contagem.dividas, 2);
  assert.equal(estado.contagem.abertas, 2);
  assert.equal(estado.aReceberCents, 120000 + 34500);
  assert.equal(estado.naRuaCents, 130000);
  assert.equal(estado.proximoVencimento, '2026-01-10', 'o mais próximo entre todas as dívidas');
});

test('situação financeira do cliente sai do estado das dívidas', () => {
  const semDivida = estadoDoCliente(OUTRO, panorama(dados(), '2026-01-01'));
  assert.equal(semDivida.situacao, 'sem-dividas');

  const emDia = estadoDoCliente(CLIENTE, panorama(dados(), '2026-01-01'));
  assert.equal(emDia.situacao, 'em-dia');

  const atrasado = estadoDoCliente(CLIENTE, panorama(dados(), '2026-03-15'));
  assert.equal(atrasado.situacao, 'atrasado');
  assert.equal(atrasado.contagem.parcelasAtrasadas, 3);

  const pagamentos = Array.from({ length: 10 }, (_, i) => ({
    id: `pag_${i}`, dividaId: 'div_1', valorCents: 12000, data: '2026-01-10', parcelaNumero: null, criadoEm: i,
  }));
  const quitado = estadoDoCliente(CLIENTE, panorama(dados({ pagamentos }), '2027-01-01'));
  assert.equal(quitado.situacao, 'quitado');
  assert.equal(quitado.aReceberCents, 0);
});

test('operação vazia não quebra e devolve zeros', () => {
  const p = panorama({ clientes: [], dividas: [], pagamentos: [], caixa: [] }, '2026-01-01');
  assert.equal(p.emCaixaCents, 0);
  assert.equal(p.naRuaCents, 0);
  assert.equal(p.aReceberCents, 0);
  assert.equal(p.atrasadoCents, 0);
  assert.deepEqual(p.agenda, { atrasadas: [], hoje: [], proximas: [] });
});
