// Автобусы и дорога к паре. Из Sources/BusRoutes.swift и Commute.swift.
import { kv, createCollection, uid } from './kv'
import { type ScheduleData, type Slot, slotsOn } from './schedule'
import { weekday, startOfDay, addDays, hm } from './date'
import { notify, type Note } from './notify'
import { weather, weatherLine, advice } from './weather'

export type BusDayType = 'weekday' | 'saturday' | 'sunday'
export const BUS_DAYS: { id: BusDayType; title: string }[] = [{ id: 'weekday', title: 'Пн–Пт' }, { id: 'saturday', title: 'Суббота' }, { id: 'sunday', title: 'Воскресенье' }]
export const dayType = (t: number): BusDayType => { const w = weekday(t); return w === 6 ? 'saturday' : w === 7 ? 'sunday' : 'weekday' }

export type BusRoute = {
  id: string; number: string; homeCity: string; homeStop: string; campusCity: string; campusStop: string
  travelMinutes: number; leadMinutes: number; colorHex: string
  toCampus: Record<string, string>; toHome: Record<string, string>; mapLink: string; useGeo: boolean; builtIn: boolean
}
export type BusTrip = { departure: number; arrival: number }
export type Direction = 'toCampus' | 'toHome'

export const BUS_PALETTE = ['F28C1A', 'E94B4B', 'E8457C', '8B5CF6', '3B82F6', '06B6D4', '10B981', '84CC16', 'EAB308', '64748B']

/** Встроенных автобусов нет: свой каждый добавляет сам (вручную или кодом от одногруппника).
 *  id прежнего встроенного 150 — у тех, кто ставил раньше, он убирается */
export const LEGACY_BUS_ID = 'builtin-150'
/** Заглушка, пока своих автобусов нет: без рейсов — значит без напоминаний */
export const noRoute: BusRoute = {
  id: '', number: '', homeCity: '', homeStop: '', campusCity: '', campusStop: '', travelMinutes: 30, leadMinutes: 60,
  colorHex: '64748B', toCampus: {}, toHome: {}, mapLink: '', useGeo: false, builtIn: false
}
/** Только свои автобусы (без прежнего встроенного) */
export const ownRoutes = (l: BusRoute[]) => l.filter(r => r.id !== LEGACY_BUS_ID && !r.builtIn)

export const newRoute = (): BusRoute => ({
  id: uid(), number: '', homeCity: '', homeStop: '', campusCity: 'Архангельск', campusStop: '', travelMinutes: 30, leadMinutes: 60,
  colorHex: BUS_PALETTE[Math.floor(Math.random() * BUS_PALETTE.length)], toCampus: {}, toHome: {}, mapLink: '', useGeo: false, builtIn: false
})

export function normalizeTimes(raw: string): string {
  const set = new Set<number>()
  for (const m of raw.matchAll(/(\d{1,2})[:.](\d{2})/g)) {
    const h = +m[1], mi = +m[2]
    if (h < 24 && mi < 60) set.add(h * 60 + mi)
  }
  return [...set].sort((a, b) => a - b).map(v => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`).join(' ')
}

export const routeTitle = (r: BusRoute) => r.number ? `Автобус ${r.number}` : 'Автобус'
export const routeText = (r: BusRoute) => `${r.homeCity || r.homeStop} ⇄ ${r.campusCity || r.campusStop}`
export const times = (r: BusRoute, d: Direction, type: BusDayType) => ((d === 'toCampus' ? r.toCampus : r.toHome)[type] || '').split(' ').filter(Boolean)

export function trips(r: BusRoute, d: Direction, day: number): BusTrip[] {
  return times(r, d, dayType(day)).map(t => {
    const [h, m] = t.split(':').map(Number)
    const dep = new Date(day); dep.setHours(h, m, 0, 0)
    return { departure: dep.getTime(), arrival: dep.getTime() + r.travelMinutes * 60_000 }
  })
}

export function mapURL(r: BusRoute) {
  if (/^https?:\/\//.test(r.mapLink.trim())) return r.mapLink.trim()
  return `https://yandex.ru/maps/20/arkhangelsk/?text=${encodeURIComponent(`автобус ${r.number} ${r.campusCity}`)}`
}

const PREFIX = 'SAFU-BUS:'
export const shareCode = (r: BusRoute) => PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify({ ...r, builtIn: false }))))
export function fromShareCode(text: string): BusRoute | null {
  const i = text.indexOf(PREFIX)
  if (i < 0) return null
  try {
    const tail = text.slice(i + PREFIX.length).split(/\s/)[0]
    const r = JSON.parse(decodeURIComponent(escape(atob(tail))))
    return { ...newRoute(), ...r, id: uid(), builtIn: false }
  } catch { return null }
}

export const busStore = createCollection<BusRoute[]>('bus.routes.v1', [])

export const bus = {
  routes: () => ownRoutes(busStore.get()),
  /** Есть ли хоть один свой автобус */
  has: () => bus.routes().length > 0,
  activeID: () => { const id = kv.get('bus.active', ''); const l = bus.routes(); return l.some(r => r.id === id) ? id : (l[0]?.id || '') },
  active(): BusRoute { const l = bus.routes(); return l.find(r => r.id === bus.activeID()) || l[0] || noRoute },
  activate(id: string) { kv.set('bus.active', id) },
  upsert(r: BusRoute) {
    busStore.set(l => { const i = l.findIndex(x => x.id === r.id); if (i >= 0) { const c = [...l]; c[i] = r; return c } return [...l, r] })
    if (!bus.routes().some(x => x.id === kv.get('bus.active', ''))) bus.activate(r.id)
  },
  remove(id: string) {
    busStore.set(l => l.filter(r => r.id !== id))
    if (!bus.routes().some(r => r.id === kv.get('bus.active', ''))) bus.activate(bus.routes()[0]?.id || '')
  }
}

export const commute = {
  enabled: () => kv.get('commute.enabled', false),
  walkMinutes: () => kv.get('commute.walk', 15) || 15,
  homeMinutes: () => kv.get('commute.home', 10) || 10,

  /** Последний рейс, который уходит за «выезд за» минут до начала пары */
  latestDeparture(start: number, r = bus.active()): number {
    return start - r.leadMinutes * 60_000
  },
  morning(first: Slot): BusTrip | null {
    const r = bus.active()
    const latest = commute.latestDeparture(first.start, r)
    const list = trips(r, 'toCampus', first.start).filter(t => t.departure <= latest)
    return list[list.length - 1] || null
  },
  afterClasses(from: number, count = 3): BusTrip[] {
    const ready = from + commute.walkMinutes() * 60_000
    return trips(bus.active(), 'toHome', from).filter(t => t.departure >= ready).slice(0, count)
  },
  firstPair: (day: number, d: ScheduleData) => slotsOn(day, d).find(s => !s.remote) || null,
  lastPair: (day: number, d: ScheduleData) => [...slotsOn(day, d)].reverse().find(s => !s.remote) || null,

  scheduleNotifications(d: ScheduleData) {
    if (!commute.enabled() || !kv.get('commute.notify', true)) { notify.cancel('commute-'); return }
    const home = commute.homeMinutes() * 60_000
    const list: Note[] = []
    const r = bus.active()
    for (let i = 0; i < 7; i++) {
      const day = addDays(startOfDay(Date.now()), i)
      const first = commute.firstPair(day, d)
      const trip = first && commute.morning(first)
      if (!first || !trip) continue
      const at = trip.departure - home - 10 * 60_000
      if (at <= Date.now()) continue
      let body = `Автобус ${r.number} в ${hm(trip.departure)}${r.homeStop ? ` с ${r.homeStop}` : ''}. Пара «${first.subject}» в ${hm(first.start)}.`
      const w = weather.hourAt(trip.departure)
      if (w) body += '\n' + weatherLine(w) + (advice(w) ? '. ' + advice(w) : '')
      list.push({ id: `commute-${i}`, at, title: 'Через 10 мин выходи 🚌', body, route: 'bus' })
    }
    notify.schedule('commute-', list)
  }
}
