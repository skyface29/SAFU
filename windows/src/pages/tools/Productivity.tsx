// Фокус (помодоро), титульник .docx, матрицы, статистика семестра
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, SkipForward, FileText, FolderOpen, ExternalLink, Plus, Minus, Calculator, Copy } from 'lucide-react'
import { PageHeader, Card, Field, Segmented, Ring, AnimatedNumber, toast, Progress } from '../../ui/kit'
import { usePref, kv } from '../../lib/kv'
import { useSchedule } from '../../lib/scheduleStore'
import { subjects, slotsRange, kindStyle, academicWeek, usesRuz } from '../../lib/schedule'
import { timer, ymd, startOfDay, addDays, plural, monday, DAY } from '../../lib/date'
import { notify } from '../../lib/notify'
import { safu } from '../../lib/bridge'
import { titlePageDocx, toBase64 } from '../../lib/zip'
import { homeworkStore } from '../../lib/homework'
import { attendanceStore } from './Group'

// ---------- фокус ----------

type Phase = 'work' | 'short' | 'long'
let focusState = { phase: 'work' as Phase, endsAt: 0, left: 25 * 60_000, running: false, cycle: 0 }

export function Focus() {
  const data = useSchedule(s => s.data)
  const [work, setWork] = usePref('focus.work', 25)
  const [short, setShort] = usePref('focus.short', 5)
  const [long, setLong] = usePref('focus.long', 15)
  const [subject, setSubject] = usePref('focus.subject', '')
  const [log, setLog] = usePref<Record<string, number>>('focus.log', {})
  const [, tick] = useState(0)
  const st = focusState
  const dur = (p: Phase) => (p === 'work' ? work : p === 'short' ? short : long) * 60_000
  useEffect(() => { const t = setInterval(() => {
    if (st.running && Date.now() >= st.endsAt) finish()
    tick(x => x + 1)
  }, 250); return () => clearInterval(t) }, [work, short, long])
  const left = st.running ? Math.max(0, st.endsAt - Date.now()) : st.left
  const total = dur(st.phase)

  function finish() {
    const was = st.phase
    if (was === 'work') {
      st.cycle++
      const k = ymd(Date.now())
      const l = { ...kv.get<Record<string, number>>('focus.log', {}) }
      l[k] = (l[k] || 0) + work
      setLog(l)
    }
    st.phase = was === 'work' ? (st.cycle % 4 === 0 ? 'long' : 'short') : 'work'
    st.left = dur(st.phase)
    st.running = kv.get('focus.auto', true)
    st.endsAt = Date.now() + st.left
    notify.show({ title: was === 'work' ? 'Фокус закончен 🎉' : 'Перерыв всё', body: was === 'work' ? `Отдохни ${st.phase === 'long' ? long : short} минут` : 'Снова за дело 💪', route: 'focus' })
    safu.app.flash()
  }
  const start = () => { st.running = true; st.endsAt = Date.now() + st.left; tick(x => x + 1) }
  const pause = () => { st.left = Math.max(0, st.endsAt - Date.now()); st.running = false; tick(x => x + 1) }
  const reset = () => { st.running = false; st.left = dur(st.phase); tick(x => x + 1) }
  const setPhase = (p: Phase) => { st.phase = p; st.running = false; st.left = dur(p); tick(x => x + 1) }
  const today = log[ymd(Date.now())] || 0
  const week = Array.from({ length: 7 }, (_, i) => log[ymd(addDays(monday(Date.now()), i))] || 0)
  const color = st.phase === 'work' ? 'var(--brand)' : '#22c55e'

  return (
    <>
      <PageHeader title="Фокус" subtitle="Помодоро: 25 минут работы, 5 отдыха — и так по кругу" />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card className="col" style={{ alignItems: 'center', padding: 30, gap: 20 }}>
          <Segmented value={st.phase} onChange={setPhase} options={[{ value: 'work', label: 'Фокус' }, { value: 'short', label: 'Перерыв' }, { value: 'long', label: 'Длинный' }]} />
          <motion.div animate={{ scale: st.running ? [1, 1.015, 1] : 1 }} transition={{ duration: 2, repeat: st.running ? Infinity : 0 }}>
            <Ring value={1 - left / total} size={300} stroke={16} color={st.phase === 'work' ? undefined : '#22c55e'}>
              <div className="tc">
                <div className="mono" style={{ fontSize: '4.2rem', fontWeight: 800, letterSpacing: '-.03em' }}>{timer(left)}</div>
                <div className="muted">{st.phase === 'work' ? (subject || 'Работаем') : 'Отдыхаем'}</div>
                <div className="tiny faint mt4">цикл {st.cycle % 4 + 1} из 4</div>
              </div>
            </Ring>
          </motion.div>
          <div className="row">
            <button className="btn icon lg round" onClick={reset} title="Сначала"><RotateCcw size={20} /></button>
            <motion.button whileTap={{ scale: 0.9 }} className="btn primary lg round" style={{ width: 90, height: 90, borderRadius: 45, background: color }} onClick={st.running ? pause : start}>
              {st.running ? <Pause size={36} /> : <Play size={36} />}
            </motion.button>
            <button className="btn icon lg round" onClick={finish} title="Дальше"><SkipForward size={20} /></button>
          </div>
          <select className="select" style={{ maxWidth: 360 }} value={subject} onChange={e => setSubject(e.target.value)}><option value="">Без предмета</option>{subjects(data).map(s => <option key={s} value={s}>{s}</option>)}</select>
        </Card>
        <div className="col gap14">
          <Card>
            <div className="tiny muted">Сегодня в фокусе</div>
            <div className="heavy grad-text" style={{ fontSize: '2.6rem' }}><AnimatedNumber value={today} /> мин</div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 90, marginTop: 10 }}>
              {week.map((m, i) => <div key={i} className="col grow" style={{ alignItems: 'center', gap: 4 }}>
                <motion.div initial={{ height: 0 }} animate={{ height: Math.max(4, Math.min(70, m / 3)) }} style={{ width: '100%', maxWidth: 30, borderRadius: 8, background: i === (new Date().getDay() + 6) % 7 ? 'var(--grad)' : 'var(--fill2)' }} />
                <span className="tiny faint">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][i]}</span>
              </div>)}
            </div>
          </Card>
          <Card>
            <Field label="Фокус, минут"><Segmented value={work} onChange={setWork} options={[15, 25, 45, 50, 90].map(v => ({ value: v, label: `${v}` }))} /></Field>
            <Field label="Перерыв"><Segmented value={short} onChange={setShort} options={[3, 5, 10].map(v => ({ value: v, label: `${v}` }))} /></Field>
            <Field label="Длинный перерыв (каждый 4-й)"><Segmented value={long} onChange={setLong} options={[10, 15, 20, 30].map(v => ({ value: v, label: `${v}` }))} /></Field>
          </Card>
        </div>
      </div>
    </>
  )
}

// ---------- титульник ----------

const KINDS = ['Лабораторная работа', 'Практическая работа', 'Курсовая работа', 'Реферат', 'Отчёт по практике']

export function Report() {
  const data = useSchedule(s => s.data)
  const [student, setStudent] = usePref('report.student', '')
  const [group, setGroup] = usePref('group', '')
  const [supervisor, setSupervisor] = usePref('report.supervisor', '')
  const [position, setPosition] = usePref('report.position', '')
  const [school, setSchool] = usePref('report.school', '')
  const [kind, setKind] = usePref('report.kind', 0)
  const [number, setNumber] = usePref('report.number', '1')
  const [discipline, setDiscipline] = usePref('report.discipline', '')
  const [topic, setTopic] = usePref('report.topic', '')
  const [created, setCreated] = useState<string | null>(null)
  const workTitle = kind === 0 ? `ЛАБОРАТОРНАЯ РАБОТА № ${number}` : kind === 1 ? `ПРАКТИЧЕСКАЯ РАБОТА № ${number}` : ['', '', 'КУРСОВАЯ РАБОТА', 'РЕФЕРАТ', 'ОТЧЁТ ПО ПРАКТИКЕ'][kind]
  const create = async () => {
    const bytes = titlePageDocx({ school, workTitle, discipline, topic, student, group, supervisor, position, year: new Date().getFullYear() })
    const short = kind < 2 ? `${kind === 0 ? 'ЛР' : 'ПР'}_${number}` : KINDS[kind]
    const rel = `Отчёты/Титульник ${short}${discipline ? ' — ' + discipline.slice(0, 30) : ''}.docx`.replace(/[\\:*?"<>|]/g, '-')
    await safu.fs.writeBase64(rel, toBase64(bytes))
    setCreated(rel)
    toast('Титульник готов — открываю в Word')
    safu.fs.open(rel)
  }
  const line = (t: string, bold = false, size = 1) => <div style={{ fontWeight: bold ? 700 : 400, fontSize: `${size * 0.62}rem`, textAlign: 'center' }}>{t}</div>
  return (
    <>
      <PageHeader title="Титульник" subtitle="По СТО САФУ: Times New Roman 14, поля по стандарту, сразу в Word" />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 16, alignItems: 'start' }}>
        <Card>
          <Field label="Вид работы"><div className="row wrap-row gap6">{KINDS.map((k, i) => <button key={k} className={`chip ${kind === i ? 'on' : ''}`} onClick={() => setKind(i)}>{k}</button>)}</div></Field>
          <div className="grid g2">
            {kind < 2 && <Field label="Номер"><input className="input" value={number} onChange={e => setNumber(e.target.value)} /></Field>}
            <Field label="Дисциплина"><input className="input" list="r-subj" value={discipline} onChange={e => setDiscipline(e.target.value)} /><datalist id="r-subj">{subjects(data).map(s => <option key={s} value={s} />)}</datalist></Field>
          </div>
          <Field label="Тема"><input className="input" value={topic} onChange={e => setTopic(e.target.value)} /></Field>
          <div className="grid g2">
            <Field label="ФИО студента"><input className="input" value={student} onChange={e => setStudent(e.target.value)} placeholder="Иванов Иван Иванович" /></Field>
            <Field label="Группа"><input className="input" value={group} onChange={e => setGroup(e.target.value)} /></Field>
          </div>
          <Field label="Высшая школа"><input className="input" value={school} onChange={e => setSchool(e.target.value)} /></Field>
          <div className="grid g2">
            <Field label="Руководитель"><input className="input" value={supervisor} onChange={e => setSupervisor(e.target.value)} placeholder="Петров П.П." /></Field>
            <Field label="Должность"><input className="input" value={position} onChange={e => setPosition(e.target.value)} placeholder="доцент" /></Field>
          </div>
          <div className="row mt8">
            <button className="btn primary lg" onClick={create}><FileText size={18} /> Создать титульник .docx</button>
            {created && <button className="btn" onClick={() => safu.fs.reveal(created)}><FolderOpen size={15} /> Показать в папке</button>}
          </div>
          <div className="tiny faint mt12">Файл сохраняется в «Документы\САФУ\Отчёты». Сверь с методичкой преподавателя: на кафедрах бывают свои требования.</div>
        </Card>
        <motion.div layout className="col" style={{ background: '#fff', color: '#111', aspectRatio: '210/297', borderRadius: 8, padding: '28px 22px 22px 34px', fontFamily: '"Times New Roman", serif', boxShadow: '0 20px 60px rgba(0,0,0,.4)', justifyContent: 'space-between' }}>
          <div className="col gap4">{line('МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', false, 0.85)}{line('федеральное государственное автономное образовательное учреждение высшего образования', false, 0.85)}{line('«Северный (Арктический) федеральный университет имени М.В. Ломоносова»', true, 0.85)}<div style={{ height: 6 }} />{line(school || 'Высшая школа…')}</div>
          <div className="col gap4">{line(workTitle, true, 1.25)}{discipline && line(`по дисциплине «${discipline}»`)}{topic && line(`на тему: «${topic}»`)}</div>
          <div style={{ marginLeft: '48%', fontSize: '.62rem' }}><div>Выполнил:</div><div>студент группы {group}</div><div>{student || 'ФИО'}</div><div style={{ height: 6 }} /><div>Проверил:</div>{position && <div>{position}</div>}<div>{supervisor || 'ФИО'}</div></div>
          {line(`Архангельск ${new Date().getFullYear()}`)}
        </motion.div>
      </div>
    </>
  )
}

// ---------- матрицы ----------

type M = number[][]
const clone = (m: M) => m.map(r => [...r])
function det(m: M): number {
  const a = clone(m), n = a.length
  let d = 1
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r
    if (Math.abs(a[p][i]) < 1e-12) return 0
    if (p !== i) { [a[p], a[i]] = [a[i], a[p]]; d = -d }
    d *= a[i][i]
    for (let r = i + 1; r < n; r++) { const f = a[r][i] / a[i][i]; for (let c = i; c < n; c++) a[r][c] -= f * a[i][c] }
  }
  return d
}
function inverse(m: M): M | null {
  const n = m.length, a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r
    if (Math.abs(a[p][i]) < 1e-12) return null
    ;[a[p], a[i]] = [a[i], a[p]]
    const v = a[i][i]
    for (let c = 0; c < 2 * n; c++) a[i][c] /= v
    for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[i][c] }
  }
  return a.map(r => r.slice(n))
}
function rank(m: M) {
  const a = clone(m); let r = 0
  for (let c = 0; c < (a[0]?.length || 0) && r < a.length; c++) {
    let p = r
    for (let i = r + 1; i < a.length; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i
    if (Math.abs(a[p][c]) < 1e-10) continue
    ;[a[p], a[r]] = [a[r], a[p]]
    for (let i = r + 1; i < a.length; i++) { const f = a[i][c] / a[r][c]; for (let j = c; j < a[0].length; j++) a[i][j] -= f * a[r][j] }
    r++
  }
  return r
}
const mul = (a: M, b: M): M | null => a[0].length !== b.length ? null : a.map(r => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)))
const transpose = (a: M): M => a[0].map((_, j) => a.map(r => r[j]))
function fmt(v: number) {
  if (Math.abs(v) < 1e-10) return '0'
  for (let d = 1; d <= 50; d++) { const n = v * d; if (Math.abs(n - Math.round(n)) < 1e-8) return d === 1 ? String(Math.round(n)) : `${Math.round(n)}/${d}` }
  return v.toFixed(4).replace(/0+$/, '')
}

function MatrixInput({ m, setM, title }: { m: M; setM: (m: M) => void; title: string }) {
  const rows = m.length, cols = m[0].length
  const resize = (r: number, c: number) => setM(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => m[i]?.[j] ?? 0)))
  return (
    <Card>
      <div className="row mb12"><div className="h-card grow">{title}</div>
        <span className="tiny muted">строк</span><button className="btn icon sm" onClick={() => resize(Math.max(1, rows - 1), cols)}><Minus size={13} /></button><b>{rows}</b><button className="btn icon sm" onClick={() => resize(Math.min(8, rows + 1), cols)}><Plus size={13} /></button>
        <span className="tiny muted">столбцов</span><button className="btn icon sm" onClick={() => resize(rows, Math.max(1, cols - 1))}><Minus size={13} /></button><b>{cols}</b><button className="btn icon sm" onClick={() => resize(rows, Math.min(8, cols + 1))}><Plus size={13} /></button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 64px))`, gap: 6, justifyContent: 'center' }}>
        {m.map((r, i) => r.map((v, j) => (
          <input key={`${i}-${j}`} className="input mono" style={{ textAlign: 'center', padding: 0 }} value={String(v)} onFocus={e => e.target.select()}
            onChange={e => { const n = clone(m); n[i][j] = Number(e.target.value.replace(',', '.')) || 0; setM(n) }} />
        )))}
      </div>
    </Card>
  )
}

function MatrixView({ m }: { m: M }) {
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
      <div style={{ width: 8, alignSelf: 'stretch', borderLeft: '2px solid var(--text2)', borderTop: '2px solid var(--text2)', borderBottom: '2px solid var(--text2)', borderRadius: '4px 0 0 4px' }} />
      <div className="grid" style={{ gridTemplateColumns: `repeat(${m[0].length}, auto)`, gap: '6px 16px' }}>
        {m.flat().map((v, i) => <motion.span key={i} className="mono bold tc" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}>{fmt(v)}</motion.span>)}
      </div>
      <div style={{ width: 8, alignSelf: 'stretch', borderRight: '2px solid var(--text2)', borderTop: '2px solid var(--text2)', borderBottom: '2px solid var(--text2)', borderRadius: '0 4px 4px 0' }} />
    </div>
  )
}

export function Matrix() {
  const [a, setA] = useState<M>([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]])
  const [b, setB] = useState<M>([[8], [-11], [-3]])
  const [op, setOp] = useState('det')
  const result = useMemo((): { text?: string; m?: M; err?: string } => {
    try {
      if (op === 'det') return a.length !== a[0].length ? { err: 'Определитель — только у квадратной матрицы' } : { text: `det A = ${fmt(det(a))}` }
      if (op === 'inv') { if (a.length !== a[0].length) return { err: 'Нужна квадратная матрица' }; const r = inverse(a); return r ? { m: r } : { err: 'Матрица вырожденная (det = 0), обратной нет' } }
      if (op === 't') return { m: transpose(a) }
      if (op === 'rank') return { text: `rang A = ${rank(a)}` }
      if (op === 'mul') { const r = mul(a, b); return r ? { m: r } : { err: 'Число столбцов A должно совпадать с числом строк B' } }
      if (op === 'solve') {
        if (a.length !== a[0].length || b.length !== a.length) return { err: 'A — квадратная, B — столбец той же высоты' }
        const inv = inverse(a)
        if (!inv) return { err: `det A = 0: система либо несовместна, либо имеет бесконечно много решений (rang A = ${rank(a)})` }
        return { m: mul(inv, b.map(r => [r[0]]))!, text: 'x = A⁻¹·B' }
      }
      if (op === 'sq') { const r = mul(a, a); return r ? { m: r } : { err: 'Нужна квадратная матрица' } }
    } catch { /* */ }
    return {}
  }, [a, b, op])
  const toWolfram = () => {
    const s = (m: M) => '{' + m.map(r => '{' + r.join(',') + '}').join(',') + '}'
    const q = op === 'det' ? `det ${s(a)}` : op === 'inv' ? `inverse ${s(a)}` : op === 't' ? `transpose ${s(a)}` : op === 'rank' ? `rank ${s(a)}` : op === 'mul' ? `${s(a)}.${s(b)}` : op === 'sq' ? `${s(a)}^2` : `LinearSolve[${s(a)}, ${s(b.map(r => [r[0]])).replace(/[{}]/g, m => m)}]`
    safu.shell.open(`https://www.wolframalpha.com/input?i=${encodeURIComponent(q)}`)
  }
  return (
    <>
      <PageHeader title="Матрицы" subtitle="Определитель, обратная, ранг, СЛАУ — с дробями, как в тетради" right={<button className="btn" onClick={toWolfram}><ExternalLink size={15} /> Проверить в Wolfram</button>} />
      <div className="row wrap-row gap6 mb16">
        {[['det', 'Определитель'], ['inv', 'Обратная'], ['t', 'Транспонировать'], ['rank', 'Ранг'], ['sq', 'A²'], ['mul', 'A × B'], ['solve', 'Решить A·x = B']].map(([k, t]) => <button key={k} className={`chip ${op === k ? 'on' : ''}`} onClick={() => setOp(k)}>{t}</button>)}
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="col gap14">
          <MatrixInput m={a} setM={setA} title="Матрица A" />
          {(op === 'mul' || op === 'solve') && <MatrixInput m={b} setM={setB} title={op === 'solve' ? 'Столбец B' : 'Матрица B'} />}
        </div>
        <Card style={{ minHeight: 220 }}>
          <div className="row mb16"><Calculator size={18} color="var(--brand)" /><div className="h-card grow">Ответ</div>
            {result.m && <button className="btn sm" onClick={() => { safu.clipboard.write(result.m!.map(r => r.map(fmt).join('\t')).join('\n')); toast('Скопировано') }}><Copy size={13} /> Копировать</button>}</div>
          <AnimatePresence mode="wait">
            <motion.div key={JSON.stringify(result)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {result.err && <div style={{ color: '#ef4444' }}>{result.err}</div>}
              {result.text && <div className="mono heavy tc" style={{ fontSize: '1.6rem', marginBottom: 14 }}>{result.text}</div>}
              {result.m && <MatrixView m={result.m} />}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </>
  )
}

// ---------- статистика ----------

export function Stats() {
  const data = useSchedule(s => s.data)
  const hw = homeworkStore.use()
  const att = attendanceStore.use()
  const st = useMemo(() => {
    const from = data.semesterStart
    const to = Math.max(Date.now() + 30 * DAY, ...data.ruzEvents.map(e => e.end))
    const days = Math.min(200, Math.ceil((to - from) / DAY))
    const all = slotsRange(from, days, data)
    const past = all.filter(s => s.end <= Date.now())
    const byKind = new Map<string, number>()
    for (const s of past) { const k = kindStyle(s.kind).label; byKind.set(k, (byKind.get(k) || 0) + 1) }
    const bySubj = new Map<string, number>()
    for (const s of past) bySubj.set(s.subject, (bySubj.get(s.subject) || 0) + 1)
    const hours = past.reduce((a, s) => a + (s.end - s.start), 0) / 3600_000
    const byWeekday = [0, 0, 0, 0, 0, 0, 0]
    for (const s of past) byWeekday[(new Date(s.start).getDay() + 6) % 7]++
    const earliest = past.filter(s => new Date(s.start).getHours() < 9).length
    return { all, past, byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]), bySubj: [...bySubj.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), hours, byWeekday, earliest }
  }, [data])
  const done = hw.filter(h => h.done).length
  const maxSubj = Math.max(1, ...st.bySubj.map(x => x[1]))
  const week = academicWeek(data.semesterStart)
  return (
    <>
      <PageHeader title="Статистика семестра" subtitle={week ? `${week}-я неделя семестра` : undefined} />
      <div className="grid g4 mb16">
        {[[st.past.length, 'пар позади', 'var(--brand)'], [Math.round(st.hours), 'часов на парах', '#8b5cf6'], [Math.max(0, st.all.length - st.past.length), 'пар впереди', '#f59e0b'], [done, 'ДЗ сделано', '#22c55e']].map(([v, t, c], i) => (
          <Card key={t as string} delay={i * 0.04}><div className="heavy" style={{ fontSize: '2.4rem', color: c as string }}><AnimatedNumber value={v as number} /></div><div className="sub">{t}</div></Card>
        ))}
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card>
          <div className="h-card mb12">Предметы</div>
          <div className="col gap8">
            {st.bySubj.map(([s, n], i) => (
              <div key={s}><div className="row small"><span className="grow ellipsis">{s}</span><b>{n}</b></div>
                <div style={{ height: 8, borderRadius: 8, background: 'var(--fill2)', marginTop: 4 }}><motion.div initial={{ width: 0 }} animate={{ width: `${(n / maxSubj) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.8 }} style={{ height: '100%', borderRadius: 8, background: 'var(--grad)' }} /></div></div>
            ))}
          </div>
        </Card>
        <div className="col gap14">
          <Card>
            <div className="h-card mb12">Виды занятий</div>
            <div className="row wrap-row gap8">{st.byKind.map(([k, n]) => <span key={k} className="pill" style={{ background: `${kindStyle(k).color}26`, color: kindStyle(k).color, fontSize: '.85rem', padding: '6px 12px' }}>{k}: {n}</span>)}</div>
          </Card>
          <Card>
            <div className="h-card mb12">По дням недели</div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 10, height: 110 }}>
              {st.byWeekday.slice(0, 6).map((n, i) => (
                <div key={i} className="col grow" style={{ alignItems: 'center', gap: 4 }}>
                  <span className="tiny bold">{n}</span>
                  <motion.div initial={{ height: 0 }} animate={{ height: Math.max(4, (n / Math.max(1, ...st.byWeekday)) * 80) }} style={{ width: '100%', maxWidth: 36, borderRadius: 8, background: 'var(--grad)' }} />
                  <span className="tiny faint">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб'][i]}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card><div className="row"><span style={{ fontSize: '2rem' }}>🌅</span><div><div className="bold">Ранних пар (до 9:00): {st.earliest}</div><div className="sub">Это {st.earliest} {plural(st.earliest, 'утро', 'утра', 'утр')}, когда ты встал раньше будильника соседа</div></div></div></Card>
        </div>
      </div>
      <div className="tiny faint mt16">Посещаемость группы: отмечено занятий {Object.keys(att.marks).length}</div>
    </>
  )
}
void Progress; void usesRuz; void startOfDay
