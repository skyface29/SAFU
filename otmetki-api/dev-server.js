// Локальная проверка: сайт + API на одном порту, данные в памяти.
// node otmetki-api/dev-server.js [порт] [папка с веткой ruz-data, в ней web/m.json]
//   http://localhost:8790/otmetki/?api=local
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { http: api } = require('./core');
const store = require('./store-mem')();
const PORT = +process.argv[2] || 8790, RUZ = process.argv[3] || '', SITE = path.join(__dirname, '..', 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    let body = ''; for await (const c of req) body += c;
    const r = await api({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams), body, isBase64Encoded: false }, async () => store);
    if (process.env.SLOW) await new Promise(x => setTimeout(x, +process.env.SLOW));
    res.writeHead(r.statusCode, r.headers); return res.end(r.body);
  }
  let p = decodeURIComponent(u.pathname);
  let f = RUZ && p.startsWith('/raspisanie/data/') ? path.join(RUZ, p.slice('/raspisanie/data/'.length)) : path.join(SITE, p);
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(PORT, () => console.log('otmetki dev on http://localhost:' + PORT + '/otmetki/'));
