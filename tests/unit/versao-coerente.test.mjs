// Os marcadores de versão têm que andar JUNTOS.
//
// A publicação de uma versão mexe em quatro lugares:
//
//   index.html   style.css?v=N  e  app.js?v=M   (cache-busting do navegador)
//   sw.js        CACHE = 'avenco-vX'            (invalida o cache do SW)
//   sw.js        ASSETS[]                       (a lista de precache)
//   app.js       "Avenco vX" nos Ajustes        (o que o usuário lê)
//
// Na v83 o bump esqueceu a lista ASSETS do service worker. O sintoma seria
// silencioso e específico: o precache buscaria `style.css?v=117` e
// `app.js?v=132` — URLs que a página não pede mais. O app continuaria
// funcionando online (o handler de fetch guarda o que a página realmente
// busca), mas a PRIMEIRA carga offline depois da atualização acharia o cache
// sem os dois arquivos que importam. É o tipo de defeito que só aparece no
// avião.
//
// Também é o tipo de defeito que nenhum teste de comportamento pega: os
// arquivos estão corretos, o app está correto, só a lista de compras está
// desatualizada. Por isso este teste é de TEXTO, e roda em todo commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ  = path.resolve(import.meta.dirname, '../..');
const ler   = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const HTML  = ler('index.html');
const SW    = ler('sw.js');
const APP   = ler('app.js');

/** Extrai o `?v=` de um arquivo referenciado no index.html. */
function versaoNoHtml(arquivo) {
  const m = HTML.match(new RegExp(`${arquivo.replace('.', '\\.')}\\?v=(\\d+)`));
  assert.ok(m, `index.html não referencia ${arquivo} com ?v=`);
  return m[1];
}

/** Extrai o `?v=` da lista ASSETS do service worker. */
function versaoNoSw(arquivo) {
  const m = SW.match(new RegExp(`\\./${arquivo.replace('.', '\\.')}\\?v=(\\d+)`));
  assert.ok(m, `sw.js não lista ${arquivo} em ASSETS`);
  return m[1];
}

test('o precache do service worker pede as MESMAS URLs que a página', () => {
  for (const arquivo of ['style.css', 'app.js']) {
    assert.equal(versaoNoSw(arquivo), versaoNoHtml(arquivo),
      `sw.js precacheia ${arquivo}?v=${versaoNoSw(arquivo)} mas a página pede ` +
      `?v=${versaoNoHtml(arquivo)} — a primeira carga offline depois desta ` +
      'atualização não vai achar o arquivo no cache');
  }
});

test('o número da versão nos Ajustes é o mesmo do cache do service worker', () => {
  const cache = SW.match(/CACHE\s*=\s*'avenco-v(\d+)'/);
  assert.ok(cache, "sw.js não declara CACHE = 'avenco-vN'");
  const ajustes = APP.match(/Avenco v(\d+)</);
  assert.ok(ajustes, 'app.js não mostra "Avenco vN" nos Ajustes');
  assert.equal(ajustes[1], cache[1],
    `os Ajustes dizem v${ajustes[1]} e o cache do SW é v${cache[1]} — ` +
    'um dos dois ficou para trás no bump');
});

test('o service worker precacheia tudo que o app precisa para abrir sozinho', () => {
  // Sem um destes, abrir o app offline dá tela branca ou tela sem estilo.
  for (const url of ["'./'", "'./index.html'", "'./manifest.json'"]) {
    assert.ok(SW.includes(url), `ASSETS do service worker perdeu ${url}`);
  }
});

test('nenhum marcador da versão anterior sobrou espalhado', () => {
  // Se o bump foi de vN-1 para vN, a string "vN-1" não pode mais aparecer em
  // sw.js nem na linha de Versão dos Ajustes.
  const atual = Number(SW.match(/CACHE\s*=\s*'avenco-v(\d+)'/)[1]);
  const anterior = `avenco-v${atual - 1}`;
  assert.ok(!SW.includes(anterior),
    `sw.js ainda menciona ${anterior} depois do bump para v${atual}`);
  assert.ok(!APP.includes(`Avenco v${atual - 1}<`),
    `os Ajustes ainda mostram Avenco v${atual - 1}`);
});
