// Живой фон: качество снижается, когда кадры не успевают, и возвращается, когда снова успевают;
// на экранах 75 и 144 Гц фон не считает себя медленным (раньше на 75 Гц разрешение падало до самого низкого)
import { test } from 'node:test'
import assert from 'node:assert/strict'

// кадры экрана — по нашей команде, со своим временем
const queue: ((now: number) => void)[] = []
;(globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => queue.push(cb)
;(globalThis as any).cancelAnimationFrame = () => undefined

/** WebGL без видеокарты: всё успешно, константы — их же имена; запоминаем размер картинки переливов */
function fakeCanvas(fbo = true) {
  const field = { w: 0, h: 0 }
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_, k: string) {
      if (k === k.toUpperCase()) return k
      if (k === 'checkFramebufferStatus') return () => fbo ? 'FRAMEBUFFER_COMPLETE' : 'FRAMEBUFFER_UNSUPPORTED'
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true
      if (k === 'getExtension') return () => null
      if (k === 'texImage2D') return (...a: unknown[]) => { field.w = a[3] as number; field.h = a[4] as number }
      return () => ({})
    }
  })
  const canvas = { width: 0, height: 0, getContext: () => gl, addEventListener() {}, removeEventListener() {} }
  return { canvas, field }
}

const colors = { base: [0, 0, 0], c1: [1, 0, 0], c2: [0, 1, 0], c3: [0, 0, 1], dark: true, k: 1 } as const
const opts = { mode: 'liquid' as const, scale: 0.42, minScale: 0.24, out: 1, minOut: 0.7, fps: 60 }

async function setup(fbo = true) {
  const { ShaderCore } = await import('../src/fx/shaderCore')
  const { canvas, field } = fakeCanvas(fbo)
  const core = new ShaderCore(canvas as any, opts, colors as any, () => ({ w: 1000, h: 600 }), () => ({ paused: false, unfocused: false, frozenUntil: 0 }), () => undefined, true)
  let now = performance.now()
  queue.length = 0
  core.start()
  /** seconds секунд кадров экрана через каждые step мс */
  const run = (seconds: number, step: number) => {
    const end = now + seconds * 1000
    while (now < end) {
      now += step
      const cbs = queue.splice(0)
      for (const cb of cbs) cb(now)
    }
  }
  return { core, canvas, field, run }
}

test('медленные кадры — сначала мельче переливы, потом холст; снова быстрые — качество возвращается полностью', async () => {
  const { canvas, field, run } = await setup()
  run(5, 1000 / 60)
  assert.deepEqual([field.w, canvas.width], [420, 1000])
  // 25 кадров в секунду вместо 60
  run(20, 40)
  assert.equal(field.w, 240, 'переливы — до нижней границы')
  assert.ok(canvas.width < 1000 && canvas.width >= 700, 'холст — меньше, но не ниже границы: ' + canvas.width)
  // нагрузка ушла (закрыли вкладки)
  run(90, 1000 / 60)
  assert.deepEqual([field.w, canvas.width], [420, 1000])
})

test('75 и 144 Гц: фон рисует каждый кадр (или через один на 144) и качество не снижает', async () => {
  for (const hz of [75, 144, 120, 60]) {
    const { canvas, field, run } = await setup()
    run(30, 1000 / hz)
    assert.deepEqual([field.w, canvas.width], [420, 1000], hz + ' Гц')
  }
})

test('качество то падает, то нет — повторные попытки реже, без постоянных скачков', async () => {
  const { field, run } = await setup()
  let changes = 0
  let prev = field.w
  // по 4 с тяжёлых и лёгких кадров по очереди, две минуты
  for (let i = 0; i < 15; i++) {
    run(4, 40)
    if (field.w !== prev) { changes++; prev = field.w }
    run(4, 1000 / 60)
    if (field.w !== prev) { changes++; prev = field.w }
  }
  assert.ok(changes < 14, 'смен качества: ' + changes)
})

test('второй проход не завёлся (старый драйвер) — фон рисуется одним проходом, как раньше, и тоже подстраивается', async () => {
  const { canvas, run } = await setup(false)
  run(5, 1000 / 60)
  assert.equal(canvas.width, 420)
  run(20, 40)
  assert.equal(canvas.width, 240)
  run(90, 1000 / 60)
  assert.equal(canvas.width, 420)
})
