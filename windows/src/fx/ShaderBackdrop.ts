// Живой фон «Свет» и «Сияние» для интерфейса. Рисует его отдельный поток (shaderWorker.ts): холст передаётся
// туда целиком, а интерфейсу остаётся только сообщать размер, мышь и состояние. Где поток с холстом
// недоступен, тот же шейдер (shaderCore.ts) рисуется прямо в интерфейсе — как раньше.
import { hexToRgb } from '../lib/theme'
import { ShaderCore, type BackdropState, type CoreOpts, type GlColors } from './shaderCore'
import type { FromWorker, ToWorker, WireState } from './shaderWorker'

export { UNFOCUSED_FPS, type BackdropState, type ShaderMode } from './shaderCore'

export type Colors = { base: string; c1: string; c2: string; c3: string; dark: boolean; k: number }

/** Живой фон: настройки меняются на ходу, без нового контекста и сборки шейдера */
export interface LiveBackdrop {
  update(opts: CoreOpts, colors: Colors): void
  /** «Меньше движения»: один неподвижный кадр */
  setStill(on: boolean): void
  /** Состояние (сайт, фокус, прокрутка) могло поменяться */
  wake(): void
  stop(): void
}

const vec = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}
const glColors = (c: Colors): GlColors => ({ base: vec(c.base), c1: vec(c.c1), c2: vec(c.c2), c3: vec(c.c3), dark: c.dark, k: c.k })
const visibleNow = () => document.visibilityState === 'visible'
/** Текущее качество — на холсте (data-q="переливы/холст"): видно в отладке и в проверках */
const markQuality = (canvas: HTMLCanvasElement) => (scale: number, out: number) => { canvas.dataset.q = scale.toFixed(2) + '/' + out.toFixed(2) }

/** Можно ли рисовать фон в отдельном потоке */
export const canUseWorker = () =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype

type Init = { opts: CoreOpts; colors: Colors; state: () => BackdropState; still: boolean }

/** Фон в отдельном потоке. onLost — WebGL не завёлся или потерян (тогда Ambient попробует иначе) */
class WorkerBackdrop implements LiveBackdrop {
  private w: Worker
  private sent: WireState
  private sentFrozenUntil = 0
  private still: boolean

  constructor(private canvas: HTMLCanvasElement, private init: Init, onLost: () => void) {
    const off = canvas.transferControlToOffscreen()
    this.w = new Worker(new URL('./shaderWorker.ts', import.meta.url), { type: 'module' })
    let lost = false
    const fail = () => { if (!lost) { lost = true; onLost() } }
    const mark = markQuality(canvas)
    this.w.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data?.type === 'lost') fail()
      else if (e.data?.type === 'quality') mark(e.data.scale, e.data.out)
    }
    this.w.onerror = fail
    this.still = init.still
    const st = init.state()
    this.sent = this.wire(st)
    this.sentFrozenUntil = st.frozenUntil
    this.post({ type: 'init', canvas: off, opts: init.opts, colors: glColors(init.colors), size: this.size(), state: this.sent, visible: visibleNow(), still: init.still }, [off])
    window.addEventListener('mousemove', this.onMove, { passive: true })
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVis)
  }

  private post(m: ToWorker, transfer: Transferable[] = []) { this.w.postMessage(m, transfer) }
  private size = () => ({ w: this.canvas.clientWidth, h: this.canvas.clientHeight })
  private wire = (s: BackdropState): WireState => ({ paused: s.paused, unfocused: s.unfocused, frozenFor: Math.max(0, s.frozenUntil - performance.now()) })

  private onMove = (e: MouseEvent) => {
    // фон стоит — мышь ему не нужна
    if (this.sent.paused || this.still) return
    this.post({ type: 'mouse', x: e.clientX / Math.max(1, window.innerWidth), y: 1 - e.clientY / Math.max(1, window.innerHeight) })
  }
  private onResize = () => this.post({ type: 'size', size: this.size() })
  private onVis = () => this.post({ type: 'visible', visible: visibleNow() })

  update(opts: CoreOpts, colors: Colors) { this.post({ type: 'update', opts, colors: glColors(colors) }) }
  setStill(on: boolean) {
    if (on === this.still) return
    this.still = on
    this.post({ type: 'still', still: on })
  }

  /** Сообщаем потоку, только когда что-то правда поменялось: прокрутка продлевает паузу не чаще раза в 100 мс */
  wake() {
    const st = this.init.state()
    const frozenMoved = st.frozenUntil > this.sentFrozenUntil + 100 || (st.frozenUntil === 0 && this.sentFrozenUntil !== 0)
    if (st.paused === this.sent.paused && st.unfocused === this.sent.unfocused && !frozenMoved) return
    this.sent = this.wire(st)
    this.sentFrozenUntil = st.frozenUntil
    this.post({ type: 'state', state: this.sent })
  }

  stop() {
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVis)
    this.w.terminate()
  }
}

/** Тот же фон прямо в интерфейсе — если поток с холстом недоступен или в нём не завёлся WebGL */
class MainBackdrop implements LiveBackdrop {
  private core: ShaderCore

  constructor(canvas: HTMLCanvasElement, init: Init, onLost: () => void) {
    this.core = new ShaderCore(canvas, init.opts, glColors(init.colors), () => ({ w: canvas.clientWidth, h: canvas.clientHeight }), init.state, onLost, visibleNow(), markQuality(canvas))
    this.core.setStill(init.still)
    this.core.start()
    window.addEventListener('mousemove', this.onMove, { passive: true })
    window.addEventListener('resize', this.core.resize)
    document.addEventListener('visibilitychange', this.onVis)
  }

  private onMove = (e: MouseEvent) => this.core.setMouse(e.clientX / Math.max(1, window.innerWidth), 1 - e.clientY / Math.max(1, window.innerHeight))
  private onVis = () => this.core.setVisible(visibleNow())

  update(opts: CoreOpts, colors: Colors) { this.core.setOpts(opts); this.core.setColors(glColors(colors)) }
  setStill(on: boolean) { this.core.setStill(on) }
  wake() { this.core.wake() }
  stop() {
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('resize', this.core.resize)
    document.removeEventListener('visibilitychange', this.onVis)
    this.core.stop()
  }
}

/** Живой фон на холсте. worker — рисовать в отдельном потоке (холст после этого переходит туда навсегда) */
export function createBackdrop(canvas: HTMLCanvasElement, init: Init, onLost: () => void, worker: boolean): LiveBackdrop {
  return worker ? new WorkerBackdrop(canvas, init, onLost) : new MainBackdrop(canvas, init, onLost)
}
