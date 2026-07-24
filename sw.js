const CACHE = 'avenco-v41';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css?v=78',
  './app.js?v=92',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic') || url.includes('jsdelivr')) return;
  if (!url.startsWith(self.registration.scope)) return;

  // HTML sempre pela rede primeiro para garantir versão atualizada
  if (e.request.headers.get('Accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // JS/CSS com ?v=N: sempre vai à rede (URL diferente = cache miss garantido)
  // Outros assets: cache-first com atualização em background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_DAILY') {
    console.log('Daily reminder scheduled for', e.data.hour + ':' + String(e.data.minute).padStart(2,'0'));
  }
});
