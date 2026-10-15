// Преподаватели (полное расписание по всему вузу), свободные аудитории, карта корпусов
import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, User, RefreshCw, MapPin, DoorOpen, Clock, ExternalLink, Navigation, Building2 } from 'lucide-react'
import { PageHeader, Card, Empty, Segmented, Progress, KindBadge, toast } from '../../ui/kit'
import { useSchedule, school, useSchool } from '../../lib/scheduleStore'
import { slotsRange, teachersOf, subjects, AddressFormat, BELLS, bellInterval, kindStyle, usesRuz, type Slot } from '../../lib/schedule'
import { type RuzEvent, findLecturerID, loadLecturer, cachedLecturer, sameLecturer, lecturerURL } from '../../lib/ruz'
import { shortDayTime, hm, fullDay, startOfDay, addDays, isToday, relDay, dayMon } from '../../lib/date'
import { safu } from '../../lib/bridge'
import { mapsURL, routeURL } from '../../lib/maps'
import { openURL } from '../../sites/sites'

// ---------- преподаватели ----------

export function Teachers({ name }: { name?: string }) {
  const data = useSchedule(s => s.data)
  const schoolState = useSchool()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [open, setOpen] = useState<string | null>(name || null)
  useEffect(() => { school.load(data.ruzInstitution) }, [])

  const mine = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of subjects(data)) for (const t of teachersOf(data, s)) for (const n of t.split(',').map(x => x.trim()).filter(x => x.length > 3)) {
      if (!m.has(n)) m.set(n, new Set()); m.get(n)!.add(s)
    }
    return [...m.entries()].map(([name, s]) => ({ name, subjects: [...s] })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [data])
  const all = useMemo(() => scope === 'all' ? school.teachers() : [], [scope, schoolState.events])
  const list = (scope === 'mine' ? mine : all).filter(t => !q || (t.name + t.subjects.join(' ')).toLowerCase().includes(q.toLowerCase()))

  if (open) return <TeacherDetail name={open} onBack={() => setOpen(null)} />

  return (
    <>
      <PageHeader title="Преподаватели" subtitle="Кто ведёт, где он сейчас и где будет" right={<>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Мои' }, { value: 'all', label: 'Весь САФУ' }]} />
        <div className="row" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)', height: 38, width: 260 }}>
          <Search size={15} className="faint" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Фамилия или предмет" style={{ background: 'none', border: 'none', outline: 'none', flex: 1 }} />
        </div>
      </>} />
      {scope === 'all' && !schoolState.events.length && (
        <Card className="mb16">
          <div className="row"><div className="grow"><div className="bold">Расписание всего САФУ</div><div className="sub">Один проход по всем группам (несколько минут), дальше — мгновенный поиск любого преподавателя. Хранится на компьютере 12 часов.</div></div>
            <button className="btn primary" disabled={schoolState.progress != null} onClick={() => school.ensure(data.ruzInstitution, true)}><RefreshCw size={15} className={schoolState.progress != null ? 'spin' : ''} /> {schoolState.progress != null ? `${Math.round(schoolState.progress * 100)}%` : 'Собрать'}</button></div>
          {schoolState.progress != null && <div className="mt12"><Progress value={schoolState.progress} /></div>}
          {schoolState.error && <div className="small mt8" style={{ color: '#ef4444' }}>{schoolState.error}</div>}
        </Card>
      )}
      {!list.length && <Empty emoji="🧑‍🏫" title="Никого не нашлось" />}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {list.slice(0, 300).map((t, i) => (
          <Card key={t.name} press delay={Math.min(i, 20) * 0.02} onClick={() => setOpen(t.name)} className="row top">
            <div className="icon-tile" style={{ width: 42, height: 42, borderRadius: '50%', background: `hsl(${[...t.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 60% 50%)`, fontWeight: 800 }}>{t.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
            <div className="grow"><div className="bold">{t.name}</div><div className="tiny muted clamp2">{t.subjects.join(', ')}</div></div>
          </Card>
        ))}
      </div>
    </>
  )
}

function TeacherDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const data = useSchedule(s => s.data)
  const [events, setEvents] = useState<RuzEvent[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'fallback'>('loading')
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const lid = data.ruzGroupID ? await findLecturerID(name, data.ruzGroupID) : null
      if (!alive) return
      setId(lid)
      if (lid) {
        const c = cachedLecturer(lid)
        if (c) { setEvents(c.events); setState('ok') }
        try { const ev = await loadLecturer(lid); if (alive) { setEvents(ev); setState('ok') } } catch { if (!c && alive) setState('fallback') }
      } else {
        // РУЗ не дал страницу преподавателя — собираем из своего расписания и расписания школы
        const own = data.ruzEvents.filter(e => sameLecturer(e.teacher, name) || e.teacher.includes(name))
        const sch = useSchool.getState().events.filter(x => sameLecturer(x.e.teacher, name)).map(x => ({ ...x.e, teacher: `Группа ${x.group}` }))
        setEvents([...own, ...sch].sort((a, b) => a.start - b.start))
        setState('fallback')
      }
    })()
    return () => { alive = false }
  }, [name])
  const upcoming = (events || []).filter(e => e.end > Date.now()).slice(0, 60)
  const now = upcoming.find(e => e.start <= Date.now())
  const byDay = new Map<number, RuzEvent[]>()
  for (const e of upcoming) { const d = startOfDay(e.start); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(e) }
  return (
    <>
      <PageHeader title={name} subtitle={state === 'fallback' ? 'Пары из твоего расписания и расписания школы' : 'Все пары по САФУ на 4 недели вперёд'} right={<>
        {id && <button className="btn" onClick={() => openURL(lecturerURL(id), 'РУЗ')}><ExternalLink size={15} /> В РУЗ</button>}
        <button className="btn" onClick={onBack}>Все преподаватели</button>
      </>} />
      {now && (
        <Card className="mb16" style={{ borderColor: '#22c55e88' }}>
          <div className="row"><span className="live-dot" /><span className="tiny heavy" style={{ color: '#22c55e' }}>СЕЙЧАС НА ПАРЕ</span></div>
          <div className="h-card mt8">{now.subject}</div>
          <div className="sub">до {hm(now.end)}{now.room ? ` · ауд. ${now.room}` : ''} · {AddressFormat.full(now.address)} · {now.teacher}</div>
        </Card>
      )}
      {state === 'loading' && !events && <div className="col gap8">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)}</div>}
      {events && !upcoming.length && <Empty emoji="📭" title="Ближайших пар не найдено" />}
      <div className="col gap16">
        {[...byDay.entries()].map(([d, list]) => (
          <div key={d}>
            <div className="h-card cap mb8" style={{ color: isToday(d) ? 'var(--brand)' : undefined }}>{relDay(d)}</div>
            <div className="col gap6">
              {list.map((e, i) => (
                <motion.div key={i} className="row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--fill)', borderLeft: `3px solid ${kindStyle(e.kind).color}` }}>
                  <span className="bold mono" style={{ width: 90 }}>{hm(e.start)}–{hm(e.end)}</span>
                  <div className="grow"><div className="bold small">{e.subject}</div><div className="tiny muted">{e.teacher}{e.room ? ` · ауд. ${e.room}` : ''}</div></div>
                  <KindBadge kind={e.kind} filled={false} />
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- свободные аудитории ----------

export function FreeRooms() {
  const data = useSchedule(s => s.data)
  const st = useSchool()
  const [day, setDay] = useState(startOfDay(Date.now()))
  const [pair, setPair] = useState(() => { const m = new Date().getHours() * 60 + new Date().getMinutes(); const i = BELLS.findIndex(b => b[2] * 60 + b[3] > m); return i < 0 ? 1 : i + 1 })
  const [addr, setAddr] = useState('')
  useEffect(() => { school.load(data.ruzInstitution) }, [])
  const busy = useMemo(() => st.events.map(x => { const loc = AddressFormat.decode(x.e.room, x.e.address, data.buildings); return { room: loc.room, address: loc.address, start: x.e.start, end: x.e.end } })
    .filter(b => b.room && b.address && !AddressFormat.isRemote(b.address) && !AddressFormat.isRemote(b.room)), [st.events])
  const addresses = useMemo(() => { const c = new Map<string, number>(); for (const b of busy) c.set(b.address, (c.get(b.address) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) }, [busy])
  const address = addr || addresses[0] || ''
  const iv = bellInterval(pair, day)
  const free = useMemo(() => {
    if (!iv) return []
    const here = busy.filter(b => b.address === address)
    const rooms = [...new Set(here.map(b => b.room))]
    const dayEnd = addDays(day, 1)
    return rooms.filter(r => !here.some(b => b.room === r && b.start < iv[1] && b.end > iv[0]))
      .map(r => ({ room: r, until: here.filter(b => b.room === r && b.start >= iv[1] && b.start < dayEnd).map(b => b.start).sort((a, b) => a - b)[0] }))
      .sort((a, b) => a.room.localeCompare(b.room, 'ru', { numeric: true }))
  }, [busy, address, pair, day])

  return (
    <>
      <PageHeader title="Свободные аудитории" subtitle="Где можно сесть позаниматься между парами" right={
        <button className="btn" disabled={st.progress != null} onClick={() => school.ensure(data.ruzInstitution, true)}><RefreshCw size={15} className={st.progress != null ? 'spin' : ''} /> {st.progress != null ? `${Math.round(st.progress * 100)}%` : st.scannedAt ? 'Обновить' : 'Собрать из РУЗ'}</button>} />
      {st.progress != null && <div className="mb16"><Progress value={st.progress} /></div>}
      {!busy.length ? (
        <Empty emoji="🚪" title="Нужно собрать расписание аудиторий" text="Приложение один раз пройдёт по расписаниям всех групп и узнает, какие аудитории когда заняты. Это несколько минут; данные хранятся 12 часов." action={<button className="btn primary" onClick={() => school.ensure(data.ruzInstitution, true)}>Собрать из РУЗ</button>} />
      ) : (
        <>
          <Card className="mb16">
            <div className="row wrap-row mb12">
              {Array.from({ length: 7 }, (_, i) => addDays(startOfDay(Date.now()), i)).map(d => <button key={d} className={`chip ${day === d ? 'on' : ''}`} onClick={() => setDay(d)}>{isToday(d) ? 'Сегодня' : `${relDay(d).split(',')[0]} ${dayMon(d)}`}</button>)}
            </div>
            <div className="row wrap-row mb12">{BELLS.map((b, i) => <button key={i} className={`chip ${pair === i + 1 ? 'on' : ''}`} onClick={() => setPair(i + 1)}>{i + 1} пара · {b[0]}:{String(b[1]).padStart(2, '0')}</button>)}</div>
            <select className="select" value={address} onChange={e => setAddr(e.target.value)}>{addresses.map(a => <option key={a} value={a}>{a}</option>)}</select>
          </Card>
          <div className="row mb12"><DoorOpen size={18} color="#22c55e" /><div className="h-card">Свободно: {free.length}</div><span className="sub">{address}</span></div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {free.map((f, i) => (
              <motion.div key={f.room} className="card tight" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 30) * 0.012 }}>
                <div className="heavy" style={{ fontSize: '1.3rem' }}>{f.room}</div>
                <div className="tiny muted">{f.until ? `свободна до ${hm(f.until)}` : 'свободна до конца дня'}</div>
              </motion.div>
            ))}
          </div>
          <div className="tiny faint mt16">Аудитории без пар в РУЗ могут быть закрыты — это подсказка, а не гарантия.</div>
        </>
      )}
    </>
  )
}

// ---------- карта корпусов ----------

export function CampusMap() {
  const data = useSchedule(s => s.data)
  const slots = useMemo(() => slotsRange(Date.now(), 14, data).filter(s => s.address && !s.remote), [data])
  const places = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots) { if (!m.has(s.address)) m.set(s.address, []); m.get(s.address)!.push(s) }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [slots])
  const [sel, setSel] = useState(0)
  const cur = places[sel]
  return (
    <>
      <PageHeader title="Карта корпусов" subtitle="Где проходят твои пары в ближайшие две недели" />
      {!places.length ? <Empty emoji="🗺️" title="Адресов пока нет" text="Они появятся вместе с расписанием." /> : (
        <div className="grid" style={{ gridTemplateColumns: '340px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div className="col gap8">
            {places.map(([a, l], i) => (
              <motion.div key={a} whileHover={{ x: 3 }} onClick={() => setSel(i)} className="card tight row" style={{ cursor: 'pointer', borderColor: sel === i ? 'var(--brand)' : undefined }}>
                <div className="icon-tile" style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)' }}><Building2 size={16} /></div>
                <div className="grow"><div className="bold small">{a}</div><div className="tiny muted">{l.length} пар · ближайшая {shortDayTime(l[0].start)}</div></div>
              </motion.div>
            ))}
          </div>
          {cur && (
            <Card flush style={{ minHeight: 520, display: 'flex', flexDirection: 'column' }}>
              <div className="row" style={{ padding: 14 }}>
                <MapPin size={18} color="var(--brand)" /><div className="grow bold">{cur[0]}</div>
                <button className="btn sm" onClick={() => safu.shell.open(routeURL(cur[0]))}><Navigation size={14} /> Маршрут</button>
                <button className="btn sm" onClick={() => openURL(mapsURL(cur[0]), 'Яндекс Карты')}><ExternalLink size={14} /> Карта</button>
              </div>
              <webview src={`https://yandex.ru/maps/?text=${encodeURIComponent('Архангельск, ' + cur[0])}`} partition="persist:sites" style={{ flex: 1, minHeight: 420 }} />
            </Card>
          )}
        </div>
      )}
    </>
  )
}
void Clock; void User; void fullDay; void usesRuz; void toast
