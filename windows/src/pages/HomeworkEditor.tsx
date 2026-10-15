// Редактор ДЗ: открывается откуда угодно (Ctrl+N, пара, уведомление, трей)
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Star, Trash2, Copy, Bell, Calendar, CheckSquare, ImagePlus, Sparkles, Wifi } from 'lucide-react'
import { Sheet, Field, Toggle, Segmented, toast, confirmDialog, KindBadge } from '../ui/kit'
import {
  type Homework, HW_KINDS, newHomework, guessKind, targets, resolve, suggestedSlot, findSlot, dayTime, hw, HWPrefs,
  defaultDueFor, type HWTarget, homeworkStore
} from '../lib/homework'
import { useSchedule } from '../lib/scheduleStore'
import { subjects, kindStyle } from '../lib/schedule'
import { toLocalInput, fromLocalInput, addDays, shortDayTime } from '../lib/date'
import { uid } from '../lib/kv'
import { safu, fileURL } from '../lib/bridge'
import { celebrations } from '../fx/Celebrations'

type Req = { id?: string; subject?: string; slotStart?: number } | null

type DueMode = 'next' | 'nextSame' | 'skip1' | 'pick' | 'tomorrow' | 'week' | 'date'

export function HomeworkEditor({ req, onClose }: { req: Req; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [h, setH] = useState<Homework | null>(null)
  const [mode, setMode] = useState<DueMode>('next')
  const [kindTouched, setKindTouched] = useState(false)
  const [stepText, setStepText] = useState('')

  useEffect(() => {
    if (!req) { setH(null); return }
    if (req.id) {
      const ex = hw.item(req.id)
      if (ex) { setH({ ...ex }); setMode(ex.rule === 'pair' ? (ex.skip === 1 ? 'skip1' : ex.matchKind ? 'nextSame' : ex.skip > 1 ? 'pick' : 'next') : 'date'); setKindTouched(true); return }
    }
    const slot = req.slotStart && req.subject ? findSlot(req.subject, req.slotStart, data) : !req.subject ? suggestedSlot(data) : null
    const subject = req.subject || slot?.subject || ''
    const n = newHomework(subject, '', addDays(Date.now(), 7))
    if (slot) { n.givenAt = slot.start; n.givenKind = slot.kind; n.fromPair = true; n.anchor = slot.start }
    const def = defaultDueFor(subject, slot, data)
    n.rule = def.rule; n.due = def.due; n.skip = def.skip; n.matchKind = def.matchKind
    if (def.target) { n.dueKind = def.target.kind; n.dueRoom = def.target.room; n.dueEstimated = def.target.estimated }
    n.follow = HWPrefs.follow(); n.skipRemote = HWPrefs.skipRemote()
    setH(n)
    setMode(def.rule === 'pair' ? (HWPrefs.defaultDue() as DueMode) : HWPrefs.defaultDue() === 'week' ? 'week' : 'tomorrow')
    setKindTouched(false)
  }, [req])

  const list = useMemo<HWTarget[]>(() => h?.subject ? targets(h.subject, h.anchor, null, data, 10, h.skipRemote) : [], [h?.subject, h?.anchor, h?.skipRemote, data])
  const sameKind = useMemo<HWTarget[]>(() => h?.subject && h.givenKind ? targets(h.subject, h.anchor, h.givenKind, data, 2, h.skipRemote) : [], [h?.subject, h?.anchor, h?.givenKind, h?.skipRemote, data])

  if (!h) return <Sheet open={false} onClose={onClose} />
  const exists = !!hw.item(h.id)
  const set = (p: Partial<Homework>) => setH({ ...h, ...p })

  const applyMode = (m: DueMode, pickIndex?: number) => {
    setMode(m)
    const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 0, 0); return d.getTime() }
    if (m === 'tomorrow') return set({ rule: 'date', due: endOfDay(addDays(Date.now(), 1)), dueKind: '', dueRoom: '' })
    if (m === 'week') return set({ rule: 'date', due: endOfDay(addDays(Date.now(), 7)), dueKind: '', dueRoom: '' })
    if (m === 'date') return set({ rule: 'date' })
    const skip = m === 'skip1' ? 1 : m === 'pick' ? (pickIndex ?? h.skip) : 0
    const matchKind = m === 'nextSame' ? h.givenKind : ''
    const n = { ...h, rule: 'pair' as const, skip, matchKind }
    const t = resolve(n, data)
    if (t) setH({ ...n, due: t.start, dueKind: t.kind, dueRoom: t.room, dueEstimated: t.estimated })
    else { toast('Подходящей пары не нашлось — поставлю дату', 'warn'); setH({ ...n, rule: 'date', due: endOfDay(addDays(Date.now(), 7)) }); setMode('date') }
  }

  const onText = (text: string) => {
    const p: Partial<Homework> = { text }
    if (!kindTouched && HWPrefs.guessKind()) { const g = guessKind(text); if (g) p.kind = g }
    set(p)
  }

  const save = () => {
    if (!h.text.trim() && !h.steps.length) { toast('Напиши, что задали', 'warn'); return }
    if (!h.subject.trim()) { toast('Выбери предмет', 'warn'); return }
    hw.upsert({ ...h, subject: h.subject.trim() })
    toast(exists ? 'ДЗ сохранено' : `ДЗ записано · сдать ${dayTime(h.due)}`)
    onClose()
  }

  const addPhotos = async () => {
    const rels: string[] = await safu.fs.import(`.homework/${h.id}`)
    if (rels.length) set({ photos: [...h.photos, ...rels] })
  }

  return (
    <Sheet open={!!req} onClose={onClose} size="wide" title={exists ? 'Домашка' : 'Записать ДЗ'}
      headRight={exists ? <>
        <button className="btn icon sm ghost" title="Дублировать" onClick={() => { hw.duplicate(h.id); toast('Копия создана'); onClose() }}><Copy size={16} /></button>
        <button className="btn icon sm ghost danger" title="Удалить" onClick={async () => { if (await confirmDialog('Удалить ДЗ?', undefined, 'Удалить', true)) { hw.remove(h.id); onClose() } }}><Trash2 size={16} /></button>
      </> : undefined}
      footer={<>
        {exists && <button className="btn" onClick={() => { const d = hw.toggle(h.id); if (d) celebrations.taskDone(h.text, hw.active().length); onClose() }}><CheckSquare size={15} /> {h.done ? 'Вернуть в работу' : 'Сделано'}</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </>}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 22 }}>
        <div>
          <Field label="Предмет">
            <input className="input" list="hw-subjects" value={h.subject} onChange={e => set({ subject: e.target.value })} placeholder="Выбери или напиши" autoFocus={!h.subject} />
            <datalist id="hw-subjects">{subjects(data).map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          {h.fromPair && <div className="pill mb12">Задали на паре: {shortDayTime(h.givenAt)} · {kindStyle(h.givenKind).label}</div>}
          <Field label="Что задали">
            <textarea className="textarea" value={h.text} onChange={e => onText(e.target.value)} placeholder="№ 12–15 на стр. 48, прочитать § 3" autoFocus={!!h.subject} style={{ minHeight: 100 }} />
          </Field>
          <Field label="Тип">
            <div className="row wrap-row gap6">
              {HW_KINDS.map(k => (
                <motion.button key={k.id} whileTap={{ scale: 0.92 }} className={`chip ${h.kind === k.id ? 'on' : ''}`} style={h.kind === k.id ? { background: k.color } : undefined}
                  onClick={() => { setKindTouched(true); set({ kind: k.id }) }}>{k.emoji} {k.title}</motion.button>
              ))}
            </div>
            {!kindTouched && HWPrefs.guessKind() && <div className="tiny faint mt4 row gap4"><Sparkles size={11} /> тип подбирается по тексту</div>}
          </Field>
          <Field label={`Подпункты${h.steps.length ? ` · ${h.steps.filter(s => s.done).length}/${h.steps.length}` : ''}`}>
            <div className="col gap6">
              <AnimatePresence initial={false}>
                {h.steps.map(st => (
                  <motion.div key={st.id} className="row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <input type="checkbox" checked={st.done} onChange={() => set({ steps: h.steps.map(x => x.id === st.id ? { ...x, done: !x.done } : x) })} style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                    <input className="input grow" style={{ height: 34, textDecoration: st.done ? 'line-through' : undefined }} value={st.text} onChange={e => set({ steps: h.steps.map(x => x.id === st.id ? { ...x, text: e.target.value } : x) })} />
                    <button className="btn icon sm ghost" onClick={() => set({ steps: h.steps.filter(x => x.id !== st.id) })}><X size={15} /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="row">
                <input className="input grow" style={{ height: 34 }} value={stepText} placeholder="Добавить пункт и Enter" onChange={e => setStepText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && stepText.trim()) { set({ steps: [...h.steps, { id: uid(), text: stepText.trim(), done: false }] }); setStepText('') } }} />
                <button className="btn icon sm" onClick={() => { if (stepText.trim()) { set({ steps: [...h.steps, { id: uid(), text: stepText.trim(), done: false }] }); setStepText('') } }}><Plus size={15} /></button>
              </div>
            </div>
          </Field>
          <Field label="Заметка"><textarea className="textarea" style={{ minHeight: 60 }} value={h.note} onChange={e => set({ note: e.target.value })} placeholder="Ссылки, подсказки, что спросить" /></Field>
          <Field label="Фото и файлы">
            <div className="row wrap-row gap8">
              {h.photos.map(p => (
                <motion.div key={p} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'relative' }}>
                  {/\.(png|jpe?g|webp|gif|bmp)$/i.test(p)
                    ? <img src={fileURL(p)} onClick={() => safu.fs.open(p)} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12, cursor: 'pointer' }} />
                    : <div className="center small" onClick={() => safu.fs.open(p)} style={{ width: 84, height: 84, borderRadius: 12, background: 'var(--fill2)', cursor: 'pointer', padding: 6, textAlign: 'center', wordBreak: 'break-all' }}>{p.split('/').pop()}</div>}
                  <button className="btn icon sm round" style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, background: 'var(--bg2)' }} onClick={() => set({ photos: h.photos.filter(x => x !== p) })}><X size={12} /></button>
                </motion.div>
              ))}
              <button className="btn" style={{ width: 84, height: 84, flexDirection: 'column', gap: 4 }} onClick={addPhotos}><ImagePlus size={20} /><span className="tiny">Добавить</span></button>
            </div>
          </Field>
        </div>

        <div>
          <Field label="Когда сдавать">
            <div className="col gap6">
              {([
                ['next', 'К следующей паре', list[0]],
                ...(h.givenKind ? [['nextSame', `К следующей: ${kindStyle(h.givenKind).label.toLowerCase()}`, sameKind[0]]] : []),
                ['skip1', 'Через одну пару', list[1]],
                ['tomorrow', 'Завтра', null],
                ['week', 'Через неделю', null],
                ['date', 'Своя дата и время', null]
              ] as [DueMode, string, HWTarget | null | undefined][]).map(([m, title, t]) => (
                <motion.div key={m} whileTap={{ scale: 0.98 }} onClick={() => applyMode(m)} className="row"
                  style={{ padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: mode === m ? 'rgba(var(--brand-rgb), .14)' : 'var(--fill)', border: `1.5px solid ${mode === m ? 'var(--brand)' : 'transparent'}` }}>
                  <div className="grow"><div className="bold small">{title}</div>{t && <div className="tiny muted">{shortDayTime(t.start)}{t.estimated ? ' · по прошлым неделям' : ''}</div>}</div>
                  {t && <KindBadge kind={t.kind} filled={false} />}
                </motion.div>
              ))}
            </div>
          </Field>
          {mode === 'date' && <Field label="Дата и время"><input type="datetime-local" className="input" value={toLocalInput(h.due)} onChange={e => set({ due: fromLocalInput(e.target.value) || h.due })} /></Field>}
          {list.length > 2 && (
            <Field label="Или выбери пару">
              <div className="row wrap-row gap6">
                {list.slice(0, 8).map((t, i) => (
                  <button key={t.start} className={`chip ${h.rule === 'pair' && !h.matchKind && h.skip === i ? 'on' : ''}`} onClick={() => applyMode('pick', i)}>
                    {shortDayTime(t.start)}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <motion.div layout className="card tight mb16" style={{ background: 'rgba(var(--brand-rgb), .1)', boxShadow: 'none' }}>
            <div className="row"><Calendar size={16} color="var(--brand)" /><div className="grow"><div className="tiny muted">Срок</div><div className="bold">{dayTime(h.due)}</div></div>
              {h.dueKind && <KindBadge kind={h.dueKind} />}</div>
            {h.dueRoom && <div className="tiny muted mt4">ауд. {h.dueRoom}</div>}
            {h.dueEstimated && <div className="tiny mt4" style={{ color: '#f59e0b' }}>РУЗ ещё не выложил эту неделю — срок посчитан по прошлым неделям</div>}
          </motion.div>
          {h.rule === 'pair' && (
            <div className="card tight list mb16" style={{ padding: 0, boxShadow: 'none' }}>
              <div className="list-row"><div className="grow small"><b>Следить за расписанием</b><div className="tiny muted">Пару перенесли — срок переедет за ней</div></div><Toggle on={h.follow} onChange={v => set({ follow: v })} /></div>
              <div className="list-row"><div className="grow small"><b className="row gap4"><Wifi size={13} /> Не считать дистант</b><div className="tiny muted">Срок встанет на ближайшую очную пару</div></div><Toggle on={h.skipRemote} onChange={v => set({ skipRemote: v })} /></div>
            </div>
          )}
          <Field label="Напоминания">
            <div className="card tight list" style={{ padding: 0, boxShadow: 'none' }}>
              {([['evening', `Накануне вечером (${HWPrefs.eveningHour()}:${String(HWPrefs.eveningMinute()).padStart(2, '0')})`], ['morning', `Утром в день сдачи (${HWPrefs.morningHour()}:${String(HWPrefs.morningMinute()).padStart(2, '0')})`], ['hourBefore', 'За час до сдачи']] as const).map(([k, t]) => (
                <div key={k} className="list-row" style={{ minHeight: 44 }}><Bell size={14} className="faint" /><div className="grow small">{t}</div><Toggle on={(h.reminders as any)[k]} onChange={v => set({ reminders: { ...h.reminders, [k]: v } })} /></div>
              ))}
              <div className="list-row" style={{ minHeight: 44 }}>
                <Bell size={14} className="faint" /><div className="grow small">Своё время</div>
                <input type="datetime-local" className="input" style={{ width: 210, height: 32 }} value={h.reminders.custom ? toLocalInput(h.reminders.custom) : ''} onChange={e => set({ reminders: { ...h.reminders, custom: e.target.value ? fromLocalInput(e.target.value) : null } })} />
              </div>
            </div>
          </Field>
          <div className="row" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--fill)', cursor: 'pointer' }} onClick={() => set({ important: !h.important })}>
            <Star size={16} fill={h.important ? '#f59e0b' : 'none'} color={h.important ? '#f59e0b' : 'currentColor'} />
            <div className="grow small bold">Важное</div>
            <Toggle on={h.important} onChange={v => set({ important: v })} />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
void homeworkStore
