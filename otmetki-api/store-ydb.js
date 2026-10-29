// Хранилище в YDB (Yandex Database, serverless). Доступ — через сервисный аккаунт функции, ключей в коде нет.
// Одна таблица kv(g, k, d, upd): g — номер группы, k — ключ (_w, meta, st/…, l/…), d — шифр. Создаётся сама.
'use strict';
const { Driver, TokenAuthService, getCredentialsFromEnv, TypedValues, TypedData, Types, TableDescription, Column } = require('ydb-sdk');

let driver = null, driverToken = null, ready = null, inited = false;
const U = TypedValues.utf8, N = TypedValues.uint64;
const ITEM = Types.struct({ k: Types.UTF8, d: Types.UTF8 });

async function initTable(d) {
  await d.tableClient.withSession(async s => {
    try { await s.describeTable('kv'); return; } catch (e) { /* нет таблицы — создаём */ }
    await s.createTable('kv', new TableDescription()
      .withColumns(new Column('g', Types.optional(Types.UTF8)), new Column('k', Types.optional(Types.UTF8)),
        new Column('d', Types.optional(Types.UTF8)), new Column('upd', Types.optional(Types.UINT64)))
      .withPrimaryKeys('g', 'k'));
  });
}

// context.token — IAM-токен сервисного аккаунта, который Cloud Functions передаёт в вызов
function getDriver(context) {
  const tok = context && context.token && context.token.access_token;
  if (driver && (!tok || tok === driverToken)) return ready;
  if (driver) driver.destroy().catch(() => {});
  driverToken = tok || null;
  const d = driver = new Driver({
    endpoint: process.env.YDB_ENDPOINT || 'grpcs://ydb.serverless.yandexcloud.net:2135',
    database: process.env.YDB_DATABASE,
    authService: tok ? new TokenAuthService(tok) : getCredentialsFromEnv(),
  });
  ready = (async () => {
    if (!(await d.ready(10000))) throw new Error('YDB не отвечает');
    if (!inited) { await initTable(d); inited = true; }
    return d;
  })();
  ready.catch(() => { if (driver === d) driver = null; });
  return ready;
}

async function q(context, text, params) {
  const d = await getDriver(context);
  return d.tableClient.withSessionRetry(async s => {
    const r = await s.executeQuery(text, params);
    return (r.resultSets || []).map(rs => TypedData.createNativeObjects(rs).map(o => ({ ...o })));
  });
}

module.exports = function ydbStore(context) {
  return {
    async get(g, k) {
      const [rows] = await q(context, 'DECLARE $g AS Utf8; DECLARE $k AS Utf8; SELECT d FROM kv WHERE g = $g AND k = $k;', { $g: U(g), $k: U(k) });
      return rows && rows[0] ? rows[0].d : null;
    },
    async put(g, items) {
      await q(context, `DECLARE $g AS Utf8; DECLARE $now AS Uint64; DECLARE $items AS List<Struct<k: Utf8, d: Utf8>>;
        UPSERT INTO kv SELECT $g AS g, k, d, $now AS upd FROM AS_TABLE($items);`,
        { $g: U(g), $now: N(Date.now()), $items: TypedValues.list(ITEM, items) });
    },
    async delMany(g, keys) {
      await q(context, 'DECLARE $g AS Utf8; DECLARE $keys AS List<Utf8>; DELETE FROM kv WHERE g = $g AND k IN $keys;',
        { $g: U(g), $keys: TypedValues.list(Types.UTF8, keys) });
    },
    async list(g, prefix) {   // ответ YDB ограничен 1000 строк — читаем страницами
      const res = []; let after = prefix;
      for (;;) {
        const [rows] = await q(context, `DECLARE $g AS Utf8; DECLARE $a AS Utf8; DECLARE $p AS Utf8;
          SELECT k, d FROM kv WHERE g = $g AND k > $a AND StartsWith(k, $p) ORDER BY k LIMIT 500;`,
          { $g: U(g), $a: U(after), $p: U(prefix) });
        rows.forEach(r => res.push({ k: r.k, d: r.d }));
        if (rows.length < 500) return res;
        after = rows[rows.length - 1].k;
      }
    },
  };
};
