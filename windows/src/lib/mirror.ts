// Зеркало расписания arktika-app.ru/raspisanie/: его собирает ruz/collect.mjs из РУЗ и расписаний колледжей.
// Приложение берёт расписание отсюда, а не со страниц РУЗ: один лёгкий JSON на группу вместо страницы на 200–400 КБ,
// есть все недели с начала семестра (архив), колледжи, и расписание видно, даже когда РУЗ лежит.
// Не ответило зеркало — sync идёт в РУЗ напрямую, как раньше.
import { safu } from './bridge'
import { kv } from './kv'
import { DAY } from './date'
import type { RuzEvent, RuzGroup } from './ruz'

export const MIRROR = 'https://arktika-app.ru/raspisanie/data/web/'
const TIMEOUT = 15_000

export type City = 'arh' | 'sev'
export type SchoolKind = 'vuz' | 'spo' | 'asp'
/** Высшая школа, институт или колледж из зеркала */
export type MirrorSchool = { id: number; short: string; full: string; about: string; city: City; kind: SchoolKind }
type Manifest = { at: number; checked: number; status?: { up: boolean }; i: string; g?: string }
type Index = { schools: MirrorSchool[]; groups: { number: string; insts: number[]; course: number; title: string }[] }

async function getJSON<T>(url: string): Promise<T> {
  const r = await safu.net.fetch({ url, timeout: TIMEOUT })
  if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`)
  return JSON.parse(r.text) as T
}

// Запасной список (если зеркало недоступно при первой регистрации): то же, что ruz/parse.mjs SCHOOLS
export const FALLBACK_SCHOOLS: MirrorSchool[] = [
  [3, 'ВШИТАС', 'Высшая школа информационных технологий и автоматизированных систем', 'ИТ, программирование, автоматизация, связь', 'arh', 'vuz'],
  [15, 'ВИШ', 'Высшая инженерная школа', 'Строительство, транспорт, машиностроение', 'arh', 'vuz'],
  [1, 'ВШЕНиТ', 'Высшая школа естественных наук и технологий', 'Биология, химия, география, экология', 'arh', 'vuz'],
  [4, 'ВШСГНиМК', 'Высшая школа социально-гуманитарных наук и международной коммуникации', 'Филология, история, языки, журналистика', 'arh', 'vuz'],
  [28, 'ВШЭУиП', 'Высшая школа экономики, управления и права', 'Экономика, менеджмент, юриспруденция', 'arh', 'vuz'],
  [12, 'ВШЭНиГ', 'Высшая школа энергетики, нефти и газа', 'Энергетика, нефтегазовое дело', 'arh', 'vuz'],
  [13, 'ВШППиФК', 'Высшая школа педагогики, психологии и физической культуры', 'Психология, педагогика, спорт', 'arh', 'vuz'],
  [36, 'ВШРиМТ', 'Высшая школа рыболовства и морских технологий', 'Рыболовство, водные биоресурсы, морские технологии', 'arh', 'vuz'],
  [1001, 'ТК Петра I', 'Технологический колледж Императора Петра I', 'Колледж, среднее профессиональное образование', 'arh', 'spo'],
  [1036, 'Колледж ВШРиМТ', 'СПО Высшей школы рыболовства и морских технологий', 'Колледж: судовождение, судовые установки, холодильные машины', 'arh', 'spo'],
  [26, 'Севмашвтуз', 'Институт судостроения и морской арктической техники (г. Северодвинск)', 'Судостроение, морская и арктическая техника', 'sev', 'vuz'],
  [6, 'ГИ Северодвинск', 'Гуманитарный институт (г. Северодвинск)', 'Педагогика, филология, гуманитарные науки', 'sev', 'vuz'],
  [23, 'ТК Северодвинск', 'Технический колледж (г. Северодвинск)', 'Колледж: машиностроение, сварка, судостроение', 'sev', 'spo'],
  [33, 'НПК', 'Управление подготовки и аттестации НПК', 'Аспирантура, подготовка кадров высшей квалификации', 'arh', 'asp'],
  [35, 'Наука, Северодвинск', 'Научный отдел филиала САФУ в г. Северодвинске', 'Аспирантура филиала', 'sev', 'asp'],
].map(fromRow)

function fromRow(s: unknown[]): MirrorSchool {
  const id = Number(s[0])
  return {
    id, short: String(s[1] || ''), full: String(s[2] || ''), about: String(s[3] || ''),
    city: (s[4] === 'sev' ? 'sev' : 'arh'), kind: (s[5] === 'spo' || s[5] === 'asp' ? s[5] : 'vuz') as SchoolKind
  }
}

export const cityOf = (inst: number): City => (FALLBACK_SCHOOLS.find(s => s.id === inst)?.city ?? 'arh')
/** Колледж, которого нет в РУЗе (или там пусто): расписание только из зеркала */
export const mirrorOnly = (inst: number) => inst >= 1000 || inst === 23

/** Школы, колледжи и все группы. Кэш на сутки; без сети — последний сохранённый */
export async function loadIndex(force = false): Promise<Index> {
  const box = kv.get<{ at: number; file: string; index: Index } | null>('mirror.index', null)
  if (!force && box && Date.now() - box.at < DAY) return box.index
  try {
    const m = await getJSON<Manifest>(MIRROR + 'm.json')
    if (box && box.file === m.i) { kv.set('mirror.index', { ...box, at: Date.now() }); return box.index }
    const raw = await getJSON<{ schools: unknown[][]; G: [string, number[], number, string][] }>(MIRROR + m.i)
    const index: Index = {
      schools: raw.schools.map(fromRow),
      groups: raw.G.map(([number, insts, course, title]) => ({ number, insts, course, title }))
    }
    kv.set('mirror.index', { at: Date.now(), file: m.i, index })
    return index
  } catch (e) {
    if (box) return box.index
    throw e
  }
}

export async function mirrorSchools(): Promise<MirrorSchool[]> {
  try {
    const ix = await loadIndex()
    const have = new Set(ix.groups.flatMap(g => g.insts))
    const fromMirror = ix.schools.filter(s => have.has(s.id))
    // колледж, у которого в зеркале пока нет пар, всё равно показываем: группу можно ввести вручную
    return [...fromMirror, ...FALLBACK_SCHOOLS.filter(s => s.kind === 'spo' && !fromMirror.some(m => m.id === s.id))]
  } catch { return FALLBACK_SCHOOLS }
}

/** Группы школы или колледжа из зеркала (без id РУЗа: зеркало ищет группу по номеру) */
export async function mirrorGroups(inst: number, force = false): Promise<RuzGroup[]> {
  const ix = await loadIndex(force)
  return ix.groups.filter(g => g.insts.includes(inst))
    .map(g => ({ id: '', number: g.number, title: g.title, course: g.course || null }))
    .sort((a, b) => (a.course ?? 9) - (b.course ?? 9) || a.number.localeCompare(b.number))
}

export type MirrorChange = { at: number; g: string; t: 'add' | 'del' | 'mod' | 'move' | 'swap' }
type GroupFile = { v: number; at: number; n: string; base: number; S: string[]; L: number[][]; C?: MirrorChange[] }

export const groupFile = (n: string) => MIRROR + 'g/' + encodeURIComponent(n.trim().replace(/\s+/g, '_')) + '.json'

/** Подгруппа и поток — в примечание, как их пишет РУЗ: так остальное приложение (фильтр подгрупп, потоки) работает как прежде */
export function eventsFromGroupFile(f: GroupFile): RuzEvent[] {
  return f.L.map(r => {
    const start = (f.base + r[0]) * 60_000
    const s = (i: number) => f.S[r[i]] || ''
    const note = [s(7) && `Поток "${s(7)}"`, s(8) && `Подгруппа ${s(8)}`].filter(Boolean).join(' ')
    return { start, end: start + r[1] * 60_000, subject: s(2), kind: s(3) || 'Занятие', teacher: s(4), room: s(5), address: s(6), note }
  })
}

/** Расписание группы из зеркала. null — группы в зеркале нет (тогда — РУЗ напрямую) */
export async function loadMirrorGroup(number: string): Promise<{ events: RuzEvent[]; at: number } | null> {
  const r = await safu.net.fetch({ url: groupFile(number), timeout: TIMEOUT })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`)
  const f = JSON.parse(r.text) as GroupFile
  return { events: eventsFromGroupFile(f), at: f.at }
}
