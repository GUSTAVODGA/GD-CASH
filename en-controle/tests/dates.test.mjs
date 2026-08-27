// Calendário: as regras que o produto promete e que aproximação frágil quebra.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bissexto, diasNoMes, partes, dataValida, somarDias, somarMeses,
  emDias, deDias, comparar, diferencaEmDias, diaDaSemana,
  formatarData, formatarDataCurta, distanciaEmPalavras, hoje, ErroDeData,
} from '../src/core/dates.js';

test('ano bissexto segue a regra gregoriana completa', () => {
  assert.equal(bissexto(2024), true);
  assert.equal(bissexto(2025), false);
  assert.equal(bissexto(1900), false, '1900 não é bissexto: divisível por 100 e não por 400');
  assert.equal(bissexto(2000), true, '2000 é bissexto: divisível por 400');
  assert.equal(diasNoMes(2024, 2), 29);
  assert.equal(diasNoMes(2025, 2), 28);
});

test('data inválida é recusada, não corrigida em silêncio', () => {
  assert.throws(() => partes('2025-02-30'), ErroDeData);
  assert.throws(() => partes('2025-13-01'), ErroDeData);
  assert.throws(() => partes('01/02/2025'), ErroDeData);
  assert.equal(dataValida('2024-02-29'), true);
  assert.equal(dataValida('2025-02-29'), false);
});

test('ida e volta entre data e número de dias é exata em qualquer época', () => {
  for (const iso of ['1970-01-01', '1999-12-31', '2000-02-29', '2026-08-27', '2100-03-01']) {
    assert.equal(deDias(emDias(iso)), iso, iso);
  }
  assert.equal(emDias('1970-01-01'), 0);
  assert.equal(emDias('1970-01-02'), 1);
});

test('somar dias atravessa mês, ano e 29 de fevereiro', () => {
  assert.equal(somarDias('2026-01-28', 7), '2026-02-04');
  assert.equal(somarDias('2026-12-28', 7), '2027-01-04');
  assert.equal(somarDias('2024-02-22', 7), '2024-02-29');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
});

test('somar meses anda no calendário, não em blocos de 30 dias', () => {
  assert.equal(somarMeses('2026-01-15', 1), '2026-02-15');
  assert.equal(somarMeses('2026-01-15', 12), '2027-01-15');

  // Fevereiro tem 28 dias: o dia 31 encosta no último dia do mês.
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2024-01-31', 1), '2024-02-29');
  assert.equal(somarMeses('2026-01-31', 3), '2026-04-30');

  // E, o ponto que importa: o dia 31 VOLTA nos meses que o têm, porque cada
  // vencimento é derivado da primeira data e não da anterior.
  assert.equal(somarMeses('2026-01-31', 2), '2026-03-31');

  assert.equal(somarMeses('2026-03-31', -1), '2026-02-28');
  assert.equal(somarMeses('2024-02-29', 12), '2025-02-28');
});

test('somar 30 dias NÃO é somar um mês — a diferença é o bug que isto evita', () => {
  assert.notEqual(somarDias('2026-01-31', 30), somarMeses('2026-01-31', 1));
  assert.equal(somarDias('2026-01-31', 30), '2026-03-02');
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
});

test('comparação e distância entre datas', () => {
  assert.equal(comparar('2026-01-01', '2026-01-02'), -1);
  assert.equal(comparar('2026-01-02', '2026-01-02'), 0);
  assert.equal(comparar('2026-02-01', '2026-01-31'), 1);
  assert.equal(diferencaEmDias('2026-01-31', '2026-02-01'), 1);
  assert.equal(diferencaEmDias('2026-03-15', '2026-03-10'), -5);
});

test('dia da semana sai do calendário, sem objeto Date', () => {
  assert.equal(diaDaSemana('1970-01-01'), 'quinta');
  assert.equal(diaDaSemana('2026-08-27'), 'quinta');
  assert.equal(diaDaSemana('2026-08-30'), 'domingo');
});

test('a data de hoje é a data civil local, sem deslocamento de fuso', () => {
  // Meia-noite e um minuto no horário local: um cálculo por UTC devolveria o
  // dia anterior em qualquer fuso a oeste de Greenwich.
  const madrugada = new Date(2026, 7, 27, 0, 1, 0);
  assert.equal(hoje(madrugada), '2026-08-27');

  const fimDoDia = new Date(2026, 11, 31, 23, 59, 0);
  assert.equal(hoje(fimDoDia), '2026-12-31');
});

test('apresentação em português', () => {
  assert.equal(formatarData('2026-03-05'), '05/03/2026');
  assert.equal(formatarDataCurta('2026-03-05'), '05 mar');
  assert.equal(distanciaEmPalavras('2026-03-05', '2026-03-05'), 'hoje');
  assert.equal(distanciaEmPalavras('2026-03-06', '2026-03-05'), 'amanhã');
  assert.equal(distanciaEmPalavras('2026-03-04', '2026-03-05'), 'ontem');
  assert.equal(distanciaEmPalavras('2026-03-15', '2026-03-05'), 'em 10 dias');
  assert.equal(distanciaEmPalavras('2026-02-25', '2026-03-05'), 'há 8 dias');
});
