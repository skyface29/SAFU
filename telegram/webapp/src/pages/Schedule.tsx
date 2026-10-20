// Пары недели из РУЗ; у пары видно, сколько ДЗ к ней сдавать. Нажал на пару — «что задали на этой паре?»
import { useEffect, useState } from 'react'
import type { Me, Slot } from '../../../shared/types'
import type { Nav } from '../App'
import { api } from '../api'
import { haptic } from '../tg'
import { Section, Empty, Skeletons, kindColor } from '../ui'
import { kindStyle } from '../../../shared/pretty'
import { relDay, startOfDay, hm, dayMon, addDays, monday } from '../../../shared/dates'

export function Schedule({ me, nav }: { me: Me; nav: Nav }) {
  const [week, setWeek] = useState(0)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const teacher = me.role === 'teacher'

  useEffect(() => {
    setSlots(null)
    // эта неделя — с сегодняшнего дня, следующие — с понедельника
    const today = startOfDay(Date.now())
    const from = week === 0 ? today : monday(today) + week * 7 * 86_400_000
    const offset = Math.round((from - today) / 86_400_000)
    api.schedule(offset, week === 0 ? 7 : 7).then(setSlots).catch(() => setSlots([]))
  }, [week])

  const now = Date.now()
  const days = new Map<number, Slot[]>()
  for (const s of slots ?? []) {
    const d = startOfDay(s.start)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(s)
  }
  const label = week === 0 ? 'Ближайшие 7 дней' : `${dayMon(monday(now) + week * 7 * 86_400_000)} – ${dayMon(addDays(monday(now) + week * 7 * 86_400_000, 6))}`

  const open = (s: Slot) => {
    haptic.tap()
    nav.push({ name: 'edit', preset: { subject: s.subject, anchor: s.start <= now ? s.start : undefined, kind: s.kind, groups: teacher ? s.groups : undefined } })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button className="pick" disabled={week <= 0} style={{ opacity: week <= 0 ? 0.4 : 1 }} onClick={() => setWeek(w => Math.max(0, w - 1))}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>{label}</div>
        <button className="pick" disabled={week >= 2} style={{ opacity: week >= 2 ? 0.4 : 1 }} onClick={() => setWeek(w => Math.min(2, w + 1))}>›</button>
      </div>
      {slots == null ? <Skeletons n={4} /> : !slots.length ? <Empty emoji="🛋" title="Пар нет" text="В РУЗ на эти дни ничего не стоит." /> : (
        [...days.entries()].map(([d, list]) => {
          const rel = relDay(d)
          return (
            <Section key={d} title={rel === 'сегодня' || rel === 'завтра' ? `${rel[0].toUpperCase()}${rel.slice(1)} · ${dayMon(d)}` : rel}>
              {list.map(s => {
                const k = kindStyle(s.kind)
                const cur = s.start <= now && now < s.end
                return (
                  <button key={`${s.start}-${s.subject}-${s.room}`} className={`slot ${cur ? 'now' : s.end < now ? 'past' : ''}`} style={{ ['--kind' as string]: kindColor(s.kind) }} onClick={() => open(s)}>
                    <div className="slot-time">{hm(s.start)}<small>{hm(s.end)}</small></div>
                    <div className="slot-bar" />
                    <div className="row-main">
                      <div className="row-title">{s.subject}</div>
                      <div className="row-sub">{[k.short, s.remote ? 'дистант' : s.room ? `ауд. ${s.room}` : '', teacher ? (s.groups ?? []).join(', ') : s.teacher].filter(Boolean).join(' · ')}</div>
                    </div>
                    {!!s.hw && <span className="chip blue">📚 {s.hw}</span>}
                    {cur && <span className="chip green">идёт</span>}
                  </button>
                )
              })}
            </Section>
          )
        })
      )}
      <div className="note" style={{ textAlign: 'center', paddingBottom: 12 }}>Нажми на пару, чтобы записать, что на ней задали. Расписание — из РУЗ САФУ.</div>
    </>
  )
}
