// «Пары»: неделя колонками или список, архив прошлых недель, журнал замен, настройки, ручной ввод, экспорт
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, RefreshCw, Bell, Settings2, Plus, Download, Copy, MapPin, User, Clock, BookMarked, Trash2,
  ExternalLink, Building2, History, CalendarDays, LayoutGrid, List, Pencil, FolderOpen, Users
} from 'lucide-react'
import { useSchedule, scheduleStore, teacherMode } from '../lib/scheduleStore'
import {
  type Slot, type Lesson, slotsOn, usesRuz, academicWeek, BELLS, bellLabel, LESSON_KINDS, kindStyle, slotShareLine,
  subjects, teachersOf, AddressFormat, defaultSemesterStart
} from '../lib/schedule'
import { monday, addDays, startOfDay, isToday, dayMon, DAY_NAMES, WEEKDAYS, fullDay, hm, ymd, plural, relativeAgo, weekday } from '../lib/date'
import { RUZ_BASE, timetableURL, institutions } from '../lib/ruz'
import { Card, PageHeader, Segmented, Sheet, Empty, KindBadge, Toggle, Row, ToggleRow, Field, toast, confirmDialog, useNow, openMenu } from '../ui/kit'
import { SlotRow } from '../ui/lesson'
import { usePref, kv, uid } from '../lib/kv'
import { useModals, openSubject, openHomeworkEditor, go } from '../lib/nav'
import { safu } from '../lib/bridge'
import { mapsURL, routeURL } from '../lib/maps'
import { hw, homeworkStore, hwTitle, chip } from '../lib/homework'
import { openURL } from '../sites/sites'
import { subjectFolder } from '../lib/effects'

export default function Schedule({ day: dayParam, changes: changesParam }: { day?: number; changes?: number }) {
  const data = useSchedule(s => s.data)
  const syncing = useSchedule(s => s.syncing)
  const unseen = useSchedule(s => s.unseen)
  const loadingWeek = useSchedule(s => s.loadingWeek)
  const now = useNow(15_000)
  const [view, setView] = usePref<'week' | 'list'>('schedule.view', 'week')
  const [weekStart, setWeekStart] = useState(monday(dayParam || Date.now()))
  const [showChanges, setShowChanges] = useState(!!changesParam)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<Lesson | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [showBuildings, setShowBuildings] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const week = academicWeek(data.semesterStart, weekStart)
  const isCurrent = weekStart === monday(Date.now())
  const archived = weekStart < monday(Date.now())
  const perDay = days.map(d => slotsOn(d, data))
  const visibleDays = days.filter((d, i) => i < 6 || perDay[i].length)
  const total = perDay.reduce((a, l) => a + l.length, 0)

  useEffect(() => { if (archived && usesRuz(data)) scheduleStore.loadArchiveWeek(weekStart) }, [weekStart])
  useEffect(() => { if (showChanges) scheduleStore.markChangesSeen() }, [showChanges])

  if (!scheduleStore.isConfigured()) {
    return (
      <>
        <PageHeader title="Пары" />
        <Card><SetupCard onManual={() => { scheduleStore.useManual(); setEditing(newLesson()) }} /></Card>
      </>
    )
  }

  const shift = (n: number) => setWeekStart(w => addDays(w, n * 7))

  return (
    <>
      <PageHeader
        title="Пары"
        subtitle={<>{week ? `${week}-я неделя · ${week % 2 ? 'нечётная' : 'чётная'} · ` : ''}{dayMon(weekStart)} — {dayMon(addDays(weekStart, 6))} · {total} {plural(total, 'пара', 'пары', 'пар')}</>}
        right={<>
          <Segmented value={view} onChange={setView} options={[{ value: 'week', label: <span className="row gap6"><LayoutGrid size={14} />Неделя</span> }, { value: 'list', label: <span className="row gap6"><List size={14} />Список</span> }]} />
          {usesRuz(data) && <button className="btn icon" title="Обновить из РУЗ" onClick={() => scheduleStore.sync(true)}><RefreshCw size={16} className={syncing ? 'spin' : ''} /></button>}
          <button className="btn icon" title="Журнал изменений" onClick={() => setShowChanges(true)} style={{ position: 'relative' }}>
            <Bell size={16} />{unseen > 0 && <span className="side-badge" style={{ position: 'absolute', top: -6, right: -6, margin: 0 }}>{unseen}</span>}
          </button>
          <button className="btn icon" title="Ещё" onClick={e => openMenu(e, [
            ...(!usesRuz(data) ? [{ label: 'Добавить пару', icon: <Plus size={15} />, run: () => setEditing(newLesson()) }] : []),
            { label: 'Отправить расписание дня', icon: <Copy size={15} />, run: () => copyDay(startOfDay(Date.now()), data) },
            { label: 'Экспорт в календарь (.ics)', icon: <Download size={15} />, run: () => setShowExport(true) },
            { label: 'Корпуса и адреса', icon: <Building2 size={15} />, run: () => setShowBuildings(true) },
            { label: 'Преподаватели', icon: <Users size={15} />, run: () => go('teachers') },
            ...(usesRuz(data) && data.ruzGroupID ? [{ label: 'Открыть мою группу в РУЗ', icon: <ExternalLink size={15} />, run: () => openURL(timetableURL(data.ruzGroupID), 'РУЗ') }] : []),
            { sep: true, label: '' },
            { label: 'Настройки расписания', icon: <Settings2 size={15} />, run: () => setShowSettings(true) }
          ])}><Settings2 size={16} /></button>
        </>}
      />

      <div className="row mb16">
        <button className="btn sm" onClick={() => shift(-1)}><ChevronLeft size={15} /> Раньше</button>
        <AnimatePresence>{!isCurrent && <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="btn sm primary" onClick={() => setWeekStart(monday(Date.now()))}>К текущей</motion.button>}</AnimatePresence>
        <button className="btn sm" onClick={() => shift(1)}>Дальше <ChevronRight size={15} /></button>
        <span className="spacer" />
        {archived && <span className="pill"><History size={12} /> {loadingWeek ? 'Загружаю неделю из РУЗ…' : 'Архив: так было на этой неделе'}</span>}
        {usesRuz(data) && <span className="tiny faint">{scheduleStore.lastSyncText()}</span>}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={weekStart + view} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
          {view === 'week' ? (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))`, gap: 10 }}>
              {visibleDays.map((d, i) => {
                const list = slotsOn(d, data)
                const today = isToday(d)
                return (
                  <motion.div key={d} className="col gap8" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="tc" style={{ padding: '8px 4px', borderRadius: 14, background: today ? 'var(--grad)' : 'var(--fill)', color: today ? '#fff' : undefined, boxShadow: today ? '0 6px 20px rgba(var(--brand-rgb),.35)' : undefined }}>
                      <div className="heavy">{DAY_NAMES[weekday(d) - 1]}</div>
                      <div className="tiny" style={{ opacity: 0.8 }}>{dayMon(d)}</div>
                    </div>
                    {!list.length && <div className="tc tiny faint" style={{ padding: 20 }}>нет пар</div>}
                    {list.map(s => <WeekCell key={s.key} s={s} now={now} />)}
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <div className="col gap18">
              {days.map(d => {
                const list = slotsOn(d, data)
                if (!list.length && weekday(d) === 7) return null
                return (
                  <div key={d}>
                    <div className="row" style={{ margin: '0 4px 8px' }}>
                      <div className="h-card cap" style={{ color: isToday(d) ? 'var(--brand)' : undefined }}>{isToday(d) ? 'Сегодня, ' : ''}{fullDay(d)}</div>
                      <span className="spacer" />
                      {list.length > 0 && <button className="btn sm ghost" onClick={() => copyDay(d, data)}><Copy size={13} /> Отправить</button>}
                    </div>
                    {!list.length ? <div className="sub" style={{ margin: '0 4px' }}>Пар нет</div> : <div className="col gap8">{list.map(s => <SlotRow key={s.key} s={s} now={now} />)}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <Bells />

      <ChangesSheet open={showChanges} onClose={() => setShowChanges(false)} />
      <ScheduleSettings open={showSettings} onClose={() => setShowSettings(false)} onAdd={() => { setShowSettings(false); setEditing(newLesson()) }} />
      <LessonEditor lesson={editing} onClose={() => setEditing(null)} />
      <ExportSheet open={showExport} onClose={() => setShowExport(false)} />
      <BuildingsSheet open={showBuildings} onClose={() => setShowBuildings(false)} />
    </>
  )
}

function WeekCell({ s, now }: { s: Slot; now: number }) {
  homeworkStore.use()
  const st = kindStyle(s.kind)
  const live = s.start <= now && now < s.end
  const due = hw.dueAt(s).filter(h => !h.done).length
  return (
    <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }} layout
      onClick={() => useModals.getState().set({ lesson: s })}
      onContextMenu={e => openMenu(e, [
        { label: 'Предмет: файлы и заметки', run: () => openSubject(s.subject) },
        { label: 'Записать ДЗ', run: () => openHomeworkEditor({ subject: s.subject, slotStart: s.start }) }
      ])}
      style={{
        padding: '10px 11px', borderRadius: 14, cursor: 'pointer', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(160deg, ${st.color}${live ? '40' : '22'}, ${st.color}0a)`, border: `1px solid ${st.color}${live ? 'aa' : '44'}`,
        opacity: s.end < now ? 0.5 : 1, boxShadow: live ? `0 0 0 3px ${st.color}33, 0 8px 22px ${st.color}33` : undefined
      }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="tiny heavy mono">{hm(s.start)}</span>
        {live ? <span className="live-dot" style={{ width: 7, height: 7 }} /> : due > 0 ? <span className="tiny bold" style={{ color: '#f59e0b' }}>ДЗ {due}</span> : <span className="tiny faint">{s.pair}</span>}
      </div>
      <div className="bold clamp3" style={{ fontSize: '.84rem', lineHeight: 1.22, margin: '5px 0' }}>{s.subject}</div>
      <div className="tiny" style={{ color: st.color, fontWeight: 800 }}>{st.label}</div>
      {s.room && <div className="tiny muted ellipsis">ауд. {s.room}</div>}
    </motion.div>
  )
}

function Bells() {
  return (
    <Card className="mt24" delay={0.1}>
      <div className="row mb12"><Clock size={16} color="var(--brand)" /><div className="h-card">Звонки</div><span className="sub">после 3-й пары обед 55 минут</span></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8 }}>
        {BELLS.map((_, i) => (
          <div key={i} className="tc" style={{ padding: 10, borderRadius: 12, background: 'var(--fill)' }}>
            <div className="tiny faint">{i + 1} пара</div>
            <div className="small bold mono">{bellLabel(i + 1)}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function copyDay(day: number, data: any) {
  const list = slotsOn(day, data)
  if (!list.length) { toast('В этот день пар нет', 'info'); return }
  const text = `📅 ${fullDay(day)[0].toUpperCase() + fullDay(day).slice(1)}\n` + list.map(slotShareLine).join('\n')
  safu.clipboard.write(text)
  toast('Расписание дня скопировано — вставь в чат группы')
}

// ---------- первое подключение ----------

function SetupCard({ onManual }: { onManual: () => void }) {
  return (
    <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: 30, gap: 12 }}>
      <motion.div style={{ fontSize: '3.5rem' }} animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 2, repeat: Infinity }}>📅</motion.div>
      <div className="h-card" style={{ fontSize: '1.4rem' }}>Расписание из РУЗ</div>
      <div className="sub" style={{ maxWidth: 440 }}>Подтягивается с ruz.narfu.ru, обновляется само и хранится офлайн. Пройди короткую регистрацию: школа → группа → готово.</div>
      <div className="row mt8">
        <button className="btn primary lg" onClick={() => kv.set('onboarding.again', true)}>Подключить</button>
        <button className="btn lg" onClick={onManual}>Внести пары вручную</button>
      </div>
    </div>
  )
}

// ---------- журнал замен ----------

function ChangesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const changes = useSchedule(s => s.changes)
  return (
    <Sheet open={open} onClose={onClose} title="Журнал изменений"
      footer={changes.length ? <button className="btn danger" onClick={() => scheduleStore.clearChanges()}><Trash2 size={15} /> Очистить</button> : undefined}>
      {!changes.length && <Empty emoji="🔔" title="Изменений пока не было" text="Когда РУЗ отменит, добавит пару или сменит аудиторию, это появится здесь и придёт уведомление." />}
      <div className="col gap8">
        {changes.map((c, i) => {
          const color = c.text.startsWith('Отменена') ? '#ef4444' : c.text.startsWith('Добавлена') ? '#22c55e' : '#f59e0b'
          return (
            <motion.div key={c.id} className="row top" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
              style={{ padding: 12, borderRadius: 12, background: 'var(--fill)', borderLeft: `3px solid ${color}` }}>
              <div className="grow small">{c.text}</div>
            </motion.div>
          )
        })}
      </div>
    </Sheet>
  )
}

// ---------- настройки ----------

function ScheduleSettings({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: () => void }) {
  const data = useSchedule(s => s.data)
  const [notifyPairs, setNotifyPairs] = usePref('notify.pairs', true)
  const [mins, setMins] = usePref('notify.pairMinutes', 10)
  const [notifyChanges, setNotifyChanges] = usePref('notify.changes', true)
  const [digest, setDigest] = usePref('notify.digest', true)
  const [morning, setMorning] = usePref('notify.morning', false)
  const subj = subjects(data)
  return (
    <Sheet open={open} onClose={onClose} title="Настройки расписания" size="wide">
      <div className="h-sec" style={{ marginTop: 4 }}>Откуда брать пары</div>
      <Card className="list" style={{ padding: 0 }}>
        <Row title="Расписание из РУЗ" sub={usesRuz(data) ? (teacherMode.isOn() ? `Преподаватель: ${teacherMode.query()}` : `Группа ${data.ruzGroupNumber} · ${institutions.find(i => i[0] === data.ruzInstitution)?.[1] || ''}`) : 'Не подключено'}
          right={<button className="btn sm" onClick={() => { onClose(); kv.set('onboarding.again', true) }}>{usesRuz(data) ? 'Сменить' : 'Подключить'}</button>} />
        <Row title="Вручную" sub={`${data.lessons.length} пар в расписании`} right={<div className="row gap6">
          {usesRuz(data) && <button className="btn sm" onClick={() => scheduleStore.useManual()}>Перейти</button>}
          <button className="btn sm" onClick={onAdd}><Plus size={14} /> Пара</button>
        </div>} />
        {usesRuz(data) && <Row title="Память расписания" sub={`${scheduleStore.lastSyncText()}. ${data.syncInfo} В памяти: ${data.ruzEvents.length} пар, ${scheduleStore.rememberedWeeks} нед.`}
          right={<button className="btn sm danger" onClick={async () => { if (await confirmDialog('Очистить память РУЗ?', 'Прошлые недели придётся загружать заново.', 'Очистить', true)) scheduleStore.clearRuzCache() }}>Очистить</button>} />}
        {!usesRuz(data) && <Row title="Начало семестра" sub="Для чётных и нечётных недель" right={
          <input type="date" className="input" style={{ width: 170 }} value={ymd(data.semesterStart)} onChange={e => scheduleStore.setData({ ...data, semesterStart: new Date(e.target.value + 'T00:00').getTime() || defaultSemesterStart() })} />} />}
      </Card>

      <div className="h-sec">Уведомления</div>
      <Card className="list" style={{ padding: 0 }}>
        <ToggleRow icon={<Bell size={16} />} color="#3b82f6" title="Напоминать перед парой" sub="Уведомление Windows" on={notifyPairs} onChange={setNotifyPairs} />
        {notifyPairs && <Row title="За сколько минут" right={<Segmented value={mins} onChange={setMins} options={[5, 10, 15, 30].map(v => ({ value: v, label: `${v}` }))} />} />}
        <ToggleRow icon={<RefreshCw size={16} />} color="#f59e0b" title="Замены и отмены" sub="Когда РУЗ изменит расписание" on={notifyChanges} onChange={setNotifyChanges} />
        <ToggleRow icon={<CalendarDays size={16} />} color="#8b5cf6" title="Итоги недели" sub="В воскресенье в 19:00" on={digest} onChange={setDigest} />
        <ToggleRow icon={<Clock size={16} />} color="#22c55e" title="Утренняя сводка" sub="Сколько пар и когда первая — в 7:00" on={morning} onChange={setMorning} />
      </Card>

      {usesRuz(data) && subj.length > 0 && (
        <>
          <div className="h-sec">Подгруппы: мой преподаватель</div>
          <div className="sub mb12">Если в одно время по предмету несколько пар разных подгрупп, покажу только пару твоего преподавателя.</div>
          <Card className="list" style={{ padding: 0 }}>
            {subj.filter(s => teachersOf(data, s).length > 1).map(s => (
              <Row key={s} title={s} right={
                <select className="select" style={{ width: 220 }} value={data.teacherPrefs[s] || ''} onChange={e => scheduleStore.setTeacherPref(s, e.target.value)}>
                  <option value="">Все подгруппы</option>
                  {teachersOf(data, s).map(t => <option key={t} value={t.split(' ')[0]}>{t}</option>)}
                </select>} />
            ))}
            {!subj.some(s => teachersOf(data, s).length > 1) && <Row title="Подгрупп не нашлось" sub="У каждого предмета один преподаватель" />}
          </Card>
        </>
      )}
    </Sheet>
  )
}

// ---------- ручной ввод пары ----------

const newLesson = (): Lesson => ({ id: uid(), subject: '', kind: 'Лекция', weekday: Math.min(6, weekday(Date.now())), pair: 1, parity: 0, room: '', building: '', teacher: '' })

function LessonEditor({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [l, setL] = useState<Lesson | null>(lesson)
  const [count, setCount] = useState(0)
  useEffect(() => { setL(lesson); setCount(0) }, [lesson])
  if (!l) return <Sheet open={false} onClose={onClose} />
  const exists = data.lessons.some(x => x.id === l.id)
  const set = (p: Partial<Lesson>) => setL({ ...l, ...p })
  const save = (next: boolean) => {
    if (!l.subject.trim()) { toast('Укажи предмет', 'warn'); return }
    scheduleStore.upsertLesson({ ...l, subject: l.subject.trim() })
    if (next) { setCount(c => c + 1); setL({ ...newLesson(), weekday: l.weekday, pair: Math.min(7, l.pair + 1), kind: l.kind }); toast('Пара добавлена') }
    else onClose()
  }
  return (
    <Sheet open={!!lesson} onClose={onClose} title={exists ? 'Изменить пару' : 'Добавить пару'}
      footer={<>
        {exists && <button className="btn danger" onClick={() => { scheduleStore.deleteLesson(l.id); onClose() }}><Trash2 size={15} /> Удалить пару</button>}
        <span className="spacer" />
        {!exists && <button className="btn" onClick={() => save(true)}>Сохранить и добавить следующую</button>}
        <button className="btn primary" onClick={() => save(false)}>Готово</button>
      </>}>
      {count > 0 && <div className="pill mb12">Добавлено пар: {count}</div>}
      <Field label="Предмет"><input className="input" autoFocus list="subj-list" value={l.subject} onChange={e => set({ subject: e.target.value })} placeholder="Математический анализ" /></Field>
      <datalist id="subj-list">{subjects(data).map(s => <option key={s} value={s} />)}</datalist>
      <Field label="Вид"><div className="row wrap-row gap6">{LESSON_KINDS.map(k => <button key={k} className={`chip ${l.kind === k ? 'on' : ''}`} onClick={() => set({ kind: k })}>{k}</button>)}</div></Field>
      <div className="grid g2">
        <Field label="День недели"><select className="select" value={l.weekday} onChange={e => set({ weekday: +e.target.value })}>{WEEKDAYS.slice(1).map((w, i) => <option key={i} value={i + 1}>{w}</option>)}</select></Field>
        <Field label="Пара"><select className="select" value={l.pair} onChange={e => set({ pair: +e.target.value })}>{BELLS.map((_, i) => <option key={i} value={i + 1}>{i + 1} пара · {bellLabel(i + 1)}</option>)}</select></Field>
      </div>
      <Field label="Неделя"><Segmented value={l.parity} onChange={v => set({ parity: v })} options={[{ value: 0, label: 'Каждую' }, { value: 1, label: 'Нечётная' }, { value: 2, label: 'Чётная' }]} /></Field>
      <div className="grid g2">
        <Field label="Аудитория"><input className="input" value={l.room} onChange={e => set({ room: e.target.value })} placeholder="1405" /></Field>
        <Field label="Корпус"><select className="select" value={l.building} onChange={e => set({ building: e.target.value })}><option value="">Не указан</option>{data.buildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select></Field>
      </div>
      <Field label="Преподаватель"><input className="input" value={l.teacher} onChange={e => set({ teacher: e.target.value })} placeholder="Иванов И.И." /></Field>
    </Sheet>
  )
}

// ---------- корпуса ----------

function BuildingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const update = (id: string, p: any) => scheduleStore.setData({ ...data, buildings: data.buildings.map(b => b.id === id ? { ...b, ...p } : b) })
  return (
    <Sheet open={open} onClose={onClose} title="Корпуса и адреса" size="wide"
      footer={<button className="btn primary" onClick={() => scheduleStore.setData({ ...data, buildings: [...data.buildings, { id: uid(), name: '', address: '' }] })}><Plus size={15} /> Добавить корпус</button>}>
      <div className="sub mb12">Для расписания из РУЗ: в названии укажи код корпуса, как он пишется в РУЗ (например, А-НСД17), а в адресе — как его показывать. Аудитория из кода подставится сама.</div>
      <div className="col gap8">
        {data.buildings.map(b => (
          <div key={b.id} className="row">
            <input className="input" style={{ width: 160 }} value={b.name} placeholder="А-НСД17" onChange={e => update(b.id, { name: e.target.value })} />
            <input className="input grow" value={b.address} placeholder="наб. Северной Двины, д. 17" onChange={e => update(b.id, { address: e.target.value })} />
            <button className="btn icon" onClick={() => safu.shell.open(mapsURL(b.address))}><MapPin size={15} /></button>
            <button className="btn icon danger" onClick={() => scheduleStore.setData({ ...data, buildings: data.buildings.filter(x => x.id !== b.id) })}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ---------- экспорт в календарь ----------

function icsDate(t: number) {
  const d = new Date(t)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`
}
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')

export function buildICS(slots: Slot[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SAFU//Windows//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:САФУ — пары', 'X-WR-TIMEZONE:Europe/Moscow']
  for (const s of slots) {
    lines.push('BEGIN:VEVENT', `UID:${Math.floor(s.start / 1000)}-${encodeURIComponent(s.subject).slice(0, 40)}@safu`, `DTSTAMP:${icsDate(Date.now())}`,
      `DTSTART:${icsDate(s.start)}`, `DTEND:${icsDate(s.end)}`, `SUMMARY:${icsEsc(`${s.subject} (${kindStyle(s.kind).label})`)}`,
      `LOCATION:${icsEsc([s.room ? `ауд. ${s.room}` : '', s.address].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${icsEsc([s.teacher, s.note].filter(Boolean).join('\n'))}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Пара', 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [weeks, setWeeks] = useState(4)
  const slots = useMemo(() => Array.from({ length: weeks * 7 }, (_, i) => slotsOn(addDays(startOfDay(Date.now()), i), data)).flat(), [weeks, data, open])
  return (
    <Sheet open={open} onClose={onClose} title="Экспорт в календарь"
      footer={<button className="btn primary" disabled={!slots.length} onClick={async () => {
        const p = await safu.dialog.save({ name: 'САФУ-пары.ics', text: buildICS(slots), filters: [{ name: 'Календарь', extensions: ['ics'] }] })
        if (p) { toast('Файл сохранён — открой его, чтобы добавить в Outlook или Календарь Windows'); onClose() }
      }}><Download size={15} /> Сохранить .ics</button>}>
      <div className="sub mb12">Файл .ics открывается в Outlook, Календаре Windows и Google Календаре. Повторный экспорт обновит пары без дублей. За 15 минут до пары будет напоминание.</div>
      <Field label="На сколько недель вперёд"><Segmented value={weeks} onChange={setWeeks} options={[1, 2, 4, 8, 16].map(v => ({ value: v, label: `${v}` }))} /></Field>
      <div className="pill">Пар в файле: {slots.length}</div>
    </Sheet>
  )
}

// ---------- подробности пары ----------

export function LessonSheet({ slot, onClose }: { slot: Slot | null; onClose: () => void }) {
  homeworkStore.use()
  const [roomNotes, setRoomNotes] = usePref<Record<string, string>>('room.notes', {})
  if (!slot) return <Sheet open={false} onClose={onClose} />
  const s = slot
  const st = kindStyle(s.kind)
  const due = hw.dueAt(s)
  const given = hw.givenAt(s)
  const roomKey = `${s.room}|${s.address}`.toLowerCase()
  return (
    <Sheet open={!!slot} onClose={onClose} title={<span className="row gap8"><KindBadge kind={s.kind} size="md" />{s.pair ? <span className="pill">{s.pair} пара</span> : null}</span>}>
      <div style={{ fontSize: '1.6rem', fontWeight: 850, lineHeight: 1.15, marginBottom: 14 }}>{s.subject}</div>
      <div className="col gap8 mb16">
        <div className="row"><Clock size={16} color={st.color} /><span className="cap">{fullDay(s.start)}</span> · {hm(s.start)}–{hm(s.end)}</div>
        {(s.room || s.address) && <div className="row top"><MapPin size={16} color={st.color} style={{ marginTop: 2 }} /><div>{s.room && <b>ауд. {s.room}</b>}{s.room && s.address ? ' · ' : ''}{AddressFormat.full(s.address)}</div></div>}
        {s.teacher && <div className="row"><User size={16} color={st.color} />{s.teacher}</div>}
        {s.note && <div className="sub wrap" style={{ padding: 10, borderRadius: 10, background: 'var(--fill)' }}>{s.note}</div>}
      </div>
      <Field label="Как найти аудиторию (своя подсказка)">
        <input className="input" value={roomNotes[roomKey] || ''} placeholder="3 этаж, налево от лестницы" onChange={e => setRoomNotes({ ...roomNotes, [roomKey]: e.target.value })} />
      </Field>
      <div className="row wrap-row gap8">
        {s.address && !s.remote && <button className="btn" onClick={() => safu.shell.open(routeURL(s.address))}><MapPin size={15} /> Маршрут в Яндекс Картах</button>}
        <button className="btn" onClick={() => { onClose(); openSubject(s.subject) }}><FolderOpen size={15} /> Файлы и заметки</button>
        <button className="btn" onClick={() => safu.fs.openRoot(subjectFolder(s.subject))}><FolderOpen size={15} /> Папка в Проводнике</button>
        <button className="btn primary" onClick={() => { onClose(); openHomeworkEditor({ subject: s.subject, slotStart: s.start }) }}><BookMarked size={15} /> Записать ДЗ</button>
        {useProfileHead() && <button className="btn" onClick={() => { onClose(); go('attendance', { slot: s.start, subject: s.subject }) }}><Users size={15} /> Посещаемость</button>}
      </div>
      {(due.length > 0 || given.length > 0) && <div className="h-sec">Домашка</div>}
      {due.map(h => <HWLine key={h.id} id={h.id} label="сдать" />)}
      {given.map(h => <HWLine key={h.id} id={h.id} label="задали" />)}
    </Sheet>
  )
}

function useProfileHead() { const [role] = usePref('user.role', 0); const [kind] = usePref('user.kind', 'student'); return role === 1 || role === 2 || kind === 'teacher' }

function HWLine({ id, label }: { id: string; label: string }) {
  const h = hw.item(id)
  if (!h) return null
  return (
    <div className="row" style={{ padding: 10, borderRadius: 12, background: 'var(--fill)', marginBottom: 6, cursor: 'pointer' }} onClick={() => openHomeworkEditor({ id })}>
      <Toggle on={h.done} onChange={() => hw.toggle(id)} />
      <div className="grow"><div className="bold small" style={{ textDecoration: h.done ? 'line-through' : undefined }}>{hwTitle(h)}</div><div className="tiny muted">{label} · {chip(h.due, h.done)}</div></div>
      <Pencil size={14} className="faint" />
    </div>
  )
}

void RUZ_BASE; void relativeAgo
