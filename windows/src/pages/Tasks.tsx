// «Задачи»: дедлайны по предметам с напоминаниями
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Bell, BellOff, Clock } from 'lucide-react'
import { PageHeader, Card, Sheet, Field, Toggle, Empty, openMenu, burst, Segmented, confirmDialog } from '../ui/kit'
import { tasksStore, tasks, blankTask, type StudyTask } from '../lib/study'
import { useSchedule } from '../lib/scheduleStore'
import { subjects } from '../lib/schedule'
import { chip, urgency } from '../lib/homework'
import { toLocalInput, fromLocalInput, plural, isToday, isTomorrow, addDays, startOfDay } from '../lib/date'
import { celebrations } from '../fx/Celebrations'

export default function Tasks() {
  const list = tasksStore.use()
  const [edit, setEdit] = useState<StudyTask | null>(null)
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')
  const shown = list.filter(t => filter === 'all' || (filter === 'done' ? t.done : !t.done)).sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due)
  const open = list.filter(t => !t.done)
  const groups: { title: string; items: StudyTask[] }[] = []
  const today = startOfDay(Date.now())
  for (const t of shown) {
    const title = t.done ? 'Сделано' : t.due < Date.now() ? 'Просрочено' : isToday(t.due) ? 'Сегодня' : isTomorrow(t.due) ? 'Завтра' : t.due < addDays(today, 7) ? 'На неделе' : 'Позже'
    let g = groups.find(x => x.title === title)
    if (!g) { g = { title, items: [] }; groups.push(g) }
    g.items.push(t)
  }
  return (
    <>
      <PageHeader title="Задачи" subtitle={open.length ? `${open.length} ${plural(open.length, 'задача', 'задачи', 'задач')} в работе` : 'Хвостов нет'}
        right={<>
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'open', label: 'В работе' }, { value: 'done', label: 'Сделано' }, { value: 'all', label: 'Все' }]} />
          {filter === 'done' && list.some(t => t.done) && <button className="btn danger" onClick={async () => { if (await confirmDialog('Удалить сделанные задачи?', undefined, 'Удалить', true)) tasks.clearDone() }}><Trash2 size={15} /></button>}
          <button className="btn primary" onClick={() => setEdit(blankTask())}><Plus size={16} /> Задача</button>
        </>} />
      {!shown.length && <Empty emoji="✅" title={filter === 'done' ? 'Пока ничего не сделано' : 'Задач нет'} text="Курсовые, отчёты, долги — всё с дедлайном и напоминанием за день и за 3 часа." action={<button className="btn primary" onClick={() => setEdit(blankTask())}><Plus size={16} /> Добавить задачу</button>} />}
      <div className="col gap18">
        {groups.map(g => (
          <div key={g.title}>
            <div className="h-card" style={{ margin: '0 4px 10px', color: g.title === 'Просрочено' ? '#ef4444' : undefined }}>{g.title}</div>
            <div className="grid gauto">
              <AnimatePresence>
                {g.items.map(t => (
                  <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="card hover press" style={{ padding: 14 }} onClick={() => setEdit(t)}
                    onContextMenu={e => openMenu(e, [{ label: 'Удалить', danger: true, icon: <Trash2 size={15} />, run: () => tasks.remove(t.id) }])}>
                    <div className="row top">
                      <motion.button whileTap={{ scale: 0.75 }} onClick={e => { e.stopPropagation(); if (!t.done) burst(e.clientX, e.clientY); if (tasks.toggle(t.id)) celebrations.taskDone(t.title, tasksStore.get().filter(x => !x.done).length) }}
                        style={{ width: 24, height: 24, borderRadius: 12, border: '2.4px solid var(--brand)', background: t.done ? 'var(--brand)' : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                      <div className="grow">
                        <div className="bold" style={{ textDecoration: t.done ? 'line-through' : undefined, opacity: t.done ? 0.6 : 1 }}>{t.title || 'Без названия'}</div>
                        {t.subject && <div className="tiny muted">{t.subject}</div>}
                        {t.note && <div className="tiny faint clamp2 mt4">{t.note}</div>}
                        <div className="row gap6 mt8">
                          <span className="pill" style={{ color: urgency(t.due, t.done) }}><Clock size={11} /> {chip(t.due, t.done)}</span>
                          {t.remind ? <Bell size={12} className="faint" /> : <BellOff size={12} className="faint" />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
      <TaskEditor t={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function TaskEditor({ t, onClose }: { t: StudyTask | null; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [v, setV] = useState<StudyTask | null>(null)
  React.useEffect(() => setV(t), [t])
  if (!v) return <Sheet open={false} onClose={onClose} />
  const exists = tasksStore.get().some(x => x.id === v.id)
  return (
    <Sheet open={!!t} onClose={onClose} title={exists ? 'Задача' : 'Новая задача'}
      footer={<>
        {exists && <button className="btn danger" onClick={() => { tasks.remove(v.id); onClose() }}><Trash2 size={15} /> Удалить</button>}
        <span className="spacer" />
        <button className="btn primary" onClick={() => { if (v.title.trim()) { tasks.upsert({ ...v, title: v.title.trim() }); onClose() } }}>Сохранить</button>
      </>}>
      <Field label="Что сделать"><input className="input" autoFocus value={v.title} onChange={e => setV({ ...v, title: e.target.value })} placeholder="Сдать курсовую" /></Field>
      <Field label="Предмет"><input className="input" list="t-subj" value={v.subject} onChange={e => setV({ ...v, subject: e.target.value })} /><datalist id="t-subj">{subjects(data).map(s => <option key={s} value={s} />)}</datalist></Field>
      <Field label="Дедлайн"><input type="datetime-local" className="input" value={toLocalInput(v.due)} onChange={e => setV({ ...v, due: fromLocalInput(e.target.value) || v.due })} /></Field>
      <Field label="Заметка"><textarea className="textarea" value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></Field>
      <div className="row"><div className="grow bold small">Напомнить за день и за 3 часа</div><Toggle on={v.remind} onChange={r => setV({ ...v, remind: r })} /></div>
    </Sheet>
  )
}
