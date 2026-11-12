// Оплата «Полной проверки» (поиск Яндекса) на arktika-app.ru/antiplagiat/ и заказов бота «Без хвостов».
// Функция Yandex Cloud (pay.handler, Node.js 22), провайдер — Robokassa (у самозанятых чеки уходят в «Мой налог» сами).
//
// Как это работает:
//   1. Страница (или сервер бота) просит create → функция заводит заказ и отдаёт ссылку на оплату Robokassa.
//   2. После оплаты Robokassa присылает уведомление на ResultURL (?robokassa=result). Функция сверяет подпись
//      (Пароль №2) и сумму. Заказ антиплагиата получает код доступа, заказ бота пересылается на BOT_WEBHOOK_URL.
//   3. Страница по токену заказа узнаёт код (status), а перед каждой полной проверкой обменивает код на «билет»
//      (ticket): списывается одна проверка, билет подписан TICKET_SECRET, его проверяет помощник yandex.js.
//
// Переменные: ROBO_LOGIN, ROBO_PASS1, ROBO_PASS2, ROBO_TEST=1 (тестовые платежи), TICKET_SECRET (та же строка
// в yandex.js), YDB_DATABASE (без неё — память, только для проверки у себя), BOT_SECRET и BOT_WEBHOOK_URL (для бота).
'use strict';
const crypto = require('crypto');

const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const ROBO_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const TICKET_TTL = 2 * 3600e3;                  // билет действует 2 часа — одна проверка, даже глубокая
const ORDER_TTL = 24 * 3600e3;                  // неоплаченный заказ можно оплатить в течение суток

/* Тарифы. Цена — в рублях, checks — сколько полных проверок, days — сколько дней действует код. */
const PLANS = {
  one:   { price: 49,  checks: 1,  days: 90,  title: 'Полная проверка — 1 раз' },
  five:  { price: 149, checks: 5,  days: 180, title: 'Полная проверка — 5 раз' },
  month: { price: 299, checks: 40, days: 30,  title: 'Полная проверка — месяц, до 40 раз' },
};

function cors(origin) {
  return { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0] };
}
const reply = (status, obj, head) => ({ statusCode: status, headers: { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const text = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const money = x => (Math.round(Number(x) * 100) / 100).toFixed(2);

/** Код доступа: АЙС-XXXX-XXXX, без похожих букв и цифр (40 бит случайности). */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % 32];
  return 'AIS-' + s.slice(0, 4) + '-' + s.slice(4);
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^AIS/, '');
const codeKey = c => { const n = normCode(c); return n.length === 8 ? 'AIS-' + n.slice(0, 4) + '-' + n.slice(4) : ''; };

/* ---------- билеты для yandex.js ---------- */
function makeTicket(secret, code, now) {
  const payload = Buffer.from(JSON.stringify({ c: sha(code).slice(0, 16), e: now + TICKET_TTL, n: crypto.randomBytes(6).toString('base64url') })).toString('base64url');
  return payload + '.' + hmac(secret, payload);
}

/* ---------- Robokassa ---------- */
function receiptOf(title, price) {
  return JSON.stringify({ items: [{ name: title.slice(0, 128), quantity: 1, sum: Number(money(price)), tax: 'none',
    payment_method: 'full_payment', payment_object: 'service' }] });
}
/** Ссылка на страницу оплаты. Подпись: MerchantLogin:OutSum:InvId:Receipt:Пароль№1 (Receipt — URL-кодированный). */
function payUrl(env, inv, sum, description) {
  const outSum = money(sum), receipt = encodeURIComponent(receiptOf(description, sum));
  const sig = md5(`${env.ROBO_LOGIN}:${outSum}:${inv}:${receipt}:${env.ROBO_PASS1}`);
  const q = new URLSearchParams({ MerchantLogin: env.ROBO_LOGIN, OutSum: outSum, InvId: String(inv), Description: description.slice(0, 100),
    Receipt: receipt, SignatureValue: sig, Culture: 'ru', Encoding: 'utf-8' });
  if (env.ROBO_TEST === '1') q.set('IsTest', '1');
  return ROBO_URL + '?' + q.toString();
}
/** Проверка уведомления ResultURL: MD5(OutSum:InvId:Пароль№2[:Shp_…]) без учёта регистра. */
function resultOk(env, p) {
  const shp = Object.keys(p).filter(k => /^shp_/i.test(k)).sort().map(k => `${k}=${p[k]}`);
  const base = [p.OutSum, p.InvId, env.ROBO_PASS2, ...shp].join(':');
  return !!p.SignatureValue && same(md5(base), String(p.SignatureValue).toLowerCase());
}

/** Номер счёта для Robokassa — целое число; берём случайное и проверяем, что такого ещё нет. */
async function newInv(db) {
  for (let i = 0; i < 5; i++) {
    const inv = 1 + crypto.randomInt(2147483000);
    if (!(await db.order(inv))) return inv;
  }
  throw new Error('не удалось выбрать номер счёта');
}

const tries = new Map();   // мягкое ограничение подбора кодов на экземпляр функции
function tooMany(ip, limit) {
  const now = Date.now(), list = (tries.get(ip) || []).filter(t => now - t < 3600e3);
  list.push(now); tries.set(ip, list);
  return list.length > limit;
}

/** Действия страницы и сервера бота. Возвращает [код ответа, объект]. */
async function handle(body, db, env, ip, now = Date.now()) {
  const action = body && body.action;
  const ready = env.ROBO_LOGIN && env.ROBO_PASS1 && env.ROBO_PASS2 && env.TICKET_SECRET;
  if (action === 'plans') {
    return [200, { ready: !!ready, test: env.ROBO_TEST === '1',
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, price: p.price, checks: p.checks, days: p.days, title: p.title })) }];
  }
  if (!ready) return [503, { error: 'Оплата ещё не подключена.' }];

  if (action === 'create') {
    const purpose = body.purpose === 'bot' ? 'bot' : 'antiplagiat';
    let plan = '', ext = '', amount, title;
    if (purpose === 'bot') {
      // заказ бота создаёт только его сервер: подпись HMAC(BOT_SECRET, "order_id:amount")
      ext = String(body.order_id || '').slice(0, 64); amount = Number(body.amount);
      title = String(body.description || 'Заказ в боте «Без хвостов»').slice(0, 100);
      if (!env.BOT_SECRET || !ext || !(amount >= 1 && amount <= 100000)) return [400, { error: 'Неверный заказ.' }];
      if (!same(hmac(env.BOT_SECRET, `${ext}:${money(amount)}`), String(body.sig || ''))) return [403, { error: 'Неверная подпись.' }];
    } else {
      plan = String(body.plan || '');
      if (!PLANS[plan]) return [400, { error: 'Нет такого тарифа.' }];
      if (tooMany('c' + ip, 30)) return [429, { error: 'Слишком много попыток. Попробуйте позже.' }];
      amount = PLANS[plan].price; title = PLANS[plan].title;
    }
    const inv = await newInv(db), secret = crypto.randomBytes(12).toString('base64url');
    await db.putOrder({ inv, secret: sha(secret), purpose, plan, ext, amount: money(amount), status: 'new', code: '', created: now, paid: 0 });
    return [200, { order: inv + '.' + secret, inv, url: payUrl(env, inv, amount, title) }];
  }

  if (action === 'status') {
    const [inv, secret] = String(body.order || '').split('.');
    const o = /^\d{1,10}$/.test(inv || '') && await db.order(Number(inv));
    if (!o || !same(o.secret, sha(secret || ''))) return [404, { error: 'Заказ не найден.' }];
    if (o.status !== 'paid') return [200, { paid: false, expired: now - o.created > ORDER_TTL }];
    const c = o.code ? await db.code(o.code) : null;
    return [200, { paid: true, code: o.code, left: c ? c.left : 0, until: c ? c.until : 0 }];
  }

  if (action === 'balance' || action === 'ticket') {
    const code = codeKey(body.code);
    if (!code) return [400, { error: 'Код выглядит так: AIS-XXXX-XXXX.' }];
    if (tooMany('t' + ip, 120)) return [429, { error: 'Слишком много попыток. Попробуйте позже.' }];
    if (action === 'balance') {
      const c = await db.code(code);
      if (!c) return [404, { error: 'Такого кода нет. Проверьте, нет ли опечатки.' }];
      return [200, { code, left: c.until > now ? c.left : 0, until: c.until }];
    }
    const before = await db.spend(code, now);
    if (!before) return [404, { error: 'Такого кода нет. Проверьте, нет ли опечатки.' }];
    if (before.until <= now) return [402, { error: 'Срок действия кода закончился.', left: 0, until: before.until }];
    if (before.left <= 0) return [402, { error: 'Проверки по этому коду закончились.', left: 0, until: before.until }];
    return [200, { ticket: makeTicket(env.TICKET_SECRET, code, now), left: before.left - 1, until: before.until }];
  }
  return [400, { error: 'Неизвестное действие.' }];
}

/** Уведомление Robokassa об оплате. Ответ «OK<InvId>» — иначе Robokassa повторит позже. */
async function handleResult(p, db, env, now = Date.now(), send = fetch) {
  if (!env.ROBO_PASS2 || !resultOk(env, p)) return text(400, 'bad sign');
  const inv = Number(p.InvId), o = await db.order(inv);
  if (!o) return text(404, 'no order');
  if (money(p.OutSum) !== o.amount) return text(400, 'bad sum');
  if (o.status === 'paid') return text(200, 'OK' + inv);
  if (o.purpose === 'bot') {
    if (!env.BOT_WEBHOOK_URL || !env.BOT_SECRET) return text(503, 'bot not configured');
    const payload = JSON.stringify({ order_id: o.ext, amount: o.amount, inv, paid_at: now });
    try {
      const r = await send(env.BOT_WEBHOOK_URL, { method: 'POST', body: payload, signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'X-Signature': hmac(env.BOT_SECRET, payload) } });
      if (!r.ok) return text(502, 'bot answered ' + r.status);
    } catch (e) { return text(502, 'bot unreachable'); }
    await db.markPaid(inv, '', now);
    return text(200, 'OK' + inv);
  }
  const plan = PLANS[o.plan];
  if (!plan) return text(400, 'bad plan');
  let code = newCode();
  for (let i = 0; i < 3 && await db.code(code); i++) code = newCode();
  await db.putCode({ code, left: plan.checks, until: now + plan.days * 86400e3, created: now, inv });
  await db.markPaid(inv, code, now);
  return text(200, 'OK' + inv);
}

/* ---------- хранилище в памяти (только для проверки у себя) ---------- */
function memoryDb() {
  const orders = new Map(), codes = new Map();
  return {
    async order(inv) { return orders.get(inv) || null; },
    async putOrder(o) { orders.set(o.inv, { ...o }); },
    async markPaid(inv, code, now) { const o = orders.get(inv); if (o) Object.assign(o, { status: 'paid', code, paid: now }); },
    async code(code) { return codes.get(code) || null; },
    async putCode(c) { codes.set(c.code, { ...c }); },
    async spend(code, now) {
      const c = codes.get(code); if (!c) return null;
      const before = { ...c };
      if (c.left > 0 && c.until > now) c.left--;
      return before;
    },
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
    const O = Types.optional;
    const ready = Promise.race([(async () => {
      if (!(await driver.ready(5000))) throw new Error('YDB не отвечает');
      await driver.tableClient.withSession(async s => {
        try { await s.describeTable('pay_orders'); } catch (e) {
          await s.createTable('pay_orders', new TableDescription()
            .withColumns(new Column('inv', O(Types.UINT64)), new Column('secret', O(Types.UTF8)), new Column('purpose', O(Types.UTF8)),
              new Column('plan', O(Types.UTF8)), new Column('ext', O(Types.UTF8)), new Column('amount', O(Types.UTF8)),
              new Column('status', O(Types.UTF8)), new Column('code', O(Types.UTF8)), new Column('created', O(Types.UINT64)), new Column('paid', O(Types.UINT64)))
            .withPrimaryKeys('inv'));
        }
        try { await s.describeTable('pay_codes'); } catch (e) {
          await s.createTable('pay_codes', new TableDescription()
            .withColumns(new Column('code', O(Types.UTF8)), new Column('remaining', O(Types.INT32)), new Column('expires', O(Types.UINT64)),
              new Column('created', O(Types.UINT64)), new Column('inv', O(Types.UINT64)))
            .withPrimaryKeys('code'));
        }
      });
      return driver;
    })(), new Promise((_, rej) => setTimeout(() => rej(new Error('YDB не отвечает')), 8000))]);
    ydb = { driver, tok, ready };
    ready.catch(() => { if (ydb && ydb.driver === driver) { ydb = null; driver.destroy().catch(() => {}); } });
  }
  const U = TypedValues.utf8, U64 = TypedValues.uint64;
  const q = async (text, params) => {
    const d = await ydb.ready;
    return d.tableClient.withSessionRetry(async s => {
      const r = await s.executeQuery(text, params);
      return (r.resultSets || []).map(rs => TypedData.createNativeObjects(rs).map(o => ({ ...o })));
    });
  };
  const num = x => Number(x || 0);
  return {
    async order(inv) {
      const [rows] = await q('DECLARE $inv AS Uint64; SELECT * FROM pay_orders WHERE inv = $inv;', { $inv: U64(inv) });
      const r = rows && rows[0];
      return r ? { ...r, inv: num(r.inv), created: num(r.created), paid: num(r.paid) } : null;
    },
    async putOrder(o) {
      await q(`DECLARE $inv AS Uint64; DECLARE $secret AS Utf8; DECLARE $purpose AS Utf8; DECLARE $plan AS Utf8; DECLARE $ext AS Utf8;
        DECLARE $amount AS Utf8; DECLARE $status AS Utf8; DECLARE $code AS Utf8; DECLARE $created AS Uint64; DECLARE $paid AS Uint64;
        UPSERT INTO pay_orders (inv, secret, purpose, plan, ext, amount, status, code, created, paid)
        VALUES ($inv, $secret, $purpose, $plan, $ext, $amount, $status, $code, $created, $paid);`,
        { $inv: U64(o.inv), $secret: U(o.secret), $purpose: U(o.purpose), $plan: U(o.plan), $ext: U(o.ext), $amount: U(o.amount),
          $status: U(o.status), $code: U(o.code), $created: U64(o.created), $paid: U64(o.paid) });
    },
    async markPaid(inv, code, now) {
      await q(`DECLARE $inv AS Uint64; DECLARE $code AS Utf8; DECLARE $paid AS Uint64;
        UPDATE pay_orders SET status = 'paid', code = $code, paid = $paid WHERE inv = $inv;`, { $inv: U64(inv), $code: U(code), $paid: U64(now) });
    },
    async code(code) {
      const [rows] = await q('DECLARE $code AS Utf8; SELECT * FROM pay_codes WHERE code = $code;', { $code: U(code) });
      const r = rows && rows[0];
      return r ? { code: r.code, left: num(r.remaining), until: num(r.expires), created: num(r.created), inv: num(r.inv) } : null;
    },
    async putCode(c) {
      await q(`DECLARE $code AS Utf8; DECLARE $left AS Int32; DECLARE $until AS Uint64; DECLARE $created AS Uint64; DECLARE $inv AS Uint64;
        UPSERT INTO pay_codes (code, remaining, expires, created, inv) VALUES ($code, $left, $until, $created, $inv);`,
        { $code: U(c.code), $left: TypedValues.int32(c.left), $until: U64(c.until), $created: U64(c.created), $inv: U64(c.inv) });
    },
    /** Списывает одну проверку одной транзакцией и возвращает состояние кода ДО списания. */
    async spend(code, now) {
      const [rows] = await q(`DECLARE $code AS Utf8; DECLARE $now AS Uint64;
        SELECT remaining, expires FROM pay_codes WHERE code = $code;
        UPDATE pay_codes SET remaining = remaining - 1 WHERE code = $code AND remaining > 0 AND expires > $now;`, { $code: U(code), $now: U64(now) });
      const r = rows && rows[0];
      return r ? { left: num(r.remaining), until: num(r.expires) } : null;
    },
  };
}

function formParams(event) {
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  return { ...Object.fromEntries(new URLSearchParams(body)), ...(event.queryStringParameters || {}) };
}

let mem = null;
process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
module.exports.handler = async (event, context) => {
  const h = event.headers || {};
  const head = cors(h.Origin || h.origin || '');
  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: head, body: '' };
  let db;
  try { db = process.env.YDB_DATABASE ? ydbDb(context) : (mem = mem || memoryDb()); }
  catch (e) { return reply(500, { error: 'Оплата сейчас недоступна, попробуйте позже.' }, head); }
  if (qs.robokassa === 'result') {
    try { return await handleResult(formParams(event), db, process.env); }
    catch (e) { console.error('pay result', e && e.message); return text(500, 'error'); }
  }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Только POST.' }, head);
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  if (body.length > 10000) return reply(413, { error: 'Слишком большой запрос.' }, head);
  try { body = JSON.parse(body); } catch (e) { return reply(400, { error: 'Запрос не разобран.' }, head); }
  const ip = (event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp) || h['X-Forwarded-For'] || '?';
  try {
    const [status, obj] = await handle(body, db, process.env, ip);
    return reply(status, obj, head);
  } catch (e) {
    console.error('pay', e && e.message);
    return reply(500, { error: 'Оплата сейчас недоступна, попробуйте позже.' }, head);
  }
};
module.exports._test = { handle, handleResult, memoryDb, payUrl, resultOk, makeTicket, codeKey, newCode, hmac, md5, PLANS };
