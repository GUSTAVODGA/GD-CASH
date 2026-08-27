// Cronograma: as duas invariantes do produto, e as três periodicidades.
import test from 'node:test';
import assert from 'node:assert/strict';

import { montarCronograma, vencimentoNoIndice, PERIODICIDADES, MAX_PARCELAS } from '../src/core/schedule.js';
import { ErroDeValor } from '../src/core/money.js';
import { ErroDeData, somarDias, somarMeses } from '../src/core/dates.js';

const BASE = {
  baseCents: 100000,
  jurosPercentual: 20,
  periodicidade: 'mensal',
  parcelas: 10,
  primeiroVencimento: '2026-01-10',
};

test('a prévia da dívida: valor, juros, total, parcelas e as duas pontas', () => {
  const c = montarCronograma(BASE);
  assert.equal(c.baseCents, 100000);
  assert.equal(c.jurosCents, 20000);
  assert.equal(c.totalCents, 120000);
  assert.equal(c.parcelas.length, 10);
  assert.equal(c.valorParcelaCents, 12000);
  assert.equal(c.parcelasIguais, true);
  assert.equal(c.primeiroVencimento, '2026-01-10');
  assert.equal(c.ultimoVencimento, '2026-10-10');
});

test('INVARIANTE 1: a soma das parcelas é exatamente o total, em qualquer combinação', () => {
  const bases = [100000, 33333, 250000, 99999, 1, 777777];
  const juros = [0, 10, 15, 20, 12.5, 33.33];
  const quantidades = [1, 3, 7, 12, 13, 24];

  for (const baseCents of bases) {
    for (const jurosPercentual of juros) {
      for (const parcelas of quantidades) {
        const c = montarCronograma({ ...BASE, baseCents, jurosPercentual, parcelas });
        const soma = c.parcelas.reduce((t, p) => t + p.valorCents, 0);
        assert.equal(soma, c.totalCents, `${baseCents} a ${jurosPercentual}% em ${parcelas}x`);
        assert.equal(c.baseCents + c.jurosCents, c.totalCents);
      }
    }
  }
});

test('INVARIANTE 2: cada vencimento nasce do primeiro, nunca do anterior', () => {
  // Um cronograma mensal iniciado em 31/01 precisa recuperar o dia 31 depois
  // de fevereiro. Derivação em cadeia grudaria em 28 para sempre.
  const c = montarCronograma({ ...BASE, parcelas: 6, primeiroVencimento: '2026-01-31' });
  assert.deepEqual(c.parcelas.map(p => p.vencimento), [
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
  ]);
});

test('mensal em ano bissexto', () => {
  const c = montarCronograma({ ...BASE, parcelas: 3, primeiroVencimento: '2024-01-31' });
  assert.deepEqual(c.parcelas.map(p => p.vencimento), ['2024-01-31', '2024-02-29', '2024-03-31']);
});

test('semanal avança semanas reais, inclusive na virada do ano', () => {
  const c = montarCronograma({
    ...BASE, periodicidade: 'semanal', parcelas: 4, primeiroVencimento: '2026-12-21',
  });
  assert.deepEqual(c.parcelas.map(p => p.vencimento), [
    '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11',
  ]);
  // Todo intervalo tem exatamente 7 dias.
  for (let i = 1; i < c.parcelas.length; i += 1) {
    assert.equal(somarDias(c.parcelas[i - 1].vencimento, 7), c.parcelas[i].vencimento);
  }
});

test('quinzenal respeita intervalos reais de 14 dias, sem exceção de mês', () => {
  const c = montarCronograma({
    ...BASE, periodicidade: 'quinzenal', parcelas: 5, primeiroVencimento: '2026-01-31',
  });
  assert.deepEqual(c.parcelas.map(p => p.vencimento), [
    '2026-01-31', '2026-02-14', '2026-02-28', '2026-03-14', '2026-03-28',
  ]);
  for (let i = 1; i < c.parcelas.length; i += 1) {
    assert.equal(somarDias(c.parcelas[i - 1].vencimento, 14), c.parcelas[i].vencimento);
  }
});

test('mensal avança mês de calendário, e nunca 30 dias', () => {
  const c = montarCronograma({ ...BASE, parcelas: 4, primeiroVencimento: '2026-01-15' });
  for (let i = 0; i < c.parcelas.length; i += 1) {
    assert.equal(c.parcelas[i].vencimento, somarMeses('2026-01-15', i));
  }
  assert.equal(c.parcelas[1].vencimento, '2026-02-15');
});

test('parcela residual aparece só na última, e o resto fica redondo', () => {
  // R$ 1.000 + 15% = R$ 1.150 em 7 vezes → 164,28 × 6 + 164,32.
  const c = montarCronograma({ ...BASE, jurosPercentual: 15, parcelas: 7 });
  assert.equal(c.totalCents, 115000);
  assert.equal(c.valorParcelaCents, 16428);
  assert.equal(c.ultimaParcelaCents, 16432);
  assert.equal(c.parcelasIguais, false);
  assert.equal(c.parcelas.slice(0, 6).every(p => p.valorCents === 16428), true);
  assert.equal(c.parcelas.reduce((t, p) => t + p.valorCents, 0), 115000);
});

test('parcela única é um cronograma legítimo', () => {
  const c = montarCronograma({ ...BASE, parcelas: 1 });
  assert.equal(c.parcelas.length, 1);
  assert.equal(c.parcelas[0].valorCents, 120000);
  assert.equal(c.primeiroVencimento, c.ultimoVencimento);
});

test('a numeração das parcelas começa em 1 e é contínua', () => {
  const c = montarCronograma({ ...BASE, parcelas: 12 });
  assert.deepEqual(c.parcelas.map(p => p.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('entrada inválida é recusada com mensagem de gente', () => {
  assert.throws(() => montarCronograma({ ...BASE, baseCents: 0 }), ErroDeValor);
  assert.throws(() => montarCronograma({ ...BASE, parcelas: 0 }), ErroDeValor);
  assert.throws(() => montarCronograma({ ...BASE, parcelas: MAX_PARCELAS + 1 }), ErroDeValor);
  assert.throws(() => montarCronograma({ ...BASE, periodicidade: 'anual' }), ErroDeData);
  assert.throws(() => montarCronograma({ ...BASE, primeiroVencimento: '2026-02-30' }), ErroDeData);
});

test('as três periodicidades previstas estão declaradas', () => {
  assert.deepEqual(Object.keys(PERIODICIDADES), ['semanal', 'quinzenal', 'mensal']);
  assert.equal(vencimentoNoIndice('2026-01-01', 'semanal', 3), '2026-01-22');
  assert.equal(vencimentoNoIndice('2026-01-01', 'quinzenal', 2), '2026-01-29');
  assert.equal(vencimentoNoIndice('2026-01-01', 'mensal', 2), '2026-03-01');
});
