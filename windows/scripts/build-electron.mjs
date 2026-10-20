// Сборка main-процесса и preload-скриптов Electron в dist-electron/
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  // в сборке для людей главный процесс сжат (быстрее грузится); имена функций остаются — журнал ошибок читаем
  minify: !process.argv.includes('--dev'),
  keepNames: true,
  logLevel: 'info'
}

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js' })
// конспекты через Claude — отдельно: main.js грузит их только при первом конспекте
await build({ ...common, entryPoints: ['electron/claude.ts'], outfile: 'dist-electron/claude.js' })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.js' })
await build({ ...common, entryPoints: ['electron/site-preload.ts'], outfile: 'dist-electron/site-preload.js' })
