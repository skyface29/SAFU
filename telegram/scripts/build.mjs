// Сервер (бот + API мини-приложения) одним файлом dist/server.mjs; зависимости остаются в node_modules
import { build } from 'esbuild'
await build({
  entryPoints: ['server/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning'
})
