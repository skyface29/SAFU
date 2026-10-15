// «Заметки»: тексты и списки, цвета, закрепление, привязка к предмету
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pin, Trash2, Search, ListChecks, X, Palette } from 'lucide-react'
import { PageHeader, Sheet, Empty, openMenu, Field } from '../ui/kit'
import { notesStore, notes, blankNote, noteTitle, notePreview, NOTE_COLORS, type Note } from '../lib/study'
import { useSchedule } from '../lib/scheduleStore'
import { subjects } from '../lib/schedule'
import { uid } from '../lib/kv'
import { dayMon, relativeAgo } from '../lib/date'

export default function Notes({ subject }: { subject?: string }) {
  const list = notesStore.use()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Note | null>(null)
  const shown = list.filter(n => (!subject || n.subject === subject) && (!q || (n.title + n.text + n.items.map(i => i.text).join(' ') + n.subject).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)
  return (
    <>
      <PageHeader title="Заметки" subtitle={`${list.length} шт.`} right={<>
        <div className="row" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)', height: 38, width: 260 }}>
          <Search size={15} className="faint" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск" style={{ background: 'none', border: 'none', outline: 'none', flex: 1 }} />
        </div>
        <button className="btn primary" onClick={() => setEdit(blankNote(subject))}><Plus size={16} /> Заметка</button>
      </>} />
      {!shown.length && <Empty emoji="🗒️" title="Заметок нет" text="Мысли, списки покупок к лабе, вопросы к экзамену — всё здесь." />}
      <div style={{ columns: '280px', columnGap: 14 }}>
        <AnimatePresence>
          {shown.map((n, i) => <NoteCard key={n.id} n={n} i={i} onOpen={() => setEdit(n)} />)}
        </AnimatePresence>
      </div>
      <NoteEditor note={edit} onClose={() => setEdit(null)} />
    </>
  )
}

export function NoteCard({ n, i, onOpen }: { n: Note; i: number; onOpen: () => void }) {
  const c = NOTE_COLORS[n.color] || 'transparent'
  return (
    <motion.div layout initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: Math.min(i, 12) * 0.025 }}
      className="card hover press" style={{ breakInside: 'avoid', marginBottom: 14, padding: 16, background: c !== 'transparent' ? `linear-gradient(160deg, ${c}38, ${c}12)` : undefined, borderColor: c !== 'transparent' ? `${c}66` : undefined }}
      onClick={onOpen}
      onContextMenu={e => openMenu(e, [
        { label: n.pinned ? 'Открепить' : 'Закрепить', icon: <Pin size={15} />, run: () => notes.togglePin(n.id) },
        { label: 'Удалить', icon: <Trash2 size={15} />, danger: true, run: () => notes.remove(n.id) }
      ])}>
      <div className="row top"><div className="bold grow">{noteTitle(n)}</div>{n.pinned && <Pin size={14} color="var(--brand)" />}</div>
      {notePreview(n) && <div className="small muted clamp3 mt4 wrap">{notePreview(n)}</div>}
      {n.items.length > 0 && <div className="col gap4 mt8">{n.items.slice(0, 5).map(it => <div key={it.id} className="row small gap6" style={{ opacity: it.done ? 0.5 : 1, textDecoration: it.done ? 'line-through' : undefined }}><span>{it.done ? '☑' : '☐'}</span>{it.text}</div>)}</div>}
      <div className="row tiny faint mt8">{n.subject && <span className="pill">{n.subject}</span>}<span className="spacer" />{relativeAgo(n.updated)}</div>
    </motion.div>
  )
}

export function NoteEditor({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [n, setN] = useState<Note | null>(null)
  useEffect(() => setN(note), [note])
  if (!n) return <Sheet open={false} onClose={onClose} />
  const close = () => { notes.upsert(n); onClose() }
  return (
    <Sheet open={!!note} onClose={close} size="wide" title={<input value={n.title} onChange={e => setN({ ...n, title: e.target.value })} placeholder="Заголовок" style={{ background: 'none', border: 'none', outline: 'none', fontSize: '1.25rem', fontWeight: 800, width: '100%' }} />}
      headRight={<>
        <button className="btn icon sm ghost" title="Цвет" onClick={e => openMenu(e, NOTE_COLORS.map((c, i) => ({ label: ['Без цвета', 'Жёлтый', 'Зелёный', 'Синий', 'Розовый', 'Фиолетовый'][i], icon: <span style={{ width: 14, height: 14, borderRadius: 7, background: c === 'transparent' ? 'var(--fill2)' : c, display: 'block' }} />, run: () => setN({ ...n, color: i }) })))}><Palette size={16} /></button>
        <button className="btn icon sm ghost" title="Закрепить" onClick={() => setN({ ...n, pinned: !n.pinned })}><Pin size={16} color={n.pinned ? 'var(--brand)' : undefined} /></button>
        <button className="btn icon sm ghost danger" onClick={() => { notes.remove(n.id); onClose() }}><Trash2 size={16} /></button>
      </>}
      footer={<button className="btn primary" onClick={close}>Готово</button>}>
      <textarea className="textarea" autoFocus value={n.text} onChange={e => setN({ ...n, text: e.target.value })} placeholder="Текст заметки…" style={{ minHeight: 200, fontSize: '1rem' }} />
      <div className="col gap6 mt12">
        {n.items.map(it => (
          <div key={it.id} className="row">
            <input type="checkbox" checked={it.done} onChange={() => setN({ ...n, items: n.items.map(x => x.id === it.id ? { ...x, done: !x.done } : x) })} style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
            <input className="input grow" style={{ height: 34 }} value={it.text} onChange={e => setN({ ...n, items: n.items.map(x => x.id === it.id ? { ...x, text: e.target.value } : x) })} />
            <button className="btn icon sm ghost" onClick={() => setN({ ...n, items: n.items.filter(x => x.id !== it.id) })}><X size={14} /></button>
          </div>
        ))}
        <div><button className="btn sm" onClick={() => setN({ ...n, items: [...n.items, { id: uid(), text: '', done: false }] })}><ListChecks size={14} /> Пункт списка</button></div>
      </div>
      <Field label="Предмет"><select className="select mt12" value={n.subject} onChange={e => setN({ ...n, subject: e.target.value })}><option value="">Без предмета</option>{subjects(data).map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
    </Sheet>
  )
}
void dayMon
