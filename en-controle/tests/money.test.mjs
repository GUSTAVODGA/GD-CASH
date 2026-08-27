// Dinheiro: arredondamento explícito e a invariante de que nada se perde.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dividirArredondando, aplicarJuros, jurosDe, repartirParcelas, ratear,
  lerValor, formatarReais, formatarNumero, formatarPercentual, ErroDeValor,
} from '../src/core/money.js';

test('divisão arredonda meio para longe do zero, sem passar por float', () => {
  assert.equal(dividirArredondando(10, 4), 3, '2,5 → 3');
  assert.equal(dividirArredondando(-10, 4), -3, '−2,5 → −3');
  assert.equal(dividirArredondando(9, 4), 2);
  assert.equal(dividirArredondando(11, 4), 3);
  assert.equal(dividirArredondando(0, 7), 0);
  assert.throws(() => dividirArredondando(1, 0), ErroDeValor);
});

test('juros simples aplicados uma única vez sobre a base', () => {
  assert.equal(aplicarJuros(100000, 20), 120000, 'R$ 1.000 + 20% = R$ 1.200');
  assert.equal(aplicarJuros(100000, 15), 115000);
  assert.equal(aplicarJuros(250000, 10), 275000);
  assert.equal(aplicarJuros(100000, 0), 100000, 'sem juros, total é a base');
  assert.equal(aplicarJuros(33333, 15), 38333, 'R$ 333,33 + 15% = R$ 383,33');
});

test('meio centavo exato sobe — a regra é declarada, não sorteada pelo float', () => {
  // 10 centavos + 15% = 11,5 centavos exatos.
  assert.equal(aplicarJuros(10, 15), 12);
  assert.equal(jurosDe(10, 12), 2);
});

test('percentual quebrado é aceito até duas casas', () => {
  assert.equal(aplicarJuros(100000, 12.5), 112500);
  assert.equal(aplicarJuros(100000, 7.25), 107250);
  assert.throws(() => aplicarJuros(100000, -1), ErroDeValor);
  assert.throws(() => aplicarJuros(-1, 10), ErroDeValor);
});

test('INVARIANTE: a soma das parcelas fecha exatamente com o total', () => {
  const totais = [100000, 120000, 100, 1, 999999, 38333, 250037, 7, 1000001];
  const quantidades = [1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 17, 24, 52, 120];

  for (const total of totais) {
    for (const n of quantidades) {
      const parcelas = repartirParcelas(total, n);
      const soma = parcelas.reduce((t, v) => t + v, 0);
      assert.equal(soma, total, `${total} em ${n}x somou ${soma}`);
      assert.equal(parcelas.length, n);
      assert.ok(parcelas.every(v => v >= 0), 'nenhuma parcela negativa');
    }
  }
});

test('a diferença de arredondamento vai inteira para a última parcela', () => {
  // R$ 1.000 em 3 vezes: 333,33 + 333,33 + 333,34.
  assert.deepEqual(repartirParcelas(100000, 3), [33333, 33333, 33334]);
  // Divisão exata não cria parcela diferente.
  assert.deepEqual(repartirParcelas(120000, 10), Array(10).fill(12000));
  assert.deepEqual(repartirParcelas(100, 7), [14, 14, 14, 14, 14, 14, 16]);
});

test('parcelamento recusa entrada sem sentido', () => {
  assert.throws(() => repartirParcelas(1000, 0), ErroDeValor);
  assert.throws(() => repartirParcelas(-1, 3), ErroDeValor);
  assert.throws(() => repartirParcelas(1000, 2.5), ErroDeValor);
});

test('rateio proporcional respeita o teto e nunca fica negativo', () => {
  // Metade de uma dívida de 120.000 recuperou metade do principal de 100.000.
  assert.equal(ratear(60000, 100000, 120000, 100000), 50000);
  assert.equal(ratear(120000, 100000, 120000, 100000), 100000, 'quitada devolve o principal inteiro');
  assert.equal(ratear(0, 100000, 120000, 100000), 0);
  assert.equal(ratear(999999, 100000, 120000, 100000), 100000, 'não passa do teto');
});

test('leitura do que o usuário digita', () => {
  assert.equal(lerValor('1.234,56'), 123456);
  assert.equal(lerValor('1234,56'), 123456);
  assert.equal(lerValor('1234.56'), 123456);
  assert.equal(lerValor('R$ 2.000'), 200000, 'milhar com ponto não vira decimal');
  assert.equal(lerValor('1.234'), 123400);
  assert.equal(lerValor('2000'), 200000);
  assert.equal(lerValor('0,5'), 50);
  assert.equal(lerValor('  850  '), 85000);
  assert.equal(lerValor(''), null);
  assert.equal(lerValor('abc'), null);
  assert.equal(lerValor(null), null);
});

test('formatação em português', () => {
  assert.equal(formatarNumero(123456), '1.234,56');
  assert.equal(formatarReais(123456), 'R$ 1.234,56');
  assert.equal(formatarReais(0), 'R$ 0,00');
  assert.equal(formatarReais(-50000), '− R$ 500,00');
  assert.equal(formatarPercentual(20), '20%');
  assert.equal(formatarPercentual(12.5), '12,5%');
});
