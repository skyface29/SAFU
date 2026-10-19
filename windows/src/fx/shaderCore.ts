// Живой фон на видеокарте: один шейдер на всё окно.
//
// «Свет» — переливающийся жидкий градиент в цветах темы, «Сияние» — северное сияние со звёздами.
// Тяжёлые плавные переливы считаются в уменьшенной картинке, а на окно её переносит лёгкий второй проход —
// плавно и в полном разрешении, вместе с мелочами (прожилки, звёзды, зерно), поэтому фон чёткий и почти
// ничего не стоит. Если кадры не успевают (слабая графика, большой монитор), разрешение снижается само,
// а когда снова успевают — возвращается; окно в фоне — реже, свёрнуто — не рисуется совсем.
//
// Здесь только рисование: без окна, документа и настроек — этот же код работает в отдельном потоке
// (shaderWorker.ts, OffscreenCanvas), а если поток недоступен — в интерфейсе (ShaderBackdrop.ts).

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`

// Переливы считаются в маленькой картинке (они плавные — так почти ничего не стоят), а на холст в полный
// размер её переносит второй, лёгкий проход: плавно (бикубически, без «квадратиков» простого растяжения),
// и уже там, в полном разрешении, дорисовываются мелочи — прожилки, звёзды и зерно. Раньше мелочи считались
// тоже в маленькой картинке и растягивались вместе с ней: на экране это выглядело как пиксели
const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

const UNIFORMS = `
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
uniform float uPx;
`

/** Плавная часть: цветные волны «Света» (и f — по нему потом идут прожилки) или занавеси «Сияния» */
const FIELD = `
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

vec3 liquid(vec2 uv, float t, out float f) {
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 0.85 + (uMouse - 0.5) * 0.12;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.045));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.07), fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.06));
  f = fbm(p + 2.0 * r);
  float s = uDark > 0.5 ? 1.0 : 0.6;
  vec3 col = uBase;
  // крупные плавные волны цвета темы: яркая основная, вторая и фиолетовая прослойка
  col = mix(col, uC1 * 0.85, smoothstep(0.42, 0.82, f) * 0.72 * uK * s);
  col = mix(col, uC2 * 0.8, smoothstep(0.5, 0.95, length(q) * 0.9 + r.y * 0.3) * 0.55 * uK * s);
  col = mix(col, uC3 * 0.8, smoothstep(0.62, 0.9, r.x) * 0.35 * uK * s);
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
    // занавес: яркий край снизу, растворяется вверх. Край — не ступенькой, а за пару пикселей картинки:
    // ступенька на растяжении шла лесенкой
    float curtain = exp(-d * d * 90.0) * 0.9 + smoothstep(-1.2, 1.2, d * uRes.y) * exp(-max(d, 0.0) * 5.5) * 0.55;
    float streak = 0.55 + 0.45 * noise(vec2(uv.x * 70.0 + fi * 13.0, t * 0.35 + uv.y * 2.0));
    vec3 c = i == 1 ? uC2 : (i == 2 ? uC3 : uC1);
    col += c * curtain * streak * (0.38 - fi * 0.08) * uK * (uDark > 0.5 ? 1.0 : 0.55);
  }
  return col;
}
`

/** Мелочи — в полном разрешении: прожилки, свет из угла, звёзды, зерно */
const FINISH = `
vec3 finish(vec3 col, float f, vec2 uv, float t) {
  if (uMode > 0.5) {
    if (uDark > 0.5) {
      // звёзды — круглые точки, каждая в своей клетке со сдвигом, мерцают в своём ритме;
      // клетка в точках окна, а не в пикселях холста — звёзды одинаковые при любом качестве
      vec2 cell = gl_FragCoord.xy / max(3.0, 6.0 * uPx);
      vec2 id = floor(cell);
      float h = hash(id);
      vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.3;
      float spot = smoothstep(0.32, 0.0, length(fract(cell) - 0.5 - o));
      float tw = 0.4 + 0.6 * sin(t * (0.8 + h * 2.5) + h * 40.0);
      col += vec3(step(0.989, h) * spot * tw * 0.7 * smoothstep(0.25, 0.85, uv.y));
    }
  } else {
    float s = uDark > 0.5 ? 1.0 : 0.6;
    // тонкие светлые прожилки на гребнях
    col += uC1 * smoothstep(0.02, 0.0, abs(f - 0.6)) * 0.07 * uK * s;
    // мягкий свет из угла, который чуть плывёт за мышью
    vec2 lp = vec2(0.82 + 0.05 * sin(t * 0.21) + (uMouse.x - 0.5) * 0.08, 0.86 + 0.04 * cos(t * 0.17));
    col += uC1 * (1.0 - smoothstep(0.0, 0.85, distance(uv, lp))) * 0.10 * uK;
    // к низу — чуть глубже, текст на карточках читается
    col = mix(col, uBase, (1.0 - uv.y) * 0.25);
  }
  // зерно против полос на плавных переходах — по пикселю экрана, а не растянутыми квадратами
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * 1.5;
  return col;
}
`

/** Первый проход. direct — сразу на холст, со всеми мелочами (запасной путь, если второй проход не завёлся) */
const fieldShader = (direct: boolean) => `
precision mediump float;
${UNIFORMS}${NOISE}${FIELD}${direct ? FINISH : ''}
void main() {
  float f = 0.0;
  vec3 col = uMode > 0.5 ? aurora(vUv, uTime) : liquid(vUv, uTime, f);
  ${direct ? 'gl_FragColor = vec4(finish(col, f, vUv, uTime), 1.0);' : 'gl_FragColor = vec4(col, f);'}
}
`

/** Второй проход: картинка переливов — на весь холст бикубически (4 выборки вместо 16), плюс мелочи */
const OUT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${UNIFORMS}${NOISE}
uniform sampler2D uTex;
uniform vec2 uTexRes;
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
vec4 bicubic(vec2 uv) {
  vec2 p = uv * uTexRes - 0.5;
  vec2 fr = fract(p);
  p -= fr;
  vec4 xc = cubic(fr.x), yc = cubic(fr.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) / uTexRes.xxyy;
  vec4 s0 = texture2D(uTex, off.xz), s1 = texture2D(uTex, off.yz), s2 = texture2D(uTex, off.xw), s3 = texture2D(uTex, off.yw);
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
${FINISH}
void main() {
  vec4 c = bicubic(vUv);
  gl_FragColor = vec4(finish(c.rgb, c.a, vUv, uTime), 1.0);
}
`

export type ShaderMode = 'liquid' | 'aurora'

type Vec3 = [number, number, number]
/** Цвета уже в долях 0…1: перевод из hex — в интерфейсе (поток не тянет за собой темы) */
export type GlColors = { base: Vec3; c1: Vec3; c2: Vec3; c3: Vec3; dark: boolean; k: number }
/** Доли от размера окна в точках: scale — картинка переливов, out — сам холст (с запасом, до которого можно снижать) */
export type CoreOpts = { mode: ShaderMode; scale: number; minScale: number; out: number; minOut: number; fps: number }

/** paused — открыт сайт (фон стоит совсем), unfocused — окно не в фокусе, frozenUntil — листают (на слабом железе) */
export type BackdropState = { paused: boolean; unfocused: boolean; frozenUntil: number }

/** Кадров в секунду, когда окно на экране, но не в фокусе (как и раньше) — теперь без пустых кадров между ними */
export const UNFOCUSED_FPS = 20

const raf: (cb: (now: number) => void) => number = typeof requestAnimationFrame === 'function'
  ? cb => requestAnimationFrame(cb)
  : cb => setTimeout(() => cb(performance.now()), 16) as unknown as number
const cancelRaf = (id: number) => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)

type Uniforms = Record<string, WebGLUniformLocation | null>
const NAMES = ['uRes', 'uTime', 'uMouse', 'uBase', 'uC1', 'uC2', 'uC3', 'uDark', 'uK', 'uMode', 'uPx', 'uTex', 'uTexRes']

export class ShaderCore {
  private gl: WebGLRenderingContext
  /** Первый проход (переливы) и второй (на холст); без второго — первый рисует сразу на холст, как раньше */
  private field: { prog: WebGLProgram; u: Uniforms }
  private out: { prog: WebGLProgram; u: Uniforms; fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null
  private fw = 0
  private fh = 0
  private raf = 0
  /** Ждём следующего кадра по таймеру (когда кадров нужно меньше, чем умеет экран) */
  private timer: ReturnType<typeof setTimeout> | 0 = 0
  private running = false
  /** Окно свёрнуто — не рисуем; «Меньше движения» — один неподвижный кадр */
  private visible: boolean
  private still = false
  /** Когда фон встал (открыт сайт): время шейдера тоже стоит, и после паузы он не «прыгает» */
  private idleSince = 0
  private last = 0
  private t0 = performance.now()
  private mx = 0.5
  private my = 0.5
  private tmx = 0.5
  private tmy = 0.5
  /** Текущее качество: доли для картинки переливов и холста */
  private scale: number
  private outScale: number
  // подстройка: средняя длительность кадра за 2,5 с
  private acc = 0
  private frames = 0
  private checkAt = 0
  /** Сколько проверок подряд кадры успевали с запасом; когда последний раз снижали и поднимали качество */
  private okRuns = 0
  private lastDown = -1e9
  private lastUp = -1e9
  /** Сколько ждать после снижения, прежде чем пробовать вернуть качество (растёт, если возврат не удаётся) */
  private upWait = 5000
  private lost = false

  /** size — размер холста на экране (CSS-пиксели), state — сайт открыт / окно не в фокусе / листают,
   *  onQuality — качество подстроилось (для проверки и отладки) */
  constructor(
    private canvas: HTMLCanvasElement | OffscreenCanvas,
    private opts: CoreOpts,
    colors: GlColors,
    private size: () => { w: number; h: number },
    private state: () => BackdropState,
    private onLost: () => void,
    visible = true,
    private onQuality?: (scale: number, out: number) => void
  ) {
    this.visible = visible
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null
    if (!gl) throw new Error('no webgl')
    this.gl = gl
    this.scale = opts.scale
    this.outScale = opts.out
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    // один треугольник на весь экран
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    try {
      this.field = this.program(fieldShader(false))
      this.out = this.target(this.program(OUT))
    } catch {
      // второй проход не завёлся (старый драйвер) — рисуем одним проходом, как раньше
      this.out = null
      this.field = this.program(fieldShader(true))
    }
    canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener, false)
    this.applyColors(colors)
    this.resize()
  }

  private program(frag: string) {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag))
    // у обоих проходов вершины в одном месте — один и тот же треугольник
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link')
    const u: Uniforms = {}
    for (const n of NAMES) u[n] = gl.getUniformLocation(prog, n)
    return { prog, u }
  }

  /** Картинка для первого прохода: сглаженная (LINEAR) — второй проход берёт из неё по 4 выборки */
  private target(p: { prog: WebGLProgram; u: Uniforms }) {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!ok) throw new Error('fbo')
    gl.useProgram(p.prog)
    gl.uniform1i(p.u.uTex, 0)
    return { ...p, fbo, tex }
  }

  /** Одинаковые настройки — в оба прохода */
  private each(fn: (u: Uniforms) => void) {
    for (const p of this.out ? [this.field, this.out] : [this.field]) {
      this.gl.useProgram(p.prog)
      fn(p.u)
    }
  }

  /** Тема поменялась — те же контекст и шейдер, новые цвета (раньше всё собиралось заново) */
  setColors(c: GlColors) {
    this.applyColors(c)
    this.redrawIfIdle()
  }

  private applyColors(c: GlColors) {
    if (this.lost) return
    const gl = this.gl
    const mode = this.opts.mode === 'aurora' ? 1 : 0
    this.each(u => {
      gl.uniform3fv(u.uBase, c.base)
      gl.uniform3fv(u.uC1, c.c1)
      gl.uniform3fv(u.uC2, c.c2)
      gl.uniform3fv(u.uC3, c.c3)
      gl.uniform1f(u.uDark, c.dark ? 1 : 0)
      gl.uniform1f(u.uK, Math.max(0.2, Math.min(2, c.k)))
      gl.uniform1f(u.uMode, mode)
    })
  }

  /** Другой фон («Свет» ↔ «Сияние»), качество или кадры в секунду */
  setOpts(o: CoreOpts) {
    const prev = this.opts
    this.opts = o
    if (o.mode !== prev.mode && !this.lost) this.each(u => this.gl.uniform1f(u.uMode, o.mode === 'aurora' ? 1 : 0))
    if (o.scale !== prev.scale || o.minScale !== prev.minScale || o.out !== prev.out || o.minOut !== prev.minOut) {
      this.scale = o.scale
      this.outScale = o.out
      this.resize()
      this.onQuality?.(this.scale, this.out ? this.outScale : this.scale)
    }
    if (o.fps !== prev.fps) { this.last = 0; this.resetMeter(performance.now()) }
    this.redrawIfIdle()
  }

  /** Мышь в долях окна (y — снизу вверх): свет чуть плывёт за ней */
  setMouse(x: number, y: number) {
    this.tmx = x
    this.tmy = y
  }

  setVisible(v: boolean) {
    this.visible = v
    if (v) this.start()
    else this.stop(false)
  }

  /** «Меньше движения»: один неподвижный кадр вместо цикла */
  setStill(on: boolean) {
    if (on === this.still) return
    this.still = on
    if (on) { this.stop(false); this.draw(performance.now()) } else this.start()
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
    this.stop()
    this.onLost()
  }

  private redrawIfIdle() {
    if (!this.running || (!this.raf && !this.timer)) this.draw(this.idleSince || performance.now())
  }

  resize = () => {
    const { w: cw, h: ch } = this.size()
    const fw = Math.max(1, Math.round(cw * this.scale))
    const fh = Math.max(1, Math.round(ch * this.scale))
    const s = this.out ? this.outScale : this.scale
    const w = Math.max(1, Math.round(cw * s))
    const h = Math.max(1, Math.round(ch * s))
    // новый размер стирает холст — кадр рисуем сразу, даже если фон сейчас стоит
    let changed = this.canvas.width !== w || this.canvas.height !== h
    if (changed && !this.lost) {
      this.canvas.width = w
      this.canvas.height = h
    }
    if (this.out && (fw !== this.fw || fh !== this.fh) && !this.lost) {
      const gl = this.gl
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.out.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      changed = true
    }
    this.fw = fw
    this.fh = fh
    if (changed) this.draw(this.idleSince || performance.now())
    else this.redrawIfIdle()
  }

  private draw(now: number) {
    if (this.lost) return
    const gl = this.gl
    this.mx += (this.tmx - this.mx) * 0.035
    this.my += (this.tmy - this.my) * 0.035
    const t = (now - this.t0) / 1000
    const pass = (u: Uniforms, w: number, h: number, px: number) => {
      gl.viewport(0, 0, w, h)
      gl.uniform2f(u.uRes, w, h)
      gl.uniform1f(u.uTime, t)
      gl.uniform2f(u.uMouse, this.mx, this.my)
      gl.uniform1f(u.uPx, px)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const { field, out } = this
    if (!out) {
      gl.useProgram(field.prog)
      pass(field.u, this.canvas.width, this.canvas.height, this.scale)
      return
    }
    // переливы — в маленькую картинку, потом она плавно на весь холст вместе с мелочами
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo)
    gl.useProgram(field.prog)
    pass(field.u, this.fw, this.fh, this.scale)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(out.prog)
    gl.uniform2f(out.u.uTexRes, this.fw, this.fh)
    pass(out.u, this.canvas.width, this.canvas.height, this.outScale)
  }

  /** Следующий кадр: сразу по кадру экрана, если нужно 50+ кадров, иначе — подождать таймером (без пустых
   *  кадров экрана: раньше фон просыпался 60–144 раза в секунду, даже когда рисовал 8) */
  private schedule(wait: number) {
    if (!this.running || this.raf || this.timer) return
    if (wait <= 4) { this.raf = raf(this.frame); return }
    this.timer = setTimeout(() => {
      this.timer = 0
      if (this.running) this.raf = raf(this.frame)
    }, wait)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (!this.running) return
    const st = this.state()
    // открыт сайт — фон стоит на последнем кадре и не тратит ничего; wake() запустит его снова
    if (st.paused) { if (!this.idleSince) this.idleSince = now; this.last = 0; return }
    if (this.idleSince) { this.t0 += now - this.idleSince; this.idleSince = 0; this.resetMeter(now) }
    if (st.frozenUntil > now && this.last > 0) { this.schedule(st.frozenUntil - now); return }
    const fps = st.unfocused ? UNFOCUSED_FPS : this.opts.fps
    const interval = 1000 / fps
    // 60 кадров: пропускаем только кадры экрана чаще ~90 в секунду (120–240 Гц). Раньше на 75 Гц фон рисовал
    // через кадр (37 в секунду), считал, что не успевает, и снижал разрешение до самого низкого — отсюда пиксели
    if (fps >= 50 && now - this.last < interval - 6) { this.schedule(0); return }
    const dt = this.last ? now - this.last : interval
    this.last = now
    this.draw(now)
    if (!st.unfocused) this.measure(now, dt, interval)
    else this.resetMeter(now)
    this.schedule(fps >= 50 ? 0 : interval - 8)
  }

  /** Кадры не успевают (в полтора раза дольше нужного) — снижаем разрешение; снова успевают с запасом — возвращаем.
   *  Раньше разрешение только снижалось: одна тяжёлая минута (много вкладок) — и фон мутный до перезапуска */
  private measure(now: number, dt: number, interval: number) {
    this.acc += dt
    this.frames++
    if (now <= this.checkAt) return
    const avg = this.acc / Math.max(1, this.frames)
    if (this.frames > 20) {
      if (avg > interval * 1.5) {
        // только что подняли и снова не успеваем — следующую попытку откладываем вдвое дольше (до минуты)
        if (now - this.lastUp < 6000) this.upWait = Math.min(60_000, this.upWait * 2)
        if (this.lower()) this.lastDown = now
        this.okRuns = 0
      } else if (avg < interval * 1.3) {
        if (++this.okRuns >= 2 && now - this.lastDown > this.upWait && this.raise()) { this.lastUp = now; this.okRuns = 0 }
      } else {
        this.okRuns = 0
      }
    }
    this.resetMeter(now)
  }

  /** Сначала мельче считаем переливы (почти незаметно), и только потом уменьшаем сам холст */
  private lower() {
    const o = this.opts
    if (this.scale > o.minScale + 1e-3) this.scale = Math.max(o.minScale, this.scale * 0.8)
    else if (this.out && this.outScale > o.minOut + 1e-3) this.outScale = Math.max(o.minOut, this.outScale * 0.85)
    else return false
    this.resize()
    this.onQuality?.(this.scale, this.out ? this.outScale : this.scale)
    return true
  }

  /** Обратно — в обратном порядке: сначала холст, потом переливы */
  private raise() {
    const o = this.opts
    if (this.out && this.outScale < o.out - 1e-3) this.outScale = Math.min(o.out, this.outScale / 0.85)
    else if (this.scale < o.scale - 1e-3) this.scale = Math.min(o.scale, this.scale / 0.8)
    else return false
    this.resize()
    this.onQuality?.(this.scale, this.out ? this.outScale : this.scale)
    return true
  }

  private resetMeter(now: number) {
    this.acc = 0
    this.frames = 0
    this.checkAt = now + 2500
  }

  start() {
    if (this.running || this.lost || this.still || !this.visible) return
    this.running = true
    this.last = 0
    this.checkAt = performance.now() + 3000
    this.schedule(0)
  }

  /** Состояние поменялось (сайт закрыли, окно в фокусе) — проснуться, если стояли */
  wake() {
    if (this.running && !this.raf && !this.timer) this.schedule(0)
  }

  /** final — фон убран совсем: видеопамять отдаём сразу, не дожидаясь сборщика мусора */
  stop(final = true) {
    this.running = false
    cancelRaf(this.raf)
    clearTimeout(this.timer)
    this.raf = 0
    this.timer = 0
    if (final) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener)
      if (!this.lost) this.gl.getExtension('WEBGL_lose_context')?.loseContext()
      this.lost = true
    }
  }
}
