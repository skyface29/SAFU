// Общие кусочки интерфейса: значки, секции, переключатели, текст ДЗ с выделенными номерами
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { blocks, parts, line, kindStyle } from '../../shared/pretty'
import { chip, DAY } from '../../shared/dates'
import { inTelegram, mainButton } from './tg'

const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12.5 4.5 4.5L19 7',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  chevron: 'm9 6 6 6-6 6',
  photo: 'M4 7h3l2-2h6l2 2h3v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z M13 7l4 4',
  share: 'M12 4v11M7 9l5-5 5 5M5 14v6h14v-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 3 7 3 7H3s3-1 3-7M10 20a2 2 0 0 0 4 0',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  restore: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  x: 'M6 6l12 12M18 6 6 18',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11'
}

export function Icon({ name, size = 20, style }: { name: keyof typeof paths | string; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      {(paths[name] ?? '').split(/(?=M)/).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

export function Section({ title, count, children, note }: { title?: ReactNode; count?: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="section">
      {title && <div className="section-head">{title}{count != null && <span className="count">{count}</span>}</div>}
      <div className="group">{children}</div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}

export function Row({ title, sub, end, onClick, icon, className = '', chevron }: {
  title: ReactNode; sub?: ReactNode; end?: ReactNode; onClick?: () => void; icon?: ReactNode; className?: string; chevron?: boolean
}) {
  return (
    <button className={`row ${className}`} onClick={onClick} disabled={!onClick && !end}>
      {icon}
      <div className="row-main"><div className="row-title">{title}</div>{sub && <div className="row-sub">{sub}</div>}</div>
      {(end || chevron) && <div className="row-end">{end}{chevron && <Icon name="chevron" size={18} />}</div>}
    </button>
  )
}

export const Switch = ({ on }: { on: boolean }) => <span className={`switch ${on ? 'on' : ''}`} />

export function Check({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={`check ${on ? 'on' : ''}`} onClick={e => { e.stopPropagation(); onClick() }} aria-label={on ? 'Снять отметку' : 'Сделано'}>
      <Icon name="check" size={16} style={{ strokeWidth: 3 }} />
    </button>
  )
}

/** Текст с выделенными «№ 5», «стр. 45», «§ 3» */
export function Refs({ text }: { text: string }) {
  return <>{parts(text).map((p, i) => (p.ref ? <span key={i} className="ref">{p.text}</span> : <span key={i}>{p.text}</span>))}</>
}

export const OneLine = ({ text }: { text: string }) => <Refs text={line(text)} />

export function Blocks({ text }: { text: string }) {
  const list = blocks(text)
  if (!list.length) return null
  return (
    <div className="blocks">
      {list.map(b => (
        <div className="b" key={b.id}>{b.marker && <span className="m">{b.marker}</span>}<span><Refs text={b.text} /></span></div>
      ))}
    </div>
  )
}

/** Плашка срока: красная — просрочено, жёлтая — меньше суток, синяя — до трёх дней */
export function DueChip({ due, done }: { due: number; done?: boolean }) {
  const left = due - Date.now()
  const cls = done ? '' : left < 0 ? 'red' : left < DAY ? 'amber' : left < 3 * DAY ? 'blue' : ''
  return <span className={`chip ${cls}`}><Icon name="clock" size={13} />{chip(due, done)}</span>
}

export const kindColor = (kind: string) => kindStyle(kind).color

export function Empty({ emoji, title, text, children }: { emoji: string; title: string; text?: ReactNode; children?: ReactNode }) {
  return <div className="empty"><div className="big">{emoji}</div><div className="title">{title}</div>{text && <div>{text}</div>}{children && <div style={{ marginTop: 18 }}>{children}</div>}</div>
}

export const Spinner = () => <div className="spinner" />

export function Skeletons({ n = 3 }: { n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <div className="skeleton" key={i} style={{ opacity: 1 - i * 0.25 }} />)}</>
}

/** Главная кнопка: в Telegram — родная снизу экрана, в браузере — своя */
export function MainButton({ text, onClick, busy, disabled }: { text: string | null; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  const ref = useRef(onClick)
  ref.current = onClick
  const [stable] = useState(() => () => ref.current())
  useEffect(() => (inTelegram ? mainButton(text, stable, { busy, disabled }) : undefined), [text, stable, busy, disabled])
  if (inTelegram || !text) return null
  return <div className="web-main"><button className="btn" onClick={onClick} disabled={disabled || busy}>{busy ? '…' : text}</button></div>
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let setToastExt: ((t: string | null) => void) | null = null
export function toast(text: string) {
  setToastExt?.(text)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setToastExt?.(null), 2200)
}
export function Toasts() {
  const [t, setT] = useState<string | null>(null)
  useEffect(() => { setToastExt = setT; return () => { setToastExt = null } }, [])
  return t ? <div className="toast">{t}</div> : null
}
