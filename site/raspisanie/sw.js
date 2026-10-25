// Офлайн для arktika-app.ru/raspisanie/: страница — из кэша, данные — свежие из сети, а без сети — последняя сохранённая копия.
const CACHE = 'raspisanie-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'og-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isData = u.pathname.includes('/raspisanie/data/') && !u.pathname.includes('/snapshots/2');
  const isPage = e.request.mode === 'navigate' || isData || u.pathname.endsWith('/raspisanie/') || u.pathname.endsWith('index.html');
  if (isPage) {
    // сначала сеть (чтобы правки приходили сразу), без сети — кэш
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // шрифты, картинки, архивные копии — из кэша, если уже есть
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => {
    if (n.ok && (u.origin === location.origin || u.host.includes('fonts.'))) { const c = n.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return n;
  })));
});
