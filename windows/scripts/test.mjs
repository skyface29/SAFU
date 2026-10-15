// Запуск тестов: собираем tests/*.test.ts esbuild'ом и гоняем встроенным node:test
import { build } from 'esbuild'
import { readdirSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const files = readdirSync('tests').filter(f => f.endsWith('.test.ts'))
mkdirSync('.test-out', { recursive: true })
await build({ entryPoints: files.map(f => 'tests/' + f), outdir: '.test-out', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'warning', external: ['electron'] })
const r = spawnSync(process.execPath, ['--test', ...files.map(f => '.test-out/' + f.replace(/\.ts$/, '.mjs'))], { stdio: 'inherit', env: { ...process.env, TZ: 'Europe/Moscow' } })
process.exit(r.status ?? 1)
