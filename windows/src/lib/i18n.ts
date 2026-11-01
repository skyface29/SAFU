// Язык интерфейса: русский или английский.
// Все фразы в коде написаны по-русски и обёрнуты в L('…') или L`… ${x} …`.
// В русском режиме L() возвращает ту же строку без поиска в словаре.
// В английском берёт перевод из en.json (ключ — русская фраза, вместо подстановок ${…} стоит %@).
// Нет перевода — остаётся русский. Данные университета (предметы, ФИО, аудитории, ДЗ, письма) не переводятся.
// Работает и в окне, и в главном процессе Electron. При смене языка окна перезагружаются,
// поэтому таблицы на уровне модулей тоже получаются на нужном языке.
import table from './en.json'

export type AppLanguage = 'system' | 'ru' | 'en'
export const LANG_KEY = 'app.language'

/** Языки, носители которых обычно читают по-русски: им — русский по умолчанию */
const RUSSIAN_FIRST = new Set(['ru', 'uk', 'be', 'kk', 'ky', 'uz', 'tg', 'tk'])
const EN = table as Record<string, string>

let choice: AppLanguage = 'system'
let system: readonly string[] = []
let english: boolean | null = null

const code = (l: string | undefined) => (l || '').slice(0, 2).toLowerCase()
const isChoice = (v: unknown): v is AppLanguage => v === 'system' || v === 'ru' || v === 'en'

/** Окно: язык приходит из главного процесса одним вызовом (а в браузере — из localStorage) */
function detect() {
  const w = (globalThis as { window?: any }).window
  if (w) {
    try {
      const info = w.safu?.lang?.()
      if (info) { choice = isChoice(info.choice) ? info.choice : 'system'; system = info.system || [] }
      else {
        let v: unknown
        try { v = JSON.parse(w.localStorage?.getItem('safu.kv') || '{}')[LANG_KEY] } catch { /* нет хранилища */ }
        choice = isChoice(v) ? v : 'system'
        system = w.navigator?.languages || []
      }
    } catch { /* остаёмся на системном */ }
  }
  english = resolve()
}

function resolve(): boolean {
  if (choice === 'en') return true
  if (choice === 'ru') return false
  const first = code(system[0])
  return first ? !RUSSIAN_FIRST.has(first) : false
}

export const Lang = {
  /** true — интерфейс на английском */
  get en(): boolean { if (english === null) detect(); return english! },
  get choice(): AppLanguage { if (english === null) detect(); return choice },
  /** Язык системы, если выбран «Как в системе» */
  get systemIsEnglish(): boolean { if (english === null) detect(); const c = code(system[0]); return !!c && !RUSSIAN_FIRST.has(c) },
  /** Код для <html lang>, Intl и т. п. */
  get code(): 'ru' | 'en' { return Lang.en ? 'en' : 'ru' },
  /** Локаль для дат и чисел: en-GB — 24 часа и «1 November», как привычно в Европе */
  get locale(): string { return Lang.en ? 'en-GB' : 'ru-RU' },
  /** Главный процесс: выбор пользователя и языки системы */
  init(c: unknown, sys: readonly string[]) { choice = isChoice(c) ? c : 'system'; system = sys || []; english = resolve() },
  isChoice
}

const esc = (s: string) => (s.indexOf('%') >= 0 ? s.replace(/%/g, '%%') : s)
const keys = new WeakMap<TemplateStringsArray, string>()

/** Подставляет значения: %@ — по порядку, %1$@ — по номеру, %% — знак процента */
export function fill(s: string, args: readonly unknown[]): string {
  if (s.indexOf('%') < 0) return s
  let next = 0
  return s.replace(/%(%|@|(\d+)\$@)/g, (_m, a: string, n?: string) => {
    if (a === '%') return '%'
    const v = n ? args[+n - 1] : args[next++]
    return v === undefined || v === null ? '' : String(v)
  })
}

/**
 * Перевод фразы интерфейса.
 * L('Готово') · L`Пара в ${time}` · L(строка) — для готовых строк из таблиц (вид занятия, rawValue и т. п.)
 */
export function L(s: TemplateStringsArray | string, ...args: unknown[]): string {
  if (typeof s === 'string') {
    if (!Lang.en) return s
    const t = EN[esc(s)]
    return t === undefined ? s : t.indexOf('%') >= 0 ? fill(t, []) : t
  }
  if (!Lang.en) {
    if (args.length === 0) return s[0]
    let out = s[0]
    for (let i = 0; i < args.length; i++) out += String(args[i] ?? '') + s[i + 1]
    return out
  }
  let key = keys.get(s)
  if (key === undefined) {
    key = esc(s[0])
    for (let i = 1; i < s.length; i++) key += '%@' + esc(s[i])
    keys.set(s, key)
  }
  const t = EN[key]
  if (t !== undefined) return fill(t, args)
  let out = s[0]
  for (let i = 0; i < args.length; i++) out += String(args[i] ?? '') + s[i + 1]
  return out
}

/** Русское число для слов: 1 задание, 2 задания, 5 заданий. По-английски — 1 task / 2 tasks */
export function plural(n: number, one: string, few: string, many: string): string {
  if (Lang.en) return Math.abs(n) === 1 ? one : many
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
