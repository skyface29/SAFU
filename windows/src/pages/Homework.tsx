// «ДЗ»: по срокам, по предметам, сделанное. Настройки домашки.
import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Settings2, Search, Star, Clock, ArrowRightCircle, Copy, Trash2, Pencil, AlertTriangle, X, Image, ListChecks, BookMarked } from 'lucide-react'
import { PageHeader, Card, Segmented, Empty, Ring, AnimatedNumber, openMenu, burst, Row, ToggleRow, toast, confirmDialog, Field } from '../ui/kit'
import { homeworkStore, hw, hwTitle, hwKind, chip, urgency, dayTime, type Homework, HW_KINDS } from '../lib/homework'
import { useSchedule } from '../lib/scheduleStore'
import { openHomeworkEditor, openSubject, go } from '../lib/nav'
import { startOfDay, addDays, isToday, isTomorrow, DAY, plural } from '../lib/date'
import { celebrations } from '../fx/Celebrations'
import { usePref } from '../lib/kv'
import { SubjectGlyph, subjectColor } from '../ui/icons'

type Mode = 'due' | 'subjects' | 'done'

export default function HomeworkPage() {
  homeworkStore.use()
  const data = useSchedule(s => s.data)
  const [mode, setMode] = usePref<Mode>('hw.mode', 'due')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string>('')
  const active = hw.active()
  const finished = hw.finished()
  const stats = hw.weekStats()
  const match = (h: Homework) => (!q || (hwTitle(h) + ' ' + h.subject + ' ' + h.note).toLowerCase().includes(q.toLowerCase())) && (!kind || h.kind === kind)
  const list = (mode === 'done' ? finished : active).filter(match)

  const groups = useMemo(() => {
    if (mode === 'subjects') {
      const m = new Map<string, Homework[]>()
      for (const h of list) { const k = h.subject || 'Без предмета'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(h) }
      return [...m.entries()].map(([title, items]) => ({ title, items, subject: true }))
    }
    if (mode === 'done') return [{ title: 'Сделано', items: list, subject: false }]
    const today = startOfDay(Date.now())
    const buckets: { title: string; test: (h: Homework) => boolean }[] = [
      { title: 'Просрочено', test: h => h.due < Date.now() },
      { title: 'Сегодня', test: h => isToday(h.due) },
      { title: 'Завтра', test: h => isTomorrow(h.due) },
      { title: 'На этой неделе', test: h => h.due < addDays(today, 7) },
      { title: 'Позже', test: () => true }
    ]
    const used = new Set<string>()
    return buckets.map(b => {
      const items = list.filter(h => !used.has(h.id) && b.test(h))
      items.forEach(h => used.add(h.id))
      return { title: b.title, items, subject: false }
    }).filter(g => g.items.length)
  }, [list, mode])

  return (
    <>
      <PageHeader title="Домашка" subtitle={active.length ? `${active.length} ${plural(active.length, 'задание', 'задания', 'заданий')} в работе · ${hw.badgeCount()} к сдаче в ближайшие сутки` : 'Всё сделано — красота'}
        right={<>
          <button className="btn icon" onClick={() => go('hwsettings')} title="Настройки"><Settings2 size={16} /></button>
          <button className="btn primary" onClick={() => openHomeworkEditor({})}><Plus size={16} /> Записать <span className="kbd" style={{ color: 'rgba(255,255,255,.8)', borderColor: 'rgba(255,255,255,.4)' }}>Ctrl N</span></button>
        </>} />

      <div className="grid g4 mb16">
        <Card className="row" delay={0}>
          <Ring value={stats.total ? stats.done / stats.total : 0} size={60} stroke={7}><span className="small heavy">{stats.total ? Math.round(stats.done / stats.total * 100) : 0}%</span></Ring>
          <div><div className="tiny muted">За неделю</div><div className="bold">{stats.done} из {stats.total}</div></div>
        </Card>
        <Stat label="В работе" value={active.length} color="var(--brand)" delay={0.04} />
        <Stat label="Просрочено" value={active.filter(h => h.due < Date.now()).length} color="#ef4444" delay={0.08} />
        <Stat label="Важных" value={active.filter(h => h.important).length} color="#f59e0b" delay={0.12} />
      </div>

      <div className="row mb16 wrap-row">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'due', label: 'По сроку' }, { value: 'subjects', label: 'По предметам' }, { value: 'done', label: `Сделано · ${finished.length}` }]} />
        <div className="row" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)', height: 38, minWidth: 240 }}>
          <Search size={15} className="faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск" style={{ background: 'none', border: 'none', outline: 'none', flex: 1 }} />
          {q && <X size={14} className="clickable faint" onClick={() => setQ('')} />}
        </div>
        <div className="row wrap-row gap6">
          {HW_KINDS.map(k => <button key={k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(kind === k.id ? '' : k.id)}>{k.emoji}</button>)}
        </div>
        <span className="spacer" />
        {mode === 'done' && finished.length > 0 && <button className="btn sm danger" onClick={async () => { if (await confirmDialog('Очистить сделанное?', undefined, 'Очистить', true)) hw.clearFinished() }}><Trash2 size={14} /> Очистить</button>}
      </div>

      {!list.length && (mode === 'done'
        ? <Empty emoji="📭" title="Сделанного пока нет" />
        : <Empty emoji="🎉" title={q || kind ? 'Ничего не нашлось' : 'Домашки нет'} text="Записывай ДЗ прямо с пары — срок встанет к следующему занятию и сам подстроится, если РУЗ перенесёт пару." action={<button className="btn primary" onClick={() => openHomeworkEditor({})}><Plus size={16} /> Записать ДЗ</button>} />)}

      <div className="col gap18">
        {groups.map(g => (
          <motion.div key={g.title} layout>
            <div className="row" style={{ margin: '0 4px 10px' }}>
              {g.subject && <div className="icon-tile" style={{ width: 28, height: 28, borderRadius: 9, background: subjectColor(g.title) }}><SubjectGlyph subject={g.title} size={14} /></div>}
              <div className="h-card clickable" style={{ color: g.title === 'Просрочено' ? '#ef4444' : undefined }} onClick={() => g.subject && openSubject(g.title)}>{g.title}</div>
              <span className="pill">{g.items.length}</span>
            </div>
            <div className="col gap8">
              <AnimatePresence initial={false}>
                {g.items.map(h => <HWRow key={h.id} h={h} showSubject={!g.subject} data={data} />)}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function Stat({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  return (
    <Card delay={delay}>
      <div className="tiny muted">{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 850, color }}><AnimatedNumber value={value} /></div>
    </Card>
  )
}

export function HWRow({ h, showSubject, data }: { h: Homework; showSubject?: boolean; data: any }) {
  const k = hwKind(h.kind)
  const steps = h.steps.length
  const done = h.steps.filter(s => s.done).length
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60, height: 0, marginTop: -8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className="card hover" style={{ padding: '12px 14px', cursor: 'pointer' }}
      onClick={() => openHomeworkEditor({ id: h.id })}
      onContextMenu={e => openMenu(e, [
        { label: 'Изменить', icon: <Pencil size={15} />, run: () => openHomeworkEditor({ id: h.id }) },
        { label: h.rule === 'pair' ? 'На следующую пару' : 'На день позже', icon: <ArrowRightCircle size={15} />, run: () => { hw.postpone(h.id, data); toast('Срок перенесён') } },
        { label: 'Дублировать', icon: <Copy size={15} />, run: () => hw.duplicate(h.id) },
        { label: 'Предмет', icon: <BookMarked size={15} />, run: () => openSubject(h.subject) },
        { sep: true, label: '' },
        { label: 'Удалить', icon: <Trash2 size={15} />, danger: true, run: () => { hw.remove(h.id); toast('ДЗ удалено', 'info') } }
      ])}>
      <div className="row top" style={{ gap: 14 }}>
        <motion.button whileTap={{ scale: 0.75 }} onClick={e => {
          e.stopPropagation()
          if (!h.done) burst(e.clientX, e.clientY, [k.color, '#fff', '#22c55e'])
          const nowDone = hw.toggle(h.id)
          if (nowDone) celebrations.taskDone(hwTitle(h), hw.active().length)
        }}
          style={{ width: 26, height: 26, borderRadius: 9, border: `2.4px solid ${k.color}`, background: h.done ? k.color : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center', marginTop: 1 }}>
          {h.done && <motion.svg initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} width="14" height="14" viewBox="0 0 24 24"><motion.path d="M4 12l5 5L20 6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} /></motion.svg>}
        </motion.button>
        <div className="grow">
          <div className="row gap6" style={{ marginBottom: 3 }}>
            <span className="badge" style={{ background: `${k.color}26`, color: k.color }}>{k.emoji} {k.title}</span>
            {h.important && <Star size={13} fill="#f59e0b" color="#f59e0b" />}
            {showSubject && <span className="tiny muted ellipsis">{h.subject}</span>}
          </div>
          <div className="bold" style={{ textDecoration: h.done ? 'line-through' : undefined, opacity: h.done ? 0.6 : 1 }}>{hwTitle(h)}</div>
          {h.note && <div className="tiny muted clamp2 mt4">{h.note}</div>}
          <div className="row wrap-row gap8 mt8">
            <span className="pill" style={{ color: urgency(h.due, h.done) }}><Clock size={11} /> {chip(h.due, h.done)}</span>
            {h.dueKind && <span className="tiny muted">{dayTime(h.due)}{h.dueRoom ? ` · ауд. ${h.dueRoom}` : ''}</span>}
            {steps > 0 && <span className="pill"><ListChecks size={11} /> {done}/{steps}</span>}
            {h.photos.length > 0 && <span className="pill"><Image size={11} /> {h.photos.length}</span>}
            {h.dueEstimated && <span className="tiny" style={{ color: '#f59e0b' }}>по прошлым неделям</span>}
          </div>
          {h.shiftNote && (
            <div className="row tiny mt8" style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(245,158,11,.12)', color: '#f59e0b' }}>
              <AlertTriangle size={12} /> <span className="grow">{h.shiftNote}</span>
              <X size={12} className="clickable" onClick={e => { e.stopPropagation(); hw.dismissShift(h.id) }} />
            </div>
          )}
        </div>
        {steps > 0 && <Ring value={done / steps} size={38} stroke={4} color={k.color}><span className="tiny bold">{done}</span></Ring>}
      </div>
    </motion.div>
  )
}

export function HomeworkSettings() {
  const [defDue, setDefDue] = usePref('hw.defaultDue', 'next')
  const [follow, setFollow] = usePref('hw.follow', true)
  const [skipRemote, setSkipRemote] = usePref('hw.skipRemote', true)
  const [guess, setGuess] = usePref('hw.guessKind', true)
  const [shift, setShift] = usePref('hw.notifyShift', true)
  const [celebrate, setCelebrate] = usePref('hw.celebrate', true)
  const [badge, setBadge] = usePref('hw.badge', true)
  const [keep, setKeep] = usePref('hw.keepDone', 30)
  const [ev, setEv] = usePref('hw.remind.evening', true)
  const [mo, setMo] = usePref('hw.remind.morning', false)
  const [hr, setHr] = usePref('hw.remind.hour', true)
  const [evH, setEvH] = usePref('hw.eveningHour', 20)
  const [moH, setMoH] = usePref('hw.morningHour', 7)
  const [ask, setAsk] = usePref('hw.ask', false)
  const [askDelay, setAskDelay] = usePref('hw.ask.delay', 3)
  const [askL, setAskL] = usePref('hw.ask.lecture', false)
  const [askP, setAskP] = usePref('hw.ask.practice', true)
  const [askLab, setAskLab] = usePref('hw.ask.lab', true)
  const [askS, setAskS] = usePref('hw.ask.seminar', true)
  return (
    <>
      <PageHeader title="Настройки домашки" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Срок по умолчанию</div>
          <Card className="list" style={{ padding: 0 }}>
            {[['next', 'К следующей паре'], ['nextSame', 'К следующей такой же (практика к практике)'], ['skip1', 'Через одну пару'], ['tomorrow', 'Завтра'], ['week', 'Через неделю']].map(([v, t]) => (
              <Row key={v} title={t} onClick={() => setDefDue(v)} right={defDue === v ? <span style={{ color: 'var(--brand)', fontWeight: 900 }}>✓</span> : null} />
            ))}
          </Card>
          <div className="h-sec">Расписание</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Следить за расписанием" sub="Пару перенесли — срок переезжает вместе с ней" on={follow} onChange={setFollow} />
            <ToggleRow title="Не считать дистанционные пары" sub="Срок встаёт на ближайшую очную" on={skipRemote} onChange={setSkipRemote} />
            <ToggleRow title="Сообщать о сдвиге срока" on={shift} onChange={setShift} />
          </Card>
          <div className="h-sec">Удобства</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Угадывать тип по тексту" on={guess} onChange={setGuess} />
            <ToggleRow title="Конфетти за сделанное" on={celebrate} onChange={setCelebrate} />
            <ToggleRow title="Число на значке и в меню" on={badge} onChange={setBadge} />
            <Row title="Хранить сделанное" right={<Segmented value={keep} onChange={setKeep} options={[{ value: 7, label: '7 дн' }, { value: 30, label: '30 дн' }, { value: 0, label: 'всегда' }]} />} />
          </Card>
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Напоминания</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Накануне вечером" on={ev} onChange={setEv} />
            {ev && <Row title="Во сколько" right={<input type="number" className="input" style={{ width: 80 }} min={12} max={23} value={evH} onChange={e => setEvH(+e.target.value)} />} />}
            <ToggleRow title="Утром в день сдачи" on={mo} onChange={setMo} />
            {mo && <Row title="Во сколько" right={<input type="number" className="input" style={{ width: 80 }} min={5} max={11} value={moH} onChange={e => setMoH(+e.target.value)} />} />}
            <ToggleRow title="За час до сдачи" on={hr} onChange={setHr} />
            <Row title="Пересчитать все напоминания" onClick={() => { hw.rescheduleAll(); toast('Готово') }} />
          </Card>
          <div className="h-sec">«Что задали?» после пары</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Спрашивать после пары" sub="Уведомление — нажми и сразу записывай" on={ask} onChange={setAsk} />
            {ask && <>
              <Row title="Через сколько минут" right={<Segmented value={askDelay} onChange={setAskDelay} options={[0, 3, 10, 30].map(v => ({ value: v, label: `${v}` }))} />} />
              <ToggleRow title="После лекций" on={askL} onChange={setAskL} />
              <ToggleRow title="После практик" on={askP} onChange={setAskP} />
              <ToggleRow title="После лабораторных" on={askLab} onChange={setAskLab} />
              <ToggleRow title="После семинаров" on={askS} onChange={setAskS} />
            </>}
          </Card>
        </div>
      </div>
    </>
  )
}
void Field; void DAY
