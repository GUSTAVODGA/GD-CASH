// Modelo e armazenamento: o que é gravado, o que é descartado, o que dispara
// redesenho.
import test from 'node:test';
import assert from 'node:assert/strict';

import { criarStore, adaptadorMemoria } from '../src/core/store.js';
import { normalizar, estadoVazio, formatarTelefone, iniciais, VERSAO_DADOS } from '../src/core/model.js';
import { ErroDeValor } from '../src/core/money.js';
import { TIPO_CAIXA } from '../src/core/portfolio.js';

function storeDeTeste() {
  return criarStore(adaptadorMemoria());
}

test('a cadeia inteira cabe em quatro coleções', () => {
  const store = storeDeTeste();
  const cliente = store.adicionarCliente({ nome: 'Cliente Teste', telefone: '11999998888' });
  const divida = store.adicionarDivida({
    clienteId: cliente.id, baseCents: 100000, jurosPercentual: 20,
    periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
  });
  store.registrarPagamento({ dividaId: divida.id, valorCents: 12000, data: '2026-01-10' });
  store.registrarMovimentoCaixa({ tipo: TIPO_CAIXA.APORTE, valorCents: 200000, data: '2026-01-01' });

  const e = store.estado();
  assert.equal(e.clientes.length, 1);
  assert.equal(e.dividas.length, 1);
  assert.equal(e.pagamentos.length, 1);
  assert.equal(e.caixa.length, 1);
  assert.equal(e.versao, VERSAO_DADOS);
});

test('parcelas não são gravadas — elas são derivadas dos termos', () => {
  const store = storeDeTeste();
  const cliente = store.adicionarCliente({ nome: 'Cliente Teste' });
  const divida = store.adicionarDivida({
    clienteId: cliente.id, baseCents: 100000, jurosPercentual: 20,
    periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
  });
  assert.equal(divida.parcelas, 10, 'guarda a quantidade');
  assert.equal(Array.isArray(divida.parcelas), false, 'não guarda a lista');
  assert.equal('totalCents' in divida, false, 'total é derivado, não gravado');
  assert.equal('saldoCents' in divida, false, 'saldo é derivado, não gravado');
});

test('a dívida já nasce com a costura para juntar dívidas no futuro', () => {
  const store = storeDeTeste();
  const cliente = store.adicionarCliente({ nome: 'Cliente Teste' });
  const divida = store.adicionarDivida({
    clienteId: cliente.id, baseCents: 50000, jurosPercentual: 10,
    periodicidade: 'semanal', parcelas: 4, primeiroVencimento: '2026-01-05',
  });
  assert.deepEqual(divida.origemDividaIds, []);
  assert.equal(divida.substituidaPorId, null);

  // E os campos sobrevivem a uma ida e volta pelo armazenamento.
  const relido = normalizar({ ...store.estado(), dividas: [{ ...divida, origemDividaIds: ['div_x'], substituidaPorId: 'div_y' }] });
  assert.deepEqual(relido.dividas[0].origemDividaIds, ['div_x']);
  assert.equal(relido.dividas[0].substituidaPorId, 'div_y');
});

test('entrada inválida é recusada antes de virar dado', () => {
  const store = storeDeTeste();
  assert.throws(() => store.adicionarCliente({ nome: '   ' }), ErroDeValor);
  const cliente = store.adicionarCliente({ nome: 'Cliente Teste' });

  const invalidas = [
    { baseCents: 0 },
    { parcelas: 0 },
    { jurosPercentual: -5 },
    { periodicidade: 'anual' },
    { primeiroVencimento: '2026-02-30' },
  ];
  for (const campo of invalidas) {
    assert.throws(() => store.adicionarDivida({
      clienteId: cliente.id, baseCents: 100000, jurosPercentual: 20,
      periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
      ...campo,
    }), Error, JSON.stringify(campo));
  }
  assert.equal(store.estado().dividas.length, 0);
});

test('remover cliente leva junto as dívidas e os pagamentos dele', () => {
  const store = storeDeTeste();
  const a = store.adicionarCliente({ nome: 'Cliente A' });
  const b = store.adicionarCliente({ nome: 'Cliente B' });
  const divA = store.adicionarDivida({
    clienteId: a.id, baseCents: 100000, jurosPercentual: 20,
    periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
  });
  const divB = store.adicionarDivida({
    clienteId: b.id, baseCents: 50000, jurosPercentual: 10,
    periodicidade: 'mensal', parcelas: 5, primeiroVencimento: '2026-01-10',
  });
  store.registrarPagamento({ dividaId: divA.id, valorCents: 12000, data: '2026-01-10' });
  store.registrarPagamento({ dividaId: divB.id, valorCents: 11000, data: '2026-01-10' });

  store.removerCliente(a.id);

  const e = store.estado();
  assert.equal(e.clientes.length, 1);
  assert.equal(e.dividas.length, 1);
  assert.equal(e.pagamentos.length, 1, 'não sobrou pagamento órfão');
  assert.equal(e.pagamentos[0].dividaId, divB.id);
});

test('remover dívida leva os pagamentos dela e nada mais', () => {
  const store = storeDeTeste();
  const cliente = store.adicionarCliente({ nome: 'Cliente Teste' });
  const divida = store.adicionarDivida({
    clienteId: cliente.id, baseCents: 100000, jurosPercentual: 20,
    periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
  });
  store.registrarPagamento({ dividaId: divida.id, valorCents: 12000, data: '2026-01-10' });
  store.removerDivida(divida.id);

  assert.equal(store.estado().dividas.length, 0);
  assert.equal(store.estado().pagamentos.length, 0);
  assert.equal(store.estado().clientes.length, 1, 'o cliente permanece');
});

test('registro malformado é descartado na leitura, não remendado por chute', () => {
  const bruto = {
    clientes: [
      { id: 'cli_1', nome: 'Cliente Teste' },
      { id: 'cli_2', nome: '   ' },            // sem nome
      { nome: 'Sem id' },                       // sem id
    ],
    dividas: [
      { id: 'div_1', clienteId: 'cli_1', baseCents: 100000, jurosPercentual: 20, periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10' },
      { id: 'div_2', clienteId: 'cli_99', baseCents: 100000, jurosPercentual: 20, periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10' }, // cliente inexistente
      { id: 'div_3', clienteId: 'cli_1', baseCents: 100000, jurosPercentual: 20, periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-02-30' },  // data impossível
    ],
    pagamentos: [
      { id: 'pag_1', dividaId: 'div_1', valorCents: 12000, data: '2026-01-10' },
      { id: 'pag_2', dividaId: 'div_2', valorCents: 12000, data: '2026-01-10' }, // dívida descartada
      { id: 'pag_3', dividaId: 'div_1', valorCents: -5, data: '2026-01-10' },    // valor negativo
    ],
    caixa: [
      { id: 'cx_1', tipo: 'aporte', valorCents: 200000, data: '2026-01-01' },
      { id: 'cx_2', tipo: 'mágica', valorCents: 200000, data: '2026-01-01' },
    ],
  };

  const limpo = normalizar(bruto);
  assert.deepEqual(limpo.clientes.map(c => c.id), ['cli_1']);
  assert.deepEqual(limpo.dividas.map(d => d.id), ['div_1']);
  assert.deepEqual(limpo.pagamentos.map(p => p.id), ['pag_1']);
  assert.deepEqual(limpo.caixa.map(m => m.id), ['cx_1']);
});

test('armazenamento ilegível não derruba o app — ele volta vazio', () => {
  assert.deepEqual(normalizar(null), estadoVazio());
  assert.deepEqual(normalizar('lixo'), estadoVazio());
  assert.deepEqual(normalizar({ clientes: 'não é lista' }).clientes, []);
});

test('o estado sobrevive a uma ida e volta pelo adaptador', () => {
  const adaptador = adaptadorMemoria();
  const primeiro = criarStore(adaptador);
  const cliente = primeiro.adicionarCliente({ nome: 'Cliente Teste', telefone: '11999998888' });
  primeiro.adicionarDivida({
    clienteId: cliente.id, baseCents: 100000, jurosPercentual: 20,
    periodicidade: 'mensal', parcelas: 10, primeiroVencimento: '2026-01-10',
  });

  const segundo = criarStore(adaptador);
  assert.equal(segundo.estado().clientes.length, 1);
  assert.equal(segundo.estado().dividas.length, 1);
  assert.equal(segundo.cliente(cliente.id).nome, 'Cliente Teste');
});

test('toda mutação avisa quem assinou', () => {
  const store = storeDeTeste();
  let avisos = 0;
  const cancelar = store.assinar(() => { avisos += 1; });

  const cliente = store.adicionarCliente({ nome: 'Cliente Teste' });
  store.editarCliente(cliente.id, { telefone: '11999998888' });
  assert.equal(avisos, 2);

  cancelar();
  store.adicionarCliente({ nome: 'Outro' });
  assert.equal(avisos, 2, 'depois de cancelar, não avisa mais');
});

test('apresentação de dados do cliente', () => {
  assert.equal(formatarTelefone('11999998888'), '(11) 99999-8888');
  assert.equal(formatarTelefone('1133334444'), '(11) 3333-4444');
  assert.equal(formatarTelefone('12345'), '12345');
  assert.equal(iniciais('João da Silva'), 'JS');
  assert.equal(iniciais('Ana'), 'AN');
  assert.equal(iniciais(''), '?');
});
