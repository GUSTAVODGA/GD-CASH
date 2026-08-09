// localDateKey — normalização de qualquer data para a chave de DIA LOCAL.
//
// É a função que impede que um lançamento "pule" de dia (e portanto de semana,
// de mês e de todos os agregados) por causa de fuso horário. Área de risco
// recorrente neste app, porque os registros convivem em três formatos:
// 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM:SS' sem fuso, e ISO com Z/offset.
//
// NOTA SOBRE FUSO: as asserções com fuso explícito são escritas como
// IDENTIDADES (localDateKey(s) === dateStr(new Date(s))) em vez de datas
// literais. Assim a suíte vale em qualquer TZ de runner, sem depender de
// variável de ambiente — o que importa é que a conversão seja coerente, não
// que ela produza um dia específico no fuso de quem roda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './_loader.mjs';
import { INSTANTES } from './_clock.mjs';

const { ctx } = carregarApp();
const chave = ctx.localDateKey;

test('valores vazios viram string vazia, nunca "Invalid Date"', () => {
  assert.equal(chave(null), '');
  assert.equal(chave(undefined), '');
  assert.equal(chave('texto sem data'), '');
  assert.equal(chave(new ctx.Date('lixo')), '');
});

test('data simples é devolvida sem conversão', () => {
  assert.equal(chave('2026-03-31'), '2026-03-31');
  assert.equal(chave('2026-01-01'), '2026-01-01');
  assert.equal(chave('2028-02-29'), '2028-02-29');
});

test('INVARIANTE: horário sem fuso nunca muda o dia', () => {
  // Este é o caso que mais causou bug: 23:30 não pode virar o dia seguinte,
  // nem 00:30 o dia anterior, quando não há fuso declarado.
  assert.equal(chave('2026-03-31T23:30:00'), '2026-03-31');
  assert.equal(chave('2026-03-31T00:30:00'), '2026-03-31');
  assert.equal(chave('2026-03-31 23:30'), '2026-03-31');
  assert.equal(chave('2026-12-31T23:59:59'), '2026-12-31');
});

test('objeto Date usa o dia civil local', () => {
  const d = new ctx.Date(2026, 2, 31, 23, 30);   // 31/03/2026 local
  assert.equal(chave(d), '2026-03-31');
  assert.equal(chave(new ctx.Date(2028, 1, 29)), '2028-02-29');
});

test('string com fuso explícito converte de forma coerente', () => {
  for (const s of [
    '2026-03-31T12:00:00Z',
    '2026-06-15T12:00:00+00:00',
    '2026-06-15T12:00:00-03:00',
    '2026-06-15T12:00:00+0530',
  ]) {
    assert.equal(chave(s), ctx.dateStr(new ctx.Date(s)), `conversão incoerente para ${s}`);
  }
});

test('INVARIANTE: o formato de saída é sempre YYYY-MM-DD ou vazio', () => {
  const amostras = [
    null, undefined, 'lixo', '2026-03-31', '2026-03-31T23:30:00',
    '2026-03-31T12:00:00Z', '2026-06-15T12:00:00-03:00',
    new ctx.Date(2026, 5, 15), new ctx.Date('lixo'), 20260331,
  ];
  for (const v of amostras) {
    const r = chave(v);
    assert.equal(r === '' || /^\d{4}-\d{2}-\d{2}$/.test(r), true, `saída fora do formato: ${JSON.stringify(v)} → ${r}`);
  }
});

test('INVARIANTE: normalizar duas vezes dá o mesmo resultado (idempotência)', () => {
  for (const v of ['2026-03-31', '2026-03-31T23:30:00', '2026-03-31T12:00:00Z', new ctx.Date(2026, 5, 15)]) {
    const uma = chave(v);
    assert.equal(chave(uma), uma, `não idempotente para ${v}`);
  }
});

test('dateStr e parseDate são inversos para qualquer dia do calendário', () => {
  // parseDate ancora ao meio-dia justamente para não sofrer com horário de
  // verão; esta ida-e-volta trava esse contrato.
  for (const iso of [
    '2026-01-01', '2026-02-28', '2026-03-31', '2026-04-30',
    '2026-10-18', '2026-12-31', '2027-02-28', '2028-02-29', '2028-03-01',
  ]) {
    assert.equal(ctx.dateStr(ctx.parseDate(iso)), iso, `ida-e-volta falhou em ${iso}`);
  }
});

test('BORDA: chaves de bordas de calendário sobrevivem à normalização', () => {
  for (const instante of Object.values(INSTANTES)) {
    const dia = instante.slice(0, 10);
    assert.equal(chave(dia), dia);
    assert.equal(chave(`${dia}T23:59:59`), dia);
  }
});

test('conversão BR ↔ ISO não inverte dia e mês', () => {
  assert.equal(ctx._isoToBr('2026-03-31'), '31/03/2026');
  assert.equal(ctx._brToIso('31/03/2026'), '2026-03-31');
  assert.equal(ctx._brToIso(ctx._isoToBr('2028-02-29')), '2028-02-29');
});
