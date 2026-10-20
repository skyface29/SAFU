// Красивое оформление ДЗ, записанного как попало (как windows/src/lib/hwpretty.ts).
// «решить номер 5,6 стр 45 , упр 3-7» → «Решить № 5, 6 стр. 45, упр. 3–7»; «1) … 2) …» одной строкой — списком.
// Сам текст задания не меняется: оформление только при показе.
import { WEEKDAYS_SHORT, MONTHS, hm } from './dates'

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

// ---------- тип пары ----------

export type KindStyle = { label: string; short: string; color: string; emoji: string }

export function kindStyle(kind: string): KindStyle {
  const k = (kind || '').toLowerCase()
  if (k.startsWith('лекц')) return { label: 'Лекция', short: 'лекция', color: '#4085ff', emoji: '📘' }
  if (k.startsWith('практ')) return { label: 'Практика', short: 'практика', color: '#29bf6b', emoji: '📗' }
  if (k.startsWith('лаб')) return { label: 'Лабораторная', short: 'лаба', color: '#ff8c1a', emoji: '🧪' }
  if (k.startsWith('семин')) return { label: 'Семинар', short: 'семинар', color: '#1ab8c7', emoji: '💬' }
  if (k.includes('экзам')) return { label: 'Экзамен', short: 'экзамен', color: '#f2404d', emoji: '🎯' }
  if (k.includes('зач')) return { label: 'Зачёт', short: 'зачёт', color: '#ed4d9e', emoji: '✅' }
  if (k.includes('консул')) return { label: 'Консультация', short: 'консультация', color: '#9e66f2', emoji: '🗣' }
  return { label: kind || 'Занятие', short: (kind || 'занятие').toLowerCase(), color: '#8c94a6', emoji: '📙' }
}

export const sameKind = (a: string, b: string) => kindStyle(a).label === kindStyle(b).label

/** Дистант: «д.о.», «онлайн», «ЭИОС» */
export function isRemote(raw: string) {
  const l = (raw || '').toLowerCase().replace(/ /g, '')
  return ['д.о', 'в.з', 'дистанц', 'онлайн', 'online', 'эиос', 'вебинар'].some(w => l.includes(w))
}

/** Предмет без регистра и лишних пробелов — ключ для сравнения */
export const subjectKey = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

// ---------- срок ----------

/** «пт 24 октября, 10:10 · практика · ауд. 1405» */
export function dueHint(due: number, kind = '', room = '', estimated = false): string {
  const d = new Date(due)
  const day = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  const end = d.getHours() === 23 && d.getMinutes() === 59
  const p = [end ? day : `${day}, ${hm(due)}`]
  if (kind) p.push(kindStyle(kind).short)
  const r = room.trim()
  if (r) p.push(r === 'дистант' || isRemote(r) ? 'дистант' : `ауд. ${r}`)
  if (estimated) p.push('по прошлым неделям')
  return p.join(' · ')
}

