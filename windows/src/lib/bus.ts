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

export const default150: BusRoute = {
  id: 'builtin-150', number: '150', homeCity: 'Северодвинск', homeStop: 'о. Ягры', campusCity: 'Архангельск', campusStop: 'м.р. вокзал',
  travelMinutes: 60, leadMinutes: 100, colorHex: 'F28C1A', useGeo: true, builtIn: true,
  mapLink: 'https://yandex.ru/maps/20/arkhangelsk/routes/bus_150/796d617073626d313a2f2f7472616e7369742f6c696e653f69643d31373034383535383634266c6c3d34302e31383136333325324336342e353534353734266e616d653d31353026723d313833383726747970653d627573/',
  toCampus: {
    weekday: '06:20 06:40 07:00 07:25 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:00 14:30 15:10 16:00 16:35 17:30 18:30 19:30',
    saturday: '06:40 07:10 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:30 15:10 16:00 16:35 17:30 18:30 19:30',
    sunday: '07:10 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:30 15:10 16:00 16:35 17:30 18:30 19:30'
  },
  toHome: {
    weekday: '06:10 07:40 08:15 08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 15:30 16:00 16:30 17:00 17:30 18:15 19:00 20:00',
    saturday: '08:15 08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 16:00 16:30 17:00 17:30 18:15 19:00 20:00',
    sunday: '08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 16:00 16:30 17:00 17:30 18:15 19:00 20:00'
  }
}

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

export const busStore = createCollection<BusRoute[]>('bus.routes.v1', [default150])

export const bus = {
  routes: () => { const l = busStore.get(); return l.length ? l : [default150] },
  activeID: () => kv.get('bus.active', default150.id),
  active(): BusRoute { const l = bus.routes(); return l.find(r => r.id === bus.activeID()) || l[0] || default150 },
  activate(id: string) { kv.set('bus.active', id) },
  upsert(r: BusRoute) { busStore.set(l => { const i = l.findIndex(x => x.id === r.id); if (i >= 0) { const c = [...l]; c[i] = r; return c } return [...l, r] }) },
  remove(id: string) {
    busStore.set(l => { const n = l.filter(r => r.id !== id); return n.length ? n : [default150] })
    if (!bus.routes().some(r => r.id === bus.activeID())) bus.activate(bus.routes()[0].id)
  },
  restore150() { if (!busStore.get().some(r => r.id === default150.id)) busStore.set(l => [default150, ...l]) }
}

export const commute = {
  enabled: () => kv.get('commute.enabled', false),
  walkMinutes: () => kv.get('commute.walk', 15) || 15,
  homeMinutes: () => kv.get('commute.home', 10) || 10,

  /** Для 150 — правила: пара в 8:20 → автобус 7:00, пара в 10:10 → 8:30. Иначе — за «выезд за» минут */
  latestDeparture(start: number, r = bus.active()): number {
    if (r.builtIn) {
      const d = new Date(start), m = d.getHours() * 60 + d.getMinutes()
      const at = (h: number, mi: number) => { const x = new Date(start); x.setHours(h, mi, 0, 0); return x.getTime() }
      if (m <= 8 * 60 + 20) return at(7, 0)
      if (m <= 10 * 60 + 10) return at(8, 30)
    }
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
