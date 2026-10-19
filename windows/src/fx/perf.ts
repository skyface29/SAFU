// Насколько богато рисовать: под железо компьютера.
//
// «Авто» смотрит на видеокарту (по имени из WebGL и по тому, работает ли ускорение), число ядер и память.
//   high — дискретная видеокарта или мощный процессор: живой фон в полном качестве, наклон карточек;
//   mid  — встроенная графика (Intel UHD/Iris, Radeon Vega): тот же фон в меньшем разрешении;
//   low  — без ускорения видеокартой или совсем слабый компьютер: фон 30 кадров, замирает при прокрутке.
// Можно выбрать и руками: Оформление → «Качество анимаций». Сам фон ещё и подстраивается на ходу:
// если кадры не успевают, он рисует в меньшем разрешении.

import { create } from 'zustand'
import { kv } from '../lib/kv'

export type FxTier = 'high' | 'mid' | 'low'
export type FxChoice = 'auto' | FxTier

type FxInfo = { gpu: string; accelerated: boolean; detected: FxTier }

export const useFx = create<FxInfo & { tier: FxTier }>(() => ({ gpu: '', accelerated: true, detected: 'mid', tier: 'mid' }))

/** Текущий уровень — для мест, где хук не нужен (быстрые обработчики мыши) */
export const fxNow = () => useFx.getState().tier

let probed: { gpu: string; webgl: boolean } | null = null

/** Имя видеокарты из WebGL (один раз): «ANGLE (NVIDIA GeForce RTX 3060 …)», «Intel(R) UHD Graphics 620» */
export function probeGpu(): { gpu: string; webgl: boolean } {
  if (probed) return probed
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return (probed = { gpu: '', webgl: false })
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    probed = { gpu, webgl: true }
  } catch {
    probed = { gpu: '', webgl: false }
  }
  return probed
}

/** Уровень по железу */
export function classify(gpu: string, accelerated: boolean, cores: number, memoryGb: number): FxTier {
  const g = gpu.toLowerCase()
  if (!accelerated || /swiftshader|llvmpipe|software|basic render|microsoft basic/.test(g)) return 'low'
  if (cores > 0 && cores <= 2) return 'low'
  if (memoryGb > 0 && memoryGb < 3) return 'low'
  // дискретные: GeForce/RTX/GTX/Quadro, Radeon RX/Pro, Arc
  if (/nvidia|geforce|rtx|gtx|quadro|radeon\s*(rx|pro|r9)|\barc\b|apple m\d/.test(g)) return 'high'
  // старая встроенная графика Intel (HD 4000–530) — экономнее
  if (/intel.*hd graphics\s*(\d{3,4})?/.test(g) && !/uhd|iris|xe/.test(g)) return cores >= 8 ? 'mid' : 'low'
  if (cores >= 12) return 'high'
  return 'mid'
}

/** Определить при запуске. gpuInfo — что знает главный процесс (безопасный режим, растр на видеокарте) */
export function initFx(gpuInfo?: { safe?: boolean; compositing?: string } | null) {
  const { gpu, webgl } = probeGpu()
  const accelerated = webgl && !gpuInfo?.safe && !/disabled|software|unavailable/i.test(gpuInfo?.compositing || '')
  const nav = navigator as Navigator & { deviceMemory?: number }
  const detected = classify(gpu, accelerated, nav.hardwareConcurrency || 0, nav.deviceMemory || 0)
  useFx.setState({ gpu, accelerated, detected })
  applyFx()
}

/** Выбор человека или «Авто» → уровень; в CSS — как data-fx на <html> */
export function applyFx() {
  const choice = kv.get<FxChoice>('fx.quality', 'auto') as FxChoice
  const s = useFx.getState()
  // без ускорения видеокартой «Максимум» не тянет — не выше среднего
  let tier: FxTier = choice === 'auto' ? s.detected : choice
  if (!s.accelerated && tier === 'high') tier = 'mid'
  useFx.setState({ tier })
  document.documentElement.dataset.fx = tier
}

/** Параметры живого фона для уровня: доля разрешения окна и потолок кадров.
 *  glass — включено стекло на карточках: каждый кадр фона заставляет пересчитать размытие всех карточек.
 *  Мощная видеокарта тянет это как есть; встроенной фон рисуется в 30 кадров (на глаз мягкие переливы
 *  не меняются) и стоит, пока листают, — иначе прокрутка со стеклом дёргается */
export function backdropBudget(tier: FxTier, glass = false): { scale: number; minScale: number; fps: number; pauseOnScroll: boolean } {
  const b = tier === 'high' ? { scale: 0.6, minScale: 0.3, fps: 60, pauseOnScroll: false }
    : tier === 'mid' ? { scale: 0.42, minScale: 0.22, fps: 60, pauseOnScroll: false }
      : { scale: 0.28, minScale: 0.16, fps: 30, pauseOnScroll: true }
  return glass && tier !== 'high' ? { ...b, fps: Math.min(b.fps, 30), pauseOnScroll: true } : b
}
