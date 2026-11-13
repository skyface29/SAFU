// Счётчик «сейчас на сайте» для arktika-app.ru (функция Yandex Cloud, Node.js 22, точка входа pulse.handler).
//
// Страницы при открытии и раз в 5 минут присылают POST {s, p}: s — случайный номер браузера (без имени),
// p — раздел (main — дневник разработки, raspisanie, otmetki, …). Хранится одна строка на браузер, раздел и час:
// pulse(h, p, s, t, d, n). d — устройство, его определяет сервер по заголовку User-Agent («phone|iOS|Safari»),
// n — отпечаток сети: SHA-256 от IP-адреса с секретной солью, которая меняется каждые сутки. Сам IP не хранится
// и из отпечатка не восстанавливается; по нему можно только посчитать, сколько разных сетей было за день.
// Боты и поисковые роботы (по User-Agent) не считаются.
// Админка (site/admin/) спрашивает GET с заголовком X-Admin-Token и получает: сколько сейчас на сайте,
// сколько было за сегодня и за неделю, и график по часам за двое суток.
//
// Ещё админка может: повесить объявление на все страницы (оно приходит в ответ на тот же запрос счётчика,
// лишних запросов нет) и запустить обновление расписания или пересборку сайта на GitHub (переменная GH_TOKEN —
// токен GitHub с правом Actions: write только на репозиторий SAFU).
//
// Переменные: ADMIN_TOKEN — пароль админки (длинная случайная строка), YDB_DATABASE — путь к базе
// (можно ту же, что у «Отметок»; таблица pulse создаётся сама). Нужен сервисный аккаунт с ролью ydb.editor.
'use strict';
const crypto = require('crypto');

const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const ONLINE_MS = 390e3;                       // «сейчас» — был на сайте за последние 6,5 минуты
// Потолок записей в сутки на экземпляр: держит счётчик в бесплатном объёме Yandex Cloud (1 млн вызовов функций и 1 млн RU
// базы YDB в месяц на всё облако; одна запись — около 2 RU, 6000 записей в сутки — около 360 тысяч RU в месяц).
const DAILY_CAP = +process.env.DAILY_CAP || 6000;
let capDay = '', capCount = 0;
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

/* ---------- расходы и бесплатные лимиты Yandex Cloud ----------
   Берутся из регулярной выгрузки детализации биллинга в бакет Object Storage (CSV раз в сутки).
   Переменные: BILLING_BUCKET — бакет, BILLING_PREFIX — папка выгрузки. Сервисному аккаунту нужна роль storage.viewer.
   Ответ кэшируется на 15 минут, чтобы не тратить запросы к хранилищу. */
const FREE = [   // бесплатный объём в месяц (yandex.cloud/ru/docs/billing/concepts/serverless-free-tier)
  { key: 'calls', label: 'Вызовы функций', service: /function/i, sku: /вызов|invocation|call/i, limit: 1e6, unit: 'вызовов' },
  { key: 'compute', label: 'Время работы функций', service: /function/i, sku: /время|execution|comput|гб.*ч|gb.*h/i, limit: 10, unit: 'ГБ×ч' },
  { key: 'ydbru', label: 'Запросы к базе YDB', service: /ydb|database/i, sku: /request|запрос/i, limit: 1e6, unit: 'RU' },
  { key: 'ydbgb', label: 'Данные в YDB', service: /ydb|database/i, sku: /хранен|storage|данн/i, limit: 1, unit: 'ГБ' },
];
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
let usageCache = null;
async function billingUsage(context, now) {
  const bucket = process.env.BILLING_BUCKET, prefix = (process.env.BILLING_PREFIX || '').replace(/^\//, '');
  const tok = context && context.token && context.token.access_token;
  if (!bucket || !tok) return null;
  if (usageCache && now - usageCache.at < 15 * 60e3) return usageCache.data;
  const H = { 'X-YaCloud-SubjectToken': tok }, base = 'https://storage.yandexcloud.net/' + bucket;
  const month = new Date(now + MSK).toISOString().slice(0, 7);          // «2026-11» по Москве
  const keys = []; let token = '';
  for (let page = 0; page < 10; page++) {
    const r = await fetch(base + '?list-type=2&prefix=' + encodeURIComponent(prefix) + (token ? '&continuation-token=' + encodeURIComponent(token) : ''), { headers: H, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('бакет выгрузки ответил ' + r.status);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) if (/\.csv$/i.test(m[1])) keys.push(m[1]);
    token = (/<NextContinuationToken>([^<]+)</.exec(xml) || [])[1];
    if (!token) break;
  }
  const mm = month.replace('-', '');
  const files = keys.filter(k => k.includes(month) || k.includes(mm)).slice(-40);
  const skus = new Map(); let cost = 0, last = '';
  for (const k of files) {
    const r = await fetch(base + '/' + k.split('/').map(encodeURIComponent).join('/'), { headers: H, signal: AbortSignal.timeout(10000) });
    if (!r.ok) continue;
    for (const row of parseCsv(await r.text())) {
      const date = row.date || row.Date || '';
      if (date && !date.startsWith(month)) continue;
      if (date > last) last = date;
      const name = (row.service_name || '') + ' · ' + (row.sku_name || row.sku_id || '');
      const e = skus.get(name) || { service: row.service_name || '', sku: row.sku_name || row.sku_id || '', unit: row.pricing_unit || '', quantity: 0, cost: 0 };
      e.quantity += parseFloat(row.pricing_quantity) || 0; e.cost += parseFloat(row.cost) || 0;
      skus.set(name, e); cost += parseFloat(row.cost) || 0;
    }
  }
  const list = [...skus.values()].sort((a, b) => b.cost - a.cost || b.quantity - a.quantity);
  const free = FREE.map(f => {
    const used = list.filter(e => f.service.test(e.service) && f.sku.test(e.sku)).reduce((s, e) => s + e.quantity, 0);
    return { key: f.key, label: f.label, unit: f.unit, limit: f.limit, used };
  });
  const data = { month, cost: Math.round(cost * 100) / 100, updated: last, files: files.length, free, skus: list.slice(0, 20) };
  usageCache = { at: now, data };
  return data;
}

/** Логика поверх хранилища db: beat(row), stats(clock) → ответ, purge(hour). */
const REPO = 'skyface29/SAFU', WORKFLOWS = { 'ruz.yml': 'Обновить расписание', 'site.yml': 'Пересобрать сайт' };
let cfgCache = null;
async function getConfig(db, now) {
  if (cfgCache && now - cfgCache.at < 60e3) return cfgCache.v;      // раз в минуту на экземпляр — почти бесплатно
  let v = {};
  try { v = JSON.parse((await db.getKv('config')) || '{}'); } catch (e) { v = {}; }
  cfgCache = { at: now, v };
  return v;
}
function liveBanner(cfg, now) {
  const b = cfg && cfg.banner;
  return b && b.text && (!b.until || b.until > now) ? b : null;
}
const isAdmin = headers => {
  const token = process.env.ADMIN_TOKEN || '';
  return !!token && sameSecret(headers['X-Admin-Token'] || headers['x-admin-token'] || '', token);
};

/* ---------- устройство и сеть: только на сервере, по заголовкам запроса ---------- */
const BOT = /bot\/|\bbot\b|telegrambot|twitterbot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|vkshare|python|curl|wget|node-fetch|axios|go-http/i;
function device(ua, touch) {
  ua = String(ua || '');
  let os = 'другая';
  if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) os = 'iPadOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const kind = os === 'iPadOS' || /Tablet/i.test(ua) || (os === 'Android' && !/Mobile/.test(ua)) ? 'tablet'
    : os === 'iOS' || /Mobi|Android/.test(ua) ? 'phone' : 'desktop';
  const br = /YaBrowser|YaSearchBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg[A-Z]?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS|Chromium/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'другой';
  return kind + '|' + os + '|' + br;
}
function netPrint(ip, now) {
  if (!ip) return '';
  const day = new Date(now + MSK).toISOString().slice(0, 10);   // соль меняется в полночь по Москве
  const salt = crypto.createHmac('sha256', process.env.ADMIN_TOKEN || 'arktika-pulse').update('net|' + day).digest();
  return crypto.createHmac('sha256', salt).update(String(ip)).digest('hex').slice(0, 16);
}

async function handle(method, body, headers, db, now = Date.now(), context = null, ip = '') {
  if (method === 'POST' && body && body.action) {                    // команды админки
    if (!isAdmin(headers)) return [403, { error: 'Нужен пароль администратора.' }];
    if (body.action === 'banner') {
      const text = String(body.text || '').trim().slice(0, 300);
      const kind = ['info', 'warn', 'ok'].includes(body.kind) ? body.kind : 'info';
      const sections = (Array.isArray(body.sections) ? body.sections : []).filter(x => /^[a-z]{2,20}$/.test(x)).slice(0, 10);
      const hours = Math.min(Math.max(+body.hours || 0, 0), 24 * 30);
      const cfg = await getConfig(db, now);
      cfg.banner = text ? { id: now.toString(36), text, kind, sections, until: hours ? now + hours * HOUR : 0, at: now } : null;
      await db.setKv('config', JSON.stringify(cfg));
      cfgCache = { at: now, v: cfg };
      return [200, { ok: true, banner: cfg.banner }];
    }
    if (body.action === 'dispatch') {
      const wf = String(body.workflow || '');
      if (!WORKFLOWS[wf]) return [400, { error: 'Неизвестное действие.' }];
      if (!process.env.GH_TOKEN) return [400, { error: 'Кнопки управления не подключены: задайте GH_TOKEN у функции.' }];
      const r = await fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + wf + '/dispatches', { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'arktika-pulse', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }) });
      if (r.status !== 204) return [502, { error: 'GitHub ответил ' + r.status }];
      return [200, { ok: true, started: WORKFLOWS[wf] }];
    }
    return [400, { error: 'Неизвестная команда.' }];
  }
  if (method === 'POST') {
    const s = body && String(body.s || ''), p = body && String(body.p || '');
    if (!/^[\w-]{8,40}$/.test(s) || !/^[a-z]{2,20}$/.test(p)) return [400, { error: 'bad' }];
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== capDay) { capDay = day; capCount = 0; }
    const ua = headers['User-Agent'] || headers['user-agent'] || '';
    if (BOT.test(ua)) return [200, {}];                                // роботов не считаем
    const d = device(ua, body.m === 1), n = netPrint(ip, now);
    if (++capCount <= DAILY_CAP) await db.beat({ h: Math.floor(now / HOUR), p, s, t: now, d, n });   // сверх лимита молча не пишем
    const b = liveBanner(await getConfig(db, now), now);
    return [200, b && (!b.sections.length || b.sections.includes(p)) ? { b: { id: b.id, text: b.text, kind: b.kind } } : {}];
  }
  if (method === 'GET') {
    if (!isAdmin(headers)) return [403, { error: 'Нужен пароль администратора.' }];
    const c = clock(now);
    const res = await db.stats(c);
    if (Math.random() < 0.05) db.purge(c.h - KEEP_HOURS).catch(() => {});   // изредка чистим старое
    let usage = null, usageError = null;
    try { usage = await billingUsage(context, now); } catch (e) { usageError = e.message; }
    const cfg = await getConfig(db, now);
    return [200, { now, ...res, usage, usageError, banner: liveBanner(cfg, now),
      can: { dispatch: !!process.env.GH_TOKEN, billing: !!process.env.BILLING_BUCKET } }];
  }
  return [405, { error: 'Метод не поддерживается.' }];
}

/* ---------- в памяти (только для проверки у себя) ---------- */
function memoryDb() {
  const rows = new Map(), kv = new Map();   // "h|p|s" → {h,p,s,t}
  const distinct = (filter, key) => { const m = new Map(); for (const r of rows.values()) if (filter(r)) { const k = key(r); if (!m.has(k.g)) m.set(k.g, new Set()); m.get(k.g).add(k.v); } return m; };
  return {
    async beat(r) { rows.set(r.h + '|' + r.p + '|' + r.s, r); },
    async stats(c) {
      const by = (filter) => { const m = distinct(filter, r => ({ g: r.p, v: r.s })); const o = {}; for (const [p, set] of m) o[p] = set.size; return o; };
      const all = (filter) => new Set([...rows.values()].filter(filter).map(r => r.s)).size;
      const on = r => r.h >= c.h - 1 && r.t > c.cut, day = r => r.h >= c.dayStart, week = r => r.h >= c.weekStart;
      const nets = f => new Set([...rows.values()].filter(r => f(r) && r.n).map(r => r.n)).size;
      const hourly = [], hourlyTotal = [], devices = {};
      for (const [k, set] of distinct(r => r.h >= c.from48, r => ({ g: r.h + '|' + r.p, v: r.s }))) { const [h, p] = k.split('|'); hourly.push({ h: +h, p, n: set.size }); }
      for (const [h, set] of distinct(r => r.h >= c.from48, r => ({ g: r.h, v: r.s }))) hourlyTotal.push({ h: +h, n: set.size });
      for (const [d, set] of distinct(r => day(r) && r.d, r => ({ g: r.d, v: r.s }))) devices[d] = set.size;
      return { online: by(on), onlineTotal: all(on), today: by(day), todayTotal: all(day), weekTotal: all(week), hourly, hourlyTotal,
        devices, onlineNets: nets(on), todayNets: nets(day) };
    },
    async purge(h) { for (const [k, r] of rows) if (r.h < h) rows.delete(k); },
    async getKv(k) { return kv.get(k) || null; },
    async setKv(k, v) { kv.set(k, v); },
  };
}

/* ---------- YDB ---------- */
let ydb = null, slow = null;
const SLOW_MS = 10 * 60e3;
function ydbDb(context) {
  const { Driver, TokenAuthService, getCredentialsFromEnv, TypedValues, TypedData, Types, TableDescription, AlterTableDescription, Column } = require('ydb-sdk');
  const tok = context && context.token && context.token.access_token;
  if (!ydb || (tok && tok !== ydb.tok)) {
    if (ydb) ydb.driver.destroy().catch(() => {});
    const driver = new Driver({ endpoint: process.env.YDB_ENDPOINT || 'grpcs://ydb.serverless.yandexcloud.net:2135', database: process.env.YDB_DATABASE,
      authService: tok ? new TokenAuthService(tok) : getCredentialsFromEnv() });
    const ready = Promise.race([(async () => {
      if (!(await driver.ready(5000))) throw new Error('YDB не отвечает');
      await driver.tableClient.withSession(async s => {
        try { await s.describeTable('admin_kv'); } catch (e) {
          await s.createTable('admin_kv', new TableDescription()
            .withColumns(new Column('k', Types.optional(Types.UTF8)), new Column('v', Types.optional(Types.UTF8))).withPrimaryKeys('k'));
        }
        try { await s.describeTable('pulse'); } catch (e) {
          await s.createTable('pulse', new TableDescription()
            .withColumns(new Column('h', Types.optional(Types.UINT32)), new Column('p', Types.optional(Types.UTF8)),
              new Column('s', Types.optional(Types.UTF8)), new Column('t', Types.optional(Types.UINT64)),
              new Column('d', Types.optional(Types.UTF8)), new Column('n', Types.optional(Types.UTF8)))
            .withPrimaryKeys('h', 'p', 's'));
        }
        // таблица из прошлой версии — дописываем столбцы устройства и сети (один раз)
        const have = new Set(((await s.describeTable('pulse')).columns || []).map(c => c.name));
        const add = ['d', 'n'].filter(c => !have.has(c));
        if (add.length) {
          const alter = new AlterTableDescription();
          alter.addColumns = add.map(c => new Column(c, Types.optional(Types.UTF8)));
          await s.alterTable('pulse', alter);
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
      await q('DECLARE $h AS Uint32; DECLARE $p AS Utf8; DECLARE $s AS Utf8; DECLARE $t AS Uint64; DECLARE $d AS Utf8; DECLARE $n AS Utf8;' +
        ' UPSERT INTO pulse (h, p, s, t, d, n) VALUES ($h, $p, $s, $t, $d, $n);',
        { $h: H(r.h), $p: U(r.p), $s: U(r.s), $t: T(r.t), $d: U(r.d || ''), $n: U(r.n || '') });
    },
    async stats(c) {
      const one = rows => Number(((rows || [])[0] || {}).n || 0);
      // «Сейчас», «сегодня» и текущий час — каждый раз (график живой); неделя, прошлые часы, устройства и сети читают
      // много строк, поэтому не чаще раза в 10 минут.
      const [onBy, onAll, onNets, dayBy, dayAll, hourBy, hourAll] = await q([
          'DECLARE $h AS Uint32; DECLARE $cut AS Uint64; DECLARE $day AS Uint32;',
          'SELECT p, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $h - 1 AND t > $cut GROUP BY p;',
          'SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $h - 1 AND t > $cut;',
          'SELECT COUNT(DISTINCT n) AS n FROM pulse WHERE h >= $h - 1 AND t > $cut AND n IS NOT NULL AND n != ""u;',
          'SELECT p, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $day GROUP BY p;',
          'SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $day;',
          'SELECT p, COUNT(*) AS n FROM pulse WHERE h = $h GROUP BY p;',
          'SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h = $h;'].join('\n'),
        { $h: H(c.h), $cut: T(c.cut), $day: H(c.dayStart) });
      if (!slow || Date.now() - slow.at > SLOW_MS) {
        const [weekAll, hourly, hourlyTotal, devices, dayNets] = await q([
          'DECLARE $week AS Uint32; DECLARE $from AS Uint32; DECLARE $day AS Uint32;',
          'SELECT COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $week;',
          'SELECT h, p, COUNT(*) AS n FROM pulse WHERE h >= $from GROUP BY h, p ORDER BY h LIMIT 1000;',
          'SELECT h, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $from GROUP BY h ORDER BY h LIMIT 100;',
          'SELECT d, COUNT(DISTINCT s) AS n FROM pulse WHERE h >= $day AND d IS NOT NULL AND d != ""u GROUP BY d LIMIT 200;',
          'SELECT COUNT(DISTINCT n) AS n FROM pulse WHERE h >= $day AND n IS NOT NULL AND n != ""u;'].join('\n'),
          { $week: H(c.weekStart), $from: H(c.from48), $day: H(c.dayStart) });
        const dev = {}; for (const r of devices || []) dev[r.d] = Number(r.n);
        slow = { at: Date.now(), weekTotal: one(weekAll), hourly: (hourly || []).map(r => ({ h: Number(r.h), p: r.p, n: Number(r.n) })),
          hourlyTotal: (hourlyTotal || []).map(r => ({ h: Number(r.h), n: Number(r.n) })), devices: dev, todayNets: one(dayNets) };
      }
      // текущий час подставляем свежий поверх закэшированного графика
      const hourly = slow.hourly.filter(r => r.h !== c.h).concat((hourBy || []).map(r => ({ h: c.h, p: r.p, n: Number(r.n) })));
      const hourlyTotal = slow.hourlyTotal.filter(r => r.h !== c.h).concat([{ h: c.h, n: one(hourAll) }]);
      const todayTotal = one(dayAll);
      return { online: toObj(onBy), onlineTotal: one(onAll), onlineNets: one(onNets), today: toObj(dayBy), todayTotal,
        weekTotal: Math.max(slow.weekTotal, todayTotal), hourly, hourlyTotal, devices: slow.devices, todayNets: slow.todayNets,
        slowAt: slow.at };
    },
    async purge(h) { await q('DECLARE $h AS Uint32; DELETE FROM pulse WHERE h < $h;', { $h: H(h) }); },
    async getKv(k) { const [rows] = await q('DECLARE $k AS Utf8; SELECT v FROM admin_kv WHERE k = $k;', { $k: U(k) }); return rows && rows[0] ? rows[0].v : null; },
    async setKv(k, v) { await q('DECLARE $k AS Utf8; DECLARE $v AS Utf8; UPSERT INTO admin_kv (k, v) VALUES ($k, $v);', { $k: U(k), $v: U(v) }); },
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
    const ip = (event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp)
      || String(h['X-Forwarded-For'] || h['x-forwarded-for'] || '').split(',')[0].trim();
    const [status, obj] = await handle(method, body, h, db, Date.now(), context, ip);
    return reply(status, obj || {}, head);
  } catch (e) {
    console.error('pulse', e && e.message);
    return reply(500, { error: 'Статистика сейчас недоступна.' }, head);
  }
};
module.exports._test = { handle, memoryDb, clock, parseCsv, billingUsage, device, netPrint };
