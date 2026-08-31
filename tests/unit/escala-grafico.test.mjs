// A escala do gráfico da Início.
//
// O gráfico de seis meses desenhava a grade em quartos do MAIOR VALOR e não
// escrevia número nenhum nela. Duas consequências:
//
//   A barra mais alta encostava no teto do desenho, sem folga, porque o topo
//   da escala ERA ela.
//
//   Sem rótulo, a grade marcava frações do maior valor — "R$ 4.324,00 ÷ 4" —
//   que ninguém lê de relance. O gráfico informava apenas "um mês foi maior
//   que o outro", que já se sabia olhando os números do mês.
//
// `_escalaRedonda` devolve o próximo número REDONDO acima do maior valor, para
// que a grade caia em marcas legíveis e a barra tenha folga. `_kAbrev` escreve
// essas marcas curtas o bastante para caberem à esquerda do desenho.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './_loader.mjs';

const { ctx } = carregarApp();
const escala = ctx._escalaRedonda;
const abrev  = ctx._kAbrev;

test('a escala nunca fica ABAIXO do valor — a barra estouraria o desenho', () => {
  for (const v of [1, 7, 99, 100, 101, 999, 1000, 1001, 4324, 12345, 98765, 1234567]) {
    assert.ok(escala(v) >= v, `escala(${v}) = ${escala(v)} é menor que ${v}`);
  }
});

test('a escala não fica MUITO acima — meio gráfico vazio é pior que nenhum', () => {
  // Nenhum valor deve ocupar menos de 40% da altura útil por culpa da escala.
  for (const v of [1, 7, 26, 99, 260, 999, 2600, 4324, 26000, 260000]) {
    const razao = v / escala(v);
    assert.ok(razao >= 0.4,
      `escala(${v}) = ${escala(v)} deixa a barra em ${Math.round(razao * 100)}% da altura`);
  }
});

test('a escala é um número redondo, não um valor qualquer', () => {
  // Um topo de escala como 4.324 produz marcas de 1.081 — ilegíveis. Redondo
  // aqui significa: um dígito significativo, ou meio passo (1,5 · 2,5 · 7,5).
  const REDONDOS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const v of [3, 26, 99, 260, 999, 1200, 4324, 26000, 87000]) {
    const e = escala(v);
    const mag = Math.pow(10, Math.floor(Math.log10(e)));
    const passo = e / mag;
    assert.ok(REDONDOS.some(r => Math.abs(r - passo) < 1e-9),
      `escala(${v}) = ${e} não é redondo (passo ${passo})`);
  }
});

test('valor zero ou inválido não vira escala zero — dividir por ela quebraria', () => {
  for (const v of [0, -5, NaN, null, undefined]) {
    assert.ok(escala(v) > 0, `escala(${v}) devolveu ${escala(v)}`);
  }
});

test('a escala cresce junto com o valor, sem degraus para trás', () => {
  let anterior = 0;
  for (let v = 1; v <= 200000; v = Math.ceil(v * 1.17)) {
    const e = escala(v);
    assert.ok(e >= anterior, `escala caiu de ${anterior} para ${e} em v=${v}`);
    anterior = e;
  }
});

test('o rótulo do eixo é curto o bastante para caber na margem', () => {
  assert.equal(abrev(0), '0');
  assert.equal(abrev(500), '500');
  assert.equal(abrev(999), '999');
  assert.equal(abrev(1000), '1k');
  assert.equal(abrev(1500), '1,5k');
  assert.equal(abrev(4500), '4,5k');
  assert.equal(abrev(12000), '12k');
  assert.equal(abrev(100000), '100k');
});

test('nenhum rótulo do eixo passa de 6 caracteres', () => {
  // A margem esquerda do desenho tem 40px; um rótulo longo invadiria a grade.
  for (let v = 0; v <= 500000; v = v ? v * 2 : 1) {
    for (const q of [0, 0.25, 0.5, 0.75, 1]) {
      const t = abrev(escala(v) * q);
      assert.ok(t.length <= 6, `rótulo "${t}" é longo demais (valor ${v}, quarto ${q})`);
    }
  }
});

test('a marca do meio da escala redonda também sai legível', () => {
  // A grade rotula 0, metade e topo. Se a metade de uma escala redonda saísse
  // quebrada, o esforço de arredondar o topo teria sido em vão.
  for (const v of [4324, 999, 26000, 1200]) {
    const meio = abrev(escala(v) / 2);
    assert.ok(/^[0-9]+(,[0-9])?k?$/.test(meio), `metade da escala saiu como "${meio}"`);
  }
});
