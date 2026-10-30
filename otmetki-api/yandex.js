// Точка входа Yandex Cloud Functions (Node.js 22, обработчик index.handler): ядро + Object Storage.
// Cloudflare из России режется (и с телефонов, и из Yandex Cloud), поэтому данные живут в Яндексе.
// Разовый перенос из D1: переменная окружения IMPORT_KEY, запрос POST ?op=import {key, rows:[{g,k,d,s}]}
// (строки — как в таблице kv воркера). После переноса переменную удалить — операция выключится.
'use strict';
const { http } = require('./core');
const s3Store = require('./store-s3');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

async function importRows(body, S) {
  const by = new Map();
  for (const r of body.rows || []) {
    if (!r || typeof r.g !== 'string' || typeof r.k !== 'string' || typeof r.d !== 'string') continue;
    const items = by.get(r.g) || []; by.set(r.g, items);
    items.push({ k: r.k, d: r.d });
    if (r.k.startsWith('l/') && r.s) {
      const parts = typeof r.s === 'string' ? JSON.parse(r.s) : r.s;
      for (const [tag, part] of Object.entries(parts || {})) items.push({ k: 's/' + tag + '/' + r.k.slice(2), d: part });
    }
  }
  let n = 0;
  for (const [g, items] of by) { await S.put(g, items); n += items.length; }
  return { groups: by.size, items: n };
}

module.exports.handler = async (event, context) => {
  const q = event.queryStringParameters || {};
  if (q.op === 'import' && process.env.IMPORT_KEY && event.httpMethod === 'POST') {
    let body; try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); } catch (e) { return { statusCode: 400, headers: CORS, body: '{"error":"bad json"}' }; }
    if (body.key !== process.env.IMPORT_KEY) return { statusCode: 403, headers: CORS, body: '{"error":"нет"}' };
    try { return { statusCode: 200, headers: CORS, body: JSON.stringify(await importRows(body, s3Store(context))) }; }
    catch (e) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e && e.message) }) }; }
  }
  return http(event, async () => s3Store(context));
};
