// Сборка main-процесса и preload-скриптов Electron в dist-electron/
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  minify: process.env.NODE_ENV === 'production',
  logLevel: 'info'
}

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js' })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.js' })
await build({ ...common, entryPoints: ['electron/site-preload.ts'], outfile: 'dist-electron/site-preload.js' })
