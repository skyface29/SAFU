// Сборка для развёртывания (вставляется в редакторы кода в консолях, поэтому — по одному файлу):
//   dist/worker.js — Cloudflare Worker (ES-модуль): ядро + хранилище D1
//   dist/proxy.js  — функция Yandex Cloud (index.handler): пересылает запросы в Worker
// node pack.js
'use strict';
const fs = require('fs'), path = require('path');
const D = __dirname, OUT = path.join(D, 'dist');
const shim = 'const __m = {};\nconst __req = n => { const k = n.replace(/^\\.\\//, \'\'); const m = __m[k]; if (!m.done) { m.done = true; m.fn(m.mod, m.mod.exports, __req); } return m.mod.exports; };\n';
const wrap = m => `__m[${JSON.stringify(m)}] = { mod: { exports: {} }, fn: function (module, exports, require) {\n${fs.readFileSync(path.join(D, m + '.js'), 'utf8').replace(/^'use strict';\n/m, '')}\n} };\n`;
fs.mkdirSync(OUT, { recursive: true });
const worker = '// Собрано из otmetki-api/ (node pack.js). Не править руками.\n' + shim + ['core', 'store-d1', 'worker'].map(wrap).join('') + 'export default __req(\'./worker\');\n';
fs.writeFileSync(path.join(OUT, 'worker.js'), worker);
fs.copyFileSync(path.join(D, 'proxy.js'), path.join(OUT, 'proxy.js'));
console.log('dist/worker.js', worker.length, 'байт; dist/proxy.js', fs.statSync(path.join(OUT, 'proxy.js')).size, 'байт');
