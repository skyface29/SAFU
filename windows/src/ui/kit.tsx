// Набор элементов интерфейса: карточки, кнопки, листы, меню, уведомления внутри приложения.
import React, { useEffect, useId, useRef, useState, createContext, useContext, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform, animate } from 'framer-motion'
import { X, Check, Info, AlertTriangle } from 'lucide-react'
import { kindStyle } from '../lib/schedule'
import { KindIcon } from './icons'

export const spring = { type: 'spring' as const, stiffness: 420, damping: 34 }
export const softSpring = { type: 'spring' as const, stiffness: 260, damping: 28 }
export const bouncy = { type: 'spring' as const, stiffness: 500, damping: 22 }

// ---------- карточка с подсветкой под курсором ----------

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  hover?: boolean
  press?: boolean
  tight?: boolean
  flush?: boolean
  delay?: number
  tilt?: boolean
  as?: 'div' | 'section'
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { hover, press, tight, flush, delay = 0, tilt, className = '', children, onMouseMove, onMouseLeave, style, ...rest }, ref
) {
  const local = useRef<HTMLDivElement>(null)
  const rx = useSpring(0, { stiffness: 200, damping: 20 })
  const ry = useSpring(0, { stiffness: 200, damping: 20 })
  const setRef = (el: HTMLDivElement | null) => {
    (local as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }
  return (
    <motion.div
      ref={setRef}
      className={`card ${hover || press ? 'hover' : ''} ${press ? 'press' : ''} ${tight ? 'tight' : ''} ${flush ? 'flush' : ''} ${className}`}
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...softSpring, delay }}
      style={{ ...style, rotateX: tilt ? rx : undefined, rotateY: tilt ? ry : undefined, transformPerspective: 900 }}
      onMouseMove={e => {
        const el = local.current
        if (el) {
          const r = el.getBoundingClientRect()
          el.style.setProperty('--mx', `${e.clientX - r.left}px`)
          el.style.setProperty('--my', `${e.clientY - r.top}px`)
          if (tilt) {
            rx.set(((e.clientY - r.top) / r.height - 0.5) * -6)
            ry.set(((e.clientX - r.left) / r.width - 0.5) * 6)
          }
        }
        onMouseMove?.(e)
      }}
      onMouseLeave={e => { rx.set(0); ry.set(0); onMouseLeave?.(e) }}
      {...(rest as any)}
    >
      <div className="spot" />
      <div className="spot-border" />
      {children}
    </motion.div>
  )
})

// ---------- кнопки и переключатели ----------

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} style={{ opacity: disabled ? 0.4 : 1 }}
    onClick={e => { e.stopPropagation(); if (!disabled) onChange(!on) }} />
}

export function Segmented<T extends string | number>({ value, options, onChange, size }: {
  value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; size?: 'sm'
}) {
  const id = useId()
  return (
    <div className="seg" style={size === 'sm' ? { transform: 'scale(.92)', transformOrigin: 'left center' } : undefined}>
      {options.map(o => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.div layoutId={`seg-${id}`} className="seg-pill" transition={spring} />}
          <span style={{ position: 'relative' }}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void
}) {
  return (
    <div className="row wrap-row gap6">
      {options.map(o => (
        <motion.button whileTap={{ scale: 0.92 }} key={String(o.value)} className={`chip ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </motion.button>
      ))}
    </div>
  )
}

// ---------- заголовки ----------

export function PageHeader({ title, subtitle, right, emoji }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; emoji?: string }) {
  return (
    <motion.div className="row top" style={{ margin: '14px 4px 18px' }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      <div className="grow">
        <h1 className="h-page">{emoji && <span style={{ marginRight: 10 }}>{emoji}</span>}{title}</h1>
        {subtitle && <div className="muted" style={{ marginTop: 6, fontSize: '.95rem' }}>{subtitle}</div>}
      </div>
      {right && <div className="row gap8" style={{ paddingTop: 6 }}>{right}</div>}
    </motion.div>
  )
}

export function Section({ title, right, children, icon }: { title: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <>
      <div className="h-sec">{icon}{title}<span className="spacer" />{right}</div>
      {children}
    </>
  )
}

export function Empty({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring}>
      <span className="em">{emoji}</span>
      <div className="h-card" style={{ color: 'var(--text)' }}>{title}</div>
      {text && <div className="sub mt8" style={{ maxWidth: 420, margin: '8px auto 0' }}>{text}</div>}
      {action && <div className="mt16">{action}</div>}
    </motion.div>
  )
}

export function KindBadge({ kind, filled = true, size = 'sm' }: { kind: string; filled?: boolean; size?: 'sm' | 'md' }) {
  const st = kindStyle(kind)
  return (
    <span className="badge" style={{
      background: filled ? st.color : `${st.color}29`, color: filled ? '#fff' : st.color,
      fontSize: size === 'md' ? '.74rem' : '.64rem', padding: size === 'md' ? '3px 9px' : '2px 7px'
    }}>
      <KindIcon kind={kind} size={size === 'md' ? 12 : 10} />
      {st.label}
    </span>
  )
}

export function Row({ icon, color, title, sub, right, onClick, danger }: {
  icon?: React.ReactNode; color?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onClick?: () => void; danger?: boolean
}) {
  return (
    <div className={`list-row ${onClick ? 'click' : ''}`} onClick={onClick}>
      {icon && <div className="icon-tile" style={{ background: color || 'var(--grad)' }}>{icon}</div>}
      <div className="grow">
        <div style={{ fontWeight: 600, color: danger ? '#ef4444' : undefined }}>{title}</div>
        {sub && <div className="sub" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function ToggleRow({ icon, color, title, sub, on, onChange }: { icon?: React.ReactNode; color?: string; title: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return <Row icon={icon} color={color} title={title} sub={sub} onClick={() => onChange(!on)} right={<Toggle on={on} onChange={onChange} />} />
}

// ---------- анимированные числа и кольца ----------

export function AnimatedNumber({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, v => v.toFixed(decimals) + suffix)
  useEffect(() => { const c = animate(mv, value, { duration: 0.9, ease: [0.2, 0.9, 0.25, 1] }); return c.stop }, [value])
  return <motion.span className="mono">{text}</motion.span>
}

export function Ring({ value, size = 64, stroke = 7, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = useId()
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color || 'var(--brand)'} />
            <stop offset="100%" stopColor={color || 'var(--brand2)'} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill2)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 1.1, ease: [0.2, 0.9, 0.25, 1] }} />
      </svg>
      <div className="center" style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.9, 0.25, 1] }} /></div>
}

// ---------- лист (модальное окно) ----------

export function Sheet({ open, onClose, title, children, footer, size, headRight, noPad }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode
  size?: 'wide' | 'xwide'; headRight?: React.ReactNode; noPad?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="overlay">
          <motion.div className="overlay-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className={`sheet ${size || ''}`}
            initial={{ opacity: 0, y: 40, scale: 0.94, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 30, scale: 0.96, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            {(title || headRight) && (
              <div className="sheet-head">
                <div className="sheet-title">{title}</div>
                {headRight}
                <button className="btn icon sm ghost round" onClick={onClose} title="Закрыть (Esc)"><X size={18} /></button>
              </div>
            )}
            <div className="sheet-body" style={noPad ? { padding: 0, flex: 1, display: 'flex', flexDirection: 'column' } : undefined}>{children}</div>
            {footer && <div className="sheet-foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ---------- подтверждение и ввод текста ----------

type DialogReq = { kind: 'confirm' | 'prompt' | 'alert'; title: string; text?: string; ok?: string; danger?: boolean; value?: string; placeholder?: string; resolve: (v: any) => void }
const DialogCtx = createContext<(r: Omit<DialogReq, 'resolve'>) => Promise<any>>(async () => null)

export function DialogHost({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null)
  const [val, setVal] = useState('')
  const ask = useCallback((r: Omit<DialogReq, 'resolve'>) => new Promise<any>(resolve => { setVal(r.value || ''); setReq({ ...r, resolve }) }), [])
  const close = (v: any) => { req?.resolve(v); setReq(null) }
  dialogRef.current = ask
  return (
    <DialogCtx.Provider value={ask}>
      {children}
      <Sheet open={!!req} onClose={() => close(req?.kind === 'confirm' ? false : null)} title={req?.title}
        footer={<>
          {req?.kind !== 'alert' && <button className="btn" onClick={() => close(req?.kind === 'confirm' ? false : null)}>Отмена</button>}
          <button className={`btn ${req?.danger ? 'danger solid' : 'primary'}`} autoFocus={req?.kind !== 'prompt'}
            onClick={() => close(req?.kind === 'prompt' ? val : true)}>{req?.ok || 'OK'}</button>
        </>}>
        {req?.text && <div className="muted wrap" style={{ lineHeight: 1.5 }}>{req.text}</div>}
        {req?.kind === 'prompt' && (
          <input className="input mt12" autoFocus value={val} placeholder={req.placeholder} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') close(val) }} />
        )}
      </Sheet>
    </DialogCtx.Provider>
  )
}

const dialogRef: { current: (r: Omit<DialogReq, 'resolve'>) => Promise<any> } = { current: async () => null }
export const useDialog = () => useContext(DialogCtx)
export const confirmDialog = (title: string, text?: string, ok = 'Да', danger = false): Promise<boolean> => dialogRef.current({ kind: 'confirm', title, text, ok, danger })
export const promptDialog = (title: string, value = '', placeholder = '', text?: string): Promise<string | null> => dialogRef.current({ kind: 'prompt', title, value, placeholder, text, ok: 'Готово' })
export const alertDialog = (title: string, text?: string): Promise<boolean> => dialogRef.current({ kind: 'alert', title, text })

// ---------- всплывающие сообщения ----------

type Toast = { id: number; text: string; kind: 'ok' | 'info' | 'warn'; action?: { label: string; run: () => void } }
const toastSubs = new Set<(t: Toast[]) => void>()
let toasts: Toast[] = []
let toastId = 0

export function toast(text: string, kind: Toast['kind'] = 'ok', action?: Toast['action']) {
  const t = { id: ++toastId, text, kind, action }
  toasts = [...toasts, t].slice(-4)
  toastSubs.forEach(f => f(toasts))
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); toastSubs.forEach(f => f(toasts)) }, action ? 6000 : 3200)
}

export function ToastHost() {
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => { toastSubs.add(setList); return () => { toastSubs.delete(setList) } }, [])
  return createPortal(
    <div className="toast-wrap">
      <AnimatePresence>
        {list.map(t => (
          <motion.div key={t.id} className="toast" layout
            initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} transition={bouncy}>
            {t.kind === 'ok' ? <Check size={18} color="#22c55e" /> : t.kind === 'warn' ? <AlertTriangle size={18} color="#f59e0b" /> : <Info size={18} color="var(--brand)" />}
            <span>{t.text}</span>
            {t.action && <button className="btn sm" onClick={t.action.run}>{t.action.label}</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}

// ---------- контекстное меню ----------

export type MenuItem = { label: string; icon?: React.ReactNode; run?: () => void; danger?: boolean; sep?: boolean; disabled?: boolean }
type MenuState = { x: number; y: number; items: MenuItem[] } | null
const menuSubs = new Set<(m: MenuState) => void>()

export function openMenu(e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[]) {
  e.preventDefault?.()
  e.stopPropagation?.()
  menuSubs.forEach(f => f({ x: e.clientX, y: e.clientY, items }))
}

export function MenuHost() {
  const [m, setM] = useState<MenuState>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { menuSubs.add(setM); return () => { menuSubs.delete(setM) } }, [])
  useEffect(() => {
    if (!m) return
    const close = () => setM(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); window.removeEventListener('resize', close); window.removeEventListener('keydown', k) }
  }, [m])
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (!m) return
    const w = ref.current?.offsetWidth || 220, h = ref.current?.offsetHeight || 200
    setPos({ x: Math.min(m.x, window.innerWidth - w - 8), y: Math.min(m.y, window.innerHeight - h - 8) })
  }, [m])
  return createPortal(
    <AnimatePresence>
      {m && (
        <motion.div ref={ref} className="menu" style={{ left: pos.x, top: pos.y, transformOrigin: 'top left' }}
          initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.16 }}
          onMouseDown={e => e.stopPropagation()}>
          {m.items.map((it, i) => it.sep ? <div key={i} className="menu-sep" /> : (
            <motion.div key={i} className={`menu-item ${it.danger ? 'danger' : ''}`} style={{ opacity: it.disabled ? 0.4 : 1 }}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: it.disabled ? 0.4 : 1, x: 0 }} transition={{ delay: i * 0.02 }}
              onClick={() => { if (it.disabled) return; setM(null); it.run?.() }}>
              <span style={{ width: 18, display: 'grid', placeItems: 'center' }}>{it.icon}</span>{it.label}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ---------- появление списков по очереди ----------

export const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.035 } } },
  item: { hidden: { opacity: 0, y: 14, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: softSpring } }
}

export function Stagger({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <motion.div className={className} style={style} variants={stagger.container} initial="hidden" animate="show">{children}</motion.div>
}
export function StaggerItem({ children, className, style, onClick, onContextMenu }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void }) {
  return <motion.div className={className} style={style} variants={stagger.item} onClick={onClick} onContextMenu={onContextMenu} layout="position">{children}</motion.div>
}

/** Часы, тикающие раз в N мс (для таймеров пар) */
export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t) }, [every])
  return now
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="faint tiny" style={{ margin: '5px 2px 0' }}>{hint}</div>}
    </div>
  )
}

/** Конфетти-вспышка из точки (для галочек) */
export function burst(x: number, y: number, colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7']) {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999;pointer-events:none`
  document.body.appendChild(host)
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i')
    const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.4
    const dist = 30 + Math.random() * 40
    p.style.cssText = `position:absolute;width:7px;height:7px;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};background:${colors[i % colors.length]};left:-3px;top:-3px`
    host.appendChild(p)
    p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 20}px) scale(.3) rotate(${Math.random() * 360}deg)`, opacity: 0 }
    ], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' })
  }
  setTimeout(() => host.remove(), 1100)
}
