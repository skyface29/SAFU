// Оформление: цветовые темы, живые фоны, стили карточек, шрифты, наборы «всё сразу».
// Перенесено из Sources/Design.swift, Appearance.swift, Themes.swift.
import { kv } from './kv'

export type Accent = { id: string; title: string; c1: string; c2: string; c1d?: string; c2d?: string; strict?: boolean }

export const ACCENTS: Accent[] = [
  { id: 'blue', title: 'Синяя', c1: '#2973fa', c2: '#4dccfa' },
  { id: 'violet', title: 'Фиолет', c1: '#8559fa', c2: '#e666e6' },
  { id: 'teal', title: 'Бирюза', c1: '#1aada8', c2: '#59d973' },
  { id: 'orange', title: 'Апельсин', c1: '#fa802e', c2: '#fac740' },
  { id: 'pink', title: 'Розовая', c1: '#f24d8c', c2: '#fa8c66' },
  { id: 'cyber', title: 'Кибер', c1: '#00c7f2', c2: '#b859ff' },
  { id: 'aurora', title: 'Сияние', c1: '#29cc9e', c2: '#7366f2' },
  { id: 'ice', title: 'Лёд', c1: '#59a8f2', c2: '#b3e6ff' },
  { id: 'lime', title: 'Лайм', c1: '#73cc1a', c2: '#1abf99' },
  { id: 'crimson', title: 'Алая', c1: '#e6294d', c2: '#ff804d' },
  { id: 'gold', title: 'Золото', c1: '#eba61f', c2: '#fa664d' },
  { id: 'graphite', title: 'Графит', c1: '#616b80', c2: '#9ea8bd' },
  { id: 'autumn', title: 'Осень', c1: '#ed731f', c2: '#cc2938' },
  { id: 'ios6', title: 'Классика', c1: '#3373cc', c2: '#6ba6eb' },
  { id: 'rust', title: 'Ржавчина', c1: '#b8662b', c2: '#5e8f7a' },
  { id: 'navy', title: 'Тёмно-синяя', c1: '#1B3A6B', c2: '#2F5288', c1d: '#5B7FC4', c2d: '#7896D0', strict: true },
  { id: 'safu', title: 'САФУ', c1: '#004C97', c2: '#1F66B0', c1d: '#3D84D6', c2d: '#6AA2E0', strict: true },
  { id: 'bordeaux', title: 'Бордо', c1: '#7A1F2B', c2: '#96323F', c1d: '#B5525E', c2d: '#C56D77', strict: true },
  { id: 'forest', title: 'Хвоя', c1: '#1F5A3D', c2: '#2F7250', c1d: '#4F9A6E', c2d: '#6BAE86', strict: true },
  { id: 'petrol', title: 'Петроль', c1: '#0F5561', c2: '#1E6C78', c1d: '#3F939E', c2d: '#5CA8B2', strict: true },
  { id: 'slate', title: 'Сланец', c1: '#3E4C5C', c2: '#566578', c1d: '#7F8FA3', c2d: '#98A6B8', strict: true },
  { id: 'olive', title: 'Олива', c1: '#5A5E28', c2: '#72773A', c1d: '#9A9E58', c2d: '#B0B470', strict: true },
  { id: 'coffee', title: 'Кофе', c1: '#6B4630', c2: '#86593E', c1d: '#A67C5E', c2d: '#BA9276', strict: true },
  { id: 'plum', title: 'Слива', c1: '#5B2D66', c2: '#74407F', c1d: '#9A6BA6', c2d: '#B085BB', strict: true },
  { id: 'ink', title: 'Чернила', c1: '#1E2126', c2: '#3A3F47', c1d: '#8C929C', c2d: '#A4AAB3', strict: true }
]

export type Backdrop = 'seasonal' | 'glow' | 'leaves' | 'petals' | 'summer' | 'aurora' | 'grid' | 'snow' | 'wash' | 'plain' | 'matrix' | 'soft' | 'linen' | 'workshop'

export const BACKDROPS: { id: Backdrop; title: string; emoji: string }[] = [
  { id: 'seasonal', title: 'По сезону', emoji: '📅' },
  { id: 'glow', title: 'Свет', emoji: '✨' },
  { id: 'aurora', title: 'Сияние', emoji: '🌌' },
  { id: 'snow', title: 'Снег', emoji: '❄️' },
  { id: 'leaves', title: 'Листопад', emoji: '🍂' },
  { id: 'petals', title: 'Цветение', emoji: '🌸' },
  { id: 'summer', title: 'Лето', emoji: '☀️' },
  { id: 'grid', title: 'Сетка', emoji: '🔷' },
  { id: 'matrix', title: 'Матрица', emoji: '💻' },
  { id: 'wash', title: 'Градиент', emoji: '🎨' },
  { id: 'soft', title: 'Мягкий', emoji: '🌫️' },
  { id: 'plain', title: 'Чистый', emoji: '⬜' },
  { id: 'linen', title: 'Классика', emoji: '📜' },
  { id: 'workshop', title: 'Мастерская', emoji: '⚙️' }
]

export type CardStyle = 'glass' | 'solid' | 'tinted' | 'neon' | 'minimal' | 'raised' | 'clean' | 'skeuo' | 'rusty'
export const CARD_STYLES: { id: CardStyle; title: string }[] = [
  { id: 'glass', title: 'Стекло' }, { id: 'solid', title: 'Сплошные' }, { id: 'tinted', title: 'Цветные' },
  { id: 'neon', title: 'Неон' }, { id: 'minimal', title: 'Контур' }, { id: 'raised', title: 'Объём' },
  { id: 'clean', title: 'Чистые' }, { id: 'skeuo', title: 'Классика' }, { id: 'rusty', title: 'Ржавые' }
]

export type AppFont = 'rounded' | 'standard' | 'mono' | 'serif'
export const FONTS: { id: AppFont; title: string; css: string }[] = [
  { id: 'rounded', title: 'Круглый', css: '"Segoe UI Variable Display", "Nunito", "Segoe UI", system-ui, sans-serif' },
  { id: 'standard', title: 'Строгий', css: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  { id: 'mono', title: 'Код', css: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { id: 'serif', title: 'Книжный', css: 'Georgia, "Cambria", "Times New Roman", serif' }
]

export type Scheme = 'system' | 'light' | 'dark'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export function season(d = new Date()): Season {
  const m = d.getMonth() + 1
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 5) return 'spring'
  if (m <= 8) return 'summer'
  return 'autumn'
}
export const SEASON_BACKDROP: Record<Season, Backdrop> = { winter: 'snow', spring: 'petals', summer: 'summer', autumn: 'leaves' }
export const SEASON_THEME: Record<Season, string> = { winter: 'ice', spring: 'pink', summer: 'lime', autumn: 'autumn' }
export const SEASON_TITLE: Record<Season, string> = { winter: 'зима — снег', spring: 'весна — цветение', summer: 'лето — солнечные блики', autumn: 'осень — листопад' }

export type LookPreset = { id: string; title: string; emoji: string; theme: string; backdrop: Backdrop; card: CardStyle; font: AppFont; radius: number; gradTitle: boolean; scheme: Scheme }

export const PRESETS: LookPreset[] = [
  { id: 'strict', title: 'Строгий', emoji: '📐', theme: 'blue', backdrop: 'soft', card: 'clean', font: 'standard', radius: 0.7, gradTitle: false, scheme: 'system' },
  { id: 'season', title: 'По сезону', emoji: '📅', theme: SEASON_THEME[season()], backdrop: 'seasonal', card: 'glass', font: 'rounded', radius: 1.05, gradTitle: true, scheme: 'system' },
  { id: 'autumn', title: 'Осень', emoji: '🍁', theme: 'autumn', backdrop: 'leaves', card: 'glass', font: 'rounded', radius: 1.1, gradTitle: true, scheme: 'system' },
  { id: 'tech', title: 'Техно', emoji: '🖥️', theme: 'cyber', backdrop: 'grid', card: 'neon', font: 'mono', radius: 0.55, gradTitle: true, scheme: 'dark' },
  { id: 'arctic', title: 'Арктика', emoji: '❄️', theme: 'ice', backdrop: 'snow', card: 'glass', font: 'rounded', radius: 1.0, gradTitle: false, scheme: 'system' },
  { id: 'aurora', title: 'Сияние', emoji: '🌌', theme: 'aurora', backdrop: 'aurora', card: 'glass', font: 'rounded', radius: 1.15, gradTitle: true, scheme: 'dark' },
  { id: 'minimal', title: 'Минимал', emoji: '⚪', theme: 'graphite', backdrop: 'plain', card: 'minimal', font: 'standard', radius: 0.7, gradTitle: false, scheme: 'system' },
  { id: 'paper', title: 'Конспект', emoji: '📒', theme: 'gold', backdrop: 'wash', card: 'raised', font: 'serif', radius: 0.8, gradTitle: false, scheme: 'light' },
  { id: 'classic', title: 'Классика', emoji: '💧', theme: 'blue', backdrop: 'glow', card: 'glass', font: 'rounded', radius: 1.0, gradTitle: false, scheme: 'system' },
  { id: 'hacker', title: 'Хакер', emoji: '🟩', theme: 'lime', backdrop: 'matrix', card: 'neon', font: 'mono', radius: 0.4, gradTitle: true, scheme: 'dark' }
]

export const PACKS = [
  { id: '', title: 'Своя', subtitle: 'Всё настраиваешь сам' },
  { id: 'clear', title: 'Ясный', subtitle: 'Чистый и спокойный: ничего лишнего, всё читается сразу' },
  { id: 'ios6', title: 'Классика', subtitle: 'Глянцевые панели, полоски и ячейки как в 2012-м' },
  { id: 'machinarium', title: 'Механизм', subtitle: 'Свалка в смоге: горы ржавого хлама, дирижабль, туман' }
]

export function applyPreset(p: LookPreset) {
  kv.set('theme.seasonal', p.id === 'season')
  kv.set('theme', p.theme)
  kv.set('bg.style', p.backdrop)
  kv.set('cardStyle', p.card)
  kv.set('ui.font', p.font)
  kv.set('ui.radius', p.radius)
  kv.set('ui.gradTitle', p.gradTitle)
  kv.set('ui.scheme', p.scheme)
  kv.set('look.pack', '')
}

export function applyPack(id: string) {
  kv.set('look.pack', id)
  if (!id) return
  const set: [string, Backdrop, CardStyle, AppFont, number, Scheme] =
    id === 'ios6' ? ['ios6', 'linen', 'skeuo', 'standard', 0.45, 'light']
      : id === 'machinarium' ? ['rust', 'workshop', 'rusty', 'rounded', 0.6, 'light']
        : ['blue', 'soft', 'clean', 'standard', 0.85, 'system']
  kv.set('theme.seasonal', false)
  kv.set('theme', set[0])
  kv.set('bg.style', set[1])
  kv.set('cardStyle', set[2])
  kv.set('ui.font', set[3])
  kv.set('ui.radius', set[4])
  kv.set('ui.scheme', set[5])
  kv.set('ui.gradTitle', false)
  kv.set('bg.intensity', 1)
}

/** Оформление по умолчанию для новых студентов: тёмно-синее, как в первых версиях приложения */
export function firstLook() {
  if (kv.get('look.firstDefault', false)) return
  kv.set('look.firstDefault', true)
  if (kv.get('onboarded', false) || kv.has('theme')) return
  kv.set('theme', 'blue')
  kv.set('bg.style', 'glow')
  kv.set('cardStyle', 'glass')
  kv.set('ui.font', 'rounded')
  kv.set('ui.radius', 1.0)
  kv.set('ui.gradTitle', false)
  kv.set('theme.seasonal', false)
  kv.set('ui.scheme', 'dark')
  kv.set('look.pack', '')
}

export function currentAccent(): Accent {
  const id = kv.get('theme.seasonal', false) ? SEASON_THEME[season()] : kv.get('theme', 'blue')
  return ACCENTS.find(a => a.id === id) || ACCENTS[0]
}

export function currentBackdrop(): Backdrop {
  const b = kv.get<Backdrop>('bg.style', 'glow') as Backdrop
  return b === 'seasonal' ? SEASON_BACKDROP[season()] : b
}

export function hexToRgb(h: string): [number, number, number] {
  const x = h.replace('#', '')
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]
}

export const rgba = (h: string, a: number) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})` }

/** Тема → CSS-переменные на <html> */
export function applyThemeToDocument(dark: boolean) {
  const a = currentAccent()
  const c1 = dark && a.c1d ? a.c1d : a.c1
  const c2 = dark && a.c2d ? a.c2d : a.c2
  const root = document.documentElement
  const font = FONTS.find(f => f.id === kv.get('ui.font', 'rounded')) || FONTS[0]
  const radius = kv.get('ui.radius', 1.0)
  const size = kv.get('ui.textSize', 0)
  root.dataset.scheme = dark ? 'dark' : 'light'
  root.dataset.card = kv.get('cardStyle', 'glass')
  root.dataset.pack = kv.get('look.pack', '')
  root.dataset.motion = kv.get('ui.reduceMotion', false) ? 'reduce' : 'full'
  root.dataset.gradTitle = String(kv.get('ui.gradTitle', false))
  root.style.setProperty('--brand', c1)
  root.style.setProperty('--brand2', c2)
  root.style.setProperty('--brand-rgb', hexToRgb(c1).join(','))
  root.style.setProperty('--brand2-rgb', hexToRgb(c2).join(','))
  root.style.setProperty('--font', font.css)
  root.style.setProperty('--r', String(radius))
  root.style.setProperty('--fs', String([1, 0.92, 1.08, 1.16][size] ?? 1))
}
