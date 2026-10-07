// Хранилище расписания: синхронизация с РУЗ, архив прошлых недель, журнал замен, режим преподавателя.
// Перенесено из Sources/ScheduleStore.swift и Sources/Teacher.swift.
import { create } from 'zustand'
import { kv } from './kv'
import { safu } from './bridge'
import {
  type ScheduleData, type ScheduleChange, type Lesson, emptySchedule, mergeRuz, restorePast, usesRuz,
  upcomingMap, diffChanges, hasEventsInWeek
} from './schedule'
import {
  type RuzEvent, type RuzGroup, findGroupID, loadGroup, loadWeek, loadGroups, allInstitutions, parseHTML,
  timetableURL, fetchText
} from './ruz'
import { startOfDay, weekKey, monday, isToday, isTomorrow, relativeAgo } from './date'
import { notify } from './notify'

const KEY = 'schedule.v1'

function loadData(): ScheduleData {
  const raw = kv.get<Partial<ScheduleData> | null>(KEY, null)
  return raw ? { ...emptySchedule(), ...raw } : emptySchedule()
}

// ---------- архив прошлых пар (отдельный файл на группу; только добавляется) ----------

const archiveName = (d: ScheduleData) => {
  const g = d.ruzGroupNumber.trim().replace(/[^\p{L}\p{N}]/gu, '')
  return g ? `ruz-archive-${g}` : null
}

async function archiveLoad(d: ScheduleData): Promise<RuzEvent[]> {
  const n = archiveName(d)
  if (!n) return []
  return ((await safu.cache.get(n)) as RuzEvent[] | null) || []
}

async function archiveSave(d: ScheduleData) {
  if (!usesRuz(d) || teacherMode.isOn() || !d.ruzEvents.length) return
  const n = archiveName(d)
  if (!n) return
  const today = startOfDay(Date.now())
  const archive = await archiveLoad(d)
  const archived = new Set(archive.map(e => startOfDay(e.start)))
  const add = d.ruzEvents.filter(e => { const day = startOfDay(e.start); return day < today && !archived.has(day) })
  if (!add.length) return
  await safu.cache.set(n, [...archive, ...add].sort((a, b) => a.start - b.start))
}

// ---------- режим преподавателя ----------

export const teacherMode = {
  isOn: () => kv.get('user.kind', 'student') === 'teacher',
  query: () => kv.get('teacher.query', ''),
  betaNote: 'Режим преподавателя в разработке: пары собираются из РУЗ по расписаниям групп и могут быть неполными. Сверяйтесь с официальным расписанием.',

  parse(q: string): { surname: string; initials: string[] } {
    const parts = q.toLowerCase().split(/[^a-zа-яё]+/i).filter(Boolean)
    if (!parts.length) return { surname: '', initials: [] }
    return { surname: parts[0], initials: parts.slice(1).map(p => p[0]).slice(0, 2) }
  },

  matches(teacher: string, who: { surname: string; initials: string[] }): boolean {
    if (!who.surname) return false
    const words = teacher.toLowerCase().split(/[^a-zа-яё]+/i).filter(Boolean)
    for (let i = 0; i < words.length; i++) {
      if (words[i] !== who.surname) continue
      const rest = words.slice(i + 1, i + 1 + who.initials.length).map(w => w[0])
      if (rest.join('') === who.initials.join('')) return true
    }
    return false
  },

  merge(list: SchoolEvent[]): RuzEvent[] {
    const merged = new Map<string, { e: RuzEvent; gs: Set<string> }>()
    for (const x of list) {
      const key = `${Math.floor(x.e.start / 1000)}|${x.e.subject.toLowerCase()}|${x.e.room}`
      const m = merged.get(key)
      if (m) m.gs.add(x.group); else merged.set(key, { e: x.e, gs: new Set([x.group]) })
    }
    return [...merged.values()].map(({ e, gs }) => {
      const l = [...gs].sort()
      return { ...e, teacher: (l.length === 1 ? 'Группа ' : 'Группы ') + l.join(', ') }
    }).sort((a, b) => a.start - b.start)
  },

  groupsIn(teacherField: string): string[] {
    return teacherField.replace('Группы ', '').replace('Группа ', '').split(', ').filter(s => s && /^\d+$/.test(s))
  },

  myGroups(d: ScheduleData): string[] {
    return [...new Set(d.ruzEvents.flatMap(e => teacherMode.groupsIn(e.teacher)))].sort()
  }
}

// ---------- расписание всей школы (для преподавателя и поиска преподавателей) ----------

export type SchoolEvent = { e: RuzEvent; group: string }

type SchoolState = {
  events: SchoolEvent[]
  institution: number
  scannedAt: number | null
  progress: number | null
  failed: number
  error: string | null
}

export const useSchool = create<SchoolState>(() => ({ events: [], institution: 0, scannedAt: null, progress: null, failed: 0, error: null }))

export const school = {
  async load(inst: number) {
    const s = useSchool.getState()
    if (s.institution === inst && s.events.length) return
    const b = await safu.cache.get(`school-${inst}`) as { institution: number; at: number; events: SchoolEvent[]; failed: number } | null
    if (b) useSchool.setState({ events: b.events, institution: b.institution, scannedAt: b.at, failed: b.failed })
  },

  isFresh(inst: number) {
    const s = useSchool.getState()
    return s.institution === inst && s.events.length > 0 && !!s.scannedAt && Date.now() - s.scannedAt < 12 * 3600_000
  },

  async ensure(inst: number, force = false, report?: (done: number, total: number) => void) {
    await school.load(inst)
    if (!force && school.isFresh(inst)) return
    if (useSchool.getState().progress != null) {
      while (useSchool.getState().progress != null) await new Promise(r => setTimeout(r, 300))
      return
    }
    useSchool.setState({ error: null, progress: 0 })
    try {
      const schools = (await allInstitutions()).filter(i => i !== inst)
      schools.unshift(inst)
      const plan: RuzGroup[] = []
      const seen = new Set<string>()
      let homeCount = 0
      for (let i = 0; i < schools.length; i++) {
        try {
          for (const g of await loadGroups(schools[i])) if (!seen.has(g.id)) { seen.add(g.id); plan.push(g) }
        } catch { /* школа не ответила */ }
        if (i === 0) homeCount = plan.length
      }
      if (!plan.length) { useSchool.setState({ error: 'Нет связи с РУЗ — не удалось получить список групп' }); return }
      report?.(0, plan.length)
      const found: SchoolEvent[] = []
      let failed = 0, start = 0, shownHome = false
      const fetchGroup = async (g: RuzGroup): Promise<SchoolEvent[] | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const html = await fetchText(timetableURL(g.id), 20_000)
            if (html) return parseHTML(html).map(e => ({ e, group: g.number }))
          } catch { /* повтор */ }
          if (attempt === 0) await new Promise(r => setTimeout(r, 700))
        }
        return null
      }
      // по 6 групп за раз — РУЗ не любит лавину запросов
      while (start < plan.length) {
        const chunk = plan.slice(start, start + 6)
        const parts = await Promise.all(chunk.map(fetchGroup))
        for (const p of parts) { if (p) found.push(...p); else failed++ }
        start += chunk.length
        useSchool.setState({ progress: start / plan.length })
        report?.(start, plan.length)
        if (!shownHome && start >= homeCount && found.length) {
          shownHome = true
          useSchool.setState({ events: [...found], institution: inst })
        }
      }
      if (!found.length) { useSchool.setState({ error: 'РУЗ не ответил — попробуй позже' }); return }
      const at = Date.now()
      useSchool.setState({ events: found, institution: inst, scannedAt: at, failed })
      await safu.cache.set(`school-${inst}`, { institution: inst, at, events: found, failed })
    } finally {
      useSchool.setState({ progress: null })
    }
  },

  eventsFor(query: string): SchoolEvent[] {
    const who = teacherMode.parse(query)
    return useSchool.getState().events.filter(x => teacherMode.matches(x.e.teacher, who))
  },

  teachers(): { name: string; subjects: string[] }[] {
    const map = new Map<string, Set<string>>()
    for (const x of useSchool.getState().events) {
      for (const name of x.e.teacher.split(',')) {
        const n = name.trim()
        if (n.length <= 3) continue
        if (!map.has(n)) map.set(n, new Set())
        map.get(n)!.add(x.e.subject)
      }
    }
    return [...map.entries()].map(([name, s]) => ({ name, subjects: [...s].sort() })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }
}

// ---------- хранилище ----------

type State = {
  data: ScheduleData
  syncing: boolean
  syncMessage: string | null
  teacherProgress: number | null
  changes: ScheduleChange[]
  unseen: number
  loadingWeek: boolean
}

export const useSchedule = create<State>(() => ({
  data: loadData(),
  syncing: false,
  syncMessage: null,
  teacherProgress: null,
  changes: kv.get<ScheduleChange[]>('schedule.changes', []),
  unseen: kv.get('schedule.unseen', 0),
  loadingWeek: false
}))

let persistTimer: number | undefined
const triedWeeks = new Set<string>()
const sideEffects = new Set<(d: ScheduleData) => void>()

/** Подписка на изменения расписания (напоминания, папки, виджет, трей) */
export function onScheduleChanged(f: (d: ScheduleData) => void) {
  sideEffects.add(f)
  return () => { sideEffects.delete(f) }
}

let sideTimer: number | undefined
function setData(next: ScheduleData) {
  // архив этой недели для ручного расписания
  if (next.lessons.length) {
    const key = weekKey(Date.now())
    if (JSON.stringify(next.history[key]) !== JSON.stringify(next.lessons)) {
      next = { ...next, history: { ...next.history, [key]: next.lessons } }
    }
    const keys = Object.keys(next.history).sort()
    if (keys.length > 60) {
      const keep = new Set(keys.slice(-60))
      next = { ...next, history: Object.fromEntries(Object.entries(next.history).filter(([k]) => keep.has(k))) }
    }
  }
  useSchedule.setState({ data: next })
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    kv.set(KEY, next)
    archiveSave(next)
  }, 400)
  window.clearTimeout(sideTimer)
  sideTimer = window.setTimeout(() => sideEffects.forEach(f => { try { f(next) } catch (e) { console.error(e) } }), 1000)
}

function setChanges(changes: ScheduleChange[], unseen: number) {
  kv.set('schedule.changes', changes)
  kv.set('schedule.unseen', unseen)
  useSchedule.setState({ changes, unseen })
}

function notifyChanges(found: ScheduleChange[]) {
  if (!found.length || !kv.get('notify.changes', true)) return
  const soon = found.some(c => isToday(c.date) || isTomorrow(c.date))
  const when = found.some(c => isToday(c.date)) ? 'сегодня' : 'завтра'
  notify.show({
    title: soon ? `Замена в расписании на ${when}` : `Расписание изменилось (${found.length})`,
    body: found.slice(0, 3).map(c => c.text).join('\n'),
    route: 'changes'
  })
}

export const scheduleStore = {
  get data() { return useSchedule.getState().data },
  setData,

  async init() {
    let d = useSchedule.getState().data
    if (usesRuz(d)) {
      const r = restorePast(d, await archiveLoad(d))
      if (r.added) { d = r.data; setData(d) }
    }
    sideEffects.forEach(f => { try { f(d) } catch (e) { console.error(e) } })
  },

  isConfigured() { const d = useSchedule.getState().data; return usesRuz(d) || d.lessons.length > 0 },
  hasLessons() { const d = useSchedule.getState().data; return usesRuz(d) ? d.ruzEvents.length > 0 : d.lessons.length > 0 },

  get memorySince() { return useSchedule.getState().data.ruzEvents[0]?.start ?? null },
  get rememberedWeeks() { return new Set(useSchedule.getState().data.ruzEvents.map(e => weekKey(e.start))).size },

  lastSyncText() {
    const l = useSchedule.getState().data.lastSync
    return l ? 'обновлено ' + relativeAgo(l) : 'ещё не обновлялось'
  },

  async loadArchiveWeek(t: number) {
    const d = useSchedule.getState().data
    if (!usesRuz(d) || !d.ruzGroupID || hasEventsInWeek(d, t)) return
    const key = weekKey(t)
    if (triedWeeks.has(key)) return
    triedWeeks.add(key)
    useSchedule.setState({ loadingWeek: true })
    try {
      const events = await loadWeek(d.ruzGroupID, monday(t))
      if (events.length) setData(mergeRuz(useSchedule.getState().data, events))
    } finally {
      useSchedule.setState({ loadingWeek: false })
    }
  },

  markChangesSeen() { setChanges(useSchedule.getState().changes, 0) },
  clearChanges() { setChanges([], 0) },

  // ручное расписание
  upsertLesson(l: Lesson) {
    const d = useSchedule.getState().data
    const i = d.lessons.findIndex(x => x.id === l.id)
    const lessons = [...d.lessons]
    if (i >= 0) lessons[i] = l; else lessons.push(l)
    setData({ ...d, lessons })
  },
  deleteLesson(id: string) {
    const d = useSchedule.getState().data
    setData({ ...d, lessons: d.lessons.filter(l => l.id !== id) })
  },
  clearLessons() { setData({ ...useSchedule.getState().data, lessons: [] }) },
  clearHistory() { setData({ ...useSchedule.getState().data, history: {} }) },
  useManual() { setData({ ...useSchedule.getState().data, source: 0 }) },

  connectRuz(number: string, institution: number, id = '') {
    let d = { ...useSchedule.getState().data }
    const n = number.trim()
    if (d.ruzGroupNumber && d.ruzGroupNumber !== n) d.ruzEvents = []
    d = { ...d, source: 1, ruzGroupNumber: n, ruzInstitution: institution, ruzGroupID: id, lastSync: null }
    setData(d)
  },

  connectTeacher(institution: number) {
    let d = { ...useSchedule.getState().data }
    if (d.ruzInstitution !== institution || d.ruzGroupNumber) d.ruzEvents = []
    d = { ...d, source: 1, ruzGroupNumber: '', ruzGroupID: '', ruzInstitution: institution, lastSync: null }
    setData(d)
  },

  async clearRuzCache() {
    const d = useSchedule.getState().data
    const n = archiveName(d)
    if (n) await safu.cache.set(n, null)
    setData({ ...d, ruzEvents: [], lastSync: null, syncInfo: '' })
  },

  setTeacherPref(subject: string, teacher: string) {
    const d = useSchedule.getState().data
    const prefs = { ...d.teacherPrefs }
    if (teacher) prefs[subject] = teacher; else delete prefs[subject]
    setData({ ...d, teacherPrefs: prefs })
  },

  async sync(force = false) {
    const st = useSchedule.getState()
    const data = st.data
    if (!usesRuz(data) || st.syncing) return
    if (!force && data.lastSync && Date.now() - data.lastSync < 20 * 60_000) return

    if (teacherMode.isOn()) {
      if (!force && data.lastSync && Date.now() - data.lastSync < 3 * 3600_000) return
      useSchedule.setState({ syncing: true })
      try {
        await school.ensure(data.ruzInstitution, force, (done, total) => useSchedule.setState({ teacherProgress: total ? done / total : 0 }))
        const s = useSchool.getState()
        if (!s.events.length && s.error) throw new Error(s.error)
        const merged = teacherMode.merge(school.eventsFor(teacherMode.query()))
        let d = useSchedule.getState().data
        if (merged.length) d = mergeRuz(d, merged)
        const groups = teacherMode.myGroups({ ...d, ruzEvents: merged })
        d = { ...d, lastSync: Date.now(), syncInfo: merged.length ? `Пар: ${merged.length} · групп: ${groups.length}` : `В РУЗ не нашлось пар преподавателя «${teacherMode.query()}»` }
        setData(d)
        useSchedule.setState({ syncMessage: d.syncInfo })
      } catch (e) {
        useSchedule.setState({ syncMessage: `${(e as Error).message || 'Нет связи с РУЗ'}, показываю сохранённое расписание` })
      } finally {
        useSchedule.setState({ syncing: false, teacherProgress: null })
      }
      return
    }

    useSchedule.setState({ syncing: true })
    try {
      let id = data.ruzGroupID
      if (!id) {
        const found = data.ruzGroupNumber ? await findGroupID(data.ruzGroupNumber, data.ruzInstitution) : null
        if (!found) {
          const msg = `Группа ${data.ruzGroupNumber} не найдена в РУЗ. Открой РУЗ, найди свою группу и проверь номер.`
          useSchedule.setState({ syncMessage: msg })
          setData({ ...useSchedule.getState().data, syncInfo: msg })
          return
        }
        id = found
      }
      const r = await loadGroup(id)
      const cur = useSchedule.getState().data
      const before = upcomingMap(cur)
      let d: ScheduleData = { ...cur, ruzGroupID: id }
      if (r.events.length) d = mergeRuz(d, r.events)
      const lastMethod = kv.get<string | null>('ruz.lastMethod', null)
      kv.set('ruz.lastMethod', r.method)
      if (before.size && r.events.length && lastMethod === r.method) {
        const found = diffChanges(before, upcomingMap(d))
        if (found.length) {
          const s = useSchedule.getState()
          setChanges([...found, ...s.changes].slice(0, 50), s.unseen + found.length)
          notifyChanges(found)
        }
      }
      d = { ...d, lastSync: Date.now(), syncInfo: r.events.length ? `Загружено пар: ${r.events.length} · ${r.method}` : (r.notice || 'РУЗ не вернул пар на ближайшие недели') }
      setData(d)
      useSchedule.setState({ syncMessage: d.syncInfo })
    } catch {
      useSchedule.setState({ syncMessage: 'Нет связи с РУЗ, показываю сохранённое расписание' })
    } finally {
      useSchedule.setState({ syncing: false })
    }
  }
}
