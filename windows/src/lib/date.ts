// Даты по-русски и календарные расчёты (неделя с понедельника, как в Calendar с firstWeekday = 2)

export const DAY = 86_400_000
export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const startOfDay = (t: number | Date) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
export const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime() }
export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b)
export const isToday = (t: number) => sameDay(t, Date.now())
export const isTomorrow = (t: number) => sameDay(t, addDays(Date.now(), 1))
export const isYesterday = (t: number) => sameDay(t, addDays(Date.now(), -1))
export const daysBetween = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY)

/** Понедельник недели этого дня, 00:00 */
export function monday(t: number): number {
  const d = new Date(startOfDay(t))
  const wd = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - wd)
  return d.getTime()
}

/** 1 = пн … 7 = вс */
export const weekday = (t: number) => { const w = new Date(t).getDay(); return w === 0 ? 7 : w }

export const pad = (n: number) => String(n).padStart(2, '0')
export const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}` }
export const hhmm = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const weekKey = (t: number) => ymd(monday(t))

/** «7 октября» */
export const dayMonth = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
/** «7 окт» */
export const dayMon = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` }
/** «среда, 7 октября» */
export const fullDay = (t: number) => `${WEEKDAYS[new Date(t).getDay()]}, ${dayMonth(t)}`
/** «ср 7 окт» */
export const shortDay = (t: number) => `${WEEKDAYS_SHORT[new Date(t).getDay()]} ${dayMon(t)}`
/** «ср, 7 окт, 10:10» */
export const shortDayTime = (t: number) => `${WEEKDAYS_SHORT[new Date(t).getDay()]}, ${dayMon(t)}, ${hm(t)}`

/** «сегодня», «завтра», «вчера» или «пятница, 10 октября» */
export function relDay(t: number): string {
  if (isToday(t)) return 'сегодня'
  if (isTomorrow(t)) return 'завтра'
  if (isYesterday(t)) return 'вчера'
  return fullDay(t)
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

/** «через 25 мин», «через 2 ч 10 мин» */
export function untilText(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60), m = mins % 60
  if (h < 24) return m ? `${h} ч ${m} мин` : `${h} ч`
  const d = Math.floor(h / 24)
  return `${d} ${plural(d, 'день', 'дня', 'дней')}`
}

/** Таймер «1:23:45» / «23:45» */
export function timer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** «обновлено 5 минут назад» */
export function relativeAgo(t: number): string {
  const diff = Date.now() - t
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`
  const d = Math.round(h / 24)
  return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 17) return 'Добрый день'
  return 'Добрый вечер'
}

/** Дата в часовом поясе Москвы → момент времени */
export function moscowDate(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 3, mi)
}

/** Значение для <input type="datetime-local"> */
export const toLocalInput = (t: number) => { const d = new Date(t); return `${ymd(t)}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const fromLocalInput = (s: string) => new Date(s).getTime()
