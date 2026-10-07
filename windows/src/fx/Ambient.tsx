// Живой фон под всем приложением. Один canvas, рисуется только пока окно на экране.
import { useEffect, useRef } from 'react'
import { usePref } from '../lib/kv'
import { type Backdrop, currentBackdrop, rgba } from '../lib/theme'

type P = { x: number; y: number; z: number; vx: number; vy: number; r: number; a: number; va: number; hue: number; life: number; ch?: string }

export function Ambient({ dark, c1, c2 }: { dark: boolean; c1: string; c2: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [style] = usePref('bg.style', 'glow')
  const [seasonal] = usePref('theme.seasonal', false)
  const [intensity] = usePref('bg.intensity', 1)
  const [reduce] = usePref('ui.reduceMotion', false)
  const mode: Backdrop = currentBackdrop()
  void style; void seasonal

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let W = 0, H = 0, dpr = 1
    let raf = 0
    let running = true
    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5
    const parts: P[] = []
    const t0 = performance.now()

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      W = cv.clientWidth; H = cv.clientHeight
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const k = Math.max(0.2, Math.min(2, intensity))
    const countFor: Partial<Record<Backdrop, number>> = { snow: 140, leaves: 34, petals: 46, summer: 26, matrix: 0, workshop: 50, glow: 0, aurora: 0, grid: 0 }
    const n = Math.round((countFor[mode] ?? 0) * k)
    const leafHues = [18, 28, 38, 8, 45]
    const spawn = (initial: boolean): P => {
      const z = rnd(0.3, 1)
      const p: P = { x: rnd(0, W), y: initial ? rnd(0, H) : rnd(-60, -10), z, vx: 0, vy: 0, r: 0, a: rnd(0, Math.PI * 2), va: rnd(-0.02, 0.02), hue: 0, life: 1 }
      if (mode === 'snow') { p.r = rnd(1, 3.4) * z; p.vy = rnd(0.3, 1.1) * z; p.vx = rnd(-0.2, 0.2) }
      if (mode === 'leaves') { p.r = rnd(7, 13) * z; p.vy = rnd(0.5, 1.2) * z; p.vx = rnd(-0.6, 0.6); p.hue = leafHues[Math.floor(Math.random() * leafHues.length)]; p.va = rnd(-0.04, 0.04) }
      if (mode === 'petals') { p.r = rnd(5, 9) * z; p.vy = rnd(0.4, 0.9) * z; p.vx = rnd(-0.3, 0.8); p.hue = rnd(330, 355); p.va = rnd(-0.05, 0.05) }
      if (mode === 'summer') { p.r = rnd(30, 120) * z; p.y = rnd(0, H); p.vx = rnd(-0.15, 0.15); p.vy = rnd(-0.15, 0.15); p.hue = rnd(35, 60) }
      if (mode === 'workshop') { p.r = rnd(40, 140); p.y = rnd(0, H); p.vx = rnd(0.1, 0.4); p.vy = rnd(-0.05, 0.05) }
      return p
    }
    for (let i = 0; i < n; i++) parts.push(spawn(true))

    // матрица: колонки символов
    const glyphs = 'アカサタナハマヤラワ0123456789САФУ$#@'.split('')
    let cols: number[] = []
    const fontSize = 16
    if (mode === 'matrix') cols = Array.from({ length: Math.ceil(W / fontSize) }, () => rnd(-50, 0))

    const onMove = (e: MouseEvent) => { tmx = e.clientX / W; tmy = e.clientY / H }
    const onVis = () => {
      const vis = document.visibilityState === 'visible'
      if (vis && !running) { running = true; raf = requestAnimationFrame(frame) }
      if (!vis) running = false
    }
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    document.addEventListener('visibilitychange', onVis)

    const bgBase = dark ? '#0a0d14' : '#eef2f8'

    function blob(x: number, y: number, r: number, color: string) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }

    function frame(now: number) {
      if (!running) return
      const t = (now - t0) / 1000
      mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04
      const px = (mx - 0.5) * 30, py = (my - 0.5) * 30

      if (mode === 'matrix') {
        ctx.fillStyle = dark ? 'rgba(5,8,10,0.12)' : 'rgba(238,242,248,0.16)'
        ctx.fillRect(0, 0, W, H)
        ctx.font = `${fontSize}px Consolas, monospace`
        for (let i = 0; i < cols.length; i++) {
          const ch = glyphs[Math.floor(Math.random() * glyphs.length)]
          const y = cols[i] * fontSize
          ctx.fillStyle = Math.random() > 0.96 ? '#e6ffe6' : rgba(c1, dark ? 0.85 : 0.6)
          ctx.fillText(ch, i * fontSize, y)
          if (y > H && Math.random() > 0.975) cols[i] = 0
          cols[i] += 0.5 + (i % 3) * 0.15
        }
        raf = requestAnimationFrame(frame)
        return
      }

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = bgBase
      ctx.fillRect(0, 0, W, H)

      // общее мягкое свечение темы — почти у всех фонов
      if (mode !== 'plain' && mode !== 'linen') {
        const a = dark ? 0.22 : 0.16
        blob(W * 0.78 + px + Math.sin(t * 0.13) * 60, H * 0.18 + py + Math.cos(t * 0.11) * 40, Math.max(W, H) * 0.55, rgba(c1, a * k))
        blob(W * 0.18 - px + Math.cos(t * 0.09) * 70, H * 0.85 - py + Math.sin(t * 0.12) * 50, Math.max(W, H) * 0.5, rgba(c2, a * 0.75 * k))
      }

      if (mode === 'glow') {
        for (let i = 0; i < 4; i++) {
          const ang = t * (0.05 + i * 0.02) + i * 1.7
          blob(W * (0.5 + Math.cos(ang) * 0.35) + px * (i + 1) * 0.3, H * (0.5 + Math.sin(ang * 1.3) * 0.32) + py * (i + 1) * 0.3,
            Math.min(W, H) * (0.22 + i * 0.05), rgba(i % 2 ? c2 : c1, (dark ? 0.16 : 0.1) * k))
        }
      }

      if (mode === 'aurora') {
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
        for (let band = 0; band < 3; band++) {
          ctx.beginPath()
          const baseY = H * (0.22 + band * 0.12)
          ctx.moveTo(0, baseY)
          for (let x = 0; x <= W; x += 24) {
            const y = baseY + Math.sin(x * 0.004 + t * (0.4 + band * 0.15) + band) * 50 + Math.sin(x * 0.011 - t * 0.3) * 18 + py
            ctx.lineTo(x, y)
          }
          ctx.lineTo(W, baseY + 260); ctx.lineTo(0, baseY + 260); ctx.closePath()
          const g = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 260)
          const col = band === 1 ? c2 : band === 2 ? '#7c3aed' : c1
          g.addColorStop(0, rgba(col, 0))
          g.addColorStop(0.3, rgba(col, (dark ? 0.22 : 0.12) * k))
          g.addColorStop(1, rgba(col, 0))
          ctx.fillStyle = g
          ctx.fill()
        }
        ctx.globalCompositeOperation = 'source-over'
        // звёзды
        if (dark) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          for (let i = 0; i < 70; i++) {
            const x = (i * 137.5) % W, y = (i * 91.3) % (H * 0.7)
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i))
            ctx.globalAlpha = tw * 0.7
            ctx.fillRect(x, y, 1.4, 1.4)
          }
          ctx.globalAlpha = 1
        }
      }

      if (mode === 'grid') {
        ctx.save()
        ctx.strokeStyle = rgba(c1, (dark ? 0.28 : 0.2) * k)
        ctx.lineWidth = 1
        const horizon = H * 0.42 + py
        const vpX = W / 2 + px * 3
        for (let i = -24; i <= 24; i++) {
          ctx.beginPath()
          ctx.moveTo(vpX, horizon)
          ctx.lineTo(vpX + i * 120, H + 40)
          ctx.stroke()
        }
        const off = (t * 40) % 60
        for (let j = 0; j < 22; j++) {
          const d = j * 60 + off
          const y = horizon + Math.pow(d / (H * 1.2), 1.8) * (H - horizon) * 1.6
          if (y > H) break
          ctx.globalAlpha = Math.min(1, (y - horizon) / 120)
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        }
        ctx.globalAlpha = 1
        const g = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 20)
        g.addColorStop(0, rgba(c2, 0)); g.addColorStop(1, rgba(c2, (dark ? 0.35 : 0.2) * k))
        ctx.fillStyle = g
        ctx.fillRect(0, horizon - 120, W, 140)
        ctx.restore()
      }

      if (mode === 'workshop') {
        // ржавая свалка: силуэты гор хлама и шестерёнки в тумане
        ctx.fillStyle = dark ? '#1c1810' : '#c9b48a'
        ctx.fillRect(0, 0, W, H)
        blob(W * 0.7 + px, H * 0.3, W * 0.6, dark ? 'rgba(200,140,60,0.18)' : 'rgba(255,235,190,0.5)')
        ctx.fillStyle = dark ? '#2b2416' : '#8f7650'
        ctx.beginPath(); ctx.moveTo(0, H)
        for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H * 0.72 + Math.sin(x * 0.013) * 40 + Math.sin(x * 0.041) * 18 - px * 0.5)
        ctx.lineTo(W, H); ctx.fill()
        const gear = (cx: number, cy: number, R: number, rot: number) => {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
          ctx.fillStyle = dark ? 'rgba(80,60,35,0.6)' : 'rgba(110,80,45,0.35)'
          ctx.beginPath()
          for (let i = 0; i < 12; i++) {
            const a1 = (i / 12) * Math.PI * 2, a2 = a1 + Math.PI / 12
            ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); ctx.lineTo(Math.cos(a2) * R * 1.18, Math.sin(a2) * R * 1.18)
          }
          ctx.closePath(); ctx.fill()
          ctx.globalCompositeOperation = 'destination-out'
          ctx.beginPath(); ctx.arc(0, 0, R * 0.35, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        }
        gear(W * 0.15 + px, H * 0.62, 70, t * 0.2)
        gear(W * 0.15 + px + 118, H * 0.62 - 40, 45, -t * 0.31)
        gear(W * 0.86 - px, H * 0.68, 90, t * 0.15)
        // дирижабль
        const ax = ((t * 12) % (W + 300)) - 150
        ctx.fillStyle = dark ? 'rgba(120,95,60,0.55)' : 'rgba(90,65,40,0.45)'
        ctx.beginPath(); ctx.ellipse(ax, H * 0.2 + Math.sin(t * 0.5) * 8, 70, 22, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillRect(ax - 14, H * 0.2 + 20 + Math.sin(t * 0.5) * 8, 28, 9)
      }

      // частицы
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        p.x += p.vx + Math.sin(t * 0.7 + i) * 0.15 * p.z + (mode === 'snow' || mode === 'leaves' || mode === 'petals' ? (mx - 0.5) * 0.6 * p.z : 0)
        p.y += p.vy
        p.a += p.va
        if (mode === 'summer' || mode === 'workshop') {
          if (p.x < -p.r) p.x = W + p.r; if (p.x > W + p.r) p.x = -p.r
          if (p.y < -p.r) p.y = H + p.r; if (p.y > H + p.r) p.y = -p.r
        } else if (p.y > H + 20 || p.x < -40 || p.x > W + 40) {
          parts[i] = spawn(false)
          continue
        }
        if (mode === 'snow') {
          ctx.fillStyle = dark ? `rgba(255,255,255,${0.35 + p.z * 0.5})` : `rgba(120,150,200,${0.25 + p.z * 0.45})`
          ctx.beginPath(); ctx.arc(p.x + px * p.z, p.y + py * p.z, p.r, 0, Math.PI * 2); ctx.fill()
        } else if (mode === 'leaves' || mode === 'petals') {
          ctx.save()
          ctx.translate(p.x + px * p.z, p.y + py * p.z)
          ctx.rotate(p.a)
          ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.a * 2)))
          if (mode === 'leaves') {
            ctx.fillStyle = `hsla(${p.hue}, 85%, ${dark ? 52 : 48}%, ${0.55 + p.z * 0.35})`
            ctx.beginPath()
            ctx.moveTo(0, -p.r)
            ctx.quadraticCurveTo(p.r * 0.9, -p.r * 0.2, 0, p.r)
            ctx.quadraticCurveTo(-p.r * 0.9, -p.r * 0.2, 0, -p.r)
            ctx.fill()
            ctx.strokeStyle = `hsla(${p.hue}, 70%, 30%, .5)`; ctx.lineWidth = 0.8
            ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(0, p.r); ctx.stroke()
          } else {
            ctx.fillStyle = `hsla(${p.hue}, 90%, ${dark ? 80 : 75}%, ${0.5 + p.z * 0.4})`
            ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
        } else if (mode === 'summer') {
          blob(p.x + px * p.z * 2, p.y + py * p.z * 2, p.r, `hsla(${p.hue}, 100%, 70%, ${(dark ? 0.08 : 0.14) * k})`)
        } else if (mode === 'workshop') {
          blob(p.x, p.y, p.r, dark ? 'rgba(170,150,120,0.05)' : 'rgba(255,250,235,0.18)')
        }
      }

      if (!reduce) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode, dark, c1, c2, intensity, reduce])

  const cssLayer = mode === 'wash'
    ? { background: `linear-gradient(120deg, ${rgba(c1, dark ? 0.35 : 0.25)}, ${rgba(c2, dark ? 0.3 : 0.22)}, ${rgba(c1, dark ? 0.2 : 0.15)})`, backgroundSize: '300% 300%', animation: 'gradient-move 18s ease infinite' }
    : mode === 'linen'
      ? { background: dark ? 'repeating-linear-gradient(90deg, #1c2028 0 3px, #20252e 3px 6px)' : 'repeating-linear-gradient(90deg, #c5ccd6 0 3px, #cbd2dc 3px 6px)' }
      : mode === 'soft'
        ? { background: dark ? 'radial-gradient(1200px 700px at 70% 0%, rgba(255,255,255,.04), transparent), #0d1017' : 'radial-gradient(1200px 700px at 70% 0%, #fff, transparent), #eef1f6' }
        : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      {cssLayer && <div style={{ position: 'absolute', inset: 0, ...cssLayer }} />}
    </div>
  )
}
