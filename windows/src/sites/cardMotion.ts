// Движение карточки сайта — на видеокарте, а не кадрами в JavaScript.
//
// Раньше анимацию вела библиотека: каждый кадр считался в главном потоке, и если в этот момент
// приложение было занято (перерисовка, сохранение, снимок страницы), кадры пропадали — отсюда рывки.
// Теперь — Web Animations API с пружиной, записанной в кривую linear(): браузер сам двигает слой
// в потоке композитора, и занятость интерфейса на плавность уже не влияет.

export type Pose = { x: number; y: number; sx: number; sy: number; o: number }
export const REST: Pose = { x: 0, y: 0, sx: 1, sy: 1, o: 1 }

export const poseCSS = (t: Pose) => `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) scale(${t.sx.toFixed(4)}, ${t.sy.toFixed(4)})`

/** Затухающая пружина → кривая CSS linear() и длительность, за которую она успокаивается */
export function springEasing(stiffness: number, damping: number, mass = 1): { easing: string; duration: number } {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const x = (t: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta)
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  }
  // до отклонения в 0,2 % — дальше глазом не видно
  const end = Math.min(1.2, Math.log(500) / (Math.min(zeta, 1) * w0))
  const n = 48
  const pts: string[] = []
  for (let i = 0; i <= n; i++) pts.push(x((end * i) / n).toFixed(4))
  pts[n] = '1'
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(end * 1000) }
}

export const OPEN = springEasing(250, 30, 1)
export const CLOSE = springEasing(380, 38, 1)
export const BACK = springEasing(460, 38, 1)

export class CardMotion {
  private anims: Animation[] = []
  constructor(private el: HTMLElement) {}

  /** Остановить то, что едет, оставив карточку там, где она сейчас на экране */
  private freeze() {
    if (!this.anims.length) return
    const cs = getComputedStyle(this.el)
    const t = cs.transform
    const o = cs.opacity
    for (const a of this.anims) a.cancel()
    this.anims = []
    this.el.style.transform = t === 'none' ? '' : t
    this.el.style.opacity = o
  }

  /** Сразу поставить (тянут мышью, начальное положение) */
  set(p: Pose) {
    for (const a of this.anims) a.cancel()
    this.anims = []
    this.el.style.transform = poseCSS(p)
    this.el.style.opacity = String(p.o)
  }

  /** Плавно переехать; true — доехала, false — её перебили другим движением */
  to(p: Pose, curve: { easing: string; duration: number }, fade: { duration?: number; delay?: number } = {}): Promise<boolean> {
    this.freeze()
    const from = this.el.style.transform || 'none'
    const fromO = this.el.style.opacity || '1'
    const to = poseCSS(p)
    // итог — сразу в стиль: когда анимация закончится, карточка так и останется
    this.el.style.transform = to
    this.el.style.opacity = String(p.o)
    const move = this.el.animate([{ transform: from }, { transform: to }], { duration: curve.duration, easing: curve.easing })
    const fadeAnim = fromO !== String(p.o)
      ? this.el.animate([{ opacity: fromO }, { opacity: String(p.o) }], { duration: fade.duration ?? 160, delay: fade.delay ?? 0, easing: 'ease-out', fill: 'backwards' })
      : null
    this.anims = fadeAnim ? [move, fadeAnim] : [move]
    return move.finished.then(() => true, () => false)
  }
}

/** Плавно сменить прозрачность слоя (заставка, снимок) — тоже на видеокарте */
export function fadeTo(el: HTMLElement | null, to: number, duration: number, delay = 0): Promise<void> {
  if (!el) return Promise.resolve()
  const from = getComputedStyle(el).opacity
  for (const a of el.getAnimations()) a.cancel()
  el.style.opacity = String(to)
  if (from === String(to)) return Promise.resolve()
  return el.animate([{ opacity: from }, { opacity: String(to) }], { duration, delay, easing: 'ease-out', fill: 'backwards' }).finished.then(() => undefined, () => undefined)
}
