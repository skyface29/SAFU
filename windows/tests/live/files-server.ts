// Живая проверка отправки файлов с Android: настоящие SyncServer + TransferServer на 127.0.0.1.
// Печатает ссылку связки (arktika://sync?…) и каждый принятый файл; выходит через 3 минуты.
// Запуск: node scripts/live-files.mjs
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { SyncServer } from '../../electron/sync'
import { TransferServer } from '../../electron/transfer'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktika-live-files-'))
const pairing = { id: 'live-' + crypto.randomBytes(6).toString('hex'), key: crypto.randomBytes(32).toString('base64url'), created: Date.now() }
const t = new TransferServer({
  name: 'PC', version: 'live', root: () => root, key: Buffer.from(pairing.key, 'base64url'), session: pairing.id, persistent: true,
  emit: e => { if (e.type === 'file' || e.type === 'done' || e.type === 'plan') console.log('EVENT ' + JSON.stringify(e)) }
})
const srv = new SyncServer({ name: 'PC', version: 'live', port: 0, pairing: () => pairing, handle: async () => ({}), files: (req, res) => t.serve(req, res), bind: '127.0.0.1' })
const port = await srv.start()
console.log(`ROOT ${root}`)
console.log(`LINK arktika://sync?h=127.0.0.1&p=${port}&i=${pairing.id}&k=${pairing.key}&n=PC`)
setTimeout(() => { srv.stop(); process.exit(0) }, 180_000)
