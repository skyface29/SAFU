// Каркас окна: заголовок с поиском, боковая панель, заставка, палитра команд
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, CalendarDays, BookMarked, ListChecks, Folder, Library, UserCheck, Code2, UserCircle2, Search, Snowflake,
  PanelLeftClose, PanelLeftOpen, Wrench, Globe, Command, ArrowRight
} from 'lucide-react'
import { useNav, go, parseTabs, DEFAULT_TABS, TAB_META, type PageId, useModals, openSubject, openHomeworkEditor } from '../lib/nav'
import { usePref } from '../lib/kv'
import { homeworkStore, hw, hwTitle } from '../lib/homework'
import { useSchedule } from '../lib/scheduleStore'
import { subjects as allSubjects } from '../lib/schedule'
import { Avatar } from './Avatar'
import { useProfile, ROLE_TITLES } from '../lib/profile'
import { spring } from './kit'
import { TOOLS } from '../pages/tools/registry'
import { resourcesStore } from '../lib/resources'
import { openSite } from '../sites/sites'

const TAB_ICONS: Record<string, React.ComponentType<any>> = {
  home: Home, schedule: CalendarDays, homework: BookMarked, tasks: ListChecks, files: Folder, subjects: Library,
  attendance: UserCheck, developer: Code2, profile: UserCircle2
}

export function Titlebar() {
  const setModals = useModals(s => s.set)
  return (
    <div className="titlebar">
      <div className="app-name">
        <motion.span animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} style={{ display: 'grid', color: 'var(--brand)' }}>
          <Snowflake size={16} strokeWidth={2.6} />
        </motion.span>
        САФУ
      </div>
      <div className="search" onClick={() => setModals({ palette: true })}>
        <Search size={14} /> Поиск: пары, предметы, ДЗ, сайты, инструменты
        <kbd>Ctrl K</kbd>
      </div>
    </div>
  )
}

export function Sidebar() {
  const page = useNav(s => s.page)
  const [tabsRaw] = usePref('tabs.order', DEFAULT_TABS)
  const [collapsed, setCollapsed] = usePref('ui.sidebarCollapsed', false)
  const [badgeOn] = usePref('hw.badge', true)
  const items = homeworkStore.use()
  void items
  const unseen = useSchedule(s => s.unseen)
  const p = useProfile()
  const tabs = parseTabs(tabsRaw).filter(t => t !== 'profile')
  const hwBadge = badgeOn ? hw.badgeCount() : 0

  const Item = ({ id, title, Icon, badge }: { id: PageId; title: string; Icon: React.ComponentType<any>; badge?: number }) => {
    const active = page === id
    return (
      <motion.div className={`side-item ${active ? 'active' : ''}`} onClick={() => go(id)} whileTap={{ scale: 0.96 }} title={collapsed ? title : undefined}>
        {active && <motion.div layoutId="side-pill" className="side-pill" transition={spring} />}
        <span className="ico">
          <motion.span key={active ? 'a' : 'b'} initial={active ? { scale: 0.6, rotate: -15 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ display: 'grid' }}>
            <Icon size={19} strokeWidth={active ? 2.5 : 2} color={active ? 'var(--brand)' : undefined} />
          </motion.span>
        </span>
        <span className="lbl">{title}</span>
        <AnimatePresence>
          {!!badge && <motion.span className="side-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>{badge}</motion.span>}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {tabs.map(t => (
        <Item key={t} id={t as PageId} title={TAB_META[t].title} Icon={TAB_ICONS[t]}
          badge={t === 'homework' ? hwBadge : t === 'schedule' ? unseen : 0} />
      ))}
      <div className="side-sep" />
      <Item id="tools" title="Инструменты" Icon={Wrench} />
      <div className="side-sep" />
      <div className={`side-profile ${page === 'profile' ? 'active' : ''}`} onClick={() => go('profile')}>
        <Avatar size={34} />
        {!collapsed && (
          <div className="grow">
            <div className="bold ellipsis">{p.first || 'Профиль'} {p.last}</div>
            <div className="tiny muted ellipsis">{p.teacher ? 'Преподаватель' : p.group ? `Группа ${p.group} · ${ROLE_TITLES[p.role] || ''}` : 'Настроить'}</div>
          </div>
        )}
      </div>
      <button className="btn ghost sm" style={{ justifyContent: collapsed ? 'center' : 'flex-start', marginTop: 4 }} onClick={() => setCollapsed(!collapsed)} title="Свернуть панель">
        {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Свернуть</>}
      </button>
    </nav>
  )
}

export function Splash({ onDone }: { onDone: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => {
    import('../lib/bridge').then(({ safu }) => safu.app.info().then((i: any) => setVersion(i.version)))
    const t = setTimeout(onDone, 1250)
    return () => clearTimeout(t)
  }, [])
  return (
    <motion.div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}
      initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }} transition={{ duration: 0.55, ease: [0.2, 0.9, 0.25, 1] }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 400px at 60% 35%, rgba(var(--brand-rgb), .25), transparent), radial-gradient(500px 360px at 30% 80%, rgba(var(--brand2-rgb), .15), transparent)' }} />
      <div className="col" style={{ alignItems: 'center', gap: 14, position: 'relative' }}>
        <motion.div initial={{ scale: 0.3, rotate: -140, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 13 }}
          style={{ width: 120, height: 120, borderRadius: 34, background: 'var(--grad)', display: 'grid', placeItems: 'center', boxShadow: '0 20px 60px rgba(var(--brand-rgb), .55)' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} style={{ display: 'grid' }}>
            <Snowflake size={64} color="#fff" strokeWidth={2.2} />
          </motion.div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, type: 'spring', stiffness: 300, damping: 24 }}
          style={{ fontSize: '2.6rem', fontWeight: 900, letterSpacing: '-.03em' }}>САФУ</motion.div>
        <motion.div className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>всё для учёбы в одном месте</motion.div>
        <motion.div className="tiny faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>для Windows · версия {version}</motion.div>
        <motion.div style={{ width: 160, height: 3, borderRadius: 3, background: 'var(--fill2)', overflow: 'hidden', marginTop: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <motion.div style={{ height: '100%', background: 'var(--grad)' }} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1, ease: 'easeInOut' }} />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ---------- палитра команд (Ctrl+K) ----------

type Cmd = { id: string; title: string; sub?: string; icon: React.ReactNode; run: () => void; group: string }

export function CommandPalette() {
  const open = useModals(s => s.palette)
  const set = useModals(s => s.set)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const data = useSchedule(s => s.data)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set({ palette: !useModals.getState().palette }) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 50) } }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    if (!open) return []
    const close = (f: () => void) => () => { set({ palette: false }); f() }
    const list: Cmd[] = []
    for (const [id, m] of Object.entries(TAB_META)) {
      const Icon = TAB_ICONS[id]
      list.push({ id: 'tab-' + id, group: 'Разделы', title: m.title, icon: <Icon size={16} />, run: close(() => go(id as PageId)) })
    }
    for (const t of TOOLS) list.push({ id: 'tool-' + t.id, group: 'Инструменты', title: t.title, sub: t.subtitle, icon: <t.Icon size={16} />, run: close(() => go(t.page)) })
    list.push({ id: 'new-hw', group: 'Действия', title: 'Записать ДЗ', sub: 'Ctrl+N', icon: <BookMarked size={16} />, run: close(() => openHomeworkEditor({})) })
    list.push({ id: 'appearance', group: 'Действия', title: 'Оформление', sub: 'темы, фоны, шрифты', icon: <Command size={16} />, run: close(() => go('appearance')) })
    for (const s of allSubjects(data)) list.push({ id: 'subj-' + s, group: 'Предметы', title: s, icon: <Library size={16} />, run: close(() => openSubject(s)) })
    for (const r of resourcesStore.get()) list.push({ id: 'site-' + r.id, group: 'Сайты', title: r.title, sub: r.subtitle, icon: <Globe size={16} />, run: close(() => openSite(r)) })
    for (const h of hw.active().slice(0, 40)) list.push({ id: 'hw-' + h.id, group: 'Домашка', title: hwTitle(h), sub: h.subject, icon: <BookMarked size={16} />, run: close(() => openHomeworkEditor({ id: h.id })) })
    return list
  }, [open, data])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return cmds.filter(c => c.group === 'Разделы' || c.group === 'Действия' || c.group === 'Инструменты').slice(0, 30)
    return cmds.filter(c => (c.title + ' ' + (c.sub || '') + ' ' + c.group).toLowerCase().includes(s)).slice(0, 40)
  }, [q, cmds])

  useEffect(() => setSel(0), [q])

  return (
    <AnimatePresence>
      {open && (
        <div className="overlay" style={{ alignItems: 'flex-start', paddingTop: 90 }}>
          <motion.div className="overlay-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => set({ palette: false })} />
          <motion.div className="sheet" style={{ width: 'min(640px, 100%)' }}
            initial={{ opacity: 0, y: -20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }} transition={spring}>
            <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <Search size={18} className="faint" />
              <input ref={input} className="grow" value={q} onChange={e => setQ(e.target.value)} placeholder="Что найти?"
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: '1.05rem' }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
                  if (e.key === 'Enter') filtered[sel]?.run()
                  if (e.key === 'Escape') set({ palette: false })
                }} />
              <span className="kbd">Esc</span>
            </div>
            <div style={{ maxHeight: 440, overflowY: 'auto', padding: 6 }}>
              {filtered.map((c, i) => (
                <React.Fragment key={c.id}>
                  {(i === 0 || filtered[i - 1].group !== c.group) && <div className="tiny faint bold" style={{ padding: '10px 12px 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.group}</div>}
                  <motion.div className="menu-item" style={{ height: 42, background: i === sel ? 'var(--fill2)' : undefined }}
                    onMouseEnter={() => setSel(i)} onClick={c.run} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.012 }}>
                    <span style={{ width: 22, display: 'grid', placeItems: 'center', color: 'var(--brand)' }}>{c.icon}</span>
                    <span className="grow ellipsis">{c.title}{c.sub && <span className="faint small"> · {c.sub}</span>}</span>
                    {i === sel && <ArrowRight size={14} className="faint" />}
                  </motion.div>
                </React.Fragment>
              ))}
              {!filtered.length && <div className="empty small">Ничего не нашлось</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
