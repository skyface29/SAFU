// «Предметы»: список с ближайшей парой, ДЗ и файлами; лист предмета — всё о нём в одном месте
import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, FolderOpen, Upload, Plus, Link2, X, User, Clock, BookMarked, StickyNote, ExternalLink, Pin, Star } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, openMenu, promptDialog, toast, KindBadge, Segmented } from '../ui/kit'
import { useSchedule } from '../lib/scheduleStore'
import { subjects as allSubjects, slotsRange, teachersOf, kindStyle, type Slot } from '../lib/schedule'
import { hw, homeworkStore, hwTitle, chip, urgency } from '../lib/homework'
import { shortDayTime, relDay, hm, plural } from '../lib/date'
import { openHomeworkEditor, openSubject, go, useModals } from '../lib/nav'
import { SubjectGlyph, subjectColor } from '../ui/icons'
import { subjectNotes, pins, pinsStore, notesStore } from '../lib/study'
import { safu, type FileInfo } from '../lib/bridge'
import { subjectFolder } from '../lib/effects'
import { Thumb, openFile, fmtSize } from './Files'
import { openURL } from '../sites/sites'
import { gradesStore, total as gradeTotal } from '../lib/grades'
import { usePref } from '../lib/kv'

export default function Subjects() {
  const data = useSchedule(s => s.data)
  homeworkStore.use()
  const [q, setQ] = useState('')
  const [sort, setSort] = usePref<'name' | 'next'>('subjects.sort', 'next')
  const list = allSubjects(data)
  const upcoming = useMemo(() => slotsRange(Date.now(), 60, data).filter(s => s.end > Date.now()), [data])
  const nextOf = (s: string) => upcoming.find(x => x.subject.toLowerCase() === s.toLowerCase())
  const shown = list.filter(s => !q || s.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.localeCompare(b, 'ru') : (nextOf(a)?.start ?? Infinity) - (nextOf(b)?.start ?? Infinity))
  return (
    <>
      <PageHeader title="Предметы" subtitle={`${list.length} ${plural(list.length, 'предмет', 'предмета', 'предметов')} в расписании`} right={<>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'next', label: 'По ближайшей паре' }, { value: 'name', label: 'По алфавиту' }]} />
        <div className="row" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)', height: 38, width: 240 }}>
          <Search size={15} className="faint" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск" style={{ background: 'none', border: 'none', outline: 'none', flex: 1 }} />
        </div>
      </>} />
      {!list.length && <Empty emoji="📚" title="Предметов пока нет" text="Они появятся вместе с расписанием." />}
      <div className="grid gauto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {shown.map((s, i) => {
          const n = nextOf(s)
          const open = hw.openItems(s).length
          const color = subjectColor(s)
          return (
            <Card key={s} press tilt delay={Math.min(i, 16) * 0.03} onClick={() => openSubject(s)} style={{ overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${color}33, transparent 70%)` }} />
              <div className="row top">
                <motion.div className="icon-tile" whileHover={{ rotate: 12, scale: 1.1 }} style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg, ${color}, ${color}aa)` }}><SubjectGlyph subject={s} size={22} /></motion.div>
                <div className="grow">
                  <div className="bold clamp2" style={{ lineHeight: 1.25 }}>{s}</div>
                  <div className="tiny muted ellipsis mt4">{teachersOf(data, s).slice(0, 2).join(', ') || 'Преподаватель не указан'}</div>
                </div>
              </div>
              <div className="row wrap-row gap6 mt12">
                {n ? <span className="pill"><Clock size={11} /> {relDay(n.start)}, {hm(n.start)}</span> : <span className="pill">пар не видно</span>}
                {n && <KindBadge kind={n.kind} filled={false} />}
                {open > 0 && <span className="pill" style={{ color: '#f59e0b' }}><BookMarked size={11} /> ДЗ {open}</span>}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

export function SubjectSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  homeworkStore.use()
  pinsStore.use()
  notesStore.use()
  const grades = gradesStore.use()
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const s = name || ''
  const folder = subjectFolder(s)
  useEffect(() => {
    if (!name) return
    setNote(subjectNotes.get(name))
    safu.fs.mkdir(folder).then(() => safu.fs.walk(folder)).then((l: FileInfo[]) => setFiles(l.sort((a, b) => b.mtime - a.mtime)))
  }, [name])
  if (!name) return <Sheet open={false} onClose={onClose} />
  const color = subjectColor(s)
  const upcoming = slotsRange(Date.now(), 45, data).filter(x => x.subject.toLowerCase() === s.toLowerCase() && x.end > Date.now()).slice(0, 5)
  const teachers = teachersOf(data, s)
  const open = hw.openItems(s)
  const subjPins = pins.of(s)
  const g = grades.find(x => x.subject.toLowerCase() === s.toLowerCase())
  const total = g ? gradeTotal(g) : null

  const addFiles = async () => { const r = await safu.fs.import(folder); if (r.length) { toast(`Добавлено: ${r.length}`); setFiles(await safu.fs.walk(folder)) } }
  return (
    <Sheet open={!!name} onClose={() => { subjectNotes.set(s, note); onClose() }} size="wide"
      title={<span className="row"><span className="icon-tile" style={{ width: 36, height: 36, borderRadius: 11, background: color }}><SubjectGlyph subject={s} size={18} /></span><span className="ellipsis">{s}</span></span>}
      headRight={<>
        <button className="btn sm" onClick={() => safu.fs.openRoot(folder)}><FolderOpen size={14} /> Папка</button>
        <button className="btn sm primary" onClick={() => { onClose(); openHomeworkEditor({ subject: s }) }}><Plus size={14} /> ДЗ</button>
      </>}>
      <div className="grid g2" style={{ gap: 20, alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 4 }}><Clock size={13} /> Ближайшие пары</div>
          {!upcoming.length && <div className="sub">В расписании пока нет</div>}
          <div className="col gap6">
            {upcoming.map(x => (
              <div key={x.key} className="row clickable" style={{ padding: '9px 12px', borderRadius: 12, background: 'var(--fill)' }} onClick={() => useModals.getState().set({ lesson: x })}>
                <KindBadge kind={x.kind} />
                <span className="grow small bold"><span className="cap">{shortDayTime(x.start)}</span></span>
                {x.room && <span className="tiny muted">ауд. {x.room}</span>}
              </div>
            ))}
          </div>
          {teachers.length > 0 && <>
            <div className="h-sec"><User size={13} /> Преподаватели</div>
            <div className="row wrap-row gap6">
              {teachers.map(t => <button key={t} className="chip" onClick={() => { onClose(); go('teachers', { name: t }) }}><User size={13} />{t}</button>)}
            </div>
          </>}
          <div className="h-sec"><BookMarked size={13} /> Домашка {open.length > 0 && <span className="pill">{open.length}</span>}</div>
          {!open.length && <div className="sub">Открытых заданий нет</div>}
          <div className="col gap6">
            {open.map(h => (
              <div key={h.id} className="row clickable" style={{ padding: '9px 12px', borderRadius: 12, background: 'var(--fill)' }} onClick={() => { onClose(); openHomeworkEditor({ id: h.id }) }}>
                <span className="grow small bold ellipsis">{hwTitle(h)}</span>
                <span className="pill" style={{ color: urgency(h.due) }}>{chip(h.due)}</span>
              </div>
            ))}
          </div>
          {g && <>
            <div className="h-sec"><Star size={13} /> БРС</div>
            <div className="row clickable" style={{ padding: 12, borderRadius: 12, background: 'var(--fill)' }} onClick={() => { onClose(); go('grades') }}>
              <span className="heavy" style={{ fontSize: '1.4rem' }}>{total}</span><span className="sub">баллов · {g.entries.length} оценок</span>
            </div>
          </>}
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 4 }}><StickyNote size={13} /> Заметка по предмету</div>
          <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} onBlur={() => subjectNotes.set(s, note)} placeholder="Требования преподавателя, допуск, что спросить…" style={{ minHeight: 110 }} />
          <div className="h-sec"><Pin size={13} /> Закрепы <span className="spacer" />
            <button className="btn sm ghost" onClick={async () => {
              const url = await promptDialog('Ссылка', 'https://', 'https://sakai.narfu.ru/…')
              if (!url || !/^https?:\/\//.test(url)) return
              const title = await promptDialog('Название', new URL(url).host)
              pins.add(s, { title: title || url, value: url, isFile: false })
            }}><Link2 size={13} /> Ссылка</button>
          </div>
          {!subjPins.length && <div className="sub">Курс в Sakai, методичка, чат группы — всё под рукой</div>}
          <div className="row wrap-row gap6">
            {subjPins.map(p => (
              <motion.div key={p.id} className="chip" whileHover={{ y: -2 }} onClick={() => p.isFile ? safu.fs.open(p.value) : openURL(p.value, p.title)}
                onContextMenu={e => openMenu(e, [{ label: 'Открыть в браузере', icon: <ExternalLink size={15} />, run: () => safu.shell.open(p.value) }, { label: 'Убрать', danger: true, run: () => pins.remove(s, p.id) }])}>
                <Link2 size={13} />{p.title}<X size={12} onClick={e => { e.stopPropagation(); pins.remove(s, p.id) }} />
              </motion.div>
            ))}
          </div>
          <div className="h-sec">Файлы <span className="pill">{files.length}</span><span className="spacer" />
            <button className="btn sm ghost" onClick={addFiles}><Upload size={13} /> Добавить</button>
          </div>
          {!files.length && <div className="sub clickable" onClick={addFiles}>Папка пустая — добавь методички и лекции</div>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
            {files.slice(0, 12).map(f => (
              <motion.div key={f.rel} whileHover={{ y: -3 }} className="clickable" onClick={() => openFile(f)} title={`${f.name} · ${fmtSize(f.size)}`}
                onContextMenu={e => openMenu(e, [{ label: 'Открыть в программе', run: () => safu.fs.open(f.rel) }, { label: 'Показать в Проводнике', run: () => safu.fs.reveal(f.rel) }, { label: 'Закрепить', run: () => pins.add(s, { title: f.name, value: f.rel, isFile: true }) }])}>
                <Thumb f={f} size={76} />
                <div className="tiny ellipsis mt4">{f.name}</div>
              </motion.div>
            ))}
          </div>
          {files.length > 12 && <button className="btn sm ghost mt8" onClick={() => { onClose(); go('files', { path: folder }) }}>Все файлы ({files.length})</button>}
        </div>
      </div>
    </Sheet>
  )
}
void kindStyle
