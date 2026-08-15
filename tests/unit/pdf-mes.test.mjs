// _pdfMesPorExtenso(off) — o mês do relatório, escrito por extenso.
//
// As telas usam `fmtMonthYear`, abreviada ("ago. de 2026"), porque ali o
// espaço é curto e há um seletor de mês ao lado. O relatório sai do app e pode
// ser lido meses depois, sem esse contexto: ali o mês vale inteiro.
//
// O ponto destes testes é justamente a SEPARAÇÃO. Um formatter local que
// derivasse do rótulo abreviado, ou que refizesse a aritmética de offset por
// conta própria, passaria a discordar do resto do app em alguma borda. Aqui se
// verifica que ele concorda com `_monthYM` — a identidade canônica do mês — e
// que `fmtMonthYear` continua abreviada para quem a usa.
import test from 'node:test';
import { assert } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';

// Segunda-feira 15/06/2026. Junho = 0, então janeiro/2026 = −5 e dezembro = +6.
const app = () => carregarApp({ agora: '2026-06-15T12:00:00' }).ctx;

const DOZE = [
  [-5, 'Janeiro de 2026'], [-4, 'Fevereiro de 2026'], [-3, 'Março de 2026'],
  [-2, 'Abril de 2026'], [-1, 'Maio de 2026'], [0, 'Junho de 2026'],
  [1, 'Julho de 2026'], [2, 'Agosto de 2026'], [3, 'Setembro de 2026'],
  [4, 'Outubro de 2026'], [5, 'Novembro de 2026'], [6, 'Dezembro de 2026'],
];

test('os doze meses saem por extenso, capitalizados', () => {
  const { _pdfMesPorExtenso } = app();
  DOZE.forEach(([off, esperado]) => assert.equal(_pdfMesPorExtenso(off), esperado, `off ${off}`));
});

test('a virada de ano não perde o ano', () => {
  const { _pdfMesPorExtenso } = app();
  assert.equal(_pdfMesPorExtenso(-6), 'Dezembro de 2025');
  assert.equal(_pdfMesPorExtenso(-7), 'Novembro de 2025');
  assert.equal(_pdfMesPorExtenso(-17), 'Janeiro de 2025');
  assert.equal(_pdfMesPorExtenso(7), 'Janeiro de 2027');
});

test('concorda com _monthYM, que é a identidade canônica do mês', () => {
  const { _pdfMesPorExtenso, _monthYM } = app();
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  for (let off = -30; off <= 30; off++) {
    const [ano, mes] = _monthYM(off).split('-');
    assert.equal(_pdfMesPorExtenso(off), `${MESES[Number(mes) - 1]} de ${ano}`, `off ${off}`);
  }
});

test('off ausente ou inválido cai no mês atual, não em "undefined"', () => {
  const { _pdfMesPorExtenso } = app();
  [undefined, null, NaN, 'x'].forEach(v => assert.equal(_pdfMesPorExtenso(v), 'Junho de 2026', String(v)));
});

test('NÃO REGRESSÃO: fmtMonthYear das telas continua abreviada', () => {
  const { fmtMonthYear, _pdfMesPorExtenso } = app();
  // Se um dia alguém "unificar" os dois, este teste cai — e deve cair, porque
  // Home, Semana e Mês desenham em cima do rótulo curto.
  assert.equal(fmtMonthYear(0), 'jun. de 2026');
  assert.equal(fmtMonthYear(2), 'ago. de 2026');
  assert.ok(fmtMonthYear(0) !== _pdfMesPorExtenso(0));
});

test('o nome do arquivo usa o mês por extenso e continua seguro', () => {
  const { _pdfNomeArquivo, _pdfMesPorExtenso } = app();
  assert.equal(_pdfNomeArquivo(_pdfMesPorExtenso(2)), 'Avenco - Agosto de 2026.pdf');
  assert.equal(_pdfNomeArquivo(_pdfMesPorExtenso(-6)), 'Avenco - Dezembro de 2025.pdf');
  DOZE.forEach(([off]) => {
    const nome = _pdfNomeArquivo(_pdfMesPorExtenso(off));
    assert.ok(!/[\\/:*?"<>|]/.test(nome), `caractere proibido em "${nome}"`);
  });
});

test('o mês por extenso sobrevive à codificação do PDF (Março tem cedilha)', () => {
  const { _pdfMesPorExtenso, _pdfTexto } = app();
  DOZE.forEach(([off, esperado]) => assert.equal(_pdfTexto(_pdfMesPorExtenso(off)), esperado));
});
