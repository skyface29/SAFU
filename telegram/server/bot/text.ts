// Разбор того, что человек написал боту: «матан: № 5, 6 стр 45» → предмет + задание
import { subjectKey } from '../../shared/pretty'

// как обычно называют предметы в чатах групп
const ALIASES: [RegExp, RegExp][] = [
  [/^(физра|физ-?ра|физкульт|фк)$/, /физическая культура|физкультура|элективн.*физ/],
  [/^(ин\.? ?яз|иняз|англ|английский|немецкий|французский)$/, /иностранн|английск|немецк|французск/],
  [/^(матан|матанализ|мат\.? ?анализ)$/, /математическ.*анализ/],
  [/^(линал|линейка|алгебра)$/, /алгебр|линейн/],
  [/^(прога|программ|прогр)$/, /программирован/],
  [/^(история|ист)$/, /истори/],
  [/^(дискра|дискретка|дискретная)$/, /дискретн/],
  [/^(философ|филос)/, /философ/],
  [/^(бжд|обж)$/, /безопасност.*жизнедеятельност/],
  [/^(физика|физ)$/, /^физика/],
  [/^(химия|хим)$/, /хими/],
  [/^(экономика|эконом)$/, /экономик/],
  [/^(информатика|инф|информ)$/, /информатик/],
  [/^(оргпрог|рус|русский)$/, /русск/]
]

/** Можно ли собрать запрос из начал слов предмета по порядку: «матан» = «мат(ематический) ан(ализ)» */
function prefixesOf(query: string, words: string[], qi = 0, wi = 0): boolean {
  if (qi === query.length) return wi > 0
  if (wi >= words.length) return false
  const w = words[wi]
  for (let n = Math.min(w.length, query.length - qi); n >= 1; n--) {
    if (query.slice(qi, qi + n) === w.slice(0, n) && prefixesOf(query, words, qi + n, wi + 1)) return true
  }
  return false
}

/** Найти предмет группы по тому, как его написали. Нашлось несколько или ни одного — null */
export function matchSubject(raw: string, subjects: string[]): string | null {
  const q = subjectKey(raw).replace(/[.,!?]+$/, '')
  if (q.length < 2) return null
  const keys = subjects.map(s => ({ s, k: subjectKey(s) }))
  const exact = keys.find(x => x.k === q)
  if (exact) return exact.s
  const pick = (list: { s: string }[]) => (list.length === 1 ? list[0].s : null)
  const starts = keys.filter(x => x.k.startsWith(q))
  if (starts.length) return pick(starts)
  for (const [from, to] of ALIASES) {
    if (from.test(q)) { const hit = keys.filter(x => to.test(x.k)); if (hit.length) return pick(hit) }
  }
  const compact = q.replace(/[\s.-]+/g, '')
  if (compact.length >= 3) {
    const pref = keys.filter(x => prefixesOf(compact, x.k.split(/[\s-]+/).filter(Boolean)))
    if (pref.length) return pick(pref)
  }
  // «по матанализу», «матанализ дз» — первое слово-предмет внутри
  const inside = keys.filter(x => x.k.length >= 4 && q.includes(x.k))
  return pick(inside)
}

/** «Матан: № 5, 6» / «Матан - № 5» / «Матан\n№ 5» → { subject: 'Матан', text: '№ 5, 6' } */
export function splitQuick(raw: string): { subject: string; text: string } | null {
  const t = raw.trim()
  const m = /^([^:\n—–]{2,40}?)\s*(?::|\s[—–-]\s|\n)\s*([\s\S]+)$/.exec(t)
  if (!m) return null
  return { subject: m[1].trim(), text: m[2].trim() }
}

/** Номер группы из текста: «151621», «гр. 151621», ссылка РУЗ с group= не годится — там внутренний id */
export const groupNumberIn = (s: string) => /(?<!\d)(\d{4,7})(?!\d)/.exec(s)?.[1] ?? null

/** Ссылка на страницу преподавателя в РУЗ: ?timetable&lecturer=123 */
export const lecturerIdIn = (s: string) => /lecturer=(\d+)/.exec(s)?.[1] ?? null

/** «матан номер 5, 6» → { subject: 'матан', text: 'номер 5, 6' } — если первое слово окажется предметом */
export function firstWord(raw: string): { subject: string; text: string } | null {
  const m = /^(\S{3,20})\s+([\s\S]{2,})$/.exec(raw.trim())
  return m ? { subject: m[1], text: m[2].trim() } : null
}
