// Разбор binary plist (bplist00) — настройки из резервной копии iPhone
export type PlistValue = null | boolean | number | string | Uint8Array | Date | PlistValue[] | { [k: string]: PlistValue }

export function parseBinaryPlist(buf: Uint8Array): PlistValue {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const magic = new TextDecoder().decode(buf.subarray(0, 8))
  if (!magic.startsWith('bplist0')) throw new Error('Это не binary plist')
  const t = buf.length - 32
  const offSize = dv.getUint8(t + 6), refSize = dv.getUint8(t + 7)
  const num = Number(dv.getBigUint64(t + 8)), top = Number(dv.getBigUint64(t + 16)), tableOff = Number(dv.getBigUint64(t + 24))
  const readN = (pos: number, size: number) => { let v = 0; for (let i = 0; i < size; i++) v = v * 256 + buf[pos + i]; return v }
  const offsets = Array.from({ length: num }, (_, i) => readN(tableOff + i * offSize, offSize))
  const cache = new Map<number, PlistValue>()

  const parse = (ref: number): PlistValue => {
    if (cache.has(ref)) return cache.get(ref)!
    const pos = offsets[ref]
    const marker = buf[pos]
    const hi = marker >> 4, lo = marker & 0xf
    const len = (): [number, number] => {
      if (lo !== 0xf) return [lo, pos + 1]
      const m = buf[pos + 1], size = 1 << (m & 0xf)
      return [readN(pos + 2, size), pos + 2 + size]
    }
    let v: PlistValue
    switch (hi) {
      case 0x0: v = lo === 8 ? false : lo === 9 ? true : null; break
      case 0x1: {
        const size = 1 << lo
        v = size === 8 ? Number(dv.getBigInt64(pos + 1)) : readN(pos + 1, size)
        break
      }
      case 0x2: v = lo === 2 ? dv.getFloat32(pos + 1) : dv.getFloat64(pos + 1); break
      case 0x3: v = new Date((dv.getFloat64(pos + 1) + 978307200) * 1000); break
      case 0x4: { const [n, s] = len(); v = buf.slice(s, s + n); break }
      case 0x5: { const [n, s] = len(); v = new TextDecoder('ascii').decode(buf.subarray(s, s + n)); break }
      case 0x6: {
        const [n, s] = len()
        let str = ''
        for (let i = 0; i < n; i++) str += String.fromCharCode(dv.getUint16(s + i * 2))
        v = str
        break
      }
      case 0x8: v = readN(pos + 1, lo + 1); break
      case 0xa: { const [n, s] = len(); v = Array.from({ length: n }, (_, i) => parse(readN(s + i * refSize, refSize))); break }
      case 0xd: {
        const [n, s] = len()
        const o: Record<string, PlistValue> = {}
        for (let i = 0; i < n; i++) {
          const k = parse(readN(s + i * refSize, refSize))
          o[String(k)] = parse(readN(s + (n + i) * refSize, refSize))
        }
        v = o
        break
      }
      default: v = null
    }
    cache.set(ref, v)
    return v
  }
  return parse(top)
}
