// Оплата у себя на компьютере — для проверки страницы перед выкладкой. Запускается сама из antiplagiat/site_dev.py.
// Настоящая Robokassa не нужна: вместо её страницы — /pay-fake, которая сразу «оплачивает» заказ
// (присылает функции уведомление с правильной подписью) и возвращает на страницу с ?pay=ok.
'use strict';
const http = require('http');
const pay = require('./pay.js');
const { memoryDb, handle, handleResult, md5 } = pay._test;

const PORT = +process.argv[2] || 8791, SITE = process.argv[3] || 'http://localhost:8790';
const env = { ROBO_LOGIN: 'demo', ROBO_PASS1: 'local1', ROBO_PASS2: 'local2', TICKET_SECRET: 'local', ROBO_TEST: '1',
  BOT_SECRET: 'local-bot', BOT_WEBHOOK_URL: process.env.BOT_WEBHOOK_URL || '' };
const db = memoryDb();

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const send = (status, type, data, head = {}) => { res.writeHead(status, { 'Content-Type': type, ...head }); res.end(data); };
  if (url.pathname === '/pay-fake') {
    const inv = url.searchParams.get('InvId'), sum = url.searchParams.get('OutSum');
    const r = await handleResult({ OutSum: sum, InvId: inv, SignatureValue: md5(`${sum}:${inv}:${env.ROBO_PASS2}`) }, db, env);
    return send(302, 'text/plain', r.body, { Location: SITE + '/antiplagiat/?pay=' + (r.statusCode === 200 ? 'ok' : 'fail') });
  }
  if (url.pathname === '/pay' && req.method === 'POST') {
    let data; try { data = JSON.parse(body); } catch (e) { return send(400, 'application/json', '{"error":"Запрос не разобран."}'); }
    const [status, obj] = await handle(data, db, env, '127.0.0.1');
    if (obj.url) { const u = new URL(obj.url); obj.url = SITE + '/pay-fake?' + u.searchParams.toString(); }
    return send(status, 'application/json; charset=utf-8', JSON.stringify(obj));
  }
  send(404, 'text/plain', '');
}).listen(PORT, '127.0.0.1');
