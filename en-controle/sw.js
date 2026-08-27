// Service worker do EN Controle.
//
// ESCOPO: registrado em `./`, ou seja, apenas esta pasta. Isso é deliberado —
// existe outro aplicativo neste mesmo domínio cujo service worker cobre a raiz
// e serve JS e CSS pelo cache primeiro. Como o navegador entrega a página ao
// registro de escopo MAIS ESPECÍFICO, este aqui assume o controle das páginas
// desta pasta e impede que os módulos do EN Controle venham de um cache alheio.
//
// ESTRATÉGIA: rede primeiro, cache como rede de segurança. O produto é um
// sistema de controle financeiro em evolução; servir código velho por engano
// custa mais caro do que uma abertura offline mais lenta. O cache existe para
// o aplicativo abrir sem sinal, não para acelerar o caso normal.

const CACHE = 'en-controle-v1';

const ESSENCIAIS = [
  './',
  './index.html',
  './style.css?v=1',
  './manifest.json',
  './icone.svg',
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(c => c !== CACHE).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;
  if (!requisicao.url.startsWith(self.registration.scope)) return;

  evento.respondWith(
    fetch(requisicao)
      .then(resposta => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then(cache => cache.put(requisicao, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(requisicao).then(cacheada => cacheada || caches.match('./index.html')))
  );
});
