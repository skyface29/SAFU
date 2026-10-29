// Точка входа Cloudflare Worker (otmetki-api): привязка D1 с именем DB. Тот же протокол, что у функции Yandex.
'use strict';
const { http } = require('./core');
const d1Store = require('./store-d1');
module.exports = {
  async fetch(req, env) {
    const u = new URL(req.url);
    const event = { httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams), body: req.method === 'POST' ? await req.text() : '', isBase64Encoded: false };
    const r = await http(event, async () => d1Store(env.DB));
    return new Response(r.body, { status: r.statusCode, headers: r.headers });
  },
};
