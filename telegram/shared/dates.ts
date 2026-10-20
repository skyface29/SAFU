// Даты по-русски и календарные расчёты — как windows/src/lib/date.ts.
// Сервер работает по Москве (TZ=Europe/Moscow), мини-приложение — по часам телефона.

export const DAY = 86_400_000
export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export const startOfDay = (t: number | Date) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
export const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime() }
export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b)
export const isToday = (t: number, now = Date.now()) => sameDay(t, now)
export const isTomorrow = (t: number, now = Date.now()) => sameDay(t, addDays(now, 1))
export const isYesterday = (t: number, now = Date.now()) => sameDay(t, addDays(now, -1))
export const daysBetween = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY)

/** Понедельник недели этого дня, 00:00 */
export function monday(t: number): number {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return d.getTime()
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}` }
export const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** «7 октября» */
export const dayMonth = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
/** «7 окт» */
export const dayMon = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` }
/** «среда, 7 октября» */
export const fullDay = (t: number) => `${WEEKDAYS[new Date(t).getDay()]}, ${dayMonth(t)}`

/** «сегодня», «завтра», «вчера» или «пятница, 10 октября» */
export function relDay(t: number, now = Date.now()): string {
  if (isToday(t, now)) return 'сегодня'
  if (isTomorrow(t, now)) return 'завтра'
  if (isYesterday(t, now)) return 'вчера'
  return fullDay(t)
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

/** Дата в часовом поясе Москвы → момент времени */
export function moscowDate(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 3, mi)
}

/** «До конца дня» — срок без времени пары */
export const isEndOfDay = (t: number) => { const d = new Date(t); return d.getHours() === 23 && d.getMinutes() === 59 }
export const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 0, 0); return d.getTime() }

/** «завтра, 10:10», «пт 24 окт, 10:10», «сегодня, до конца дня» */
export function dayTime(t: number, now = Date.now()): string {
  const time = isEndOfDay(t) ? 'до конца дня' : hm(t)
  if (isToday(t, now)) return `сегодня, ${time}`
  if (isTomorrow(t, now)) return `завтра, ${time}`
  if (isYesterday(t, now)) return `вчера, ${time}`
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear()
  return `${WEEKDAYS_SHORT[new Date(t).getDay()]} ${dayMon(t)}${sameYear ? '' : ' ' + new Date(t).getFullYear()}, ${time}`
}

/** Короткая плашка срока: «через 25 мин», «завтра 10:10», «пт», «просрочено» */
export function chip(t: number, done = false, now = Date.now()): string {
  if (!done && t < now) {
    const days = daysBetween(t, now)
    return days <= 0 ? 'просрочено' : `просрочено ${days} дн`
  }
  const mins = Math.floor((t - now) / 60_000)
  if (mins < 60 && mins >= 0) return `через ${Math.max(mins, 1)} мин`
  if (isToday(t, now)) return isEndOfDay(t) ? 'сегодня' : `сегодня ${hm(t)}`
  if (isTomorrow(t, now)) return isEndOfDay(t) ? 'завтра' : `завтра ${hm(t)}`
  const days = daysBetween(now, t)
  if (days < 7) { const wd = WEEKDAYS_SHORT[new Date(t).getDay()]; return isEndOfDay(t) ? wd : `${wd}, ${hm(t)}` }
  return dayMon(t)
}

/** «25.10», «25.10.2026», «25 октября», «завтра», «пт» → полночь этого дня (или null) */
export function parseDay(raw: string, now = Date.now()): number | null {
  const s = raw.trim().toLowerCase().replace(/ё/g, 'е')
  if (!s) return null
  if (s === 'сегодня') return startOfDay(now)
  if (s === 'завтра') return startOfDay(addDays(now, 1))
  if (s === 'послезавтра') return startOfDay(addDays(now, 2))
  const wds = [['вс', 'воскр'], ['пн', 'понед'], ['вт', 'вторн'], ['ср', 'сред'], ['чт', 'четв'], ['пт', 'пятн'], ['сб', 'субб']]
  const wi = wds.findIndex(([a, b]) => s === a || s.startsWith(b))
  if (wi >= 0) {
    let d = startOfDay(addDays(now, 1))
    while (new Date(d).getDay() !== wi) d = addDays(d, 1)
    return d
  }
  const year = new Date(now).getFullYear()
  const pick = (dd: number, mm: number, yy?: number) => {
    if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12)) return null
    let y = yy ? (yy < 100 ? 2000 + yy : yy) : year
    let t = new Date(y, mm - 1, dd).getTime()
    // «10.01» в декабре — это январь следующего года
    if (!yy && t < startOfDay(addDays(now, -60))) { y += 1; t = new Date(y, mm - 1, dd).getTime() }
    return new Date(t).getDate() === dd ? t : null
  }
  const num = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/.exec(s)
  if (num) return pick(+num[1], +num[2], num[3] ? +num[3] : undefined)
  const word = /^(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?$/.exec(s)
  if (word) {
    const mi = MONTHS.findIndex(m => m.startsWith(word[2].slice(0, 3)))
    if (mi >= 0) return pick(+word[1], mi + 1, word[3] ? +word[3] : undefined)
  }
  return null
}
