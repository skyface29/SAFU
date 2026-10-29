// Логика API отметок (arktika-app.ru/otmetki/). Сервер хранит только шифр: фамилии, отметки и названия
// зашифрованы в браузере ключом из кода группы, который на сервер не попадает.
// Протокол (op в адресе, данные — в адресе для чтения или JSON в теле для записи):
//   create {g, w}            — новая группа: g — открытый номер группы из кода, w — пропуск на запись (хранится только хеш)
//   get    ?g&k              — один ключ: meta (список группы) или st/<метка> (карточка студента)
//   put    {g, w, items}     — записать ключи: meta, st/<метка>, l/<дата>T<время>-<хеш> (пара)
//   del    {g, w, k}         — удалить пару
//   month  ?g&m              — все пары месяца (для старосты; расшифровать может только он)
//   student ?g&t&m           — пары месяца, только часть одного студента (по его метке)
// Хранение пары: l/<ключ> = {g: шифр для старост, t: метки студентов} и s/<метка>/<ключ> — часть каждого студента
// (хранилище само решает, как их разложить). Код без зависимостей от Node: работает и в Cloudflare Workers.
'use strict';

const LIM = { meta: 300000, card: 4000, les: 60000, items: 200, rows: 1200 };
const GID = /^[abcdefghjklmnpqrstuvwxyz2-9]{16}$/;
const TAG = /^[abcdefghjklmnpqrstuvwxyz2-9]{16}$/;
const W = /^[A-Za-z0-9_-]{32}$/;
const KEY = /^(meta|st\/[abcdefghjklmnpqrstuvwxyz2-9]{16}|l\/\d{4}-\d{2}-\d{2}T\d{4}-[abcdefghjklmnpqrstuvwxyz2-9]{8})$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function sha(t) {
  const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}
function same(a, b) {   // сравнение без утечки по времени
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const out = (code, body) => [code, body];

function okCipher(s, max) { return typeof s === 'string' && s.length >= 24 && s.length <= max && B64.test(s); }
function okItem(it) {
  if (!it || typeof it.k !== 'string' || !KEY.test(it.k) || typeof it.d !== 'string') return false;
  if (it.k === 'meta') return okCipher(it.d, LIM.meta);
  if (it.k.startsWith('st/')) return okCipher(it.d, LIM.card);
  // пара: {g: всё для старост, s: {метка студента: его часть}}
  if (it.d.length > LIM.les) return false;
  let o; try { o = JSON.parse(it.d); } catch (e) { return false; }
  if (!o || !okCipher(o.g, LIM.les) || !o.s || typeof o.s !== 'object' || Array.isArray(o.s)) return false;
  return Object.keys(o.s).every(t => TAG.test(t) && okCipher(o.s[t], LIM.card));
}

async function checkWrite(S, g, w) {
  if (typeof w !== 'string' || !W.test(w)) return false;
  return same(await S.get(g, '_w'), await sha(w));
}

async function handle(op, q, body, S) {
  q = q || {};
  const g = (body && body.g) || q.g;
  if (typeof g !== 'string' || !GID.test(g)) return out(400, { error: 'неверный номер группы' });

  switch (op) {
    case 'create': {
      if (!body || typeof body.w !== 'string' || !W.test(body.w)) return out(400, { error: 'нет пропуска' });
      const was = await S.get(g, '_w');
      if (was) return same(was, await sha(body.w)) ? out(200, { ok: 1 }) : out(409, { error: 'такая группа уже есть' });
      await S.put(g, [{ k: '_w', d: await sha(body.w) }]);
      return out(200, { ok: 1 });
    }
    case 'get': {
      if (typeof q.k !== 'string' || !(q.k === 'meta' || /^st\/[abcdefghjklmnpqrstuvwxyz2-9]{16}$/.test(q.k))) return out(400, { error: 'неверный ключ' });
      const d = await S.get(g, q.k);
      return d ? out(200, { d }) : out(404, { error: 'не найдено' });
    }
    case 'month':
    case 'student': {
      if (typeof q.m !== 'string' || !MONTH.test(q.m)) return out(400, { error: 'неверный месяц' });
      if (op === 'student' && (typeof q.t !== 'string' || !TAG.test(q.t))) return out(400, { error: 'неверная ссылка' });
      const items = {};
      if (op === 'month') for (const r of await S.list(g, 'l/' + q.m + '-')) items[r.k] = r.d;
      else for (const r of await S.list(g, 's/' + q.t + '/' + q.m + '-')) items['l/' + r.k.slice(19)] = r.d;
      return out(200, { items });
    }
    case 'put': {
      if (!body || !(await checkWrite(S, g, body.w))) return out(403, { error: 'код группы не подходит' });
      const items = body.items;
      if (!Array.isArray(items) || !items.length || items.length > LIM.items || !items.every(okItem)) return out(400, { error: 'неверные данные' });
      const rows = [], gone = [], now = Date.now();
      for (const it of items) {
        if (!it.k.startsWith('l/')) { rows.push({ k: it.k, d: it.d }); continue; }
        const key = it.k.slice(2), o = JSON.parse(it.d), tags = Object.keys(o.s);
        if (Math.abs(Date.parse(key.slice(0, 10)) - now) > 400 * 864e5) return out(400, { error: 'неверная дата пары' });
        const old = await S.get(g, it.k);   // при правке: убрать части студентов, у которых отметку сняли
        if (old) { try { for (const t of JSON.parse(old).t || []) if (!o.s[t]) gone.push('s/' + t + '/' + key); } catch (e) {} }
        rows.push({ k: it.k, d: JSON.stringify({ g: o.g, t: tags }) });
        for (const t of tags) rows.push({ k: 's/' + t + '/' + key, d: o.s[t] });
      }
      if (rows.length > LIM.rows) return out(413, { error: 'слишком большой запрос' });
      await S.put(g, rows);
      if (gone.length) await S.delMany(g, gone);
      return out(200, { ok: 1, n: items.length });
    }
    case 'del': {
      if (!body || !(await checkWrite(S, g, body.w))) return out(403, { error: 'код группы не подходит' });
      if (typeof body.k !== 'string' || !/^l\//.test(body.k) || !KEY.test(body.k)) return out(400, { error: 'неверный ключ' });
      const old = await S.get(g, body.k), key = body.k.slice(2), keys = [body.k];
      if (old) { try { for (const t of JSON.parse(old).t || []) keys.push('s/' + t + '/' + key); } catch (e) {} }
      await S.delMany(g, keys);
      return out(200, { ok: 1 });
    }
  }
  return out(400, { error: 'неизвестная операция' });
}

// HTTP в формате Yandex Cloud Functions: event.httpMethod, queryStringParameters, body, isBase64Encoded
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
async function http(event, getStore) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const q = event.queryStringParameters || {};
  let body = null;
  if (event.httpMethod === 'POST') {
    let raw = event.body || '';
    if (event.isBase64Encoded) raw = new TextDecoder().decode(Uint8Array.from(atob(raw), c => c.charCodeAt(0)));
    if (raw.length > LIM.meta + LIM.items * LIM.card + 10000) return { statusCode: 413, headers: CORS, body: '{"error":"слишком большой запрос"}' };
    try { body = JSON.parse(raw); } catch (e) { return { statusCode: 400, headers: CORS, body: '{"error":"bad json"}' }; }
  }
  if (!q.op) return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }, body: 'API отметок arktika-app.ru/otmetki/' };
  try {
    const [code, obj] = await handle(q.op, q, body, await getStore());
    return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: CORS, body: '{"error":"сервер не ответил, попробуй ещё раз"}' };
  }
}

module.exports = { handle, http, LIM };
