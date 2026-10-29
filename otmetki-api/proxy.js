// Функция Yandex Cloud (index.handler): «входная дверь» для России. Пересылает запрос в Cloudflare Worker,
// где хранятся данные (D1, бесплатный план без карты). Своих данных и хранилища у функции нет.
'use strict';
const UP = process.env.UPSTREAM || 'https://otmetki-api.zarubin-kirillcka.workers.dev/';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
module.exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const qs = new URLSearchParams(event.queryStringParameters || {}).toString();
  const post = event.httpMethod === 'POST';
  let body = event.body || '';
  if (post && event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  try {
    const r = await fetch(UP + (qs ? '?' + qs : ''), { method: post ? 'POST' : 'GET', headers: { 'Content-Type': 'text/plain' }, body: post ? body : undefined, signal: AbortSignal.timeout(9000) });
    return { statusCode: r.status, headers: { ...CORS, 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: await r.text() };
  } catch (e) {
    console.error('upstream', e && e.message);
    return { statusCode: 502, headers: CORS, body: '{"error":"сервер не ответил, попробуй ещё раз"}' };
  }
};
