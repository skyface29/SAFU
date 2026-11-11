// «Кольцо САФУ» — общая база работ, которые студенты добавили сами (функция Yandex Cloud, Node.js 22, index.handler).
// Страница присылает «отпечатки» текста — числа-хеши троек основ слов (см. fingerprints в site/antiplagiat/engine.js).
// По отпечаткам находятся работы с общими кусками, и наружу отдаются только эти куски с небольшим запасом вокруг:
// чужую работу целиком получить нельзя. Удалить свою работу можно ключом, который выдаётся при добавлении.
//
// Хранилище — YDB (переменная YDB_DATABASE, доступ через сервисный аккаунт функции, нужен пакет ydb-sdk).
// Таблицы создаются сами: ring_docs(id, title, text, created, owner, fps) и ring_fp(fp, doc, pos).
'use strict';
const crypto = require('crypto');

const ORIGINS = ['https://arktika-app.ru', 'https://www.arktika-app.ru', 'http://localhost:8790'];
const MAX_TEXT = 600000, MAX_FPS = 40000, MIN_HITS = 6, TOP = 8, WIN = 350, MAX_EXCERPT = 40000, CHUNK = 2000;
const ADDS_PER_HOUR = 20;

function cors(origin) {
  return { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0] };
}
const reply = (status, obj, head) => ({ statusCode: status, headers: { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const randomId = n => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const isU32 = x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** Куски текста вокруг совпавших отпечатков, склеенные через многоточие. */
function excerpt(text, positions) {
  const ps = [...new Set(positions)].filter(p => p >= 0 && p < text.length).sort((a, b) => a - b);
  const wins = [];
  for (const p of ps) {
    const a = Math.max(0, p - WIN), b = Math.min(text.length, p + WIN);
    const last = wins[wins.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else wins.push([a, b]);
  }
  let out = '', used = 0;
  for (const [a, b] of wins) {
    if (used + (b - a) > MAX_EXCERPT) break;
    out += (out ? '\n…\n' : '') + text.slice(a, b); used += b - a;
  }
  return out;
}

const addsByIp = new Map();   // мягкое ограничение на экземпляр функции
function tooManyAdds(ip) {
  const now = Date.now(), list = (addsByIp.get(ip) || []).filter(t => now - t < 3600e3);
  list.push(now); addsByIp.set(ip, list);
  return list.length > ADDS_PER_HOUR;
}

/** Логика кольца поверх любого хранилища db: add, counts, positions, get, remove. */
async function handle(body, db, ip) {
  const action = body && body.action;
  if (action === 'ping') return [200, { ok: true }];
  if (action === 'add') {
    const text = String(body.text || ''), title = String(body.title || '').trim().slice(0, 160);
    if (text.length < 1000 || text.length > MAX_TEXT) return [400, { error: 'Текст должен быть от 1 тысячи до 600 тысяч знаков.' }];
    if (!Array.isArray(body.fps) || body.fps.length < 30 || body.fps.length > MAX_FPS) return [400, { error: 'Не удалось разобрать текст.' }];
    const seen = new Map();
    for (const f of body.fps) {
      if (!Array.isArray(f) || !isU32(f[0]) || !isU32(f[1]) || f[1] >= text.length) return [400, { error: 'Не удалось разобрать текст.' }];
      if (!seen.has(f[0])) seen.set(f[0], f[1]);
    }
    if (tooManyAdds(ip)) return [429, { error: 'Слишком много работ за час. Попробуйте позже.' }];
    const id = randomId(9), key = randomId(15);
    const fps = [...seen.entries()].map(([fp, pos]) => ({ fp, pos }));
    await db.add({ id, title, text, created: Date.now(), owner: sha(key), fps });
    return [200, { id, key }];
  }
  if (action === 'query') {
    if (!Array.isArray(body.fps) || body.fps.length > MAX_FPS) return [400, { error: 'Слишком большой запрос.' }];
    const list = [...new Set(body.fps.filter(isU32))];
    if (!list.length) return [200, { docs: [] }];
    const counts = await db.counts(list);
    const top = [...counts.entries()].filter(([, n]) => n >= MIN_HITS).sort((a, b) => b[1] - a[1]).slice(0, TOP);
    const docs = [];
    for (const [id, hits] of top) {
      const d = await db.get(id);
      if (!d) continue;
      const pos = await db.positions(id, list);
      docs.push({ id, title: d.title, year: new Date(Number(d.created)).getFullYear(), hits, excerpt: excerpt(d.text, pos) });
    }
    return [200, { docs }];
  }
  if (action === 'delete') {
    const d = body.id && await db.get(String(body.id));
    if (!d) return [404, { error: 'Работа не найдена — возможно, уже удалена.' }];
    if (sha(body.key || '') !== d.owner) return [403, { error: 'Неверный ключ удаления.' }];
    await db.remove(String(body.id), d.fps);
    return [200, { ok: true }];
  }
  return [400, { error: 'Неизвестное действие.' }];
}

/* ---------- хранилище в памяти (только для проверки у себя) ---------- */
function memoryDb() {
  const docs = new Map(), idx = new Map();
  return {
    async add(d) { docs.set(d.id, { ...d, fps: d.fps.map(f => f.fp) }); for (const { fp, pos } of d.fps) { if (!idx.has(fp)) idx.set(fp, new Map()); idx.get(fp).set(d.id, pos); } },
    async counts(list) { const c = new Map(); for (const fp of list) for (const doc of (idx.get(fp) || new Map()).keys()) c.set(doc, (c.get(doc) || 0) + 1); return c; },
    async positions(id, list) { const out = []; for (const fp of list) { const m = idx.get(fp); if (m && m.has(id)) out.push(m.get(id)); } return out; },
    async get(id) { return docs.get(id) || null; },
    async remove(id, fps) { for (const fp of fps) { const m = idx.get(fp); if (m) m.delete(id); } docs.delete(id); },
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
        try { await s.describeTable('ring_docs'); } catch (e) {
          await s.createTable('ring_docs', new TableDescription()
            .withColumns(new Column('id', Types.optional(Types.UTF8)), new Column('title', Types.optional(Types.UTF8)),
              new Column('text', Types.optional(Types.UTF8)), new Column('created', Types.optional(Types.UINT64)),
              new Column('owner', Types.optional(Types.UTF8)), new Column('fps', Types.optional(Types.UTF8)))
            .withPrimaryKeys('id'));
        }
        try { await s.describeTable('ring_fp'); } catch (e) {
          await s.createTable('ring_fp', new TableDescription()
            .withColumns(new Column('fp', Types.optional(Types.UINT32)), new Column('doc', Types.optional(Types.UTF8)), new Column('pos', Types.optional(Types.UINT32)))
            .withPrimaryKeys('fp', 'doc'));
        }
      });
      return driver;
    })(), new Promise((_, rej) => setTimeout(() => rej(new Error('YDB не отвечает')), 8000))]);
    ydb = { driver, tok, ready };
    ready.catch(() => { if (ydb && ydb.driver === driver) { ydb = null; driver.destroy().catch(() => {}); } });
  }
  const U = TypedValues.utf8, FP_ROW = Types.struct({ fp: Types.UINT32, pos: Types.UINT32 });
  const q = async (text, params) => {
    const d = await ydb.ready;
    return d.tableClient.withSessionRetry(async s => {
      const r = await s.executeQuery(text, params);
      return (r.resultSets || []).map(rs => TypedData.createNativeObjects(rs).map(o => ({ ...o })));
    });
  };
  const fpList = list => TypedValues.list(Types.UINT32, list);
  return {
    async add(d) {
      await q(`DECLARE $id AS Utf8; DECLARE $title AS Utf8; DECLARE $text AS Utf8; DECLARE $created AS Uint64; DECLARE $owner AS Utf8; DECLARE $fps AS Utf8;
        UPSERT INTO ring_docs (id, title, text, created, owner, fps) VALUES ($id, $title, $text, $created, $owner, $fps);`,
        { $id: U(d.id), $title: U(d.title), $text: U(d.text), $created: TypedValues.uint64(d.created), $owner: U(d.owner), $fps: U(JSON.stringify(d.fps.map(f => f.fp))) });
      for (const part of chunks(d.fps, CHUNK)) {
        await q(`DECLARE $doc AS Utf8; DECLARE $rows AS List<Struct<fp: Uint32, pos: Uint32>>;
          UPSERT INTO ring_fp SELECT fp, $doc AS doc, pos FROM AS_TABLE($rows);`, { $doc: U(d.id), $rows: TypedValues.list(FP_ROW, part) });
      }
    },
    async counts(list) {
      const c = new Map();
      for (const part of chunks(list, CHUNK)) {
        const [rows] = await q(`DECLARE $fps AS List<Uint32>;
          SELECT doc, COUNT(*) AS n FROM ring_fp WHERE fp IN $fps GROUP BY doc ORDER BY n DESC LIMIT 50;`, { $fps: fpList(part) });
        for (const r of rows || []) c.set(r.doc, (c.get(r.doc) || 0) + Number(r.n));
      }
      return c;
    },
    async positions(id, list) {
      const out = [];
      for (const part of chunks(list, CHUNK)) {
        const [rows] = await q(`DECLARE $fps AS List<Uint32>; DECLARE $doc AS Utf8;
          SELECT pos FROM ring_fp WHERE fp IN $fps AND doc = $doc LIMIT 1000;`, { $fps: fpList(part), $doc: U(id) });
        for (const r of rows || []) out.push(Number(r.pos));
      }
      return out;
    },
    async get(id) {
      const [rows] = await q('DECLARE $id AS Utf8; SELECT title, text, created, owner, fps FROM ring_docs WHERE id = $id;', { $id: U(id) });
      const r = rows && rows[0];
      return r ? { title: r.title, text: r.text, created: Number(r.created), owner: r.owner, fps: JSON.parse(r.fps || '[]') } : null;
    },
    async remove(id, fps) {
      for (const part of chunks(fps, CHUNK)) {
        await q('DECLARE $fps AS List<Uint32>; DECLARE $doc AS Utf8; DELETE FROM ring_fp WHERE fp IN $fps AND doc = $doc;', { $fps: fpList(part), $doc: U(id) });
      }
      await q('DECLARE $id AS Utf8; DELETE FROM ring_docs WHERE id = $id;', { $id: U(id) });
    },
  };
}

let mem = null;
process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
module.exports.handler = async (event, context) => {
  const h = event.headers || {};
  const head = cors(h.Origin || h.origin || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: head, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Только POST.' }, head);
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  if (body.length > 3e6) return reply(413, { error: 'Слишком большой запрос.' }, head);
  try { body = JSON.parse(body); } catch (e) { return reply(400, { error: 'Запрос не разобран.' }, head); }
  const ip = (event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp) || h['X-Forwarded-For'] || '?';
  try {
    const db = process.env.YDB_DATABASE ? ydbDb(context) : (mem = mem || memoryDb());
    const [status, obj] = await handle(body, db, ip);
    return reply(status, obj, head);
  } catch (e) {
    console.error('ring', e && e.message);
    return reply(500, { error: 'Кольцо САФУ сейчас недоступно, попробуйте позже.' }, head);
  }
};
module.exports._test = { handle, memoryDb, excerpt };
