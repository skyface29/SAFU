// Набор элементов интерфейса: карточки, кнопки, листы, меню, уведомления внутри приложения.
import React, { useEffect, useId, useLayoutEffect, useRef, useState, createContext, useContext, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { X, Check, Info, AlertTriangle } from 'lucide-react'
import { kindStyle } from '../lib/schedule'
import { KindIcon } from './icons'
import { fxNow } from '../fx/perf'

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
  { hover, press, tight, flush, delay = 0, tilt, as: Tag = 'div', className = '', children, onMouseMove, onMouseLeave, style, ...rest }, ref
) {
  // Всё движение карточки — на видеокарте (CSS): появление, наклон и возврат. Раньше у каждой карточки была
  // своя пружина в JavaScript, и при входе в раздел их запускались десятки, пока тот же поток собирал раздел
  const local = useRef<HTMLDivElement | null>(null)
  const spot = useRef<HTMLDivElement>(null)
  const edge = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const at = useRef({ x: 0, y: 0 })
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const setRef = (el: HTMLDivElement | null) => {
    local.current = el
    if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }
  // перспектива — только у карточек, которые наклоняются: с ней карточка становится отдельным
  // 3D-слоем видеокарты (лишняя память, а текст в таком слое рисуется без сглаживания ClearType)
  const tilts = !!tilt || ((hover || press) && fxNow() === 'high')
  return (
    <Tag
      ref={setRef}
      className={`card in ${hover || press ? 'hover' : ''} ${press ? 'press' : ''} ${tight ? 'tight' : ''} ${flush ? 'flush' : ''} ${tilts ? 'tilts' : ''} ${className}`}
      style={delay ? { ...style, animationDelay: `${delay}s` } : style}
      onMouseMove={(e: React.MouseEvent<HTMLDivElement>) => {
        at.current = { x: e.clientX, y: e.clientY }
        if (!frame.current) frame.current = requestAnimationFrame(() => {
          frame.current = 0
          const el = local.current
          if (!el) return
          const r = el.getBoundingClientRect()
          const x = at.current.x - r.left, y = at.current.y - r.top
          // координаты — только двум слоям подсветки: заданные у карточки, они пересчитывали стиль всего, что внутри
          for (const s of [spot.current, edge.current]) { s?.style.setProperty('--mx', `${x}px`); s?.style.setProperty('--my', `${y}px`) }
          // наклон за курсором: у карточек с наклоном — всегда, у нажимаемых — на мощном железе и чуть-чуть
          const amp = tilt ? 6 : tilts && r.width < 900 ? 2.5 : 0
          if (amp) {
            el.classList.add('tilting')
            el.style.transform = `perspective(900px) rotateX(${((y / r.height - 0.5) * -amp).toFixed(2)}deg) rotateY(${((x / r.width - 0.5) * amp).toFixed(2)}deg)`
          }
        })
        onMouseMove?.(e)
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        cancelAnimationFrame(frame.current)
        frame.current = 0
        const el = local.current
        if (el?.classList.contains('tilting')) { el.classList.remove('tilting'); el.style.transform = '' }
        onMouseLeave?.(e)
      }}
      {...(rest as any)}
    >
      <div className="spot" ref={spot} />
      <div className="spot-border" ref={edge} />
      {children}
    </Tag>
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
  // Подложка выбранного варианта одна на весь переключатель и переезжает переходом CSS (как подсветка в боковой
  // панели). Раньше это была общая анимация раскладки framer-motion: она замеряла подложку при появлении раздела,
  // пока раздел ещё въезжал, и потом подложка без причины подпрыгивала
  const box = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const place = useCallback((glide: boolean) => {
    const el = pill.current, on = box.current?.querySelector<HTMLElement>(':scope > button.on')
    if (!el) return
    if (!on) { el.style.opacity = '0'; return }
    if (!glide) el.style.transition = 'none'
    el.style.opacity = ''
    el.style.width = `${on.offsetWidth}px`
    el.style.height = `${on.offsetHeight}px`
    el.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`
    if (!glide) { el.getBoundingClientRect(); el.style.transition = '' }
  }, [])
  const placed = useRef(false)
  useLayoutEffect(() => { place(placed.current); placed.current = true }, [value, place])
  // подписи меняют ширину (счётчики, шрифт) — подложка подстраивается без проезда
  useEffect(() => {
    const ro = new ResizeObserver(() => place(false))
    box.current?.querySelectorAll(':scope > button').forEach(b => ro.observe(b))
    return () => ro.disconnect()
  }, [options.length, place])
  return (
    <div ref={box} className="seg" style={size === 'sm' ? { transform: 'scale(.92)', transformOrigin: 'left center' } : undefined}>
      <div ref={pill} className="seg-pill" />
      {options.map(o => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
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
    <div className="row top fall-in" style={{ margin: '14px 4px 18px' }}>
      <div className="grow">
        <h1 className="h-page">{emoji && <span style={{ marginRight: 10 }}>{emoji}</span>}{title}</h1>
        {subtitle && <div className="muted" style={{ marginTop: 6, fontSize: '.95rem' }}>{subtitle}</div>}
      </div>
      {right && <div className="row gap8" style={{ paddingTop: 6 }}>{right}</div>}
    </div>
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
    <div className="empty pop-in">
      <span className="em">{emoji}</span>
      <div className="h-card" style={{ color: 'var(--text)' }}>{title}</div>
      {text && <div className="sub mt8" style={{ maxWidth: 420, margin: '8px auto 0' }}>{text}</div>}
      {action && <div className="mt16">{action}</div>}
    </div>
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
  // при появлении дуга вырастает от нуля
  const [shown, setShown] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t) }, [])
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
        {/* дуга дорисовывается переходом CSS: без кадров в JavaScript на каждое обновление */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} style={{ strokeDashoffset: shown ? c * (1 - Math.max(0, Math.min(1, value))) : c, transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.9,.25,1)' }} />
      </svg>
      <div className="center" style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  // ширину не анимируем (это перекладка страницы на каждом кадре) — сжимаем полоску на видеокарте
  const [shown, setShown] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t) }, [])
  const v = shown ? Math.max(0, Math.min(1, value)) : 0
  return <div className="progress"><i style={{ width: '100%', transform: `scaleX(${v})`, transformOrigin: 'left center', transition: 'transform .8s cubic-bezier(.2,.9,.25,1)' }} /></div>
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
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}>
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

type DialogReq = { kind: 'confirm' | 'prompt' | 'alert'; title: string; text?: string; ok?: string; danger?: boolean; value?: string; placeholder?: string; secret?: boolean; resolve: (v: any) => void }
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
          <input className="input mt12" autoFocus type={req.secret ? 'password' : 'text'} value={val} placeholder={req.placeholder} onChange={e => setVal(e.target.value)}
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
/** Ввод пароля: символы скрыты */
export const passwordDialog = (title: string, text?: string, ok = 'Готово'): Promise<string | null> => dialogRef.current({ kind: 'prompt', title, value: '', placeholder: 'Пароль', text, ok, secret: true })
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
