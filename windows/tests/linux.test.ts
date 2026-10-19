// Linux: ярлыки .desktop, пароли без связки ключей, точка на значке, правила брандмауэра
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import * as net from 'node:net'
import {
  execArg, desktopEntry, execOf, sealWithKey, openWithKey, vaultKind, MAGIC_KEYRING, secureBackend,
  drawBadgeDot, portsCovered, ufwAllows, ufwEnabled, ufwDefaultAccepts, freePort
} from '../electron/linux'

test('ярлык .desktop: пути с пробелами и кириллицей, ссылки safu://, автозапуск в трей', () => {
  assert.equal(execArg('/usr/bin/arktika'), '/usr/bin/arktika')
  assert.equal(execArg('/home/кирилл/Загрузки/Arktika 19.9.AppImage'), '"/home/кирилл/Загрузки/Arktika 19.9.AppImage"')
  assert.equal(execArg('/a/$HOME"x`y\\z'), '"/a/\\$HOME\\"x\\`y\\\\z"')
  assert.equal(execArg('/a/100%'), '/a/100%%')

  const app = desktopEntry({ exec: '/home/кирилл/Загрузки/Arktika 19.9.AppImage', icon: 'arktika' })
  assert.match(app, /^\[Desktop Entry\]\n/)
  assert.match(app, /^Exec="\/home\/кирилл\/Загрузки\/Arktika 19\.9\.AppImage" %U$/m)
  assert.match(app, /^MimeType=x-scheme-handler\/safu;$/m)
  assert.match(app, /^StartupWMClass=arktika$/m)
  assert.match(app, /safu:\/\/schedule$/m)
  assert.equal(execOf(app), '/home/кирилл/Загрузки/Arktika 19.9.AppImage')

  const auto = desktopEntry({ exec: '/opt/Арктика/arktika', icon: 'arktika', autostart: true })
  assert.match(auto, /^Exec="\/opt\/Арктика\/arktika" --hidden$/m)
  assert.doesNotMatch(auto, /MimeType/)
  assert.equal(execOf(auto), '/opt/Арктика/arktika')
  assert.equal(execOf('[Desktop Entry]\nExec=/usr/bin/arktika %U\n'), '/usr/bin/arktika')
})

test('пароли без связки ключей: AES-256-GCM своим ключом, подмена файла не проходит', () => {
  const key = crypto.randomBytes(32)
  const sealed = sealWithKey(key, '{"cred:sakai":"Секрет-123"}')
  assert.equal(vaultKind(sealed), 'filekey')
  assert.ok(!sealed.includes(Buffer.from('Секрет-123')))
  assert.equal(openWithKey(key, sealed), '{"cred:sakai":"Секрет-123"}')
  assert.throws(() => openWithKey(crypto.randomBytes(32), sealed))
  const broken = Buffer.from(sealed); broken[broken.length - 1] ^= 1
  assert.throws(() => openWithKey(key, broken))
  assert.notDeepEqual(sealWithKey(key, 'x'), sealWithKey(key, 'x'))

  assert.equal(vaultKind(Buffer.concat([MAGIC_KEYRING, Buffer.from('v11...')])), 'keyring')
  assert.equal(vaultKind(Buffer.from('{"a":1}')), 'raw')
  // общий ключ Chromium (basic_text) — не связка ключей
  assert.equal(secureBackend('basic_text'), false)
  assert.equal(secureBackend('unknown'), false)
  assert.equal(secureBackend('gnome_libsecret'), true)
  assert.equal(secureBackend('kwallet6'), true)
})

test('точка непрочитанного: красная в правом верхнем углу, остальной значок не тронут', () => {
  const w = 32, h = 32
  const bmp = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) bmp.writeUInt32LE(0xff3366cc, i * 4) // BGRA: синий значок
  const out = drawBadgeDot(bmp, w, h)
  const px = (x: number, y: number) => [...out.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)]
  const r = Math.round(32 * 0.22)
  assert.deepEqual(px(w - r - 1, r + 1), [0x44, 0x44, 0xef, 0xff])
  assert.deepEqual(px(2, h - 3), [...bmp.subarray(((h - 3) * w + 2) * 4, ((h - 3) * w + 2) * 4 + 4)])
  assert.equal(out.length, bmp.length)
})

test('брандмауэр: firewalld и ufw — открыты ли порты Арктики', () => {
  assert.equal(portsCovered('1025-65535/tcp 1025-65535/udp', 47823, 47840), true) // Fedora Workstation
  assert.equal(portsCovered('47823-47840/tcp', 47823, 47840), true)
  assert.equal(portsCovered('47823-47830/tcp 47831-47840/tcp', 47823, 47840), true)
  assert.equal(portsCovered('47823-47830/tcp', 47823, 47840), false)
  assert.equal(portsCovered('47823-47840/udp', 47823, 47840), false)
  assert.equal(portsCovered('', 47823, 47840), false)

  const rules = [
    '### tuple ### allow tcp 47823:47840 0.0.0.0/0 any 0.0.0.0/0 in comment=4172',
    '-A ufw-user-input -p tcp -m multiport --dports 47823:47840 -j ACCEPT -m comment --comment \'dapp_Arktika\'',
    '-A ufw-user-input -p tcp --dport 22 -j ACCEPT'
  ].join('\n')
  assert.equal(ufwAllows(rules, 47823, 47840), true)
  assert.equal(ufwAllows('-A ufw-user-input -p tcp --dport 22 -j ACCEPT', 47823, 47840), false)
  assert.equal(ufwAllows('-A ufw-user-input -p tcp -m multiport --dports 47823:47840 -s 10.0.0.0/8 -j ACCEPT', 47823, 47840), false)

  assert.equal(ufwEnabled('# comment\nENABLED=yes\nLOGLEVEL=low\n'), true)
  assert.equal(ufwEnabled('ENABLED=no\n'), false)
  assert.equal(ufwDefaultAccepts('DEFAULT_INPUT_POLICY="DROP"\n'), false)
  assert.equal(ufwDefaultAccepts('DEFAULT_INPUT_POLICY="ACCEPT"\n'), true)
})

test('перенос с iPhone: занятый порт пропускается', async () => {
  const busy = net.createServer()
  const port = await new Promise<number>(r => busy.listen(0, '0.0.0.0', () => r((busy.address() as net.AddressInfo).port)))
  try {
    const got = await freePort(port, port + 3)
    assert.ok(got > port && got <= port + 3)
  } finally {
    busy.close()
  }
})
