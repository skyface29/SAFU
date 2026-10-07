// Салюты и конфетти: конец пар, конец недели, сделанные задачи, праздники, день рождения.
// Перенесено из Sources/Celebrations.swift; салют рисуется на canvas с физикой частиц.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { motion, AnimatePresence } from 'framer-motion'
import { kv } from '../lib/kv'
import { type ScheduleData, slotsOn } from '../lib/schedule'
import { startOfDay, addDays, weekday, plural } from '../lib/date'
import { notify, type Note } from '../lib/notify'

type Style = { kind: 'confetti' } | { kind: 'emoji'; list: string[] } | { kind: 'fireworks'; big: boolean }
type Celebration = { id: number; title: string; subtitle: string; style: Style; force?: boolean }

const useCeleb = create<{ current: Celebration | null }>(() => ({ current: null }))
let counter = 0

const flag = (k: string) => kv.get(k, true)
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
function once(id: string) {
  const k = `fx.shown.${id}.${dayKey()}`
  if (kv.get(k, false)) return false
  kv.set(k, true)
  return true
}

export const HOLIDAYS: { id: string; m: number; d: number; title: string; subtitle: string; style: Style }[] = [
  { id: 'ny', m: 1, d: 1, title: 'С Новым годом! 🎄', subtitle: 'Пусть сессия сдастся сама', style: { kind: 'emoji', list: ['🎄', '❄️', '✨', '🎆'] } },
  { id: 'xmas', m: 1, d: 7, title: 'С Рождеством! ⭐️', subtitle: 'Тепла и уюта', style: { kind: 'emoji', list: ['⭐️', '❄️', '🕯️'] } },
  { id: 'tatiana', m: 1, d: 25, title: 'С Днём студента! 🎓', subtitle: 'Татьянин день — это твой праздник', style: { kind: 'emoji', list: ['🎓', '📚', '🎉', '✨'] } },
  { id: 'feb23', m: 2, d: 23, title: 'С 23 Февраля! 🎖️', subtitle: 'Сил и стойкости', style: { kind: 'emoji', list: ['🎖️', '⭐️'] } },
  { id: 'mar8', m: 3, d: 8, title: 'С 8 Марта! 💐', subtitle: 'Весны и хорошего настроения', style: { kind: 'emoji', list: ['💐', '🌷', '🌸', '✨'] } },
  { id: 'cosmos', m: 4, d: 12, title: 'С Днём космонавтики! 🚀', subtitle: 'Поехали!', style: { kind: 'emoji', list: ['🚀', '🪐', '⭐️'] } },
  { id: 'may1', m: 5, d: 1, title: 'С Первомаем! 🌷', subtitle: 'Весна, труд и отдых', style: { kind: 'emoji', list: ['🌷', '🌼', '☀️'] } },
  { id: 'may9', m: 5, d: 9, title: 'С Днём Победы', subtitle: 'Помним', style: { kind: 'emoji', list: ['🕊️', '🌷'] } },
  { id: 'jun12', m: 6, d: 12, title: 'С Днём России!', subtitle: 'Хороших выходных', style: { kind: 'confetti' } },
  { id: 'sep1', m: 9, d: 1, title: 'С Днём знаний! 📚', subtitle: 'Новый семестр — новый уровень', style: { kind: 'emoji', list: ['📚', '✏️', '🎓', '🍁'] } },
  { id: 'prog', m: 9, d: 13, title: 'С Днём программиста! 💻', subtitle: '256-й день года — свой праздник', style: { kind: 'emoji', list: ['💻', '⌨️', '🐛', '✨'] } },
  { id: 'nov4', m: 11, d: 4, title: 'С Днём народного единства!', subtitle: 'Отдыхай', style: { kind: 'confetti' } },
  { id: 'students', m: 11, d: 17, title: 'С Международным днём студента! 🎓', subtitle: 'Учёба подождёт пять минут', style: { kind: 'emoji', list: ['🎓', '🎉', '📚'] } },
  { id: 'security', m: 11, d: 30, title: 'С Днём защиты информации! 🔐', subtitle: 'Твой профессиональный праздник', style: { kind: 'emoji', list: ['🔐', '🛡️', '💾', '✨'] } },
  { id: 'nye', m: 12, d: 31, title: 'Последний день года! 🎆', subtitle: 'Ты хорошо поработал', style: { kind: 'emoji', list: ['🎆', '🎄', '✨', '🥂'] } }
]

function holidayToday(now = new Date()) {
  const m = now.getMonth() + 1, d = now.getDate()
  const y = now.getFullYear()
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  return HOLIDAYS.find(h => h.id === 'prog' ? m === 9 && d === (leap ? 12 : 13) : h.m === m && h.d === d) || null
}

function weekDone(day: number, d: ScheduleData) {
  const wd = weekday(day)
  if (wd >= 7) return true
  for (let i = 1; i <= 7 - wd; i++) if (slotsOn(addDays(startOfDay(day), i), d).length) return false
  return true
}

export const celebrations = {
  fire(c: Omit<Celebration, 'id'>) {
    if (!flag('fx.on') && !c.force) return
    const cur = { ...c, id: ++counter }
    useCeleb.setState({ current: cur })
    const dur = c.style.kind === 'fireworks' ? (c.style.big ? 7500 : 6000) : 4200
    setTimeout(() => { if (useCeleb.getState().current?.id === cur.id) useCeleb.setState({ current: null }) }, dur)
  },
  checkOnOpen(d: ScheduleData) {
    if (!flag('fx.on')) return
    const now = new Date()
    const b = kv.get<number | null>('user.birthday', null)
    if (flag('fx.birthday') && b) {
      const bd = new Date(b)
      if (bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth() && once('bday')) {
        const name = kv.get('user.first', '')
        celebrations.fire({ title: `С днём рождения${name ? ', ' + name : ''}! 🎂`, subtitle: 'Пусть все дедлайны будут далеко, а автоматы — близко', style: { kind: 'emoji', list: ['🎂', '🎉', '🎈', '✨'] } })
        return
      }
    }
    const h = holidayToday(now)
    if (flag('fx.holidays') && h && once('hol-' + h.id)) { celebrations.fire({ title: h.title, subtitle: h.subtitle, style: h.style }); return }
    const today = startOfDay(Date.now())
    const slots = slotsOn(today, d)
    const last = slots[slots.length - 1]
    if (!last || Date.now() < last.end || Date.now() > last.end + 6 * 3600_000) return
    const restEmpty = weekDone(today, d)
    if (flag('fx.weekEnd') && restEmpty && once('week')) {
      celebrations.fire({ title: 'Неделя закрыта! 🎆', subtitle: 'Салют в твою честь — свободен до понедельника', style: { kind: 'fireworks', big: true } })
    } else if (flag('fx.dayEnd') && !restEmpty && once('day')) {
      celebrations.fire({ title: 'Пары всё! 🎉', subtitle: `${slots.length} ${plural(slots.length, 'пара', 'пары', 'пар')} позади. Можно выдохнуть`, style: { kind: 'fireworks', big: false } })
    }
  },
  scheduleNotifications(d: ScheduleData) {
    if (!flag('fx.on') || !(flag('fx.dayEnd') || flag('fx.weekEnd'))) { notify.cancel('fx.end.'); return }
    const list: Note[] = []
    for (let i = 0; i < 8; i++) {
      const day = addDays(startOfDay(Date.now()), i)
      const slots = slotsOn(day, d)
      const last = slots[slots.length - 1]
      if (!last || last.end <= Date.now()) continue
      const isWeek = weekDone(day, d)
      if (isWeek ? !flag('fx.weekEnd') : !flag('fx.dayEnd')) continue
      list.push({
        id: `fx.end.${i}`, at: last.end + 20_000, title: isWeek ? 'Неделя закрыта! 🎆' : 'Пары всё! 🎉',
        body: isWeek ? 'Свободен до понедельника — открой, там салют в твою честь' : `${slots.length} ${plural(slots.length, 'пара', 'пары', 'пар')} позади. Можно выдохнуть`,
        route: 'home'
      })
    }
    notify.schedule('fx.end.', list)
  },
  taskDone(title: string, left: number) {
    if (!flag('fx.tasks')) return
    celebrations.fire({ title: left === 0 ? 'Все задачи сделаны! 🏆' : 'Готово! ✅', subtitle: left === 0 ? 'Ни одного хвоста — красота' : `«${title}» закрыта. Осталось ${left}`, style: { kind: 'confetti' } })
  },
  examPassed(subject: string, grade: string) {
    if (!flag('fx.exams')) return
    celebrations.fire({ title: 'Сдано! 🎓', subtitle: `${subject} — ${grade}`, style: { kind: 'emoji', list: ['🎓', '🎉', '⭐️', '🔥'] } })
  },
  test() { celebrations.fire({ title: 'Вот так это выглядит 🎆', subtitle: 'Салют и конфетти на месте', style: { kind: 'fireworks', big: true }, force: true }) },
  welcome() { celebrations.fire({ title: 'Всё готово! 🎉', subtitle: 'Добро пожаловать в САФУ', style: { kind: 'fireworks', big: false }, force: true }) }
}

export function CelebrationOverlay() {
  const c = useCeleb(s => s.current)
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} style={{ position: 'fixed', inset: 0, zIndex: 800, pointerEvents: 'none' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {c.style.kind === 'fireworks' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />}
          <FxCanvas style={c.style} />
          <motion.div onClick={() => useCeleb.setState({ current: null })}
            initial={{ y: 80, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
            style={{ position: 'absolute', left: '50%', bottom: 90, translateX: '-50%', pointerEvents: 'auto', cursor: 'pointer', padding: '16px 26px', borderRadius: 24, background: 'var(--glass-strong)', border: '1px solid var(--line2)', backdropFilter: 'blur(30px)', boxShadow: '0 20px 60px rgba(0,0,0,.4)', textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 850 }}>{c.title}</div>
            <div className="muted small" style={{ marginTop: 4 }}>{c.subtitle}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const COLORS = ['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ed99', '#c77dff', '#ff9e00', '#ffffff']

function FxCanvas({ style }: { style: Style }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const W = (cv.width = window.innerWidth), H = (cv.height = window.innerHeight)
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rot: number; vr: number; shape: number; emoji?: string; trail?: boolean }
    const parts: P[] = []
    const rockets: { x: number; y: number; vy: number; tx: number; ty: number; color: string; at: number }[] = []
    const t0 = performance.now()
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    const confetti = (n: number, emoji?: string[]) => {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: rnd(0, W), y: rnd(-H * 0.3, -10), vx: rnd(-1.5, 1.5), vy: rnd(2, 5), life: 0, max: rnd(220, 320),
          color: COLORS[i % COLORS.length], size: emoji ? rnd(22, 36) : rnd(6, 12), rot: rnd(0, 6), vr: rnd(-0.2, 0.2), shape: i % 3,
          emoji: emoji ? emoji[i % emoji.length] : undefined
        })
      }
    }
    const explode = (x: number, y: number, color: string, big: boolean) => {
      const n = big ? 110 : 75
      const ring = Math.random() > 0.5
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const sp = ring ? (big ? 6 : 4.6) : rnd(1, big ? 7.5 : 5.5)
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(60, 100), color: Math.random() > 0.8 ? '#fff' : color, size: rnd(1.6, 3), rot: 0, vr: 0, shape: 9, trail: true })
      }
    }

    if (style.kind === 'confetti') confetti(160)
    if (style.kind === 'emoji') { confetti(40, style.list); confetti(70) }
    if (style.kind === 'fireworks') {
      const count = style.big ? 14 : 8
      for (let i = 0; i < count; i++) {
        rockets.push({ x: rnd(W * 0.15, W * 0.85), y: H + 10, vy: rnd(-13, -10), tx: 0, ty: rnd(H * 0.12, H * 0.45), color: COLORS[i % 6], at: i * (style.big ? 420 : 520) + rnd(0, 200) })
      }
    }

    let raf = 0
    const frame = (now: number) => {
      const el = now - t0
      ctx.globalCompositeOperation = 'source-over'
      if (style.kind === 'fireworks') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter' }
      else ctx.clearRect(0, 0, W, H)
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        if (el < r.at) continue
        r.y += r.vy; r.vy += 0.12
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2); ctx.fill()
        parts.push({ x: r.x, y: r.y + 4, vx: rnd(-0.3, 0.3), vy: rnd(0.5, 1.5), life: 0, max: 20, color: '#ffcc66', size: 1.4, rot: 0, vr: 0, shape: 9 })
        if (r.y <= r.ty || r.vy >= -1) { explode(r.x, r.y, r.color, style.kind === 'fireworks' && style.big); rockets.splice(i, 1) }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life++
        p.x += p.vx; p.y += p.vy
        if (p.shape === 9) { p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.06 }
        else { p.vx += Math.sin((p.life + i) * 0.05) * 0.05; p.vy = Math.min(p.vy + 0.03, 4); p.rot += p.vr }
        const a = Math.max(0, 1 - p.life / p.max)
        if (a <= 0 || p.y > H + 50) { parts.splice(i, 1); continue }
        ctx.globalAlpha = a
        if (p.emoji) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.font = `${p.size}px "Segoe UI Emoji"`; ctx.fillText(p.emoji, -p.size / 2, p.size / 2); ctx.restore()
        } else if (p.shape === 9) {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color
          if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill() }
          else { ctx.beginPath(); ctx.moveTo(0, -p.size / 2); ctx.lineTo(p.size / 2, p.size / 2); ctx.lineTo(-p.size / 2, p.size / 2); ctx.fill() }
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
      if (parts.length || rockets.length) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [style])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}
