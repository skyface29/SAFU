// Красивое оформление ДЗ, записанного как попало (как HWPretty в Sources/Homework.swift).
// «решить номер 5,6 стр 45 , упр 3-7» → «Решить № 5, 6 стр. 45, упр. 3–7»; «1) … 2) …» одной строкой — списком.
// Сам текст задания не меняется: оформление только при показе и при отправке ребятам.
import type { Homework } from './homework'
import { kindStyle, AddressFormat } from './schedule'
import { hm, MONTHS, WEEKDAYS_SHORT } from './date'

export type Block = { id: number; marker: string; text: string }

// \b в JS не знает кириллицу — границу слова задаём сами
const B = '(?<![\\p{L}\\p{N}_])'
const re = (p: string, f = 'gu') => new RegExp(p, f)

const R = {
  url: re('(https?://\\S+|www\\.\\S+)', 'giu'),
  space: re('\\s+'),
  num: re(`(?:№|${B}номера?)\\s*(?=\\d)`, 'giu'),
  page: re(`${B}страниц[аыеу]?\\s*(?=\\d)`, 'giu'),
  ex: re(`${B}упражнени[еяй]\\s*(?=\\d)`, 'giu'),
  par: re(`${B}параграф[аы]?\\s*(?=\\d)`, 'giu'),
  sect: re('§\\s*(?=\\d)'),
  abbr: re(`${B}(стр|упр|зад|рис|табл|гл|пп|п)\\.?\\s*(?=\\d)`, 'giu'),
  range: re('(\\d)\\s*[-–—]\\s*(\\d)'),
  list: re('((?:№|§|стр\\.|упр\\.|зад\\.|п\\.) \\d+(?:[.–]\\d+)?(?:, \\d+(?:[.–]\\d+)?)*),(?=\\d)'),
  beforePunct: re(' +([,.;:!?)])'),
  afterParen: re('\\( +'),
  afterPunct: re('([,;:])(?=[^\\s\\d/\\u0001])'),
  marks: re('(?:(?<=\\s)|^)(\\d{1,2})(?:\\)|\\.(?!\\d))\\s*'),
  numbered: re('^(\\d{1,2})(?:\\)|\\.(?!\\d)|:)\\s*(.+)$', 'u'),
  bullet: re('^[-–—•*·]\\s*(.+)$', 'u'),
  ref: re('(?:№|§|(?:стр|упр|зад|рис|табл|гл|пп|п)\\.)\\s?\\d+(?:[.,–]\\s?\\d+)*')
}

/** Пробелы, сокращения, номера и диапазоны: «стр. 45», «упр. 3», «№ 5, 6», «§ 2», «1–5» */
export function clean(raw: string): string {
  const urls: string[] = []
  let s = raw.replace(R.url, m => { urls.push(m); return `\u0001${urls.length - 1}\u0001` })
  s = s.replace(R.space, ' ').trim()
  s = s.replace(R.num, '№ ').replace(R.page, 'стр. ').replace(R.ex, 'упр. ').replace(R.par, '§ ').replace(R.sect, '§ ')
  s = s.replace(R.abbr, '$1. ').replace(R.range, '$1–$2')
  for (let i = 0; i < 12; i++) { const t = s.replace(R.list, '$1, '); if (t === s) break; s = t }
  s = s.replace(R.beforePunct, '$1').replace(R.afterParen, '(').replace(R.afterPunct, '$1 ')
  s = s.trim().replace(/[,;\s]+$/u, '').trim()
  if (s && s[0] !== s[0].toUpperCase() && s[0] === s[0].toLowerCase()) s = s[0].toUpperCase() + s.slice(1)
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => urls[+i])
}

/** «1) прочитать § 5 2) упр. 3» одной строкой — по пунктам; «а; б; в» — тоже */
function splitInline(line: string): string[] {
  const seq: number[] = []
  let want = 1
  for (const m of line.matchAll(R.marks)) if (Number(m[1]) === want) { seq.push(m.index!); want++ }
  if (seq.length >= 2) {
    const parts: string[] = []
    const pre = line.slice(0, seq[0]).trim()
    if (pre) parts.push(pre)
    seq.forEach((c, i) => parts.push(line.slice(c, seq[i + 1] ?? line.length).trim()))
    return parts
  }
  const semi = line.split(';').map(x => x.trim()).filter(Boolean)
  return semi.length >= 2 ? semi : [line]
}

export function blocks(raw: string): Block[] {
  const lines = raw.replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean).flatMap(splitInline)
  const anyNumbered = lines.some(l => R.numbered.test(l))
  const many = lines.length > 1
  const out: Block[] = []
  for (const line of lines) {
    const n = line.match(R.numbered)
    const b = n ? null : line.match(R.bullet)
    const id = out.length
    if (n) out.push({ id, marker: `${Number(n[1])}.`, text: clean(n[2]) })
    else if (b) out.push({ id, marker: '•', text: clean(b[1]) })
    else if (many && !anyNumbered && !line.endsWith(':')) out.push({ id, marker: '•', text: clean(line) })
    else out.push({ id, marker: '', text: clean(line) })
  }
  return out.filter(x => x.text)
}

/** В одну строку — для списков */
export function line(raw: string): string {
  const b = blocks(raw)
  if (b.length <= 1) return b[0]?.text ?? raw
  return b.map(x => x.text).join(' · ')
}

/** Для чата: «1. …», «• …», абзацы как есть */
export const plain = (raw: string) => blocks(raw).map(b => (b.marker ? `${b.marker} ${b.text}` : b.text))

/** Куски текста: обычные и выделенные (номера, страницы, параграфы) — для показа */
export function parts(s: string): { text: string; ref: boolean }[] {
  const out: { text: string; ref: boolean }[] = []
  let last = 0
  for (const m of s.matchAll(R.ref)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index), ref: false })
    out.push({ text: m[0], ref: true })
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last), ref: false })
  return out
}

// ---------- «Отправить ребятам» ----------

/** «пт 17 октября, 10:10 · практика · ауд. 1405» */
export function dueLine(h: Homework): string {
  const d = new Date(h.due)
  const day = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  const end = d.getHours() === 23 && d.getMinutes() === 59
  const p = [end ? day : `${day}, ${hm(h.due)}`]
  if (h.dueKind) p.push(kindStyle(h.dueKind).label.toLowerCase())
  const r = h.dueRoom.trim()
  if (r) p.push(AddressFormat.isRemote(r) ? 'дистант' : `ауд. ${r}`)
  return p.join(' · ')
}

function body(h: Homework): string[] {
  const lines = plain(h.text)
  for (const s of h.steps) if (s.text.trim()) lines.push(`${s.done ? '✅' : '▫️'} ${clean(s.text)}`)
  const n = h.note.trim()
  if (n) lines.push(`💬 ${n}`)
  return lines
}

export function shareText(h: Homework): string {
  const lines = [`📚 ${h.subject || 'ДЗ'}${h.important ? ' ❗️' : ''}`, ...body(h), `📅 Сдать: ${dueLine(h)}`]
  if (h.photos.length) lines.push(`📎 ${h.photos.length} фото`)
  return lines.join('\n')
}

/** Несколько заданий одним сообщением, по срокам */
export function shareList(list: Homework[], title: string): string {
  const out = [`📚 ${title}`]
  for (const h of [...list].sort((a, b) => a.due - b.due)) {
    out.push('', `▫️ ${h.subject || 'Без предмета'} — ${dueLine(h)}`, ...body(h))
  }
  return out.join('\n')
}
