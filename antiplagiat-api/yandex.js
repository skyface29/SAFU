// Функция Yandex Cloud (index.handler, Node.js 22) — помощник страницы arktika-app.ru/antiplagiat/.
// Браузер не может сам прочитать чужой сайт (нет разрешения CORS), поэтому страницы, выдачу поисковиков
// и поиск КиберЛенинки он скачивает через эту функцию: GET ?url=… → тело страницы как есть.
// Функция ничего не хранит. Скачивает только из открытого интернета: адреса внутренних сетей запрещены.
'use strict';
const dns = require('dns').promises;
const net = require('net');

const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const POST_OK = ['https://cyberleninka.ru/api/search'];   // POST — только поиск КиберЛенинки
const MAX = 2500000;                                       // ответ функции до 3,5 МБ, а base64 раздувает в 4/3
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function cors(origin) {
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Status, X-Final-Url', 'Access-Control-Max-Age': '86400' };
  // чужим сайтам — адрес своего сайта: браузер увидит несовпадение и не отдаст им ответ
  // (без этого заголовка Yandex сам подставляет «*», то есть «можно всем»)
  h['Access-Control-Allow-Origin'] = ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return h;
}
const json = (status, obj, head) => ({ statusCode: status, headers: { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') ||
    v.startsWith('fea') || v.startsWith('feb') || v.startsWith('64:ff9b') || v.startsWith('ff');
}

/** Разрешён ли адрес: обычный веб-адрес, имя ведёт только на адреса открытого интернета. */
async function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || u.port || u.username || u.password) return null;
  const host = u.hostname;
  if (!host.includes('.') || net.isIP(host.replace(/^\[|\]$/g, ''))) return null;
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch (e) { return null; }
  if (!addrs.length || addrs.some(a => privateIp(a.address))) return null;
  return u;
}

/** Запрос с ручным переходом по переадресациям: каждый новый адрес тоже проверяется. */
async function grab(url, init) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const u = await checkUrl(current);
    if (!u) throw Object.assign(new Error('адрес не разрешён'), { code: 400 });
    const r = await fetch(u, { ...init, redirect: 'manual', signal: AbortSignal.timeout(12000) });
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
  if (!r.body) return Buffer.alloc(0);
  const reader = r.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
    if (size >= MAX) { try { await reader.cancel(); } catch (e) { /* уже закрыто */ } break; }
  }
  return Buffer.concat(chunks).subarray(0, MAX);
}

module.exports.handler = async (event) => {
  const h = event.headers || {};
  const head = cors(h.Origin || h.origin || '');
  const method = event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: head, body: '' };
  const url = (event.queryStringParameters || {}).url;
  if (!url) return json(200, { ok: true, service: 'antiplagiat' }, head);
  let init = { method: 'GET', headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/json,application/pdf;q=0.9,*/*;q=0.5' } };
  if (method === 'POST') {
    if (!POST_OK.includes(url)) return json(403, { error: 'сюда отправлять нельзя' }, head);
    let body = event.body || '';
    if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    if (body.length > 10000) return json(413, { error: 'слишком большой запрос' }, head);
    init = { method: 'POST', body, headers: { ...init.headers, 'Content-Type': 'application/json' } };
  } else if (method !== 'GET') return json(405, { error: 'метод не поддерживается' }, head);
  try {
    const { r, url: finalUrl } = await grab(url, init);
    const buf = await readCapped(r);
    return { statusCode: 200, isBase64Encoded: true, body: buf.toString('base64'),
      headers: { ...head, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'X-Status': String(r.status),
        'X-Final-Url': finalUrl, 'Cache-Control': 'no-store' } };
  } catch (e) {
    return json(e.code || 502, { error: e.code ? e.message : 'страница не ответила' }, head);
  }
};
