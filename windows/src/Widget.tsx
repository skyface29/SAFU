// Мини-окно пары поверх всех окон — как Live Activity на экране блокировки iPhone
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, ArrowRight } from 'lucide-react'
import { safu } from './lib/bridge'
import { kv } from './lib/kv'
import { applyThemeToDocument } from './lib/theme'
import { hm, timer, untilText } from './lib/date'
import type { WidgetPayload } from './lib/effects'

export function Widget() {
  const [p, setP] = useState<WidgetPayload | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    applyThemeToDocument(true)
    const off = safu.app.on('widget:data', (d: WidgetPayload) => setP(d))
    safu.widget.ready()
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => { off(); clearInterval(t) }
  }, [])
  const theme = kv.get('live.theme', 'night')
  const bg = theme === 'light' ? 'rgba(255,255,255,.92)' : theme === 'brand' ? 'linear-gradient(135deg, var(--brand), var(--brand2))' : 'rgba(14,17,26,.9)'
  const fg = theme === 'light' ? '#111' : '#fff'
  const isNow = p?.mode === 'now'
  const total = p ? p.end - p.start : 1
  const progress = isNow && p ? Math.min(1, (now - p.start) / total) : 0

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      style={{ position: 'fixed', inset: 6, borderRadius: 22, background: bg, color: fg, padding: '12px 14px', boxShadow: '0 10px 30px rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.12)', backdropFilter: 'blur(20px)', overflow: 'hidden', WebkitAppRegion: 'drag', cursor: 'move' } as any}>
      <button onClick={() => safu.widget.toggle(false)} style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'rgba(127,127,127,.2)', borderRadius: 99, width: 22, height: 22, display: 'grid', placeItems: 'center', cursor: 'pointer', color: fg, WebkitAppRegion: 'no-drag' } as any}><X size={12} /></button>
      <AnimatePresence mode="wait">
        {!p || p.mode === 'none' ? (
          <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', display: 'grid', placeItems: 'center', fontWeight: 700, opacity: .8 }}>Ближайших пар нет 🎉</motion.div>
        ) : (
          <motion.div key={p.subject + p.start} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            onDoubleClick={() => safu.widget.open('schedule')} style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: isNow ? '#22c55e' : '#f59e0b', boxShadow: `0 0 8px ${isNow ? '#22c55e' : '#f59e0b'}` }} />
              <span style={{ opacity: .75 }}>{isNow ? 'Сейчас' : 'Следующая'}</span>
              <span style={{ background: p.kindColor, color: '#fff', padding: '1px 7px', borderRadius: 99, fontSize: 9 }}>{p.kind}</span>
              <span style={{ marginLeft: 'auto', marginRight: 24, fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 900, textTransform: 'none' }}>
                {isNow ? timer(p.end - now) : p.start - now < 3600_000 ? timer(p.start - now) : hm(p.start)}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.subject}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: .75, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <MapPin size={12} />{p.room ? `ауд. ${p.room}` : 'аудитория не указана'}{p.address ? ` · ${p.address}` : ''}
            </div>
            {isNow && <div style={{ height: 4, borderRadius: 4, background: 'rgba(127,127,127,.25)', overflow: 'hidden', marginTop: 2 }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, var(--brand), var(--brand2))', transition: 'width 1s linear' }} />
            </div>}
            {p.nextSubject && p.nextStart && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, opacity: .6, marginTop: 'auto' }}>
              <ArrowRight size={11} /> {hm(p.nextStart)} {p.nextSubject}
            </div>}
            {!isNow && !p.nextSubject && <div style={{ fontSize: 11, opacity: .6, marginTop: 'auto' }}>через {untilText(p.start - now)}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
