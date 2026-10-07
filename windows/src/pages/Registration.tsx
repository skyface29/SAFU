// Регистрация: имя → высшая школа → группа из РУЗ → роль и дорога → приложение само всё настраивает.
// Перенесено из Sources/Registration.swift.
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, X, Snowflake, GraduationCap, Presentation, Cpu, Cog, Leaf, Globe2, LineChart, Zap, Dumbbell, Fish,
  Search, Keyboard, RefreshCw, Check, Loader2, AlertCircle, Circle, User, Star, StarHalf, Footprints, Bus, Plus, ClipboardPaste, ArchiveRestore
} from 'lucide-react'
import { kv } from '../lib/kv'
import { loadGroups, type RuzGroup } from '../lib/ruz'
import { scheduleStore, useSchedule, teacherMode } from '../lib/scheduleStore'
import { subjects, slotsRange } from '../lib/schedule'
import { fullDay, hm } from '../lib/date'
import { bus, busStore, fromShareCode, routeText, newRoute } from '../lib/bus'
import { safu } from '../lib/bridge'
import { celebrations, CelebrationOverlay } from '../fx/Celebrations'
import { resources } from '../lib/resources'
import { subjectFolder } from '../lib/effects'
import { restoreBackupInteractive } from '../lib/backup'
import { toast, alertDialog } from '../ui/kit'

export const SCHOOLS = [
  { id: 3, short: 'ВШИТАС', full: 'Высшая школа информационных технологий и автоматизированных систем', about: 'ИТ, программирование, автоматизация, связь', Icon: Cpu },
  { id: 15, short: 'ВИШ', full: 'Высшая инженерная школа', about: 'Строительство, транспорт, машиностроение', Icon: Cog },
  { id: 1, short: 'ВШЕНиТ', full: 'Высшая школа естественных наук и технологий', about: 'Биология, химия, география, экология', Icon: Leaf },
  { id: 4, short: 'ВШСГНиМК', full: 'Высшая школа социально-гуманитарных наук и международной коммуникации', about: 'Филология, история, языки, журналистика', Icon: Globe2 },
  { id: 28, short: 'ВШЭУиП', full: 'Высшая школа экономики, управления и права', about: 'Экономика, менеджмент, юриспруденция', Icon: LineChart },
  { id: 12, short: 'ВШЭНиГ', full: 'Высшая школа энергетики, нефти и газа', about: 'Энергетика, нефтегазовое дело', Icon: Zap },
  { id: 13, short: 'ВШППиФК', full: 'Высшая школа психологии, педагогики и физической культуры', about: 'Психология, педагогика, спорт', Icon: Dumbbell },
  { id: 36, short: 'ВШ рыболовства', full: 'Высшая школа рыболовства', about: 'Рыболовство, водные биоресурсы', Icon: Fish }
]

type Step = 0 | 1 | 2 | 3 | 4 | 5   // welcome, name, school, group, extras, setup
type Task = { id: number; title: string; detail: string; state: 'waiting' | 'running' | 'done' | 'warn' }

export function Registration({ canClose, onDone }: { canClose: boolean; onDone: () => void }) {
  const [step, setStep] = useState<Step>(0)
  const [dir, setDir] = useState(1)
  const [first, setFirst] = useState(kv.get('user.first', ''))
  const [last, setLast] = useState(kv.get('user.last', ''))
  const [middle, setMiddle] = useState(kv.get('user.middle', ''))
  const [showMore, setShowMore] = useState(!!kv.get('user.last', ''))
  const [school, setSchool] = useState<typeof SCHOOLS[0] | null>(SCHOOLS.find(s => s.id === useSchedule.getState().data.ruzInstitution && kv.get('onboarded', false)) || null)
  const [groups, setGroups] = useState<RuzGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [course, setCourse] = useState<number | null>(null)
  const [picked, setPicked] = useState<RuzGroup | null>(null)
  const [manual, setManual] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [role, setRole] = useState(kv.get('user.role', 0))
  const [teacher, setTeacher] = useState(kv.get('user.kind', 'student') === 'teacher')
  const [teacherQuery, setTeacherQuery] = useState(kv.get('teacher.query', ''))
  const [farAway, setFarAway] = useState(kv.get('commute.enabled', false))
  const [tasks, setTasks] = useState<Task[]>([])
  const [finished, setFinished] = useState(false)
  const routes = busStore.use()
  const [activeBus, setActiveBus] = useState(bus.activeID())

  const groupNumber = (manualMode ? manual : picked?.number || '').trim()
  const canContinue =
    step === 0 ? true
      : step === 1 ? !!first.trim() && (!teacher || !!last.trim())
        : step === 2 ? !!school
          : step === 3 ? (teacher ? teacherMode.parse(teacherQuery).surname.length >= 2 : groupNumber.length >= 4)
            : step === 4 ? true
              : finished

  const go = (delta: number) => {
    let next = (step + delta) as Step
    if (teacher && next === 4) next = (next + delta) as Step
    if (next < 0 || next > 5) return
    setDir(delta)
    setStep(next)
    if (next === 3) {
      if (teacher) { if (!teacherQuery) setTeacherQuery([last, [first[0], middle[0]].filter(Boolean).map(c => c + '.').join('')].filter(Boolean).join(' ')) }
      else loadList()
    }
    if (next === 5) runSetup()
  }

  const loadList = async (force = false) => {
    if (!school) return
    setLoading(true); setGroupsError(null)
    try {
      const list = await loadGroups(school.id, force)
      setGroups(list)
      if (!list.length) setGroupsError('РУЗ не вернул список групп. Введи номер группы вручную.')
    } catch {
      setGroupsError('Нет связи с РУЗ. Проверь интернет или введи номер группы вручную.')
    } finally { setLoading(false) }
  }

  const courses = useMemo(() => [...new Set(groups.map(g => g.course).filter((c): c is number => c != null))].sort(), [groups])
  const filtered = groups.filter(g => (course == null || g.course === course) && (!query || (g.number + ' ' + g.title).toLowerCase().includes(query.toLowerCase())))

  const setTask = (id: number, state: Task['state'], detail = '') => setTasks(ts => ts.map(t => t.id === id ? { ...t, state, detail: detail || t.detail } : t))

  const saveProfile = () => {
    const f = first.trim(), l = last.trim(), m = middle.trim()
    kv.set('user.name', [f, l].filter(Boolean).join(' '))
    kv.set('user.first', f); kv.set('user.last', l); kv.set('user.middle', m)
    kv.set('group', teacher ? '' : groupNumber)
    kv.set('user.kind', teacher ? 'teacher' : 'student')
    let r = role
    if (teacher) { kv.set('teacher.query', teacherQuery.trim()); r = 3 } else if (r === 3) r = 0
    kv.set('user.role', r)
    kv.set('commute.enabled', teacher ? false : farAway)
    const fio = [l, f, m].filter(Boolean).join(' ')
    if (fio && !teacher) kv.set('report.student', fio)
    if (school) kv.set('report.school', school.full)
    if (teacher) resources.addTeacherSites()
  }

  const runSetup = async () => {
    setFinished(false)
    setTasks([
      { id: 0, title: 'Профиль', detail: '', state: 'waiting' },
      { id: 1, title: teacher ? 'Ваши пары по всем группам САФУ' : `Расписание группы ${groupNumber} из РУЗ`, detail: '', state: 'waiting' },
      { id: 2, title: 'Папки предметов', detail: '', state: 'waiting' },
      { id: 3, title: 'Уведомления о парах и заменах', detail: '', state: 'waiting' },
      { id: 4, title: 'Трей и мини-окно пары', detail: '', state: 'waiting' }
    ])
    await sleep(300)
    setTask(0, 'running'); saveProfile(); await sleep(250)
    setTask(0, 'done', [first, last].filter(Boolean).join(' ') + (school ? ` · ${school.short}` : ''))

    setTask(1, 'running')
    scheduleStore.setData({ ...scheduleStore.data, teacherPrefs: {} })
    const inst = school?.id ?? 3
    if (teacher) {
      scheduleStore.connectTeacher(inst)
      const ticker = setInterval(() => { const p = useSchedule.getState().teacherProgress; if (p != null) setTask(1, 'running', `Просмотрено групп: ${Math.round(p * 100)}%`) }, 400)
      await scheduleStore.sync(true)
      clearInterval(ticker)
    } else {
      scheduleStore.connectRuz(groupNumber, inst, manualMode ? '' : picked?.id || '')
      await scheduleStore.sync(true)
    }
    const count = useSchedule.getState().data.ruzEvents.length
    if (count > 0) setTask(1, 'done', `Загружено пар: ${count}`)
    else setTask(1, 'warn', useSchedule.getState().syncMessage || 'Пока пусто — попробую ещё раз позже')

    setTask(2, 'running')
    const subj = subjects(useSchedule.getState().data)
    if (subj.length) await safu.fs.ensureDirs(subj.map(subjectFolder))
    setTask(2, subj.length ? 'done' : 'warn', subj.length ? `Предметов: ${subj.length} — в «Документы\\САФУ\\Предметы»` : 'Появятся вместе с расписанием')

    setTask(3, 'running'); await sleep(300)
    setTask(3, 'done', 'Напомню о парах, заменах и отменах — уведомлениями Windows')
    setTask(4, 'running'); await sleep(300)
    setTask(4, 'done', 'Значок у часов показывает текущую пару, а мини-окно висит поверх всех окон')
    setFinished(true)
    celebrations.welcome()
  }

  const next = slotsRange(Date.now(), 14, useSchedule.getState().data).find(s => s.end > Date.now())

  return (
    <motion.div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }} transition={{ duration: 0.45 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 80% 0%, rgba(var(--brand-rgb), .22), transparent), radial-gradient(700px 500px at 0% 100%, rgba(var(--brand2-rgb), .15), transparent)', pointerEvents: 'none' }} />
      {step === 0 && <Flakes />}
      <div style={{ height: 'var(--titlebar)', WebkitAppRegion: 'drag' } as any} />
      {/* верх: назад, прогресс, закрыть */}
      <div className="row" style={{ padding: '6px 32px', gap: 14, position: 'relative' }}>
        {step !== 0 && step !== 5 ? <button className="btn icon round" onClick={() => go(-1)}><ChevronLeft size={18} /></button> : <div style={{ width: 38 }} />}
        <div className="row grow" style={{ gap: 6, opacity: step === 0 ? 0 : 1, transition: 'opacity .3s' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ flex: 1, height: 5, borderRadius: 5, background: 'var(--fill2)', overflow: 'hidden' }}>
              <motion.div style={{ height: '100%', background: 'var(--grad)' }} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} />
            </div>
          ))}
        </div>
        {canClose && step !== 5 ? <button className="btn icon round" onClick={onDone}><X size={18} /></button> : <div style={{ width: 38 }} />}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 32px 40px' }}
            initial={{ opacity: 0, x: 80 * dir, filter: 'blur(6px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -80 * dir, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {step === 0 && (
                <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 22, paddingTop: 20 }}>
                  <div style={{ position: 'relative', width: 240, height: 240, display: 'grid', placeItems: 'center' }}>
                    <motion.div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--brand-rgb), .5), transparent 65%)' }} animate={{ scale: [0.9, 1.1, 0.9] }} transition={{ duration: 3, repeat: Infinity }} />
                    <motion.svg width="150" height="150" style={{ position: 'absolute' }} animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}>
                      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--brand)" /><stop offset="1" stopColor="var(--brand2)" stopOpacity="0" /></linearGradient></defs>
                      <circle cx="75" cy="75" r="71" fill="none" stroke="url(#rg)" strokeWidth="4" strokeDasharray="320 500" strokeLinecap="round" />
                    </motion.svg>
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 14 }}
                      style={{ width: 116, height: 116, borderRadius: '50%', background: 'var(--grad)', display: 'grid', placeItems: 'center', boxShadow: '0 14px 40px rgba(var(--brand-rgb), .55)' }}>
                      <motion.div animate={{ rotate: [-30, 30, -30] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}><Snowflake size={58} color="#fff" /></motion.div>
                    </motion.div>
                  </div>
                  <Appear delay={0.25}><div style={{ fontSize: '3rem', fontWeight: 900 }}>Привет! <motion.span style={{ display: 'inline-block', transformOrigin: '70% 80%' }} animate={{ rotate: [-8, 18, -8] }} transition={{ duration: 1, repeat: Infinity }}>👋</motion.span></div></Appear>
                  <Appear delay={0.4}><div className="muted" style={{ fontSize: '1.1rem' }}>Твои пары, файлы и оценки САФУ — в одном красивом месте.<br />Теперь и на компьютере.</div></Appear>
                  <Appear delay={0.5}><div className="tiny faint">Неофициальное студенческое приложение · данные остаются на твоём компьютере</div></Appear>
                  <div className="grid g2" style={{ width: '100%', maxWidth: 520 }}>
                    {[false, true].map((isT, i) => {
                      const on = teacher === isT
                      return (
                        <Appear key={i} delay={0.55 + i * 0.12}>
                          <motion.div onClick={() => setTeacher(isT)} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} animate={{ scale: on ? 1.03 : 0.98 }}
                            className="col" style={{ alignItems: 'center', gap: 8, padding: '20px 10px', borderRadius: 22, cursor: 'pointer', background: on ? 'var(--grad)' : 'var(--fill)', color: on ? '#fff' : undefined, boxShadow: on ? '0 12px 30px rgba(var(--brand-rgb), .4)' : undefined, border: '1px solid var(--line)' }}>
                            {isT ? <Presentation size={28} /> : <GraduationCap size={28} />}
                            <div className="bold row gap6">{isT ? 'Я преподаватель' : 'Я студент'}{isT && <span className="badge" style={{ background: '#f59e0b', color: '#fff' }}>бета</span>}</div>
                            <div className="tiny" style={{ opacity: 0.8 }}>{isT ? 'Свои пары во всех группах' : 'Группа, пары, файлы, оценки'}</div>
                          </motion.div>
                        </Appear>
                      )
                    })}
                  </div>
                  <Appear delay={0.9}>
                    <button className="btn ghost" onClick={async () => { if (await restoreBackupInteractive()) { toast('Копия восстановлена'); onDone() } }}><ArchiveRestore size={16} /> У меня есть резервная копия</button>
                  </Appear>
                </div>
              )}

              {step === 1 && (
                <>
                  <Header title={teacher ? 'Как вас зовут?' : 'Как тебя зовут?'} text={teacher ? 'Фамилия нужна, чтобы найти ваши пары в РУЗ.' : 'Для приветствия и титульных листов.'} />
                  <Appear delay={0.08}><Input label="Имя" value={first} onChange={setFirst} autoFocus placeholder="Кирилл" /></Appear>
                  {(showMore || teacher) ? (
                    <>
                      <Appear delay={0.12}><Input label="Фамилия" value={last} onChange={setLast} placeholder="Иванов" /></Appear>
                      <Appear delay={0.16}><Input label="Отчество" value={middle} onChange={setMiddle} placeholder="Иванович" /></Appear>
                    </>
                  ) : <button className="btn ghost" onClick={() => setShowMore(true)}><Plus size={15} /> Фамилия и отчество — для титульников</button>}
                  <div className="tiny faint mt16">Всё хранится только на твоём компьютере.</div>
                </>
              )}

              {step === 2 && (
                <>
                  <Header title={teacher ? 'Где вы преподаёте' : 'Твоя высшая школа'} text="Выбери школу — оттуда подтянется список групп." />
                  <div className="grid g2">
                    {SCHOOLS.map((s, i) => {
                      const on = school?.id === s.id
                      return (
                        <Appear key={s.id} delay={0.04 * i}>
                          <motion.div onClick={() => setSchool(s)} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="row top"
                            style={{ padding: 14, borderRadius: 18, cursor: 'pointer', background: on ? 'rgba(var(--brand-rgb), .16)' : 'var(--fill)', border: `1.5px solid ${on ? 'var(--brand)' : 'var(--line)'}`, gap: 12 }}>
                            <div className="icon-tile" style={{ width: 42, height: 42, borderRadius: 13, background: on ? 'var(--grad)' : 'var(--fill2)', color: on ? '#fff' : 'var(--text)' }}><s.Icon size={20} /></div>
                            <div className="grow"><div className="bold">{s.short}</div><div className="tiny muted">{s.about}</div></div>
                            {on && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={18} color="var(--brand)" /></motion.div>}
                          </motion.div>
                        </Appear>
                      )
                    })}
                  </div>
                </>
              )}

              {step === 3 && !teacher && (
                <>
                  <Header title="Твоя группа" text={school ? `${school.short}: выбери группу — расписание подтянется само.` : ''} />
                  {!manualMode ? (
                    <>
                      <div className="row mb12">
                        <div className="row grow" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line2)' }}>
                          <Search size={16} className="faint" />
                          <input className="input" style={{ border: 'none', background: 'none', boxShadow: 'none' }} placeholder="Номер или направление" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
                        </div>
                        <button className="btn icon" onClick={() => loadList(true)} title="Обновить список"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
                      </div>
                      {courses.length > 1 && (
                        <div className="row wrap-row gap6 mb12">
                          <button className={`chip ${course == null ? 'on' : ''}`} onClick={() => setCourse(null)}>Все курсы</button>
                          {courses.map(c => <button key={c} className={`chip ${course === c ? 'on' : ''}`} onClick={() => setCourse(c)}>{c} курс</button>)}
                        </div>
                      )}
                      {loading && <div className="col gap8">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 54 }} />)}<div className="sub tc">Загружаю группы из РУЗ…</div></div>}
                      {groupsError && <div className="row" style={{ padding: 14, borderRadius: 14, background: 'rgba(245,158,11,.12)', color: '#f59e0b' }}><AlertCircle size={18} />{groupsError}</div>}
                      <div className="col gap6">
                        {filtered.slice(0, 120).map((g, i) => {
                          const on = picked?.id === g.id
                          return (
                            <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }}
                              onClick={() => setPicked(g)} className="row" whileHover={{ x: 3 }}
                              style={{ padding: '11px 14px', borderRadius: 14, cursor: 'pointer', background: on ? 'rgba(var(--brand-rgb), .16)' : 'var(--fill)', border: `1.5px solid ${on ? 'var(--brand)' : 'transparent'}` }}>
                              <div className="heavy mono" style={{ width: 80, fontSize: '1.05rem' }}>{g.number}</div>
                              <div className="grow small muted ellipsis">{g.title || 'Направление не указано'}</div>
                              {g.course && <span className="pill">{g.course} курс</span>}
                              {on && <Check size={18} color="var(--brand)" />}
                            </motion.div>
                          )
                        })}
                      </div>
                      <button className="btn ghost mt12" onClick={() => setManualMode(true)}><Keyboard size={15} /> Нет в списке — ввести номер</button>
                    </>
                  ) : (
                    <>
                      <Input label="Номер группы" value={manual} onChange={setManual} autoFocus placeholder="151621" />
                      <div className="tiny faint">Номер группы — на студенческом или в РУЗ. Приложение найдёт её само, даже если она в другой высшей школе.</div>
                      <button className="btn ghost mt12" onClick={() => setManualMode(false)}>Выбрать из списка</button>
                    </>
                  )}
                </>
              )}

              {step === 3 && teacher && (
                <>
                  <Header title="Как вы записаны в РУЗ" text="Обычно «Фамилия И.О.». Найду все ваши пары во всех группах САФУ." />
                  <Input label="Фамилия и инициалы" value={teacherQuery} onChange={setTeacherQuery} autoFocus placeholder="Иванов И.И." />
                  <div className="tiny faint">Если фамилия с инициалами не находится — оставьте только фамилию.</div>
                  <div className="row mt16" style={{ padding: 14, borderRadius: 14, background: 'rgba(245,158,11,.1)' }}><AlertCircle size={18} color="#f59e0b" /><span className="small">{teacherMode.betaNote}</span></div>
                </>
              )}

              {step === 4 && (
                <>
                  <Header title="Роль и дорога" text="Можно поменять потом в Профиле." />
                  <div className="bold mb8">Кто ты в группе</div>
                  <div className="grid g3 mb8">
                    {[[0, 'Студент', User], [1, 'Староста', Star], [2, 'Зам', StarHalf]].map(([r, t, I]: any) => (
                      <motion.div key={r} onClick={() => setRole(r)} whileTap={{ scale: 0.95 }} className="col" style={{ alignItems: 'center', gap: 6, padding: 16, borderRadius: 18, cursor: 'pointer', background: role === r ? 'var(--grad)' : 'var(--fill)', color: role === r ? '#fff' : undefined }}>
                        <I size={20} /><span className="bold small">{t}</span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="tiny muted mb16">{role === 0 ? 'Всё для учёбы: пары, файлы, оценки.' : 'Откроется «Посещаемость»: отметки ребят на каждой паре и рассылка группе.'}</div>
                  <div className="bold mb8">Как добираешься</div>
                  <Option on={!farAway} title="Живу рядом" text="Хожу пешком или езжу по городу" Icon={Footprints} onClick={() => setFarAway(false)} />
                  <Option on={farAway} title="Езжу на автобусе" text="Выбери свой — подскажу, когда выезжать, чтобы успеть к паре" Icon={Bus} onClick={() => setFarAway(true)} />
                  <AnimatePresence>
                    {farAway && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="col gap8 mt8">
                        {routes.map(r => {
                          const on = r.id === activeBus
                          return (
                            <div key={r.id} className="row" onClick={() => { bus.activate(r.id); setActiveBus(r.id) }} style={{ padding: 10, borderRadius: 16, background: 'var(--fill)', cursor: 'pointer', border: `1.5px solid ${on ? 'var(--brand)' : 'transparent'}` }}>
                              <div className="icon-tile heavy" style={{ width: 50, height: 40, borderRadius: 11, background: '#' + r.colorHex }}>{r.number || '?'}</div>
                              <div className="grow"><div className="bold small">{routeText(r)}</div><div className="tiny muted">в пути {r.travelMinutes} мин</div></div>
                              {on ? <Check size={18} color="var(--brand)" /> : <Circle size={18} className="faint" />}
                            </div>
                          )
                        })}
                        <div className="row">
                          <button className="btn grow" onClick={async () => {
                            const t = await safu.clipboard.read()
                            const r = fromShareCode(t)
                            if (r) { bus.upsert(r); bus.activate(r.id); setActiveBus(r.id); toast(`Автобус ${r.number} добавлен и выбран`) }
                            else alertDialog('Автобус', 'В буфере нет кода автобуса. Попроси одногруппника нажать «Поделиться» в его автобусе и скопируй код.')
                          }}><ClipboardPaste size={15} /> Код от друга</button>
                          <button className="btn grow" onClick={() => { const r = { ...newRoute(), number: 'Свой' }; bus.upsert(r); toast('Маршрут добавлен — настрой его в «Дороге» после регистрации', 'info') }}><Plus size={15} /> Свой автобус</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {step === 5 && (
                <>
                  <Header title={finished ? `Готово, ${first.trim()}! 🎉` : 'Настраиваю всё…'}
                    text={finished ? (teacher ? 'Ваше расписание собрано из РУЗ.' : `Приложение настроено под группу ${groupNumber}.`) : teacher ? 'Просматриваю расписания всех групп САФУ — несколько минут, ваша школа первой.' : 'Это займёт несколько секунд.'} />
                  <div className="card" style={{ padding: '6px 18px' }}>
                    {tasks.map((t, i) => (
                      <motion.div key={t.id} className="row top" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} style={{ padding: '12px 0', borderBottom: i < tasks.length - 1 ? '1px solid var(--line)' : 'none' }}>
                        <div style={{ width: 26, display: 'grid', placeItems: 'center', paddingTop: 1 }}>
                          <AnimatePresence mode="wait">
                            <motion.div key={t.state} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                              {t.state === 'waiting' ? <Circle size={20} className="faint" /> : t.state === 'running' ? <Loader2 size={20} className="spin" color="var(--brand)" /> : t.state === 'done' ? <Check size={20} color="#22c55e" strokeWidth={3} /> : <AlertCircle size={20} color="#f59e0b" />}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        <div className="grow"><div className="bold">{t.title}</div>{t.detail && <div className="tiny muted">{t.detail}</div>}</div>
                      </motion.div>
                    ))}
                  </div>
                  {finished && next && (
                    <motion.div className="card mt16" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="tiny heavy" style={{ color: 'var(--brand)' }}>БЛИЖАЙШАЯ ПАРА</div>
                      <div className="h-card mt4">{next.subject}</div>
                      <div className="sub" style={{ textTransform: 'capitalize' }}>{fullDay(next.start)}, {hm(next.start)}{next.room ? ` · ауд. ${next.room}` : ''}</div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ padding: '14px 32px 26px', position: 'relative' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <motion.button className="btn primary lg block" disabled={!canContinue} style={{ opacity: step === 5 && !finished ? 0 : 1, height: 54, fontSize: '1.05rem' }}
            whileHover={{ scale: canContinue ? 1.01 : 1 }} whileTap={{ scale: 0.97 }}
            onClick={() => step === 5 ? onDone() : go(1)}>
            {step === 0 ? 'Начать' : step === 4 ? 'Настроить всё' : step === 5 ? 'Поехали 🚀' : 'Дальше'}
          </motion.button>
        </div>
      </div>
      <CelebrationOverlay />
    </motion.div>
  )
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function Appear({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay }}>{children}</motion.div>
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <Appear>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-.02em' }}>{title}</div>
        <div className="muted mt4">{text}</div>
      </div>
    </Appear>
  )
}

function Input({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" style={{ height: 50, fontSize: '1.05rem', borderRadius: 14 }} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Option({ on, title, text, Icon, onClick }: { on: boolean; title: string; text: string; Icon: any; onClick: () => void }) {
  return (
    <motion.div onClick={onClick} whileTap={{ scale: 0.98 }} className="row" style={{ padding: 12, borderRadius: 18, cursor: 'pointer', background: 'var(--fill)', marginBottom: 8, border: `1.5px solid ${on ? 'var(--brand)' : 'transparent'}` }}>
      <div className="icon-tile" style={{ width: 44, height: 44, borderRadius: 13, background: on ? 'var(--grad)' : 'var(--fill2)', color: on ? '#fff' : 'var(--text)' }}><Icon size={19} /></div>
      <div className="grow"><div className="bold">{title}</div><div className="tiny muted">{text}</div></div>
      {on ? <Check size={20} color="var(--brand)" /> : <Circle size={20} className="faint" />}
    </motion.div>
  )
}

function Flakes() {
  const flakes = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ x: Math.random() * 100, size: 10 + Math.random() * 18, dur: 8 + Math.random() * 10, delay: -Math.random() * 15, i })), [])
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {flakes.map(f => (
        <motion.div key={f.i} style={{ position: 'absolute', left: `${f.x}%`, top: -30, opacity: 0.35, color: 'var(--brand2)' }}
          animate={{ y: ['0vh', '110vh'], rotate: [0, 360], x: [0, 30, -20, 0] }} transition={{ duration: f.dur, repeat: Infinity, delay: f.delay, ease: 'linear' }}>
          <Snowflake size={f.size} />
        </motion.div>
      ))}
    </div>
  )
}
