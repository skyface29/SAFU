// Строка пары — общая для главной, «Пар», листа предмета
import React from 'react'
import { motion } from 'framer-motion'
import { MapPin, User, Wifi, BookMarked } from 'lucide-react'
import { type Slot, kindStyle, AddressFormat } from '../lib/schedule'
import { hm } from '../lib/date'
import { KindBadge, openMenu } from './kit'
import { useModals, openSubject, openHomeworkEditor } from '../lib/nav'
import { hw, homeworkStore } from '../lib/homework'
import { safu } from '../lib/bridge'
import { mapsURL } from '../lib/maps'

export function SlotRow({ s, now, compact, showDay, alts = [] }: { s: Slot; now: number; compact?: boolean; showDay?: string; alts?: Slot[] }) {
  homeworkStore.use()
  const st = kindStyle(s.kind)
  const live = s.start <= now && now < s.end
  const past = s.end <= now
  const due = hw.dueAt(s).filter(h => !h.done)
  const progress = live ? (now - s.start) / (s.end - s.start) : 0
  return (
    <motion.div
      className="row top"
      layout="position"
      whileHover={{ x: 3 }}
      onClick={() => useModals.getState().set({ lesson: alts.length ? { ...s, alts } : s })}
      onContextMenu={e => openMenu(e, [
        { label: 'Подробнее', run: () => useModals.getState().set({ lesson: s }) },
        { label: 'Предмет: файлы и заметки', run: () => openSubject(s.subject) },
        { label: 'Записать ДЗ с этой пары', icon: <BookMarked size={15} />, run: () => openHomeworkEditor({ subject: s.subject, slotStart: s.start }) },
        ...(s.address && !s.remote ? [{ label: 'Маршрут в Яндекс Картах', icon: <MapPin size={15} />, run: () => safu.shell.open(mapsURL(s.address)) }] : [])
      ])}
      style={{
        position: 'relative', flexShrink: 0, padding: compact ? '10px 12px' : '13px 14px', borderRadius: 16, cursor: 'pointer', gap: 14,
        background: live ? `linear-gradient(90deg, ${st.color}26, transparent)` : 'var(--fill)',
        border: `1px solid ${live ? st.color + '66' : 'var(--line)'}`, opacity: past ? 0.55 : 1, overflow: 'hidden'
      }}>
      {live && <motion.div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, background: st.color, boxShadow: `0 0 10px ${st.color}` }} initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 1 }} />}
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: st.color, flexShrink: 0, boxShadow: live ? `0 0 12px ${st.color}` : undefined }} />
      <div style={{ width: 62, flexShrink: 0 }}>
        <div className="bold mono" style={{ fontSize: '1.02rem' }}>{hm(s.start)}</div>
        <div className="tiny faint mono">{hm(s.end)}</div>
        {showDay && <div className="tiny muted" style={{ marginTop: 2 }}>{showDay}</div>}
      </div>
      <div className="grow">
        <div className="row gap6" style={{ marginBottom: 4 }}>
          <KindBadge kind={s.kind} />
          {live && <span className="badge" style={{ background: '#22c55e', color: '#fff' }}><span className="live-dot" style={{ width: 6, height: 6, background: '#fff' }} />идёт</span>}
          {s.remote && <span className="pill"><Wifi size={11} /> дистант</span>}
          {alts.length > 0 && <span className="pill" title="Несколько пар в одно время — выбери свою подгруппу">+{alts.length} {alts.length === 1 ? 'подгруппа' : alts.length < 5 ? 'подгруппы' : 'подгрупп'}</span>}
          {due.length > 0 && <span className="pill" style={{ background: 'rgba(245,158,11,.18)', color: '#f59e0b' }}><BookMarked size={11} /> ДЗ: {due.length}</span>}
        </div>
        <div className="bold" style={{ fontSize: compact ? '.95rem' : '1.02rem', lineHeight: 1.25 }}>{s.subject}</div>
        <div className="row wrap-row sub" style={{ gap: '4px 14px', marginTop: 4 }}>
          {alts.length > 0 ? <span className="row gap4"><MapPin size={12} />{[s, ...alts].map(x => x.room).filter(Boolean).slice(0, 4).join(', ')}{alts.length > 3 ? '…' : ''}</span> : (s.room || s.address) && <span className="row gap4"><MapPin size={12} />{s.room ? `ауд. ${s.room}` : ''}{s.room && s.address ? ' · ' : ''}{!compact && AddressFormat.full(s.address)}</span>}
          {s.teacher && !alts.length && <span className="row gap4"><User size={12} />{s.teacher}</span>}
        </div>
      </div>
    </motion.div>
  )
}
