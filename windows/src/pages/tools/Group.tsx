// Для старост и преподавателей: посещаемость, рассылка группе, опросы. Из Attendance.swift, Polls.swift, Features.swift.
import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Users, Check, Download, Copy, Trash2, Plus, BarChart3, X, Send, Megaphone, ClipboardList, Lock, Unlock } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, Field, Segmented, toast, confirmDialog, KindBadge, Progress, openMenu } from '../../ui/kit'
import { createCollection, uid } from '../../lib/kv'
import { useSchedule } from '../../lib/scheduleStore'
import { slotsRange, kindStyle, type Slot, subjects } from '../../lib/schedule'
import { addDays, startOfDay, shortDayTime, fullDay, hm, dayMonth, ymd, toLocalInput, fromLocalInput, plural } from '../../lib/date'
import { safu } from '../../lib/bridge'

// ---------- модель (ключ attendance.v1 как в iOS) ----------

export type Mark = 'present' | 'absent' | 'excused'
const MARKS: { id: Mark; sym: string; title: string; color: string }[] = [
  { id: 'present', sym: '+', title: 'Был', color: '#29bf6b' },
  { id: 'absent', sym: '−', title: 'Н/б', color: '#f2474d' },
  { id: 'excused', sym: 'У', title: 'Уваж.', color: '#ff9e1a' }
]
type Student = { id: string; name: string }
type ALesson = { key: string; subject: string; kind: string; start: number }
type AData = { students: Student[]; marks: Record<string, Record<string, Mark>>; lessons: Record<string, ALesson> }

export const attendanceStore = createCollection<AData>('attendance.v1', { students: [], marks: {}, lessons: {} })
const keyOf = (s: Slot) => `${Math.floor(s.start / 1000)}|${s.subject}`
const sorted = (l: Student[]) => [...l].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))

const att = {
  set(m: Mark | null, st: Student, s: Slot) {
    attendanceStore.set(d => {
      const k = keyOf(s)
      const marks = { ...(d.marks[k] || {}) }
      if (m) marks[st.id] = m; else delete marks[st.id]
      return { ...d, lessons: { ...d.lessons, [k]: { key: k, subject: s.subject, kind: s.kind, start: s.start } }, marks: { ...d.marks, [k]: marks } }
    })
  },
  all(m: Mark | null, s: Slot) {
    attendanceStore.set(d => {
      const k = keyOf(s)
      const marks: Record<string, Mark> = {}
      if (m) for (const st of d.students) marks[st.id] = m
      return { ...d, lessons: { ...d.lessons, [k]: { key: k, subject: s.subject, kind: s.kind, start: s.start } }, marks: { ...d.marks, [k]: marks } }
    })
  },
  add(names: string[]) {
    attendanceStore.set(d => {
      const ex = new Set(d.students.map(s => s.name.toLowerCase()))
      const fresh = names.map(n => n.trim()).filter(n => n && !ex.has(n.toLowerCase()))
      return { ...d, students: [...d.students, ...fresh.map(name => ({ id: uid(), name }))] }
    })
  },
  remove(id: string) { attendanceStore.set(d => ({ ...d, students: d.students.filter(s => s.id !== id) })) },
  stats(d: AData, st: Student, subject?: string) {
    let p = 0, a = 0, e = 0
    for (const [k, m] of Object.entries(d.marks)) {
      if (subject && d.lessons[k]?.subject !== subject) continue
      const v = m[st.id]
      if (v === 'present') p++; else if (v === 'absent') a++; else if (v === 'excused') e++
    }
    return { p, a, e }
  },
  report(d: AData, s: Slot) {
    const m = d.marks[keyOf(s)] || {}
    const list = sorted(d.students)
    const by = (x: Mark) => list.filter(st => m[st.id] === x).map(st => st.name)
    const lines = [`📋 ${s.subject} (${kindStyle(s.kind).label.toLowerCase()}), ${dayMonth(s.start)}, ${hm(s.start)}`, `Были: ${by('present').length} из ${list.length}`]
    if (by('absent').length) lines.push(`Отсутствовали: ${by('absent').join(', ')}`)
    if (by('excused').length) lines.push(`По уважительной: ${by('excused').join(', ')}`)
    return lines.join('\n')
  },
  csv(d: AData, subject?: string) {
    const lessons = Object.values(d.lessons).filter(l => (!subject || l.subject === subject) && Object.keys(d.marks[l.key] || {}).length).sort((a, b) => a.start - b.start)
    const head = ['Студент', ...lessons.map(l => `${ymd(l.start)} ${hm(l.start)} ${l.subject} (${kindStyle(l.kind).label})`), 'Был', 'Н/б', 'Уваж.']
    const rows = sorted(d.students).map(st => {
      const s = att.stats(d, st, subject)
      return [st.name, ...lessons.map(l => MARKS.find(m => m.id === d.marks[l.key]?.[st.id])?.sym || ''), s.p, s.a, s.e]
    })
    return '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  }
}

// ---------- посещаемость ----------

export function Attendance({ slot: slotParam }: { slot?: number; subject?: string }) {
  const data = useSchedule(s => s.data)
  const d = attendanceStore.use()
  const recent = useMemo(() => slotsRange(addDays(startOfDay(Date.now()), -7), 8, data).filter(s => s.start <= Date.now() + 3600_000).reverse(), [data])
  const [sel, setSel] = useState<string>(() => {
    const p = slotParam ? recent.find(s => Math.abs(s.start - slotParam) < 90_000) : null
    return (p || recent.find(s => s.start <= Date.now()) || recent[0])?.key || ''
  })
  const [roster, setRoster] = useState(false)
  const [stats, setStats] = useState(false)
  const slot = recent.find(s => s.key === sel)
  const marks = slot ? d.marks[keyOf(slot)] || {} : {}
  const list = sorted(d.students)
  const present = list.filter(st => marks[st.id] === 'present').length

  return (
    <>
      <PageHeader title="Посещаемость" subtitle={`${d.students.length} ${plural(d.students.length, 'человек', 'человека', 'человек')} в группе`} right={<>
        <button className="btn" onClick={() => setStats(true)}><BarChart3 size={16} /> Статистика и таблица</button>
        <button className="btn" onClick={() => setRoster(true)}><Users size={16} /> Список группы</button>
      </>} />
      {!d.students.length ? (
        <Empty emoji="👥" title="Сначала добавь группу" text="Один раз внеси список ребят — можно вставить сразу всех, по одному в строке." action={<button className="btn primary" onClick={() => setRoster(true)}><UserPlus size={16} /> Добавить студентов</button>} />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '320px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <Card className="col gap6" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            <div className="tiny faint bold mb8">ЗАНЯТИЯ ЗА НЕДЕЛЮ</div>
            {!recent.length && <div className="sub">Нет занятий за последнюю неделю</div>}
            {recent.map(s => {
              const n = Object.keys(d.marks[keyOf(s)] || {}).length
              return (
                <motion.div key={s.key} whileHover={{ x: 3 }} onClick={() => setSel(s.key)} className="row"
                  style={{ padding: '9px 10px', borderRadius: 12, cursor: 'pointer', background: sel === s.key ? 'rgba(var(--brand-rgb), .15)' : 'var(--fill)', border: `1.5px solid ${sel === s.key ? 'var(--brand)' : 'transparent'}` }}>
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: kindStyle(s.kind).color }} />
                  <div className="grow"><div className="small bold ellipsis">{s.subject}</div><div className="tiny muted">{shortDayTime(s.start)}</div></div>
                  {n > 0 && <Check size={15} color="#22c55e" />}
                </motion.div>
              )
            })}
          </Card>
          {slot && (
            <Card>
              <div className="row top mb12">
                <div className="grow"><div className="h-card">{slot.subject}</div><div className="row gap6 mt4"><KindBadge kind={slot.kind} /><span className="sub cap">{fullDay(slot.start)}, {hm(slot.start)}</span></div></div>
                <div className="tc"><div className="heavy" style={{ fontSize: '1.6rem' }}>{present}/{list.length}</div><div className="tiny muted">были</div></div>
              </div>
              <Progress value={list.length ? present / list.length : 0} />
              <div className="row mt12 mb12 wrap-row">
                <button className="btn sm" onClick={() => att.all('present', slot)}><Check size={14} /> Все были</button>
                <button className="btn sm" onClick={() => att.all(null, slot)}>Сбросить</button>
                <span className="spacer" />
                <button className="btn sm primary" onClick={() => { safu.clipboard.write(att.report(d, slot)); toast('Отчёт скопирован — вставь в чат') }}><Copy size={14} /> Отчёт по занятию</button>
              </div>
              <div className="tiny faint mb8">Нажимай + (был), − (не было) или У (уважительная). Повторное нажатие снимает отметку.</div>
              <div className="col gap6">
                {list.map((st, i) => (
                  <motion.div key={st.id} className="row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }}
                    style={{ padding: '6px 6px 6px 12px', borderRadius: 12, background: 'var(--fill)' }}>
                    <span className="tiny faint mono" style={{ width: 20 }}>{i + 1}</span>
                    <span className="grow small bold">{st.name}</span>
                    {MARKS.map(m => {
                      const on = marks[st.id] === m.id
                      return (
                        <motion.button key={m.id} whileTap={{ scale: 0.85 }} animate={{ scale: on ? 1.08 : 1 }} onClick={() => att.set(on ? null : m.id, st, slot)}
                          style={{ width: 38, height: 32, borderRadius: 10, border: `1.5px solid ${on ? m.color : 'var(--line2)'}`, background: on ? m.color : 'transparent', color: on ? '#fff' : m.color, fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>{m.sym}</motion.button>
                      )
                    })}
                  </motion.div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      <RosterSheet open={roster} onClose={() => setRoster(false)} />
      <StatsSheet open={stats} onClose={() => setStats(false)} />
    </>
  )
}

function RosterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = attendanceStore.use()
  const [text, setText] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Список группы" size="wide" footer={<button className="btn primary" onClick={onClose}>Готово</button>}>
      <div className="grid g2" style={{ gap: 20 }}>
        <div>
          <Field label="Вставить список целиком" hint="По одному человеку в строке. Можно скопировать список из беседы группы.">
            <textarea className="textarea" style={{ minHeight: 220 }} value={text} onChange={e => setText(e.target.value)} placeholder={'Иванов Иван\nПетрова Анна\n…'} />
          </Field>
          <button className="btn primary" disabled={!text.trim()} onClick={() => { att.add(text.split(/\r?\n/).map(s => s.replace(/^\d+[.)]\s*/, ''))); setText(''); toast('Добавлено') }}><UserPlus size={15} /> Добавить всех</button>
        </div>
        <div className="col gap6" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {sorted(d.students).map((s, i) => (
            <div key={s.id} className="row" style={{ padding: '7px 10px', borderRadius: 10, background: 'var(--fill)' }}>
              <span className="tiny faint" style={{ width: 22 }}>{i + 1}</span><span className="grow small">{s.name}</span>
              <button className="btn icon sm ghost" onClick={() => att.remove(s.id)}><X size={14} /></button>
            </div>
          ))}
          {!d.students.length && <div className="sub">Пока никого</div>}
        </div>
      </div>
    </Sheet>
  )
}

function StatsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = attendanceStore.use()
  const data = useSchedule(s => s.data)
  const [subject, setSubject] = useState('')
  const recorded = Object.values(d.lessons).filter(l => (!subject || l.subject === subject) && Object.keys(d.marks[l.key] || {}).length).length
  return (
    <Sheet open={open} onClose={onClose} title="Статистика" size="wide" footer={<>
      <button className="btn" onClick={() => { safu.clipboard.write(att.csv(d, subject || undefined)); toast('Таблица скопирована') }}><Copy size={15} /> Копировать</button>
      <button className="btn primary" onClick={async () => { const p = await safu.dialog.save({ name: `Посещаемость ${subject || 'все предметы'} ${ymd(Date.now())}.csv`, text: att.csv(d, subject || undefined), filters: [{ name: 'Таблица', extensions: ['csv'] }] }); if (p) toast('Таблица сохранена — открывается в Excel и Р7') }}><Download size={15} /> Таблица для Excel</button>
    </>}>
      <div className="row mb12"><select className="select" style={{ width: 320 }} value={subject} onChange={e => setSubject(e.target.value)}><option value="">Все предметы</option>{subjects(data).map(s => <option key={s} value={s}>{s}</option>)}</select><span className="sub">Отмечено занятий: {recorded}</span></div>
      <div className="col gap6">
        {sorted(d.students).map(st => {
          const s = att.stats(d, st, subject || undefined)
          const tot = s.p + s.a + s.e
          const pct = tot ? Math.round(s.p / tot * 100) : 0
          return (
            <div key={st.id} className="row" style={{ padding: '8px 12px', borderRadius: 12, background: 'var(--fill)' }}>
              <span className="grow small bold">{st.name}</span>
              <span className="tiny muted">был {s.p} · н/б {s.a} · уваж. {s.e}</span>
              <div style={{ width: 120 }}><Progress value={tot ? s.p / tot : 0} /></div>
              <span className="small heavy" style={{ width: 44, textAlign: 'right', color: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

// ---------- рассылка ----------

export function Broadcast() {
  const data = useSchedule(s => s.data)
  const slots = useMemo(() => slotsRange(Date.now(), 14, data).filter(s => s.end > Date.now()), [data])
  const [kind, setKind] = useState(0)
  const [key, setKey] = useState(slots[0]?.key || '')
  const [newTime, setNewTime] = useState(Date.now() + 86_400_000)
  const [room, setRoom] = useState('')
  const [extra, setExtra] = useState('')
  const s = slots.find(x => x.key === key)
  let text = ''
  if (s) {
    const when = `${fullDay(s.start)} в ${hm(s.start)}`
    const what = `«${s.subject}» (${kindStyle(s.kind).label.toLowerCase()})`
    text = [
      `📢 Перенос: пара ${what}, ${when}, переносится на ${fullDay(newTime)} в ${hm(newTime)}.`,
      `❌ Отмена: пары ${what}, ${when}, не будет.`,
      `🚪 Аудитория: пара ${what}, ${when}, пройдёт в ауд. ${room || '…'}.`,
      `⏰ Напоминание: ${when} — ${what}${s.room ? `, ауд. ${s.room}` : ''}.`,
      ''
    ][kind]
  }
  if (extra) text += (text ? '\n' : '') + extra
  return (
    <>
      <PageHeader title="Рассылка группе" subtitle="Готовое сообщение для чата группы за пару кликов" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card>
          <Field label="Что случилось"><div className="row wrap-row gap6">{['Перенос', 'Отмена', 'Другая аудитория', 'Напоминание', 'Своё'].map((k, i) => <button key={k} className={`chip ${kind === i ? 'on' : ''}`} onClick={() => setKind(i)}>{k}</button>)}</div></Field>
          {kind !== 4 && <Field label="Пара"><select className="select" value={key} onChange={e => setKey(e.target.value)}>{slots.map(x => <option key={x.key} value={x.key}>{shortDayTime(x.start)} · {x.subject}</option>)}</select></Field>}
          {kind === 0 && <Field label="Новое время"><input type="datetime-local" className="input" value={toLocalInput(newTime)} onChange={e => setNewTime(fromLocalInput(e.target.value) || newTime)} /></Field>}
          {kind === 2 && <Field label="Новая аудитория"><input className="input" value={room} onChange={e => setRoom(e.target.value)} /></Field>}
          <Field label="Добавить от себя"><textarea className="textarea" value={extra} onChange={e => setExtra(e.target.value)} /></Field>
        </Card>
        <Card>
          <div className="row mb12"><Megaphone size={18} color="var(--brand)" /><div className="h-card">Сообщение</div></div>
          <AnimatePresence mode="wait">
            <motion.div key={text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="wrap" style={{ padding: 16, borderRadius: 16, background: 'rgba(var(--brand-rgb), .12)', minHeight: 100, lineHeight: 1.5, userSelect: 'text' }}>{text || <span className="faint">Заполни поля слева</span>}</motion.div>
          </AnimatePresence>
          <div className="row mt12">
            <button className="btn primary grow" disabled={!text} onClick={() => { safu.clipboard.write(text); toast('Скопировано — вставь в чат группы') }}><Copy size={15} /> Скопировать</button>
            <button className="btn grow" disabled={!text} onClick={() => safu.shell.open(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`)}><Send size={15} /> В Telegram</button>
          </div>
        </Card>
      </div>
    </>
  )
}

// ---------- опросы ----------

type Poll = { id: string; question: string; options: string[]; created: number; answers: Record<string, number>; closed: boolean }
const pollsStore = createCollection<Poll[]>('polls.v1', [])
const MARK_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣']

const pollText = {
  invite: (p: Poll) => `📊 Опрос: ${p.question}\n\n${p.options.map((o, i) => `${MARK_EMOJI[Math.min(i, 7)]} ${o}`).join('\n')}\n\nОтветьте цифрой 🙏`,
  results(p: Poll, st: Student[]) {
    let t = `📊 Итоги: ${p.question}\n\n`
    p.options.forEach((o, i) => {
      const names = st.filter(s => p.answers[s.id] === i).map(s => s.name)
      t += `${MARK_EMOJI[Math.min(i, 7)]} ${o} — ${names.length}${names.length ? ': ' + names.join(', ') : ''}\n`
    })
    const silent = st.filter(s => p.answers[s.id] == null)
    if (silent.length) t += `\nНе ответили: ${silent.map(s => s.name).join(', ')}`
    return t
  },
  nudge: (p: Poll, st: Student[]) => `⏰ Напоминаю про опрос «${p.question}».\nЕщё не ответили: ${st.filter(s => p.answers[s.id] == null).map(s => s.name).join(', ')}`
}

export function Polls() {
  const polls = pollsStore.use()
  const d = attendanceStore.use()
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const p = polls.find(x => x.id === open)
  const list = sorted(d.students)
  const update = (np: Poll) => pollsStore.set(l => l.map(x => x.id === np.id ? np : x))
  return (
    <>
      <PageHeader title="Опросы" subtitle="Кто что ответил в чате — без хаоса" right={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Опрос</button>} />
      {!polls.length && <Empty emoji="📊" title="Опросов нет" text="Создай опрос, скопируй приглашение в чат и отмечай, кто что ответил." />}
      <div className="grid gauto">
        {polls.map((x, i) => {
          const answered = Object.keys(x.answers).length
          return (
            <Card key={x.id} press delay={i * 0.03} onClick={() => setOpen(x.id)}>
              <div className="row"><ClipboardList size={18} color="var(--brand)" /><div className="bold grow clamp2">{x.question}</div>{x.closed && <Lock size={14} className="faint" />}</div>
              <div className="sub mt8">{answered} из {list.length} ответили</div>
              <div className="mt8"><Progress value={list.length ? answered / list.length : 0} /></div>
            </Card>
          )
        })}
      </div>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Новый опрос" footer={<button className="btn primary" disabled={!q.trim() || opts.filter(o => o.trim()).length < 2} onClick={() => {
        pollsStore.set(l => [{ id: uid(), question: q.trim(), options: opts.map(o => o.trim()).filter(Boolean), created: Date.now(), answers: {}, closed: false }, ...l])
        setCreating(false); setQ(''); setOpts(['', ''])
      }}>Создать</button>}>
        <Field label="Вопрос"><input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Кто идёт на консультацию?" /></Field>
        <Field label="Варианты">
          <div className="col gap6">
            {opts.map((o, i) => <div key={i} className="row"><span>{MARK_EMOJI[i]}</span><input className="input grow" value={o} onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} />{opts.length > 2 && <button className="btn icon sm ghost" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><X size={14} /></button>}</div>)}
            {opts.length < 8 && <button className="btn sm" onClick={() => setOpts([...opts, ''])}><Plus size={14} /> Вариант</button>}
          </div>
        </Field>
      </Sheet>
      <Sheet open={!!p} onClose={() => setOpen(null)} size="wide" title={p?.question}
        headRight={p && <>
          <button className="btn icon sm ghost" title={p.closed ? 'Открыть' : 'Закрыть'} onClick={() => update({ ...p, closed: !p.closed })}>{p.closed ? <Unlock size={16} /> : <Lock size={16} />}</button>
          <button className="btn icon sm ghost danger" onClick={async () => { if (await confirmDialog('Удалить опрос?', undefined, 'Удалить', true)) { pollsStore.set(l => l.filter(x => x.id !== p.id)); setOpen(null) } }}><Trash2 size={16} /></button>
        </>}
        footer={p && <>
          <button className="btn" onClick={() => { safu.clipboard.write(pollText.invite(p)); toast('Приглашение скопировано') }}>Приглашение</button>
          <button className="btn" onClick={() => { safu.clipboard.write(pollText.nudge(p, list)); toast('Напоминание скопировано') }}>Напомнить молчунам</button>
          <button className="btn primary" onClick={() => { safu.clipboard.write(pollText.results(p, list)); toast('Итоги скопированы') }}>Итоги</button>
        </>}>
        {p && (
          <>
            <div className="grid g4 mb16">
              {p.options.map((o, i) => {
                const n = Object.values(p.answers).filter(v => v === i).length
                return <Card key={i} tight><div className="tiny muted ellipsis">{MARK_EMOJI[i]} {o}</div><div className="heavy" style={{ fontSize: '1.6rem' }}>{n}</div><Progress value={list.length ? n / list.length : 0} /></Card>
              })}
            </div>
            {!list.length && <div className="sub">Добавь список группы в «Посещаемости»</div>}
            <div className="col gap6">
              {list.map(st => (
                <div key={st.id} className="row" style={{ padding: '6px 10px', borderRadius: 12, background: 'var(--fill)' }}>
                  <span className="grow small bold">{st.name}</span>
                  {p.options.map((o, i) => (
                    <button key={i} disabled={p.closed} className={`chip ${p.answers[st.id] === i ? 'on' : ''}`} style={{ height: 28 }} title={o}
                      onClick={() => { const a = { ...p.answers }; if (a[st.id] === i) delete a[st.id]; else a[st.id] = i; update({ ...p, answers: a }) }}>{i + 1}</button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
void Segmented; void openMenu
