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

/* ---------- поиск Яндекса (Yandex Search API v2, отложенный режим) ----------
   Включается переменной YSEARCH=on; нужен сервисный аккаунт функции с ролью search-api.webSearch.user
   и переменная FOLDER_ID. Дневной лимит запросов на экземпляр — YSEARCH_DAILY (защита от перерасхода).
   GET ?ysearch=<запрос>  → {done, results} или {done:false, op} — тогда страница спрашивает ?yop=<op>. */
const YS = 'https://searchapi.api.cloud.yandex.net/v2/web/searchAsync', OPS = 'https://operation.api.cloud.yandex.net/operations/';
let ysDay = '', ysCount = 0;
function ysAllowed() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== ysDay) { ysDay = day; ysCount = 0; }
  return ++ysCount <= (+process.env.YSEARCH_DAILY || 5000);
}
const unxml = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
function parseYandexXml(xml) {
  const out = [];
  for (const m of xml.matchAll(/<doc\b[\s\S]*?<\/doc>/g)) {
    const doc = m[0], url = (/<url>([\s\S]*?)<\/url>/.exec(doc) || [])[1];
    if (!url) continue;
    const title = (/<title>([\s\S]*?)<\/title>/.exec(doc) || [])[1] || '';
    const passages = [...doc.matchAll(/<passage>([\s\S]*?)<\/passage>/g)].map(x => unxml(x[1])).join(' … ');
    out.push({ url: unxml(url), title: unxml(title), snippet: passages });
  }
  return out;
}
async function opResult(op, token) {
  if (!op.done) return { done: false, op: op.id };
  if (op.error) throw Object.assign(new Error('поиск Яндекса: ' + (op.error.message || 'ошибка')), { code: 502 });
  const raw = op.response && op.response.rawData;
  return { done: true, results: raw ? parseYandexXml(Buffer.from(raw, 'base64').toString('utf8')) : [] };
}
async function ysearch(query, context) {
  const token = context && context.token && context.token.access_token;
  if (!token || !process.env.FOLDER_ID) throw Object.assign(new Error('поиск Яндекса не настроен'), { code: 503 });
  if (!ysAllowed()) throw Object.assign(new Error('дневной лимит поиска исчерпан'), { code: 429 });
  const r = await fetch(YS, { method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { searchType: 'SEARCH_TYPE_RU', queryText: String(query).slice(0, 400), familyMode: 'FAMILY_MODE_NONE', fixTypoMode: 'FIX_TYPO_MODE_OFF' },
      groupSpec: { groupMode: 'GROUP_MODE_FLAT', groupsOnPage: '10', docsInGroup: '1' }, maxPassages: '2', l10n: 'LOCALIZATION_RU',
      folderId: process.env.FOLDER_ID, responseFormat: 'FORMAT_XML' }) });
  if (!r.ok) throw Object.assign(new Error('поиск Яндекса ответил ' + r.status), { code: 502 });
  let op = await r.json();
  for (let i = 0; i < 10 && !op.done; i++) {          // ждём до ~10 с, дальше страница спросит сама
    await new Promise(res => setTimeout(res, 1000));
    const p = await fetch(OPS + op.id, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(4000) });
    if (p.ok) op = await p.json();
  }
  return opResult(op, token);
}
async function yop(id, context) {
  const token = context && context.token && context.token.access_token;
  if (!token || !/^[\w-]{6,64}$/.test(id)) throw Object.assign(new Error('неверная операция'), { code: 400 });
  const p = await fetch(OPS + id, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000) });
  if (!p.ok) throw Object.assign(new Error('операция не найдена'), { code: 404 });
  return opResult(await p.json(), token);
}

module.exports.handler = async (event, context) => {
  const h = event.headers || {};
  const head = cors(h.Origin || h.origin || '');
  const method = event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: head, body: '' };
  const qs = event.queryStringParameters || {};
  const yandexOn = process.env.YSEARCH === 'on';
  if (qs.ysearch || qs.yop) {
    if (!yandexOn) return json(503, { error: 'поиск Яндекса выключен' }, head);
    try { return json(200, qs.ysearch ? await ysearch(qs.ysearch, context) : await yop(qs.yop, context), head); }
    catch (e) { return json(e.code || 502, { error: e.message }, head); }
  }
  const url = qs.url;
  if (!url) return json(200, { ok: true, service: 'antiplagiat', yandex: yandexOn }, head);
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
