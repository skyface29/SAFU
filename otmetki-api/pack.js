// Сборка функции для Yandex Cloud одним файлом: node pack.js → dist/index.js + dist/package.json (+ dist/otmetki-api.zip, если есть zip).
// Один файл удобно вставить в редактор кода в консоли Yandex Cloud; зависимость ydb-sdk облако ставит само по package.json.
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const D = __dirname, OUT = path.join(D, 'dist');
const mods = process.env.STORE === 'ydb' ? ['core', 'store-ydb'] : ['core', 'store-s3'];
let src = '// Собрано из otmetki-api/ (node pack.js). Не править руками.\n\'use strict\';\nconst __m = {};\nconst __req = n => { const k = n.replace(/^\\.\\//, \'\'); if (!__m[k]) return require(n); if (!__m[k].done) { __m[k].done = true; __m[k].fn(__m[k].mod, __m[k].mod.exports, __req); } return __m[k].mod.exports; };\n';
for (const m of mods) {
  const code = fs.readFileSync(path.join(D, m + '.js'), 'utf8').replace(/^'use strict';\n/m, '');
  src += `__m[${JSON.stringify(m)}] = { mod: { exports: {} }, fn: function (module, exports, require) {\n${code}\n} };\n`;
}
src += fs.readFileSync(path.join(D, 'index.js'), 'utf8').replace(/^'use strict';\n/m, '').replace(/require\('\.\//g, "__req('./");
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.js'), src);
const pkg = JSON.parse(fs.readFileSync(path.join(D, 'package.json'), 'utf8'));
// для Object Storage зависимостей нет; ydb-sdk нужен, только если STORE=ydb
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true, main: 'index.js', dependencies: process.env.STORE === 'ydb' ? pkg.dependencies : {} }, null, 2) + '\n');
try { fs.rmSync(path.join(OUT, 'otmetki-api.zip'), { force: true }); execSync('zip -q -j otmetki-api.zip index.js package.json', { cwd: OUT }); } catch (e) {}
console.log('dist/index.js', src.length, 'байт');
