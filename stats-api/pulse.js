// Счётчик «сейчас на сайте» для arktika-app.ru (функция Yandex Cloud, Node.js 22, точка входа pulse.handler).
//
// Страницы раз в минуту присылают POST {s, p}: s — случайный номер браузера (без имени, IP не сохраняется),
// p — раздел (raspisanie, otmetki, …). Хранится одна строка на браузер, раздел и час: pulse(h, p, s, t).
// Админка (site/admin/) спрашивает GET с заголовком X-Admin-Token и получает: сколько сейчас на сайте,
// сколько было за сегодня и за неделю, и график по часам за двое суток.
//
// Переменные: ADMIN_TOKEN — пароль админки (длинная случайная строка), YDB_DATABASE — путь к базе
// (можно ту же, что у «Отметок»; таблица pulse создаётся сама). Нужен сервисный аккаунт с ролью ydb.editor.
'use strict';
const crypto = require('crypto');

const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const ONLINE_MS = 150e3;                       // «сейчас» — был виден за последние 2,5 минуты
const HOUR = 3600e3, MSK = 3 * HOUR, KEEP_HOURS = 24 * 35;

function cors(origin) {
  return { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Max-Age': '86400', 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0] };
}
const reply = (status, obj, head) => ({ statusCode: status, headers: { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Часы и границы суток по Москве. */
function clock(now) {
  const h = Math.floor(now / HOUR);
  const dayStart = Math.floor((now + MSK) / (24 * HOUR)) * 24 - 3;   // полночь по Москве, в часах от 1970
  return { h, dayStart, weekStart: h - 24 * 7 + 1, from48: h - 47, cut: now - ONLINE_MS };
}

/** Логика поверх хранилища db: beat(row), stats(clock) → ответ, purge(hour). */
async function handle(method, body, headers, db, now = Date.now()) {
  if (method === 'POST') {
    const s = body && String(body.s || ''), p = body && String(body.p || '');
    if (!/^[\w-]{8,40}$/.test(s) || !/^[a-z]{2,20}$/.test(p)) return [400, { error: 'bad' }];
    await db.beat({ h: Math.floor(now / HOUR), p, s, t: now });
    return [204, null];
  }
  if (method === 'GET') {
    const token = process.env.ADMIN_TOKEN || '';
    if (!token || !sameSecret(headers['X-Admin-Token'] || headers['x-admin-token'] || '', token)) return [403, { error: 'Нужен пароль администратора.' }];
    const c = clock(now);
    const res = await db.stats(c);
    if (Math.random() < 0.05) db.purge(c.h - KEEP_HOURS).catch(() => {});   // изредка чистим старое
    return [200, { now, ...res }];
  }
  return [405, { error: 'Метод не поддерживается.' }];
}

/* ---------- в памяти (только для проверки у себя) ---------- */
function memoryDb() {
  const rows = new Map();   // "h|p|s" → {h,p,s,t}
  const distinct = (filter, key) => { const m = new Map(); for (const r of rows.values()) if (filter(r)) { const k = key(r); if (!m.has(k.g)) m.set(k.g, new Set()); m.get(k.g).add(k.v); } return m; };
  return {
    async beat(r) { rows.set(r.h + '|' + r.p + '|' + r.s, r); },
    async stats(c) {
      const by = (filter) => { const m = distinct(filter, r => ({ g: r.p, v: r.s })); const o = {}; for (const [p, set] of m) o[p] = set.size; return o; };
      const all = (filter) => new Set([...rows.values()].filter(filter).map(r => r.s)).size;
      const on = r => r.h >= c.h - 1 && r.t > c.cut, day = r => r.h >= c.dayStart, week = r => r.h >= c.weekStart;
      const hourly = [];
      for (const [k, set] of distinct(r => r.h >= c.from48, r => ({ g: r.h + '|' + r.p, v: r.s }))) { const [h, p] = k.split('|'); hourly.push({ h: +h, p, n: set.size }); }
      return { online: by(on), onlineTotal: all(on), today: by(day), todayTotal: all(day), weekTotal: all(week), hourly };
    },
    async purge(h) { for (const [k, r] of rows) if (r.h < h) rows.delete(k); },
  };
}

/* ---------- YDB ---------- */
let ydb = null;
function ydbDb(context) {
  const { Driver, TokenAuthService, getCredentialsFromEnv, TypedValues, TypedData, Types, TableDescription, Column } = require('ydb-sdk');
  const tok = context && context.token && context.token.access_token;
  if (!ydb || (tok && tok !== ydb.tok)) {
    if (ydb) ydb.driver.destroy().catch(() => {});
    const driver = new Driver({ endpoint: process.env.YDB_ENDPOINT || 'grpcs://ydb.serverless.yandexcloud.net:2135', database: process.env.YDB_DATABASE,
      authService: tok ? new TokenAuthService(tok) : getCredentialsFromEnv() });
    const ready = Promise.race([(async () => {
      if (!(await driver.ready(5000))) throw new Error('YDB не отвечает');
      await driver.tableClient.withSession(async s => {
        try { await s.describeTable('pulse'); } catch (e) {
          await s.createTable('pulse', new TableDescription()
            .withColumns(new Column('h', Types.optional(Types.UINT32)), new Column('p', Types.optional(Types.UTF8)),
              new Column('s', Types.optional(Types.UTF8)), new Column('t', Types.optional(Types.UINT64)))
            .withPrimaryKeys('h', 'p', 's'));
        }
      });
      return driver;
    })(), new Promise((_, rej) => setTimeout(() => rej(new Error('YDB не отвечает')), 8000))]);
    ydb = { driver, tok, ready };
    ready.catch(() => { if (ydb && ydb.driver === driver) { ydb = null; driver.destroy().catch(() => {}); } });
  }
  const U = TypedValues.utf8, H = TypedValues.uint32, T = TypedValues.uint64;
  const q = async (text, params) => {
    const d = await ydb.ready;
    return d.tableClient.withSessionRetry(async s => {
      const r = await s.executeQuery(text, params);
      return (r.resultSets || []).map(rs => TypedData.createNativeObjects(rs).map(o => ({ ...o })));
    });
  };
  const toObj = rows => { const o = {}; for (const r of rows || []) o[r.p] = Number(r.n); return o; };
  return {
    async beat(r) {
      await q('DECLARE $h AS Uint32; DECLARE $p AS Utf8; DECLARE $s AS Utf8; DECLARE $t AS Uint64; UPSERT INTO pulse (h, p, s, t) VALUES ($h, $p, $s, $t);',
        { $h: H(r.h), $p: U(r.p), $s: U(r.s), $t: T(r.t) });
    },
    async stats(c) {
      const [onBy, onAll, dayBy, dayAll, weekAll, hourly] = await q(`
        DECLARE $h AS Uint32; DECLARE $cut AS Uint64; DECLARE $day AS Uint32; DECLARE $week AS Uint32; DECLARE $from AS Uint32;
        SELECT p, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $h - 1 AND t > $cut GROUP BY p;
        SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $h - 1 AND t > $cut;
        SELECT p, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $day GROUP BY p;
        SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $day;
        SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $week;
        SELECT h, p, COUNT(*) AS n FROM pulse WHERE h >= $from GROUP BY h, p ORDER BY h LIMIT 1000;`,
        { $h: H(c.h), $cut: T(c.cut), $day: H(c.dayStart), $week: H(c.weekStart), $from: H(c.from48) });
      const one = rows => Number(((rows || [])[0] || {}).n || 0);
      return { online: toObj(onBy), onlineTotal: one(onAll), today: toObj(dayBy), todayTotal: one(dayAll), weekTotal: one(weekAll),
        hourly: (hourly || []).map(r => ({ h: Number(r.h), p: r.p, n: Number(r.n) })) };
    },
    async purge(h) { await q('DECLARE $h AS Uint32; DELETE FROM pulse WHERE h < $h;', { $h: H(h) }); },
  };
}

let mem = null;
process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
module.exports.handler = async (event, context) => {
  const h = event.headers || {};
  const head = cors(h.Origin || h.origin || '');
  const method = event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: head, body: '' };
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  if (body.length > 2000) return reply(413, { error: 'big' }, head);
  try { body = body ? JSON.parse(body) : {}; } catch (e) { return reply(400, { error: 'bad' }, head); }
  try {
    const db = process.env.YDB_DATABASE ? ydbDb(context) : (mem = mem || memoryDb());
    const [status, obj] = await handle(method, body, h, db);
    return status === 204 ? { statusCode: 204, headers: head, body: '' } : reply(status, obj, head);
  } catch (e) {
    console.error('pulse', e && e.message);
    return reply(500, { error: 'Статистика сейчас недоступна.' }, head);
  }
};
module.exports._test = { handle, memoryDb, clock };
