// Обёртка над Telegram.WebApp: кнопки «Назад» и главная кнопка, вибрация, ссылки.
// Вне Telegram (разработка в браузере) всё это тихо ничего не делает, а кнопки рисуются на странице.

type Btn = {
  show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void
  setText?(t: string): void; showProgress?(leaveActive?: boolean): void; hideProgress?(): void; enable?(): void; disable?(): void
  setParams?(p: Record<string, unknown>): void
}

type WebApp = {
  initData: string
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string } }
  colorScheme: 'light' | 'dark'
  platform: string
  version: string
  ready(): void
  expand(): void
  isVersionAtLeast(v: string): boolean
  disableVerticalSwipes?(): void
  setHeaderColor?(c: string): void
  setBackgroundColor?(c: string): void
  BackButton: Btn
  MainButton: Btn
  HapticFeedback?: { impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void; selectionChanged(): void }
  showConfirm?(msg: string, cb: (ok: boolean) => void): void
  showAlert?(msg: string, cb?: () => void): void
  openTelegramLink?(url: string): void
  openLink?(url: string): void
  close?(): void
  onEvent?(e: string, cb: () => void): void
}

const w = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp
export const tg = w && w.initData ? w : null
export const inTelegram = !!tg

export function init() {
  if (!tg) return
  tg.ready()
  tg.expand()
  if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()
  if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor?.('secondary_bg_color'); tg.setBackgroundColor?.('secondary_bg_color') }
  document.documentElement.dataset.platform = tg.platform
  document.documentElement.dataset.tg = tg.colorScheme
  document.documentElement.style.colorScheme = tg.colorScheme
  tg.onEvent?.('themeChanged', () => { document.documentElement.dataset.tg = tg.colorScheme; document.documentElement.style.colorScheme = tg.colorScheme })
}

export const initData = () => tg?.initData ?? ''
export const startParam = () => tg?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get('startapp') ?? ''

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error')
}

export function confirm(msg: string): Promise<boolean> {
  if (tg?.showConfirm && tg.isVersionAtLeast('6.2')) return new Promise(r => tg.showConfirm!(msg, r))
  return Promise.resolve(window.confirm(msg))
}

export function alert(msg: string) {
  if (tg?.showAlert && tg.isVersionAtLeast('6.2')) tg.showAlert(msg)
  else window.alert(msg)
}

export function openTelegram(url: string) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url)
  else window.open(url, '_blank')
}

export function openLink(url: string) {
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank')
}

/** Кнопка «Назад» в шапке Telegram */
export function backButton(cb: (() => void) | null) {
  if (!tg || !tg.isVersionAtLeast('6.1')) return () => {}
  if (!cb) { tg.BackButton.hide(); return () => {} }
  tg.BackButton.show()
  tg.BackButton.onClick(cb)
  return () => { tg.BackButton.offClick(cb); tg.BackButton.hide() }
}

/** Большая кнопка внизу экрана Telegram */
export function mainButton(text: string | null, cb: () => void, opts: { busy?: boolean; disabled?: boolean } = {}) {
  if (!tg) return () => {}
  const b = tg.MainButton
  if (!text) { b.hide(); return () => {} }
  b.setText?.(text)
  if (opts.disabled) b.disable?.(); else b.enable?.()
  if (opts.busy) b.showProgress?.(false); else b.hideProgress?.()
  b.show()
  b.onClick(cb)
  return () => { b.offClick(cb); b.hide() }
}
