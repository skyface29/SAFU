// Живой фон на видеокарте: один шейдер на всё окно.
//
// «Свет» — переливающийся жидкий градиент в цветах темы, «Сияние» — северное сияние со звёздами.
// Рисуется в уменьшенном разрешении (плавные переливы на глаз не отличить) и растягивается на окно,
// поэтому почти ничего не стоит. Если кадры не успевают (слабая графика, большой монитор), разрешение
// снижается само; окно в фоне — реже, свёрнуто — не рисуется совсем.

import { hexToRgb } from '../lib/theme'

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uBase;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uDark;
uniform float uK;
uniform float uMode;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

vec3 liquid(vec2 uv, float t) {
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 0.85 + (uMouse - 0.5) * 0.12;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.045));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.07), fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.06));
  float f = fbm(p + 2.0 * r);
  float s = uDark > 0.5 ? 1.0 : 0.6;
  vec3 col = uBase;
  // крупные плавные волны цвета темы: яркая основная, вторая и фиолетовая прослойка
  col = mix(col, uC1 * 0.85, smoothstep(0.42, 0.82, f) * 0.72 * uK * s);
  col = mix(col, uC2 * 0.8, smoothstep(0.5, 0.95, length(q) * 0.9 + r.y * 0.3) * 0.55 * uK * s);
  col = mix(col, uC3 * 0.8, smoothstep(0.62, 0.9, r.x) * 0.35 * uK * s);
  // тонкие светлые прожилки на гребнях
  col += uC1 * smoothstep(0.02, 0.0, abs(f - 0.6)) * 0.07 * uK * s;
  // мягкий свет из угла, который чуть плывёт за мышью
  vec2 lp = vec2(0.82 + 0.05 * sin(t * 0.21) + (uMouse.x - 0.5) * 0.08, 0.86 + 0.04 * cos(t * 0.17));
  col += uC1 * (1.0 - smoothstep(0.0, 0.85, distance(uv, lp))) * 0.10 * uK;
  // к низу — чуть глубже, текст на карточках читается
  col = mix(col, uBase, (1.0 - uv.y) * 0.25);
  return col;
}

vec3 aurora(vec2 uv, float t) {
  vec3 col = mix(uBase * (uDark > 0.5 ? 0.85 : 1.0), uBase + uC1 * 0.04, uv.y);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * (1.4 + fi * 0.35) + t * (0.025 + fi * 0.012) + (uMouse.x - 0.5) * 0.06;
    float wave = fbm(vec2(x * 1.8, fi * 3.1 + t * 0.045));
    float y0 = 0.66 - fi * 0.09 + 0.10 * sin(uv.x * 2.6 + t * 0.18 + fi * 1.7) + (wave - 0.5) * 0.28;
    float d = uv.y - y0;
    // занавес: яркий край снизу, растворяется вверх
    float curtain = exp(-d * d * 90.0) * 0.9 + step(0.0, d) * exp(-d * 5.5) * 0.55;
    float streak = 0.55 + 0.45 * noise(vec2(uv.x * 70.0 + fi * 13.0, t * 0.35 + uv.y * 2.0));
    vec3 c = i == 1 ? uC2 : (i == 2 ? uC3 : uC1);
    col += c * curtain * streak * (0.38 - fi * 0.08) * uK * (uDark > 0.5 ? 1.0 : 0.55);
  }
  if (uDark > 0.5) {
    // звёзды — круглые точки в своих клетках, мерцают каждая в своём ритме
    vec2 cell = uv * uRes / 3.0;
    vec2 id = floor(cell);
    float h = hash(id);
    float dot = smoothstep(0.45, 0.0, length(fract(cell) - 0.5));
    float tw = 0.4 + 0.6 * sin(t * (0.8 + h * 2.5) + h * 40.0);
    col += vec3(step(0.992, h) * dot * tw * 0.7 * smoothstep(0.25, 0.85, uv.y));
  }
  return col;
}

void main() {
  vec3 col = uMode > 0.5 ? aurora(vUv, uTime) : liquid(vUv, uTime);
  // зерно против полос на плавных переходах
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0 * 1.5;
  gl_FragColor = vec4(col, 1.0);
}
`

export type ShaderMode = 'liquid' | 'aurora'

type Colors = { base: string; c1: string; c2: string; c3: string; dark: boolean; k: number }

const toVec = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}

/** paused — открыт сайт (фон стоит совсем), unfocused — окно не в фокусе, frozenUntil — листают (на слабом железе) */
export type BackdropState = { paused: boolean; unfocused: boolean; frozenUntil: number }

/** Кадров в секунду, когда окно на экране, но не в фокусе (как и раньше) — теперь без пустых кадров между ними */
export const UNFOCUSED_FPS = 20

export class ShaderBackdrop {
  private gl: WebGLRenderingContext
  private prog: WebGLProgram
  private u: Record<string, WebGLUniformLocation | null> = {}
  private raf = 0
  /** Ждём следующего кадра по таймеру (когда кадров нужно меньше, чем умеет экран) */
  private timer = 0
  private running = false
  /** Когда фон встал (открыт сайт): время шейдера тоже стоит, и после паузы он не «прыгает» */
  private idleSince = 0
  private last = 0
  private t0 = performance.now()
  private mx = 0.5
  private my = 0.5
  private tmx = 0.5
  private tmy = 0.5
  private scale: number
  // подстройка: средняя длительность кадра
  private acc = 0
  private frames = 0
  private checkAt = 0
  private lost = false

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: { mode: ShaderMode; scale: number; minScale: number; fps: number; colors: Colors; state: () => BackdropState },
    private onLost: () => void
  ) {
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) throw new Error('no webgl')
    this.gl = gl
    this.scale = opts.scale
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link')
    this.prog = prog
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    // один треугольник на весь экран
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    for (const n of ['uRes', 'uTime', 'uMouse', 'uBase', 'uC1', 'uC2', 'uC3', 'uDark', 'uK', 'uMode']) this.u[n] = gl.getUniformLocation(prog, n)
    this.setColors(opts.colors)
    canvas.addEventListener('webglcontextlost', this.onContextLost, false)
    window.addEventListener('mousemove', this.onMove, { passive: true })
    window.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVis)
    this.resize()
  }

  setColors(c: Colors) {
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.uniform3fv(this.u.uBase, toVec(c.base))
    gl.uniform3fv(this.u.uC1, toVec(c.c1))
    gl.uniform3fv(this.u.uC2, toVec(c.c2))
    gl.uniform3fv(this.u.uC3, toVec(c.c3))
    gl.uniform1f(this.u.uDark, c.dark ? 1 : 0)
    gl.uniform1f(this.u.uK, Math.max(0.2, Math.min(2, c.k)))
    gl.uniform1f(this.u.uMode, this.opts.mode === 'aurora' ? 1 : 0)
    this.opts.colors = c
    if (!this.running || (!this.raf && !this.timer)) this.draw(performance.now())
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
    this.stop()
    this.onLost()
  }

  private onMove = (e: MouseEvent) => {
    this.tmx = e.clientX / Math.max(1, window.innerWidth)
    this.tmy = 1 - e.clientY / Math.max(1, window.innerHeight)
  }

  private onVis = () => {
    if (document.visibilityState === 'visible') this.start()
    else this.stop(false)
  }

  resize = () => {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.scale))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.scale))
    // новый размер стирает холст — кадр рисуем сразу, даже если фон сейчас стоит
    const changed = this.canvas.width !== w || this.canvas.height !== h
    if (changed) {
      this.canvas.width = w
      this.canvas.height = h
      this.gl.viewport(0, 0, w, h)
    }
    if (changed || !this.running || (!this.raf && !this.timer)) this.draw(this.idleSince || performance.now())
  }

  private draw(now: number) {
    if (this.lost) return
    const gl = this.gl
    this.mx += (this.tmx - this.mx) * 0.035
    this.my += (this.tmy - this.my) * 0.035
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.u.uTime, (now - this.t0) / 1000)
    gl.uniform2f(this.u.uMouse, this.mx, this.my)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /** Следующий кадр: сразу по кадру экрана, если нужно 50+ кадров, иначе — подождать таймером (без пустых
   *  кадров экрана: раньше фон просыпался 60–144 раза в секунду, даже когда рисовал 8) */
  private schedule(wait: number) {
    if (!this.running || this.raf || this.timer) return
    if (wait <= 4) { this.raf = requestAnimationFrame(this.frame); return }
    this.timer = window.setTimeout(() => {
      this.timer = 0
      if (this.running) this.raf = requestAnimationFrame(this.frame)
    }, wait)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (!this.running) return
    const st = this.opts.state()
    // открыт сайт — фон стоит на последнем кадре и не тратит ничего; wake() запустит его снова
    if (st.paused) { if (!this.idleSince) this.idleSince = now; this.last = 0; return }
    if (this.idleSince) { this.t0 += now - this.idleSince; this.idleSince = 0; this.resetMeter(now) }
    if (st.frozenUntil > now && this.last > 0) { this.schedule(st.frozenUntil - now); return }
    const fps = st.unfocused ? UNFOCUSED_FPS : this.opts.fps
    const interval = 1000 / fps
    if (fps >= 50) {
      if (now - this.last < interval - 2) { this.schedule(0); return }
    }
    const dt = this.last ? now - this.last : interval
    this.last = now
    this.draw(now)
    // кадры не успевают (больше чем в полтора раза дольше нужного) — рисуем в меньшем разрешении
    if (!st.unfocused) {
      this.acc += dt
      this.frames++
      if (now > this.checkAt) {
        const avg = this.acc / Math.max(1, this.frames)
        if (this.frames > 20 && avg > interval * 1.5 && this.scale > this.opts.minScale) {
          this.scale = Math.max(this.opts.minScale, this.scale * 0.8)
          this.resize()
        }
        this.resetMeter(now)
      }
    } else {
      this.resetMeter(now)
    }
    this.schedule(fps >= 50 ? 0 : interval - 8)
  }

  private resetMeter(now: number) {
    this.acc = 0
    this.frames = 0
    this.checkAt = now + 2500
  }

  start() {
    if (this.running || this.lost || document.visibilityState !== 'visible') return
    this.running = true
    this.last = 0
    this.checkAt = performance.now() + 3000
    this.schedule(0)
  }

  /** Состояние поменялось (сайт закрыли, окно в фокусе) — проснуться, если стояли */
  wake() {
    if (this.running && !this.raf && !this.timer) this.schedule(0)
  }

  stop(final = true) {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.timer)
    this.raf = 0
    this.timer = 0
    if (final) {
      window.removeEventListener('mousemove', this.onMove)
      window.removeEventListener('resize', this.resize)
      document.removeEventListener('visibilitychange', this.onVis)
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    }
  }

  /** Один неподвижный кадр («Меньше движения») */
  still() {
    this.draw(performance.now())
  }
}
