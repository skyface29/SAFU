// Арктика для Linux — то, что на Windows делает сама система: ярлык в меню приложений и ссылки safu://,
// автозапуск, пароли без связки ключей, значок с точкой непрочитанного, брандмауэр (ufw / firewalld).
// Здесь только чистые функции без Electron — их проверяют тесты (tests/linux.test.ts); подключает их platform.ts.

import * as crypto from 'node:crypto'
import * as net from 'node:net'

export const DESKTOP_ID = 'arktika'
/** Имя окна для панели задач (WM_CLASS): по нему док склеивает окно с ярлыком и берёт значок */
export const WM_CLASS = 'arktika'

// ---------- .desktop: ярлык в меню, автозапуск ----------

/** Аргумент для строки Exec в .desktop: кавычки и экранирование по спецификации freedesktop */
export function execArg(s: string): string {
  const v = s.replace(/%/g, '%%')
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(v)) return v
  return '"' + v.replace(/(["`$\\])/g, '\\$1') + '"'
}

export type DesktopOpts = {
  exec: string
  args?: string[]
  icon: string
  /** Для автозапуска: окно не показывается, Арктика сразу в трее */
  autostart?: boolean
}

export function desktopEntry(o: DesktopOpts): string {
  const exec = [execArg(o.exec), ...(o.args || []).map(execArg)]
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Арктика',
    'GenericName=Расписание и учёба САФУ',
    'Comment=Расписание, ДЗ, файлы, почта и сайты университета САФУ',
    `Icon=${o.icon}`,
    `StartupWMClass=${WM_CLASS}`,
    'Terminal=false'
  ]
  if (o.autostart) {
    lines.push(`Exec=${[...exec, '--hidden'].join(' ')}`, 'X-GNOME-Autostart-enabled=true', 'X-KDE-autostart-after=panel', 'NoDisplay=true')
  } else {
    lines.push(
      `Exec=${[...exec, '%U'].join(' ')}`,
      'Categories=Education;Office;Calendar;',
      'Keywords=САФУ;НАрФУ;расписание;пары;ДЗ;домашка;Sakai;safu;narfu;schedule;',
      'MimeType=x-scheme-handler/safu;',
      'StartupNotify=true',
      'Actions=schedule;homework;',
      '',
      '[Desktop Action schedule]',
      'Name=Расписание',
      `Exec=${[...exec, 'safu://schedule'].join(' ')}`,
      '',
      '[Desktop Action homework]',
      'Name=Записать ДЗ',
      `Exec=${[...exec, 'safu://hw'].join(' ')}`
    )
  }
  return lines.join('\n') + '\n'
}

/** Путь программы из строки Exec (чтобы понять, не переехал ли AppImage) */
export function execOf(entry: string): string | null {
  const m = /^Exec=(.*)$/m.exec(entry)
  if (!m) return null
  const s = m[1].trim()
  if (s.startsWith('"')) {
    let out = ''
    for (let i = 1; i < s.length; i++) {
      const c = s[i]
      if (c === '\\' && i + 1 < s.length) { out += s[++i]; continue }
      if (c === '"') break
      out += c
    }
    return out.replace(/%%/g, '%')
  }
  return s.split(/\s+/)[0].replace(/%%/g, '%')
}

// ---------- пароли без связки ключей ----------
//
// Связка ключей (GNOME Keyring, KWallet) есть не везде, а Chromium без неё шифрует общим для всех ключом —
// это почти открытый текст. Поэтому формат файла с паролями на Linux такой:
//   ARKS1 + шифр связки ключей (safeStorage)
//   ARKF1 + iv(12) + tag(16) + AES-256-GCM — своим случайным ключом из файла, доступного только владельцу

export const MAGIC_KEYRING = Buffer.from('ARKS1')
export const MAGIC_FILEKEY = Buffer.from('ARKF1')

export type VaultKind = 'keyring' | 'filekey' | 'raw'

export function vaultKind(buf: Buffer): VaultKind {
  if (buf.length >= 5 && buf.subarray(0, 5).equals(MAGIC_KEYRING)) return 'keyring'
  if (buf.length >= 5 && buf.subarray(0, 5).equals(MAGIC_FILEKEY)) return 'filekey'
  return 'raw'
}

export function sealWithKey(key: Buffer, text: string): Buffer {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([MAGIC_FILEKEY, iv, c.getAuthTag(), body])
}

export function openWithKey(key: Buffer, buf: Buffer): string {
  if (vaultKind(buf) !== 'filekey' || buf.length < 5 + 12 + 16) throw new Error('not a file-key vault')
  const iv = buf.subarray(5, 17)
  const tag = buf.subarray(17, 33)
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]).toString('utf8')
}

/** Связка ключей настоящая (а не общий ключ Chromium «basic_text») */
export function secureBackend(backend: string | undefined): boolean {
  return !!backend && /^(gnome_libsecret|kwallet\d?)$/.test(backend)
}

export function backendLabel(backend: string | undefined): string {
  if (backend === 'gnome_libsecret') return 'связка ключей GNOME (libsecret)'
  if (backend && backend.startsWith('kwallet')) return 'KWallet'
  return 'свой ключ AES-256, доступный только твоей учётной записи'
}

// ---------- значок в трее с точкой непрочитанного ----------

/** Красная точка с белой обводкой в правом верхнем углу картинки (BGRA, как отдаёт nativeImage.toBitmap) */
export function drawBadgeDot(bitmap: Buffer, w: number, h: number): Buffer {
  const out = Buffer.from(bitmap)
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.22))
  const cx = w - r - 1, cy = r + 1
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const paint = (i: number, col: number[], a: number) => {
    for (let k = 0; k < 3; k++) out[i + k] = Math.round(out[i + k] * (1 - a) + col[k] * a)
    out[i + 3] = Math.round(out[i + 3] * (1 - a) + 255 * a)
  }
  for (let y = 0; y < Math.min(h, cy + r + 2); y++) {
    for (let x = Math.max(0, cx - r - 2); x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const ring = clamp(r + 1.5 - d) // белая обводка — точку видно и на тёмной, и на красной панели
      const dot = clamp(r + 0.5 - d) // красная точка, края сглажены
      const i = (y * w + x) * 4
      if (ring > 0) paint(i, [0xff, 0xff, 0xff], ring)
      if (dot > 0) paint(i, [0x44, 0x44, 0xef], dot) // #ef4444 в BGRA
    }
  }
  return out
}

// ---------- брандмауэр: ufw (Ubuntu, Mint) и firewalld (Fedora, openSUSE) ----------

/** Порты Арктики на Linux: синхронизация 47823–47830 и перенос с iPhone 47831–47840 */
export const LINUX_PORTS = { from: 47823, to: 47840, transferFrom: 47831 }

/** Покрыт ли диапазон портов списком вида «1025-65535/tcp 47823-47840/tcp» (firewall-cmd --list-ports) */
export function portsCovered(list: string, from: number, to: number): boolean {
  const ranges = list.split(/\s+/).filter(Boolean).flatMap(item => {
    const m = /^(\d+)(?:-(\d+))?\/tcp$/.exec(item)
    return m ? [[Number(m[1]), Number(m[2] || m[1])] as const] : []
  }).sort((a, b) => a[0] - b[0])
  let need = from
  for (const [a, b] of ranges) {
    if (a > need) break
    if (b >= need) need = b + 1
    if (need > to) return true
  }
  return need > to
}

/** Есть ли в правилах ufw (/etc/ufw/user.rules) разрешение на наши порты */
export function ufwAllows(rules: string, from: number, to: number): boolean {
  const ranges: [number, number][] = []
  for (const line of rules.split('\n')) {
    if (!/-j ACCEPT/.test(line) || !/-p tcp/.test(line) || /-s \d/.test(line)) continue
    const m = /--dports? (\d+)(?::(\d+))?/.exec(line)
    if (m) ranges.push([Number(m[1]), Number(m[2] || m[1])])
  }
  return portsCovered(ranges.map(([a, b]) => `${a}-${b}/tcp`).join(' '), from, to)
}

/** ufw включён — по /etc/ufw/ufw.conf (читается без прав администратора) */
export function ufwEnabled(conf: string): boolean {
  return /^\s*ENABLED\s*=\s*"?yes"?\s*$/mi.test(conf)
}

/** Политика ufw для входящих по умолчанию: ACCEPT — значит, ничего не режется */
export function ufwDefaultAccepts(defaults: string): boolean {
  return /^\s*DEFAULT_INPUT_POLICY\s*=\s*"?ACCEPT"?\s*$/mi.test(defaults)
}

// ---------- свободный порт для переноса с iPhone ----------

/** Первый свободный порт из диапазона (его откроет правило брандмауэра); нет свободных — 0, любой */
export async function freePort(from: number, to: number): Promise<number> {
  for (let p = from; p <= to; p++) {
    const ok = await new Promise<boolean>(resolve => {
      const s = net.createServer()
      s.once('error', () => resolve(false))
      s.listen(p, '0.0.0.0', () => s.close(() => resolve(true)))
    })
    if (ok) return p
  }
  return 0
}
