// БРС и сессия. Из Sources/BRS.swift и Session.swift.
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Star, GraduationCap, MapPin, Clock, ExternalLink, Trophy } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, Field, Segmented, Ring, AnimatedNumber, Progress, toast, confirmDialog, KindBadge, openMenu } from '../../ui/kit'
import { gradesStore, grades, total, ratio, forecast, statusColor, nextStep, num, newEntry, CONTROL_TITLES, type SubjectGrades } from '../../lib/grades'
import { useSchedule } from '../../lib/scheduleStore'
import { subjects } from '../../lib/schedule'
import { session, sessionStore, daysLeft, isConsult, ticketSet, learned, shaky, type SessionExam } from '../../lib/session'
import { fullDay, hm, plural, dayMon, toLocalInput, fromLocalInput, addDays } from '../../lib/date'
import { openSiteByKey } from '../../sites/sites'
import { celebrations } from '../../fx/Celebrations'
import { safu } from '../../lib/bridge'
import { mapsURL } from '../../lib/maps'
import { usePref } from '../../lib/kv'

// ---------- БРС ----------

export function Grades() {
  const list = gradesStore.use()
  const data = useSchedule(s => s.data)
  const [open, setOpen] = useState<string | null>(null)
  const missing = subjects(data).filter(s => !list.some(g => g.subject === s))
  const avg = grades.average()
  const g = list.find(x => x.id === open)
  return (
    <>
      <PageHeader title="БРС" subtitle="Баллы за лабы, тесты и посещения — и прогноз оценки" right={<>
        <button className="btn" onClick={() => openSiteByKey('lk')}><ExternalLink size={15} /> Личный кабинет</button>
        <button className="btn" onClick={() => openSiteByKey('sakai')}><ExternalLink size={15} /> Sakai</button>
      </>} />
      {list.length > 0 && (
        <div className="grid g4 mb16">
          <Card className="row"><Ring value={avg / 100} size={64}><span className="small heavy">{Math.round(avg)}</span></Ring><div><div className="tiny muted">Средний балл</div><div className="bold">по {list.filter(x => x.entries.length).length} предметам</div></div></Card>
          <Card delay={0.04}><div className="tiny muted">Идёшь на «5»</div><div className="heavy" style={{ fontSize: '2rem', color: '#22c55e' }}><AnimatedNumber value={list.filter(x => forecast(x) === '5').length} /></div></Card>
          <Card delay={0.08}><div className="tiny muted">Автоматы</div><div className="heavy" style={{ fontSize: '2rem', color: 'var(--brand)' }}><AnimatedNumber value={list.filter(x => total(x) >= x.auto).length} /></div></Card>
          <Card delay={0.12}><div className="tiny muted">В зоне риска</div><div className="heavy" style={{ fontSize: '2rem', color: '#ef4444' }}><AnimatedNumber value={list.filter(x => total(x) < x.pass && x.entries.length).length} /></div></Card>
        </div>
      )}
      {!list.length && <Empty emoji="⭐" title="Добавь предметы" text="Нажми «Добавить все из расписания» — и вписывай баллы за лабы, тесты и посещения." />}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {list.map((x, i) => (
          <Card key={x.id} press tilt delay={i * 0.03} onClick={() => setOpen(x.id)}>
            <div className="row top">
              <Ring value={ratio(x)} size={66} stroke={7} color={statusColor(x)}><div className="tc"><div className="heavy">{num(total(x))}</div><div className="tiny faint">из {x.max}</div></div></Ring>
              <div className="grow">
                <div className="bold clamp2">{x.subject}</div>
                <div className="tiny muted mt4">{CONTROL_TITLES[x.control]} · прогноз: <b style={{ color: statusColor(x) }}>{forecast(x)}</b></div>
                <div className="small mt8" style={{ color: statusColor(x), fontWeight: 700 }}>{nextStep(x)}</div>
              </div>
            </div>
            <div className="mt12" style={{ position: 'relative', height: 8, borderRadius: 8, background: 'var(--fill2)' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${ratio(x) * 100}%` }} transition={{ duration: 1, delay: i * 0.03 }} style={{ height: '100%', borderRadius: 8, background: statusColor(x) }} />
              {[x.pass, x.good, x.excellent].map((t, j) => <div key={j} title={['3 / зачёт', '4', '5'][j]} style={{ position: 'absolute', top: -3, left: `${(t / x.max) * 100}%`, width: 2, height: 14, background: 'var(--text3)' }} />)}
            </div>
          </Card>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="row mt16">
          <button className="btn primary" onClick={() => { grades.addMany(missing); toast(`Добавлено: ${missing.length}`) }}><Plus size={15} /> Добавить все из расписания ({missing.length})</button>
          <button className="btn" onClick={e => openMenu(e, missing.map(s => ({ label: s, run: () => grades.addMany([s]) })))}>Выбрать предмет…</button>
        </div>
      )}
      <GradeSheet g={g || null} onClose={() => setOpen(null)} />
    </>
  )
}

function GradeSheet({ g, onClose }: { g: SubjectGrades | null; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [pts, setPts] = useState('')
  if (!g) return <Sheet open={false} onClose={onClose} />
  const set = (p: Partial<SubjectGrades>) => grades.upsert({ ...g, ...p })
  return (
    <Sheet open={!!g} onClose={onClose} size="wide" title={g.subject} headRight={<button className="btn icon sm ghost danger" onClick={async () => { if (await confirmDialog('Убрать предмет из БРС?', undefined, 'Убрать', true)) { grades.remove(g.id); onClose() } }}><Trash2 size={16} /></button>}>
      <div className="grid g2" style={{ gap: 22, alignItems: 'start' }}>
        <div>
          <div className="row mb16">
            <Ring value={ratio(g)} size={110} stroke={10} color={statusColor(g)}><div className="tc"><div className="heavy" style={{ fontSize: '1.8rem' }}><AnimatedNumber value={total(g)} decimals={Number.isInteger(total(g)) ? 0 : 1} /></div><div className="tiny faint">из {g.max}</div></div></Ring>
            <div><div className="sub">Прогноз</div><div className="heavy" style={{ fontSize: '2rem', color: statusColor(g) }}>{forecast(g)}</div><div className="small bold" style={{ color: statusColor(g) }}>{nextStep(g)}</div></div>
          </div>
          <div className="h-sec">Оценки</div>
          <div className="col gap6">
            <AnimatePresence initial={false}>
              {g.entries.map(e => (
                <motion.div key={e.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="row" style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--fill)' }}>
                  <input className="input grow" style={{ height: 32 }} value={e.title} onChange={ev => set({ entries: g.entries.map(x => x.id === e.id ? { ...x, title: ev.target.value } : x) })} />
                  <input className="input" type="number" style={{ width: 80, height: 32 }} value={e.points} onChange={ev => set({ entries: g.entries.map(x => x.id === e.id ? { ...x, points: Number(ev.target.value) } : x) })} />
                  <span className="tiny faint" style={{ width: 50 }}>{dayMon(e.date)}</span>
                  {e.source && <span className="pill">{e.source}</span>}
                  <button className="btn icon sm ghost" onClick={() => set({ entries: g.entries.filter(x => x.id !== e.id) })}><Trash2 size={14} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="row mt8">
            <input className="input grow" placeholder="Лаба 3, тест, посещения…" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="input" type="number" placeholder="баллы" style={{ width: 100 }} value={pts} onChange={e => setPts(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && pts) { set({ entries: [...g.entries, newEntry(title || 'Работа', Number(pts))] }); setTitle(''); setPts('') } }} />
            <button className="btn primary" disabled={!pts} onClick={() => { set({ entries: [...g.entries, newEntry(title || 'Работа', Number(pts))] }); setTitle(''); setPts('') }}><Plus size={15} /></button>
          </div>
          <div className="row wrap-row gap6 mt8">{['Посещения', 'Лабораторная', 'Тест', 'Контрольная', 'Доклад', 'Бонус'].map(t => <button key={t} className="chip" onClick={() => setTitle(t)}>{t}</button>)}</div>
        </div>
        <div>
          <Field label="Форма контроля"><Segmented value={g.control} onChange={v => set({ control: v as any })} options={CONTROL_TITLES.map((t, i) => ({ value: i, label: t }))} /></Field>
          <div className="grid g2">
            <Field label={g.control === 0 ? 'Зачёт от' : '«3» от'}><input className="input" type="number" value={g.pass} onChange={e => set({ pass: +e.target.value })} /></Field>
            {g.control !== 0 && <Field label="«4» от"><input className="input" type="number" value={g.good} onChange={e => set({ good: +e.target.value })} /></Field>}
            {g.control !== 0 && <Field label="«5» от"><input className="input" type="number" value={g.excellent} onChange={e => set({ excellent: +e.target.value })} /></Field>}
            <Field label="Автомат от"><input className="input" type="number" value={g.auto} onChange={e => set({ auto: +e.target.value })} /></Field>
            <Field label="Максимум"><input className="input" type="number" value={g.max} onChange={e => set({ max: +e.target.value })} /></Field>
          </div>
          <Field label="Итог после сессии">
            <div className="row wrap-row gap6">
              {(g.control === 0 ? ['зачёт', 'незачёт'] : ['5', '4', '3', '2']).map(r => (
                <button key={r} className={`chip ${g.result === r ? 'on' : ''}`} onClick={() => { const v = g.result === r ? '' : r; set({ result: v }); if (v && v !== '2' && v !== 'незачёт') celebrations.examPassed(g.subject, v) }}>{r}</button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    </Sheet>
  )
}

// ---------- сессия ----------

export function Session() {
  const data = useSchedule(s => s.data)
  sessionStore.use()
  const [open, setOpen] = useState<SessionExam | null>(null)
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = usePref('session.mode', 0)
  const [win, setWin] = usePref('session.window', 21)
  const exams = session.exams(data)
  const main = exams.filter(e => !isConsult(e))
  const next = main[0]
  const totalTickets = main.reduce((a, e) => a + ticketSet(e.subject).total, 0)
  const learnedAll = main.reduce((a, e) => a + learned(ticketSet(e.subject)), 0)
  return (
    <>
      <PageHeader title="Сессия" subtitle={next ? `${main.length} ${plural(main.length, 'экзамен', 'экзамена', 'экзаменов')} и зачётов впереди` : 'Экзаменов пока нет'} right={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Экзамен</button>} />
      {next ? (
        <Card tilt style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(500px 260px at 100% 0%, rgba(239,68,68,.25), transparent)' }} />
          <div className="row" style={{ position: 'relative', gap: 30 }}>
            <div className="tc">
              <div className="grad-text" style={{ fontSize: '5rem', fontWeight: 900, lineHeight: 1 }}><AnimatedNumber value={daysLeft(next)} /></div>
              <div className="muted">{plural(daysLeft(next), 'день', 'дня', 'дней')}</div>
            </div>
            <div className="grow">
              <div className="tiny heavy" style={{ color: '#ef4444' }}>БЛИЖАЙШИЙ — {next.kind.toUpperCase()}</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 850, margin: '6px 0' }}>{next.subject}</div>
              <div className="row gap14 muted"><span className="row gap6 cap"><Clock size={14} />{fullDay(next.start)}, {hm(next.start)}</span>{next.room && <span className="row gap6"><MapPin size={14} />ауд. {next.room}</span>}</div>
            </div>
            {totalTickets > 0 && <Ring value={learnedAll / totalTickets} size={110} stroke={10}><div className="tc"><div className="heavy">{Math.round(learnedAll / totalTickets * 100)}%</div><div className="tiny faint">билетов</div></div></Ring>}
          </div>
        </Card>
      ) : <Empty emoji="🎓" title="Экзаменов пока нет" text="Как только их выложат в РУЗ, они появятся здесь. Можно добавить свой экзамен кнопкой «+»." />}
      <div className="col gap8">
        {exams.map((e, i) => {
          const t = ticketSet(e.subject)
          return (
            <motion.div key={e.id} className="card hover press row" style={{ padding: 14 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => !isConsult(e) && setOpen(e)}>
              <div className="tc" style={{ width: 64 }}><div className="heavy" style={{ fontSize: '1.5rem' }}>{daysLeft(e)}</div><div className="tiny faint">{plural(daysLeft(e), 'день', 'дня', 'дней')}</div></div>
              <div className="grow"><div className="row gap6"><KindBadge kind={e.kind} />{e.manual && <span className="pill">своё</span>}</div><div className="bold mt4">{e.subject}</div><div className="tiny muted cap">{fullDay(e.start)}, {hm(e.start)}{e.room ? ` · ауд. ${e.room}` : ''}</div></div>
              {!isConsult(e) && <div style={{ width: 160 }}><div className="tiny muted mb8">билеты: знаю {learned(t)}, повторить {shaky(t)}</div><Progress value={t.total ? learned(t) / t.total : 0} /></div>}
              {e.manual && <button className="btn icon sm ghost" onClick={ev => { ev.stopPropagation(); session.removeManual(e.id) }}><Trash2 size={14} /></button>}
            </motion.div>
          )
        })}
      </div>
      <div className="h-sec">Режим сессии</div>
      <Card className="row wrap-row">
        <Segmented value={mode} onChange={setMode} options={[{ value: 0, label: 'Сам' }, { value: 1, label: 'Всегда' }, { value: 2, label: 'Выключен' }]} />
        <span className="sub">Включается за</span>
        <Segmented value={win} onChange={setWin} options={[7, 14, 21, 30].map(v => ({ value: v, label: `${v} дн` }))} />
        <span className="sub">до первого экзамена — карточка появится на главной</span>
      </Card>
      <TicketsSheet exam={open} onClose={() => setOpen(null)} />
      <AddExam open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

function TicketsSheet({ exam, onClose }: { exam: SessionExam | null; onClose: () => void }) {
  sessionStore.use()
  if (!exam) return <Sheet open={false} onClose={onClose} />
  const t = ticketSet(exam.subject)
  return (
    <Sheet open={!!exam} onClose={onClose} size="wide" title={exam.subject}
      headRight={exam.address ? <button className="btn sm" onClick={() => safu.shell.open(mapsURL(exam.address))}><MapPin size={14} /> На карте</button> : undefined}>
      <div className="row mb16">
        <div className="grow"><div className="sub cap">{fullDay(exam.start)}, {hm(exam.start)}</div><div className="small mt4">Знаю <b style={{ color: '#22c55e' }}>{learned(t)}</b> · повторить <b style={{ color: '#f59e0b' }}>{shaky(t)}</b> · не трогал {t.total - learned(t) - shaky(t)}</div></div>
        <span className="sub">Билетов:</span><input className="input" type="number" style={{ width: 90 }} value={t.total} onChange={e => session.setTotal(exam.subject, Math.max(1, Math.min(200, +e.target.value)))} />
      </div>
      <div className="tiny faint mb8">Нажми на билет: один раз — «повторить», два — «знаю», три — сбросить</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 8 }}>
        {Array.from({ length: t.total }, (_, i) => i + 1).map(n => {
          const v = t.states[n] || 0
          return (
            <motion.button key={n} whileTap={{ scale: 0.85 }} animate={{ scale: v === 2 ? [1, 1.15, 1] : 1 }} onClick={() => session.cycle(n, exam.subject)}
              style={{ height: 52, borderRadius: 14, border: '1.5px solid var(--line2)', cursor: 'pointer', fontWeight: 800, fontSize: 16, background: v === 2 ? '#22c55e' : v === 1 ? '#f59e0b' : 'var(--fill)', color: v ? '#fff' : 'var(--text)' }}>{n}</motion.button>
          )
        })}
      </div>
      {learned(t) === t.total && <div className="row mt16" style={{ padding: 14, borderRadius: 14, background: 'rgba(34,197,94,.14)', color: '#22c55e' }}><Trophy size={18} /> Все билеты выучены — ты готов!</div>}
    </Sheet>
  )
}

function AddExam({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState('Экзамен')
  const [start, setStart] = useState(addDays(Date.now(), 14))
  const [room, setRoom] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Свой экзамен" footer={<button className="btn primary" disabled={!subject.trim()} onClick={() => { session.addManual({ subject: subject.trim(), kind, start, room, address: '' }); onClose(); setSubject('') }}>Добавить</button>}>
      <Field label="Предмет"><input className="input" list="ex-s" value={subject} onChange={e => setSubject(e.target.value)} autoFocus /><datalist id="ex-s">{subjects(data).map(s => <option key={s} value={s} />)}</datalist></Field>
      <Field label="Вид"><div className="row gap6">{['Экзамен', 'Зачёт', 'Консультация', 'Курсовая'].map(k => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}</div></Field>
      <Field label="Когда"><input type="datetime-local" className="input" value={toLocalInput(start)} onChange={e => setStart(fromLocalInput(e.target.value) || start)} /></Field>
      <Field label="Аудитория"><input className="input" value={room} onChange={e => setRoom(e.target.value)} /></Field>
    </Sheet>
  )
}
void Star; void GraduationCap
