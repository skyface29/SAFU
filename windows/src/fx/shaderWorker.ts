// Живой фон в своём потоке: шейдер рисует сюда переданный холст (OffscreenCanvas), и его кадры не делят
// время с интерфейсом — ни запуск, ни переходы между разделами, ни прокрутка не ждут фон, и фон не ждёт их.
// Окна и документа здесь нет: размер, мышь, свёрнутость и «открыт сайт» присылает ShaderBackdrop.ts.
import { ShaderCore, type BackdropState, type CoreOpts, type GlColors } from './shaderCore'

export type WireState = { paused: boolean; unfocused: boolean; frozenFor: number }
export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; opts: CoreOpts; colors: GlColors; size: { w: number; h: number }; state: WireState; visible: boolean; still: boolean }
  | { type: 'size'; size: { w: number; h: number } }
  | { type: 'mouse'; x: number; y: number }
  | { type: 'state'; state: WireState }
  | { type: 'visible'; visible: boolean }
  | { type: 'update'; opts: CoreOpts; colors: GlColors }
  | { type: 'still'; still: boolean }

const post = (m: { type: 'lost' | 'ready' }) => (self as unknown as Worker).postMessage(m)
let core: ShaderCore | null = null
let size = { w: 1, h: 1 }
const st: BackdropState = { paused: false, unfocused: false, frozenUntil: 0 }
// «листают до» приходит как остаток: часы потока и интерфейса начинаются в разное время
const setState = (s: WireState) => {
  st.paused = s.paused
  st.unfocused = s.unfocused
  st.frozenUntil = s.frozenFor > 0 ? performance.now() + s.frozenFor : 0
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.type === 'init') {
    size = m.size
    setState(m.state)
    try {
      core = new ShaderCore(m.canvas, m.opts, m.colors, () => size, () => st, () => post({ type: 'lost' }), m.visible)
    } catch {
      post({ type: 'lost' })
      return
    }
    core.setStill(m.still)
    core.start()
    post({ type: 'ready' })
    return
  }
  if (!core) return
  if (m.type === 'size') { size = m.size; core.resize() }
  else if (m.type === 'mouse') core.setMouse(m.x, m.y)
  else if (m.type === 'state') { setState(m.state); core.wake() }
  else if (m.type === 'visible') core.setVisible(m.visible)
  else if (m.type === 'update') { core.setOpts(m.opts); core.setColors(m.colors) }
  else if (m.type === 'still') core.setStill(m.still)
}
