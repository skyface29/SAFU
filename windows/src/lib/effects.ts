// Что пересчитывается после каждого изменения расписания: напоминания, папки предметов,
// итоги недели, сроки ДЗ, трей и мини-окно пары. (refreshSideEffects из ScheduleStore.swift)
import { kv } from './kv'
import { safu } from './bridge'
import { notify, type Note } from './notify'
import { type ScheduleData, slotsOn, nowAndNext, subjects, kindStyle } from './schedule'
import { addDays, startOfDay, hm, untilText, timer, monday, DAY } from './date'
import { hw, scheduleAsk } from './homework'
import { onScheduleChanged, scheduleStore } from './scheduleStore'
import { commute } from './bus'
import { celebrations } from '../fx/Celebrations'

export const folderName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
export const subjectFolder = (s: string) => `Предметы/${folderName(s)}`

function pairReminders(d: ScheduleData) {
  if (!kv.get('notify.pairs', true)) { notify.cancel('pair-'); return }
  const mins = kv.get('notify.pairMinutes', 10) || 10
  const list: Note[] = []
  for (let i = 0; i < 7 && list.length < 40; i++) {
    for (const s of slotsOn(addDays(startOfDay(Date.now()), i), d)) {
      const at = s.start - mins * 60_000
      if (at <= Date.now()) continue
      list.push({
        id: `pair-${Math.floor(s.start / 1000)}`, at,
        title: `Через ${mins} мин: ${s.subject}`,
        body: [kindStyle(s.kind).label, s.room ? `ауд. ${s.room}` : '', s.address].filter(Boolean).join(' · '),
        route: 'schedule'
      })
    }
  }
  notify.schedule('pair-', list)
}

function weeklyDigest(d: ScheduleData) {
  if (!kv.get('notify.digest', true)) { notify.cancel('digest'); return }
  // ближайшее воскресенье 19:00
  const fire = new Date(); fire.setHours(19, 0, 0, 0)
  while (fire.getDay() !== 0 || fire.getTime() <= Date.now()) fire.setDate(fire.getDate() + 1)
  const mon = startOfDay(addDays(fire.getTime(), 1))
  const slots = Array.from({ length: 6 }, (_, i) => slotsOn(addDays(mon, i), d)).flat()
  const labs = slots.filter(s => s.kind.toLowerCase().startsWith('лаб')).length
  const exams = slots.filter(s => { const k = s.kind.toLowerCase(); return k.includes('экзам') || k.includes('зач') })
  const weekEnd = mon + 7 * DAY
  const due = hw.active().filter(h => h.due >= mon && h.due < weekEnd).length
  const lines = [`Пар: ${slots.length}, лабораторных: ${labs}`]
  if (exams.length) lines.push('Экзамены и зачёты: ' + exams.map(s => s.subject).join(', '))
  lines.push(due ? `ДЗ на неделе: ${due}` : 'Дедлайнов на неделе нет')
  notify.schedule('digest', [{ id: 'digest', at: fire.getTime(), title: 'Следующая неделя 📚', body: lines.join('\n'), route: 'schedule' }])
}

/** Утренняя сводка: первая пара, погода — в 7:00 (если включено) */
function morningBrief(d: ScheduleData) {
  if (!kv.get('notify.morning', false)) { notify.cancel('morning-'); return }
  const h = kv.get('notify.morningHour', 7)
  const list: Note[] = []
  for (let i = 0; i < 7; i++) {
    const day = addDays(startOfDay(Date.now()), i)
    const slots = slotsOn(day, d)
    if (!slots.length) continue
    const at = new Date(day); at.setHours(h, 0, 0, 0)
    if (at.getTime() <= Date.now() || at.getTime() >= slots[0].start) continue
    list.push({
      id: `morning-${day}`, at: at.getTime(), route: 'schedule',
      title: `Сегодня ${slots.length} ${slots.length === 1 ? 'пара' : slots.length < 5 ? 'пары' : 'пар'} ☀️`,
      body: `Первая в ${hm(slots[0].start)}: ${slots[0].subject}${slots[0].room ? `, ауд. ${slots[0].room}` : ''}. Последняя заканчивается в ${hm(slots[slots.length - 1].end)}.`
    })
  }
  notify.schedule('morning-', list)
}

async function ensureFolders(d: ScheduleData) {
  if (!kv.get('files.autoFolders', true)) return
  const list = subjects(d)
  if (list.length) await safu.fs.ensureDirs(list.map(subjectFolder))
}

// ---------- трей и мини-окно ----------

export type WidgetPayload = {
  mode: 'now' | 'next' | 'none'
  subject: string
  kind: string
  kindColor: string
  room: string
  address: string
  teacher: string
  start: number
  end: number
  nextSubject: string
  nextStart: number | null
  group: string
}

export function widgetPayload(d: ScheduleData): WidgetPayload {
  const r = nowAndNext(Date.now(), d)
  const main = r.current || r.next
  const isNow = !!r.current
  const after = isNow ? r.next : main ? nowAndNext(main.start + 60_000, d).next : null
  const sameDay = after && main && startOfDay(after.start) === startOfDay(main.start) ? after : null
  return {
    mode: main ? (isNow ? 'now' : 'next') : 'none',
    subject: main?.subject || '', kind: main?.kind || '', kindColor: main ? kindStyle(main.kind).color : '#888',
    room: main?.room || '', address: main?.address || '', teacher: main?.teacher || '',
    start: main?.start || 0, end: main?.end || 0,
    nextSubject: sameDay?.subject || '', nextStart: sameDay?.start ?? null,
    group: d.ruzGroupNumber
  }
}

export function trayLine(d: ScheduleData): { tooltip: string; line: string } {
  const p = widgetPayload(d)
  if (p.mode === 'now') {
    const line = `Сейчас: ${p.subject}${p.room ? `, ауд. ${p.room}` : ''} — до ${hm(p.end)}`
    return { line, tooltip: `САФУ\n${p.subject}\nещё ${timer(p.end - Date.now())}${p.room ? ` · ауд. ${p.room}` : ''}` }
  }
  if (p.mode === 'next') {
    const line = `Далее: ${p.subject} в ${hm(p.start)}${p.room ? `, ауд. ${p.room}` : ''}`
    return { line, tooltip: `САФУ\nСледующая: ${p.subject}\nчерез ${untilText(p.start - Date.now())}` }
  }
  return { line: 'Ближайших пар нет', tooltip: 'САФУ — ближайших пар нет' }
}

let tickTimer: number | undefined
let tickerWired = false
export function startTicker() {
  const tick = () => {
    const d = scheduleStore.data
    safu.tray.update(trayLine(d))
    safu.widget.push(widgetPayload(d))
  }
  tick()
  window.clearInterval(tickTimer)
  tickTimer = window.setInterval(tick, 20_000)
  if (!tickerWired) { tickerWired = true; safu.app.on('widget:wants', tick) }
}

let effectsInstalled = false
export function installEffects() {
  if (effectsInstalled) return
  effectsInstalled = true
  onScheduleChanged(d => {
    pairReminders(d)
    weeklyDigest(d)
    morningBrief(d)
    ensureFolders(d)
    hw.reconcile(d)
    scheduleAsk(d)
    commute.scheduleNotifications(d)
    celebrations.scheduleNotifications(d)
    safu.tray.update(trayLine(d))
    safu.widget.push(widgetPayload(d))
    void monday
  })
}
