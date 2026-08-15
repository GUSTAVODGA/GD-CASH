// _pdfTexto — a última passada antes de escrever no PDF.
//
// As fontes padrão do jsPDF escrevem em cp1252. Fora dessa tabela ele não
// falha nem avisa: troca os bytes, e o texto sai embaralhado no papel. Isso
// foi encontrado revisando um PDF real — um mês de resultado negativo saía
// com `"R$ 6.922,15` no lugar de `-R$ 6.922,15`, porque `R()` usa o sinal
// tipográfico U+2212, que não existe na cp1252.
//
// O teste é aqui, e não no tier E2E, porque a função é pura: a pergunta é
// "que caracteres sobrevivem à codificação", não "como o documento parece".
import test from 'node:test';
import { assert } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';

const app = () => carregarApp({ agora: '2026-06-15T12:00:00' }).ctx;

test('o sinal negativo de R() vira um hífen que a cp1252 conhece', () => {
  const { _pdfTexto, R } = app();
  assert.equal(R(-6922.15).charCodeAt(0), 0x2212, 'premissa: R() usa U+2212 na tela');
  assert.equal(_pdfTexto(R(-6922.15)), '-R$ 6.922,15');
  assert.ok(!_pdfTexto(R(-1)).includes('−'));
});

test('valor positivo atravessa intacto', () => {
  const { _pdfTexto, R } = app();
  assert.equal(_pdfTexto(R(1234.5)), R(1234.5));
});

test('acentos e pontuação tipográfica do português sobrevivem', () => {
  const { _pdfTexto } = app();
  // Todos existem na cp1252 — trocá-los seria estragar texto que imprime bem.
  [
    'Alimentação', 'Dentista — primeira sessão', 'Conta – luz', 'Compra…',
    'çãõéêíóúÀÇ', '“Mercado” ‘feira’', 'Item • dois', '€ 100,00', 'ª º ½ ¹',
  ].forEach(txt => assert.equal(_pdfTexto(txt), txt, `alterou "${txt}"`));
});

test('caractere fora da cp1252 vira "?" em vez de sair embaralhado', () => {
  const { _pdfTexto } = app();
  assert.equal(_pdfTexto('Mercado \u{1F6D2} do mês'), 'Mercado ? do mês');
  assert.equal(_pdfTexto('Loja 中文 aqui'), 'Loja ?? aqui');
  assert.equal(_pdfTexto('A → B'), 'A ? B');
});

test('emoji conta como UM caractere, não como dois', () => {
  const { _pdfTexto } = app();
  // Emoji fora do BMP ocupa duas unidades de código em JS. Percorrer por
  // unidade produziria "??" e alargaria a coluna sem motivo.
  assert.equal(_pdfTexto('\u{1F6D2}'), '?');
  assert.equal(_pdfTexto('\u{1F600}\u{1F600}'), '??');
});

test('quebra de linha é preservada: a célula ainda pode ter duas linhas', () => {
  const { _pdfTexto } = app();
  assert.equal(_pdfTexto('linha um\nlinha dois'), 'linha um\nlinha dois');
});

test('nulo e indefinido viram string vazia, não "null"', () => {
  const { _pdfTexto } = app();
  assert.equal(_pdfTexto(null), '');
  assert.equal(_pdfTexto(undefined), '');
  assert.equal(_pdfTexto(0), '0');
});
