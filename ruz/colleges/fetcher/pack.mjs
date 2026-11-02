// Сборка загрузчика для функции Yandex Cloud: один файл dist/index.js (CommonJS, точка входа index.handler).
// node ruz/colleges/fetcher/pack.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(D, 'dist');
let s = fs.readFileSync(path.join(D, 'fetch.mjs'), 'utf8');
s = s.replace(/\nif \(import\.meta\.url[\s\S]*$/, '\n')
  .replace('export async function run', 'async function run')
  .replace('export const handler =', 'exports.handler =');
if (/\bexport\b|import\.meta/.test(s)) throw new Error('в fetch.mjs остался ESM-синтаксис, поправь pack.mjs');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'package.json'), '{"type": "commonjs"}\n');
fs.writeFileSync(path.join(OUT, 'index.js'), "'use strict';\n// Собрано из ruz/colleges/fetcher/fetch.mjs (node pack.mjs). Не править руками.\n" + s + 'exports.run = run;\n');
console.log('dist/index.js', fs.statSync(path.join(OUT, 'index.js')).size, 'байт');
