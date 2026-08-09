// Cronograma de dívida — total derivado + parcela residual.
//
// Caracteriza a correção que já foi a produção: quando o total cadastrado não
// é múltiplo do valor da parcela, a quantidade de parcelas é DERIVADA
// (ceil(total/parcela)) e a última absorve o resíduo, de modo que a soma das
// parcelas seja exatamente o valor total. O número cadastrado errado é
// ignorado, sem tocar em saldo, pagamentos ou histórico.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './_loader.mjs';
import {
  cenarioDivida, dividaComParcelaResidual, dividaRedonda,
  dividaComAmortizacaoAnterior, dividaIniciadaEmDia31,
} from './_fixtures.mjs';

function comDivida(divida, pagamentos = [], agora = '2026-06-15T12:00:00') {
  const carregado = carregarApp({ agora });
  carregado.app.D = cenarioDivida(divida, pagamentos);
  return carregado;
}

test('total de parcelas é derivado do valor, não do campo cadastrado', () => {
  const divida = dividaComParcelaResidual();      // 6500 / 200, cadastro diz 30
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtParcelasTotal(divida), 33);
});

test('a última parcela absorve o resíduo', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtParcelaCents(divida, 1), 20000);   // 200,00
  assert.equal(ctx._debtParcelaCents(divida, 32), 20000);
  assert.equal(ctx._debtParcelaCents(divida, 33), 10000);  // 100,00 de resíduo
});

test('INVARIANTE: a soma das parcelas é exatamente o valor total', () => {
  for (const divida of [dividaComParcelaResidual(), dividaRedonda(), dividaIniciadaEmDia31()]) {
    const { ctx } = comDivida(divida);
    const n = ctx._debtParcelasTotal(divida);
    let soma = 0;
    for (let k = 1; k <= n; k++) soma += ctx._debtParcelaCents(divida, k);
    assert.equal(soma, Math.round(divida.valorOriginal * 100), `soma divergente em ${divida.id}`);
  }
});

test('INVARIANTE: nenhuma parcela é zero ou negativa', () => {
  for (const divida of [dividaComParcelaResidual(), dividaRedonda(), dividaIniciadaEmDia31()]) {
    const { ctx } = comDivida(divida);
    const n = ctx._debtParcelasTotal(divida);
    for (let k = 1; k <= n; k++) {
      assert.equal(ctx._debtParcelaCents(divida, k) > 0, true, `parcela ${k} não positiva em ${divida.id}`);
    }
  }
});

test('dívida redonda mantém a contagem exata, sem resíduo artificial', () => {
  const divida = dividaRedonda();                  // 1200 / 100
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtParcelasTotal(divida), 12);
  assert.equal(ctx._debtParcelaCents(divida, 12), 10000);
});

test('sem valor de parcela, cai no total cadastrado', () => {
  const divida = dividaRedonda({ valorParcela: 0, parcelasTotal: 7 });
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtParcelasTotal(divida), 7);
});

test('amortização anterior ao cadastro conta como parcelas pagas', () => {
  const divida = dividaComAmortizacaoAnterior();   // 2000 amortizados, parcela 200
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtParcelasPagas(divida), 10);
  assert.equal(ctx._debtParcelasDeAmort(divida), 10);
  assert.equal(ctx._debtProximaParcelaNo(divida), 11);
  assert.equal(ctx._debtSaldo(divida), 4500);
});

test('pagamentos registrados no app somam à amortização anterior', () => {
  const divida = dividaComAmortizacaoAnterior();
  const { ctx } = comDivida(divida, [
    { id: 'pg-1', debtId: divida.id, valor: 200, data: '2026-06-10' },
  ]);
  assert.equal(ctx._debtParcelasPagas(divida), 11);
  assert.equal(ctx._debtSaldo(divida), 4300);
  // a origem anterior continua identificável à parte
  assert.equal(ctx._debtParcelasDeAmort(divida), 10);
});

test('pagamento parcial não fecha a parcela', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [
    { id: 'pg-parcial', debtId: divida.id, valor: 150, data: '2026-06-10' },
  ]);
  assert.equal(ctx._debtParcelasPagas(divida), 0);   // 150 < 200
  assert.equal(ctx._debtProximaParcelaNo(divida), 1);
  assert.equal(ctx._debtSaldo(divida), 6350);
});

test('pagamento antecipado cobre várias parcelas de uma vez', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [
    { id: 'pg-antec', debtId: divida.id, valor: 1000, data: '2026-06-10' },
  ]);
  assert.equal(ctx._debtParcelasPagas(divida), 5);   // 1000 / 200
  assert.equal(ctx._debtProximaParcelaNo(divida), 6);
});

test('INVARIANTE: saldo nunca fica negativo, mesmo pagando além do total', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida, [
    { id: 'pg-excesso', debtId: divida.id, valor: 5000, data: '2026-06-10' },
  ]);
  assert.equal(ctx._debtSaldo(divida), 0);
  assert.equal(ctx._debtProximaParcelaNo(divida), null);  // não há próxima
  assert.equal(ctx._debtQuitada(divida), true);
});

test('INVARIANTE: pago + saldo = valor original enquanto houver saldo', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [
    { id: 'pg', debtId: divida.id, valor: 1000, data: '2026-06-10' },
  ]);
  assert.equal(ctx._debtPago(divida) + ctx._debtSaldo(divida), divida.valorOriginal);
});

test('progresso fica entre 0 e 100', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 600, data: '2026-06-10' }]);
  assert.equal(ctx._debtProgress(divida), 50);
  const outra = dividaRedonda({ id: 'd2' });
  const carregado = comDivida(outra, [{ id: 'p2', debtId: 'd2', valor: 99999, data: '2026-06-10' }]);
  assert.equal(carregado.ctx._debtProgress(outra), 100);
});

// ── vencimentos e bordas de calendário ────────────────────────────────────

test('vencimento mensal avança um mês por parcela', () => {
  const divida = dividaRedonda();                  // início 2026-01-15
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtDueDate(divida, 1), '2026-01-15');
  assert.equal(ctx._debtDueDate(divida, 2), '2026-02-15');
  assert.equal(ctx._debtDueDate(divida, 13), '2027-01-15');  // vira o ano
});

test('BORDA dia 31: mês curto clampa para o último dia, sem escorregar de mês', () => {
  const divida = dividaIniciadaEmDia31();          // início 2026-01-31
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtDueDate(divida, 1), '2026-01-31');
  assert.equal(ctx._debtDueDate(divida, 2), '2026-02-28'); // fevereiro comum
  assert.equal(ctx._debtDueDate(divida, 3), '2026-03-31');
  assert.equal(ctx._debtDueDate(divida, 4), '2026-04-30'); // abril tem 30
});

test('BORDA 29/02: parcela que cai em fevereiro bissexto usa o dia 29', () => {
  const divida = dividaIniciadaEmDia31({ id: 'd-bissexto', dataInicio: '2028-01-31' });
  const { ctx } = comDivida(divida, [], '2028-01-15T12:00:00');
  assert.equal(ctx._debtDueDate(divida, 2), '2028-02-29');
});

test('INVARIANTE: vencimentos são estritamente crescentes', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida);
  const n = ctx._debtParcelasTotal(divida);
  let anterior = '';
  for (let k = 1; k <= n; k++) {
    const atual = ctx._debtDueDate(divida, k);
    assert.equal(atual > anterior, true, `parcela ${k} (${atual}) não avançou em relação a ${anterior}`);
    anterior = atual;
  }
});
