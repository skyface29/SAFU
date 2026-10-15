// Проверка почты САФУ: сначала «как сайт почты» (XIMSS поверх HTTPS, так входит Samoware),
// запасной способ — IMAP по TLS. Смотрим только отправителя и тему новых писем,
// письма не скачиваются и не помечаются прочитанными.

import { session } from 'electron'
import * as tls from 'node:tls'

export type MailAccount = {
  user: string
  pass: string
  server: string
  port: number
  transport: 'auto' | 'ximss' | 'imap'
  preferImap?: boolean
}

export type MailMessage = { uid: number; from: string; subject: string; seen: boolean }
export type MailReport = {
  ok: boolean
  via?: 'ximss' | 'imap'
  unseen?: number
  total?: number
  messages?: MailMessage[]
  validity?: number
  error?: string
  kind?: 'login' | 'network' | 'server'
}

const WEB_HOST = 'edu.narfu.ru'

class MailError extends Error {
  constructor(public kind: 'login' | 'network' | 'server', msg: string) { super(msg) }
}

function logins(user: string): string[] {
  return user.includes('@') ? [user] : [user, `${user}@${WEB_HOST}`]
}

// ---------- MIME-заголовки ----------

export function decodeMIME(s: string): string {
  const joined = s.replace(/(\?=)\s+(=\?)/g, '$1$2')
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset: string, kind: string, body: string) => {
    try {
      let bytes: Uint8Array
      if (kind.toUpperCase() === 'B') {
        bytes = Uint8Array.from(Buffer.from(body, 'base64'))
      } else {
        const out: number[] = []
        const t = body.replace(/_/g, ' ')
        for (let i = 0; i < t.length; i++) {
          if (t[i] === '=' && i + 2 < t.length + 1 && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) {
            out.push(parseInt(t.slice(i + 1, i + 3), 16))
            i += 2
          } else {
            out.push(t.charCodeAt(i))
          }
        }
        bytes = Uint8Array.from(out)
      }
      return new TextDecoder(charset.toLowerCase()).decode(bytes)
    } catch {
      return whole
    }
  }).trim()
}

export function senderName(from: string): string {
  const f = from.trim()
  const lt = f.indexOf('<')
  if (lt >= 0) {
    const name = f.slice(0, lt).replace(/^[\s"]+|[\s"]+$/g, '')
    if (name) return name
    return f.slice(lt + 1).replace(/[>\s]+$/g, '')
  }
  return f.replace(/^"+|"+$/g, '')
}

// ---------- крошечный XML-разбор для ответов XIMSS ----------

type XNode = { name: string; attrs: Record<string, string>; text: string; children: XNode[] }

function decodeXML(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

export function parseXML(src: string): XNode | null {
  const root: XNode = { name: '#root', attrs: {}, text: '', children: [] }
  const stack: XNode[] = [root]
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) { top.text += m[1]; continue }
    if (m[6] !== undefined) { top.text += decodeXML(m[6]); continue }
    if (!m[3]) continue
    if (m[2] === '/') {
      if (stack.length > 1) stack.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = ar.exec(m[4] || ''))) attrs[a[1]] = decodeXML(a[2] ?? a[3] ?? '')
    const node: XNode = { name: m[3], attrs, text: '', children: [] }
    top.children.push(node)
    if (m[5] !== '/') stack.push(node)
  }
  return root.children.length ? root : null
}

const attr = (n: XNode, k: string) => Object.entries(n.attrs).find(([key]) => key.toLowerCase() === k.toLowerCase())?.[1]
const child = (n: XNode, k: string) => n.children.find(c => c.name.toLowerCase() === k.toLowerCase())
const fullText = (n: XNode): string => n.text + n.children.map(fullText).join('')
function all(n: XNode, k: string): XNode[] {
  const out: XNode[] = []
  const walk = (x: XNode) => { if (x.name.toLowerCase() === k.toLowerCase()) out.push(x); x.children.forEach(walk) }
  walk(n)
  return out
}
function errorText(n: XNode): string | undefined {
  let e: string | undefined
  const walk = (x: XNode) => { if (!e) { const t = attr(x, 'errorText'); if (t) e = t; x.children.forEach(walk) } }
  walk(n)
  return e
}

const looksLikeAuth = (t: string) =>
  ['password', 'пароль', 'account', 'учетн', 'учётн', 'authentic', 'unknown user', 'incorrect', 'неверн', 'credentials']
    .some(w => t.toLowerCase().includes(w))

const form = (items: [string, string][]) => items.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

async function ximssCheck(acc: MailAccount): Promise<MailReport> {
  const ses = session.fromPartition('ximss')     // не сохраняется на диск
  await ses.clearStorageData()
  const host = acc.server || WEB_HOST
  const loginURL = `https://${host}/XIMSSLogin/`
  const send = async (url: string, init?: RequestInit) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15_000)
    try {
      const res = await ses.fetch(url, { ...init, signal: ctrl.signal })
      const text = await res.text()
      return { code: res.status, root: parseXML(text), head: text.slice(0, 200) }
    } catch (e) {
      throw new MailError('network', (e as Error).name === 'AbortError' ? 'нет ответа от сервера' : (e as Error).message)
    } finally {
      clearTimeout(t)
    }
  }

  let urlID: string | undefined
  let lastAuth: string | undefined
  for (const user of logins(acc.user)) {
    const params: [string, string][] = [['username', user], ['password', acc.pass], ['version', '6.1'], ['errorAsXML', '1']]
    let a = await send(loginURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: form(params)
    })
    const sid = (r: typeof a) => r.root ? all(r.root, 'session').map(s => attr(s, 'urlID')).find(Boolean) : undefined
    const rejected = a.root ? looksLikeAuth(errorText(a.root) || '') : false
    if (!sid(a) && !rejected) a = await send(`${loginURL}?${form(params)}`)
    urlID = sid(a)
    if (urlID) break
    const e = a.root ? errorText(a.root) : undefined
    if (e) {
      if (looksLikeAuth(e)) { lastAuth = e; continue }
      throw new MailError('server', e)
    }
    throw new MailError('server', `Сайт почты не пустил приложение (HTTP ${a.code})`)
  }
  if (!urlID) throw new MailError('login', lastAuth || 'Сервер не принял логин или пароль')

  let counter = 0
  const request = async (xml: string) => {
    counter += 1
    const r = await send(`https://${host}/Session/${urlID}/sync?random=${counter}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: `<XIMSS>${xml}</XIMSS>`
    })
    if (r.code !== 200) throw new MailError('server', `HTTP ${r.code}`)
    if (!r.root) throw new MailError('server', `непонятный ответ: ${r.head.slice(0, 80)}`)
    return r.root
  }
  const respError = (root: XNode, id: string) => all(root, 'response').find(r => attr(r, 'id') === id)?.attrs.errorText

  try {
    const fields = '<field>FLAGS</field><field>From</field><field>Subject</field>'
    let opened: XNode | undefined
    let sorted = false
    let lastErr = ''
    for (const sort of [' sortField="INTERNALDATE" sortOrder="desc"', ' sortField="Date" sortOrder="desc"', '']) {
      const r = await request(`<folderOpen id="open" folder="INBOX" mailbox="INBOX"${sort}>${fields}</folderOpen>`)
      const e = respError(r, 'open')
      if (e) { lastErr = e; continue }
      opened = r
      sorted = !!sort
      break
    }
    if (!opened) throw new MailError('server', `Не открылась папка «Входящие»: ${lastErr}`)
    const head = all(opened, 'folderReport')[0]
    const total = head && attr(head, 'messages') ? Number(attr(head, 'messages')) : undefined
    const unseenAttr = head && attr(head, 'unseen') ? Number(attr(head, 'unseen')) : undefined
    const limit = 20
    const n = total ?? limit
    let items: MailMessage[] = []
    if (n > 0) {
      const from = sorted ? 0 : Math.max(0, n - limit)
      const till = sorted ? limit - 1 : Math.max(0, n - 1)
      const b = await request(`<folderBrowse id="browse" folder="INBOX"><index from="${from}" till="${till}"/></folderBrowse>`)
      const e = respError(b, 'browse')
      if (e) throw new MailError('server', e)
      items = all(b, 'folderReport').map(x => {
        const uid = Number(attr(x, 'UID'))
        if (!uid) return null
        const flags = fullText(child(x, 'FLAGS') || { name: '', attrs: {}, text: '', children: [] }).toLowerCase()
        const f = child(x, 'From') || child(x, 'E-From')
        let fromText = f ? (attr(f, 'realName') || (f.children[0] && attr(f.children[0], 'realName')) || fullText(f)) : ''
        fromText = senderName(decodeMIME(fromText.trim()))
        const s = child(x, 'Subject')
        return { uid, seen: /\bseen\b/.test(flags.replace(/\\/g, ' ')), from: fromText, subject: decodeMIME((s ? fullText(s) : '').trim()) }
      }).filter((v): v is MailMessage => !!v)
      if (!sorted) items.reverse()
    }
    await request('<folderClose id="close" folder="INBOX"/>').catch(() => null)
    return { ok: true, via: 'ximss', unseen: unseenAttr ?? items.filter(i => !i.seen).length, total, messages: items, validity: 0 }
  } finally {
    await request('<bye id="bye"/>').catch(() => null)
  }
}

// ---------- IMAP ----------

function imapQuote(s: string) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

async function imapCheck(acc: MailAccount): Promise<MailReport> {
  const host = acc.server || WEB_HOST
  const sock = tls.connect({ host, port: acc.port || 993, servername: host, timeout: 20_000 })
  let buffer = ''
  let waiters: (() => void)[] = []
  let closed: Error | null = null
  sock.setEncoding('utf8')
  sock.on('data', (d: string) => { buffer += d; const w = waiters; waiters = []; w.forEach(f => f()) })
  const fail = (e: Error) => { closed = e; const w = waiters; waiters = []; w.forEach(f => f()) }
  sock.on('error', e => fail(new MailError('network', e.message)))
  sock.on('close', () => fail(new MailError('network', 'сервер закрыл соединение')))
  sock.on('timeout', () => { fail(new MailError('network', 'нет ответа от сервера')); sock.destroy() })

  const waitData = () => new Promise<void>(res => { if (closed) res(); else waiters.push(res) })
  const readLine = async () => {
    while (!buffer.includes('\r\n')) { if (closed) throw closed; await waitData() }
    const i = buffer.indexOf('\r\n')
    const line = buffer.slice(0, i)
    buffer = buffer.slice(i + 2)
    return line
  }
  let counter = 0
  const command = async (cmd: string) => {
    counter += 1
    const tag = `s${counter}`
    sock.write(`${tag} ${cmd}\r\n`)
    const re = new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)([^\\r\\n]*)\\r\\n`)
    let m: RegExpExecArray | null
    while (!(m = re.exec(buffer))) { if (closed) throw closed; await waitData() }
    const end = m.index + m[0].length
    const text = buffer.slice(0, end)
    buffer = buffer.slice(end)
    if (m[2] === 'OK') return text
    if (m[2] === 'NO') throw new MailError('login', m[3].trim())
    throw new MailError('server', m[3].trim())
  }

  try {
    await new Promise<void>((res, rej) => {
      sock.once('secureConnect', () => res())
      sock.once('error', e => rej(new MailError('network', e.message)))
    })
    const hello = await readLine()
    if (!hello.startsWith('* OK') && !hello.startsWith('* PREAUTH')) throw new MailError('server', hello)
    let ok = false
    let lastNo = ''
    for (const l of logins(acc.user)) {
      try { await command(`LOGIN ${imapQuote(l)} ${imapQuote(acc.pass)}`); ok = true; break } catch (e) {
        if (e instanceof MailError && e.kind === 'login') { lastNo = e.message; continue }
        throw e
      }
    }
    if (!ok) throw new MailError('login', lastNo || 'логин не принят')
    const sel = await command('EXAMINE INBOX')
    const validity = Number(/UIDVALIDITY (\d+)/.exec(sel)?.[1] || 0)
    const total = Number(/\* (\d+) EXISTS/.exec(sel)?.[1] || 0)
    const search = await command('UID SEARCH UNSEEN')
    const line = search.split('\r\n').find(l => l.startsWith('* SEARCH')) || ''
    const uids = line.replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean).map(Number)
    let messages: MailMessage[] = []
    const last = uids.slice(-10)
    if (last.length) {
      const resp = await command(`UID FETCH ${last.join(',')} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`)
      const blocks = resp.split(/\r\n(?=\* \d+ FETCH)|^(?=\* \d+ FETCH)/)
      for (const b of blocks) {
        const uid = Number(/UID (\d+)/.exec(b)?.[1] || 0)
        if (!uid) continue
        const h = b.replace(/\r?\n[ \t]+/g, ' ')
        const from = /^From:\s*(.*)$/im.exec(h)?.[1] || ''
        const subj = /^Subject:\s*(.*)$/im.exec(h)?.[1] || ''
        messages.push({ uid, seen: false, from: senderName(decodeMIME(from)), subject: decodeMIME(subj) })
      }
    }
    await command('LOGOUT').catch(() => null)
    messages = messages.sort((a, b) => b.uid - a.uid)
    return { ok: true, via: 'imap', unseen: uids.length, total, messages, validity }
  } finally {
    sock.destroy()
  }
}

export async function checkMail(acc: MailAccount): Promise<MailReport> {
  if (!acc.user || !acc.pass) return { ok: false, error: 'Нет сохранённого пароля от почты', kind: 'login' }
  const order: ('ximss' | 'imap')[] =
    acc.transport === 'ximss' ? ['ximss'] : acc.transport === 'imap' ? ['imap'] : acc.preferImap ? ['imap', 'ximss'] : ['ximss', 'imap']
  let last: MailError | null = null
  for (const t of order) {
    try {
      return t === 'imap' ? await imapCheck(acc) : await ximssCheck(acc)
    } catch (e) {
      const err = e instanceof MailError ? e : new MailError('network', (e as Error).message)
      if (err.kind === 'login') return { ok: false, error: `Сервер не принял логин или пароль. ${err.message}`, kind: 'login' }
      last = err
    }
  }
  return { ok: false, error: last?.message || 'Почта недоступна', kind: last?.kind || 'network' }
}
