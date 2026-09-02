// A tela branca no calendário.
//
// Relato: "não funciona, tá abrindo uma tela toda branca". A exportação de
// vencimentos (.ics) tinha, só para iOS, um ramo separado que criava uma URI
// `data:text/calendar` e um `<a target="_blank">`.
//
// Numa aba comum do Safari isso funciona: o WebKit intercepta a navegação,
// reconhece o tipo do arquivo e mostra a folha nativa "Adicionar eventos"
// sem sair da aba. Mas o Avenco roda INSTALADO (`display: "standalone"` no
// manifest.json — sem barra de navegador). Um app instalado não tem "aba"
// para abrir uma segunda: o iOS cria um contexto novo, sem a interface do
// Safari, e esse contexto não reconhece calendário. Ele tenta desenhar o
// conteúdo como se fosse uma página, não há HTML nenhum para desenhar, e o
// resultado é a tela em branco relatada.
//
// A correção é navegar a MESMA janela (`location.href`) para um Blob de
// verdade — nunca `target="_blank"`, nunca uma URI `data:`. Sendo navegação
// de página inteira, o WebKit intercepta o tipo do arquivo antes de tentar
// desenhar qualquer coisa.
//
// POR QUE UM TESTE DE TEXTO, E NÃO SÓ UM TESTE DE COMPORTAMENTO: a folha
// nativa que a correção habilita é interface do sistema operacional —
// nenhum motor de teste (Chromium incluso, usado no tier e2e deste projeto)
// consegue reproduzi-la ou apitar quando ela some. O tier e2e
// (`exportar-planilha-calendario.spec.js`) prova que a MESMA JANELA navega
// para um Blob; este arquivo prova, por leitura direta do código-fonte, que
// os dois ingredientes exatos da tela branca — `target="_blank"` e a URI
// `data:` — não voltam a aparecer no ramo do iOS, mesmo que alguém reescreva
// a função inteira sem tocar no comportamento observável em Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');

/** Extrai o corpo de `function nome() { ... }` contando chaves, não regex guloso. */
function corpoDaFuncao(codigo, nome) {
  const inicio = codigo.indexOf(`function ${nome}(`);
  assert.ok(inicio >= 0, `função ${nome} não encontrada em app.js`);
  const abre = codigo.indexOf('{', inicio);
  let prof = 0, i = abre;
  for (; i < codigo.length; i++) {
    if (codigo[i] === '{') prof++;
    else if (codigo[i] === '}') { prof--; if (prof === 0) break; }
  }
  return codigo.slice(abre + 1, i);
}

const corpo = corpoDaFuncao(APP, 'exportCalendar');
// Os comentários deste próprio arquivo (e do código) EXPLICAM o bug antigo
// citando `target="_blank"` e `data:text/calendar` entre aspas — checar o
// texto com comentário incluso pegaria a própria explicação como se fosse o
// defeito. As asserções abaixo rodam contra o código puro.
const semComentarios = corpo.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('exportCalendar existe e ainda decide o caminho por isIOS', () => {
  assert.match(corpo, /isIOS/, 'a variável de decisão sumiu — a função foi reescrita sem o ramo?');
});

test('NUNCA MAIS target="_blank" — a causa direta da tela branca', () => {
  assert.doesNotMatch(semComentarios, /target\s*=\s*['"]_blank['"]/,
    'exportCalendar voltou a usar target="_blank" — dentro do app instalado ' +
    '(display: standalone) isso abre um contexto sem a interface do Safari, ' +
    'que não reconhece calendário e mostra tela em branco');
});

test('NUNCA MAIS uma URI data: para o calendário — só um Blob de verdade', () => {
  assert.doesNotMatch(semComentarios, /data:text\/calendar/,
    'exportCalendar voltou a montar uma URI data:text/calendar — o mesmo ' +
    'ingrediente da tela branca, com ou sem target="_blank" ao lado');
  assert.match(corpo, /new Blob\(\[ics\]/, 'o Blob real do .ics sumiu da função');
});

test('o ramo do iOS navega a MESMA janela — nunca abre um <a>', () => {
  const ramoIOS = corpo.match(/if\s*\(\s*isIOS\s*\)\s*\{([\s\S]*?)\}\s*else\s*\{/);
  assert.ok(ramoIOS, 'não encontrei o formato "if (isIOS) { ... } else { ... }"');
  const dentro = ramoIOS[1];
  assert.match(dentro, /window\.location\.href\s*=\s*url/,
    'o ramo do iOS não navega a própria janela para o Blob — sem isso, o ' +
    'WebKit não tem como interceptar o tipo do arquivo antes de renderizar');
  assert.doesNotMatch(dentro, /createElement\(['"]a['"]\)/,
    'o ramo do iOS criou um <a> — só a navegação direta da janela evita a ' +
    'tela branca dentro do app instalado');
});

test('o ramo de fora do iOS continua com download por <a> — não foi tocado', () => {
  const ramoOutros = corpo.match(/\}\s*else\s*\{([\s\S]*)\}\s*$/);
  assert.ok(ramoOutros, 'não encontrei o ramo "else" da função');
  assert.match(ramoOutros[1], /createElement\(['"]a['"]\)/,
    'o ramo não-iOS perdeu o download por <a> — ele nunca teve o defeito ' +
    'relatado e não deveria ter mudado');
  assert.match(ramoOutros[1], /\.download\s*=\s*['"]avenco-vencimentos\.ics['"]/,
    'o nome do arquivo baixado (fora do iOS) mudou ou sumiu');
});

test('o Blob é criado UMA vez só, antes da decisão — os dois ramos usam o mesmo arquivo', () => {
  // Duas cópias do Blob (uma por ramo) já foi como o defeito original nasceu
  // torto: o ramo do iOS ganhou um caminho de conteúdo totalmente separado
  // (a URI data:) que podia divergir do outro sem que ninguém notasse.
  const criacoesDeBlob = (corpo.match(/new Blob\(/g) || []).length;
  assert.equal(criacoesDeBlob, 1,
    `esperava um Blob só, compartilhado pelos dois ramos; achei ${criacoesDeBlob}`);
});
