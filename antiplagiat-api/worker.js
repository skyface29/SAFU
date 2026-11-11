// Cloudflare Worker — тот же помощник страницы arktika-app.ru/antiplagiat/, что и yandex.js, на случай,
// если функция Yandex недоступна. GET ?url=… → тело страницы как есть; POST — только поиск КиберЛенинки.
// Ничего не хранит. Воркеры Cloudflare и так не достают до внутренних сетей; дополнительно запрещены
// IP-адреса вместо имён, нестандартные порты и служебные имена.
const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const POST_OK = ['https://cyberleninka.ru/api/search'];
const MAX = 2500000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function cors(origin) {
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Status, X-Final-Url', 'Access-Control-Max-Age': '86400' };
  if (ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (status, obj, head) => new Response(JSON.stringify(obj), { status, headers: { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || u.port || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || /^[\d.]+$/.test(host)) return null;  // имя, а не IP-адрес
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return null;
  return u;
}

async function grab(url, init) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const u = allowed(current);
    if (!u) throw Object.assign(new Error('адрес не разрешён'), { code: 400 });
    const r = await fetch(u.href, { ...init, redirect: 'manual' });
    const loc = r.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
      current = new URL(loc, u).href;
      if (r.status === 303 || (init.method === 'POST' && (r.status === 301 || r.status === 302))) init = { ...init, method: 'GET', body: undefined };
      continue;
    }
    return { r, url: u.href };
  }
  throw Object.assign(new Error('слишком много переадресаций'), { code: 502 });
}

async function readCapped(r) {
  if (!r.body) return new Uint8Array(0);
  const reader = r.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX) { try { await reader.cancel(); } catch (e) { /* уже закрыто */ } break; }
  }
  const out = new Uint8Array(Math.min(size, MAX));
  let pos = 0;
  for (const c of chunks) { const part = c.subarray(0, out.length - pos); out.set(part, pos); pos += part.length; if (pos >= out.length) break; }
  return out;
}

export default {
  async fetch(request) {
    const head = cors(request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    const url = new URL(request.url).searchParams.get('url');
    if (!url) return json(200, { ok: true, service: 'antiplagiat' }, head);
    let init = { method: 'GET', headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/json,application/pdf;q=0.9,*/*;q=0.5' } };
    if (request.method === 'POST') {
      if (!POST_OK.includes(url)) return json(403, { error: 'сюда отправлять нельзя' }, head);
      const body = await request.text();
      if (body.length > 10000) return json(413, { error: 'слишком большой запрос' }, head);
      init = { method: 'POST', body, headers: { ...init.headers, 'Content-Type': 'application/json' } };
    } else if (request.method !== 'GET') return json(405, { error: 'метод не поддерживается' }, head);
    try {
      const { r, url: finalUrl } = await grab(url, init);
      const body = await readCapped(r);
      return new Response(body, { status: 200, headers: { ...head, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
        'X-Status': String(r.status), 'X-Final-Url': finalUrl, 'Cache-Control': 'no-store' } });
    } catch (e) {
      return json(e.code || 502, { error: e.code ? e.message : 'страница не ответила' }, head);
    }
  },
};
