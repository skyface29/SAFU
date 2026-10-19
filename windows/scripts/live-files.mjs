// Живой сервер файлов для проверки Android (tests/live/files-server.ts)
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
mkdirSync('.test-out', { recursive: true })
await build({ entryPoints: ['tests/live/files-server.ts'], outfile: '.test-out/live-files.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'warning', external: ['electron'] })
spawnSync(process.execPath, ['.test-out/live-files.mjs'], { stdio: 'inherit' })
