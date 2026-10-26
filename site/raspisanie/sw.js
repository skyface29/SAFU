// Офлайн и экономия трафика для arktika-app.ru/raspisanie/.
//  • data/web/m.json, списки архива — сначала сеть (это «что сейчас»), без сети — из памяти телефона
//  • data/web/<имя>.<хэш>.json и архивные копии — из памяти, если уже есть: при том же хэше содержимое то же,
//    поэтому повторно не качаются; старые версии файла той же школы удаляются
//  • сама страница — сначала сеть, без сети — из памяти
// Так расписание открывается, даже когда РУЗ, сайт или интернет недоступны, а трафик тратится только на изменения.
const CACHE = 'raspisanie-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'og-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

const put = (req, res) => caches.open(CACHE).then(c => c.put(req, res));
const networkFirst = req => fetch(req).then(r => { if (r.ok) put(req, r.clone()); return r; })
  .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')));
const cacheFirst = (req, after) => caches.match(req).then(hit => hit || fetch(req).then(r => {
  if (r.ok) { const c = r.clone(); put(req, c).then(() => after && after(req)); }
  return r;
}));
// s3.abc123.json пришёл — s3.<старый хэш>.json больше не нужен
const dropOld = req => {
  const m = /\/data\/web\/([a-z]+\d*)\.[0-9a-f]+\.json$/.exec(new URL(req.url).pathname); if (!m) return;
  return caches.open(CACHE).then(c => c.keys().then(keys => Promise.all(keys.filter(k => {
    const p = new URL(k.url).pathname; return p !== new URL(req.url).pathname && new RegExp('/data/web/' + m[1] + '\\.[0-9a-f]+\\.json$').test(p);
  }).map(k => c.delete(k)))));
};

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url), p = u.pathname;
  if (u.origin === location.origin && p.includes('/raspisanie/')) {
    if (/\/data\/web\/[a-z]+\d*\.[0-9a-f]+\.json$/.test(p)) return e.respondWith(cacheFirst(req, dropOld));
    if (/\/data\/snapshots\/.+\.json\.gz$/.test(p)) return e.respondWith(cacheFirst(req));
    if (p.includes('/data/') || req.mode === 'navigate' || p.endsWith('/raspisanie/') || p.endsWith('index.html')) return e.respondWith(networkFirst(req));
    return e.respondWith(cacheFirst(req));
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return e.respondWith(cacheFirst(req));
});
