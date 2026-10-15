// QR-код без сторонних библиотек: байтовый режим, коррекция M, версия и маска подбираются сами.
// Алгоритм — по стандарту ISO/IEC 18004 (так же устроены все генераторы QR).

type Ecl = 'L' | 'M' | 'Q' | 'H'

const ECL_INDEX: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 }
const ECL_FORMAT: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 }

// длина кода коррекции на блок и число блоков: [уровень][версия], версия 0 не используется
const ECC_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
]
const NUM_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
]

function rawModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}

function dataCodewords(ver: number, ecl: Ecl): number {
  const e = ECL_INDEX[ecl]
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver]
}

// ---------- Рида — Соломона над GF(256) ----------

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0)
  r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root)
      if (j + 1 < degree) r[j] ^= r[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return r
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (r.shift() as number)
    r.push(0)
    for (let i = 0; i < r.length; i++) r[i] ^= gfMul(divisor[i], factor)
  }
  return r
}

// ---------- построение матрицы ----------

export type QrMatrix = { size: number; dark: boolean[][] }

export function encodeQr(text: string, ecl: Ecl = 'M'): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text))

  // наименьшая версия, куда поместится текст
  let ver = 1
  for (; ver <= 40; ver++) {
    const countBits = ver <= 9 ? 8 : 16
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break
  }
  if (ver > 40) throw new Error('Слишком длинный текст для QR-кода')

  // биты: режим «байты», длина, данные, конец, выравнивание, заполнители
  const bits: number[] = []
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1) }
  put(0b0100, 4)
  put(bytes.length, ver <= 9 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  const capacity = dataCodewords(ver, ecl) * 8
  put(0, Math.min(4, capacity - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    data.push(b)
  }

  // блоки с кодами коррекции и их чередование
  const e = ECL_INDEX[ecl]
  const numBlocks = NUM_BLOCKS[e][ver]
  const eccLen = ECC_PER_BLOCK[e][ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const numShort = numBlocks - (raw % numBlocks)
  const shortLen = Math.floor(raw / numBlocks)
  const divisor = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1)
    const dat = data.slice(k, k + len)
    k += len
    const ecc = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j][i])
    }
  }

  const size = ver * 4 + 17
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true }

  // полосы синхронизации
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  // три больших квадрата по углам
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      const x = cx + dx, y = cy + dy
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  // малые квадраты выравнивания
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2
    const pos = new Array<number>(n)
    pos[0] = 6
    for (let i = n - 1, p = size - 7; i >= 1; i--, p -= step) pos[i] = p
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  // служебные биты формата (сначала заглушка — чтобы данные их обошли) и версии
  const format = (mask: number) => {
    const d = (ECL_FORMAT[ecl] << 3) | mask
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const b = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  format(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const b = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) !== 0
      const a = size - 11 + (i % 3), c = Math.floor(i / 3)
      set(a, c, dark); set(c, a, dark)
    }
  }

  // данные змейкой снизу вверх по парам столбцов
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!fn[y][x] && i < codewords.length * 8) {
          mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
          i++
        }
      }
    }
  }

  // маска: пробуем все восемь, берём ту, что лучше читается
  const masked = (mask: number): boolean[][] => {
    const out = mod.map(r => r.slice())
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (fn[y][x]) continue
      let inv: boolean
      switch (mask) {
        case 0: inv = (x + y) % 2 === 0; break
        case 1: inv = y % 2 === 0; break
        case 2: inv = x % 3 === 0; break
        case 3: inv = (x + y) % 3 === 0; break
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
        case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break
        case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break
        default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0
      }
      if (inv) out[y][x] = !out[y][x]
    }
    return out
  }
  // биты формата пишутся в служебные клетки, маска их не трогает — поэтому формат ставим перед каждой пробой
  let bestMask = 0
  let bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    format(m)
    const s = penalty(masked(m), size)
    if (s < bestScore) { bestScore = s; bestMask = m }
  }
  format(bestMask)
  return { size, dark: masked(bestMask) }
}

/** Штраф за плохо читаемые узоры (правила стандарта) */
function penalty(g: boolean[][], size: number): number {
  let score = 0
  // 1. длинные ряды одного цвета
  for (let y = 0; y < size; y++) {
    let run = 1
    for (let x = 1; x <= size; x++) {
      if (x < size && g[y][x] === g[y][x - 1]) run++
      else { if (run >= 5) score += run - 2; run = 1 }
    }
  }
  for (let x = 0; x < size; x++) {
    let run = 1
    for (let y = 1; y <= size; y++) {
      if (y < size && g[y][x] === g[y - 1][x]) run++
      else { if (run >= 5) score += run - 2; run = 1 }
    }
  }
  // 2. квадраты 2×2 одного цвета
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = g[y][x]
    if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) score += 3
  }
  // 3. узоры, похожие на угловые квадраты
  const pat = [true, false, true, true, true, false, true]
  const at = (get: (k: number) => boolean | undefined, k: number) => {
    for (let t = 0; t < 7; t++) if (get(k + t) !== pat[t]) return false
    const light = (a: number, b: number) => { for (let t = a; t < b; t++) { const v = get(t); if (v === true) return false } return true }
    return light(k - 4, k) || light(k + 7, k + 11)
  }
  for (let y = 0; y < size; y++) for (let x = 0; x + 7 <= size; x++) {
    if (at(k => (k < 0 || k >= size ? false : g[y][k]), x)) score += 40
  }
  for (let x = 0; x < size; x++) for (let y = 0; y + 7 <= size; y++) {
    if (at(k => (k < 0 || k >= size ? false : g[k][x]), y)) score += 40
  }
  // 4. баланс тёмного и светлого
  let dark = 0
  for (const r of g) for (const c of r) if (c) dark++
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  score += Math.max(0, k) * 10
  return score
}

/** SVG-путь тёмных клеток (по одной на модуль, с полем `margin` вокруг) */
export function qrPath(m: QrMatrix, margin = 4): string {
  let d = ''
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
    if (m.dark[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`
  }
  return d
}
