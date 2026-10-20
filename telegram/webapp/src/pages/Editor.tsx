// Записать или изменить ДЗ: предмет из расписания группы, текст, фото доски, срок «к паре»
import { useEffect, useMemo, useState } from 'react'
import type { Me, Homework, DueOption, HomeworkInput } from '../../../shared/types'
import type { Nav } from '../App'
import { api, shrink, photoURL } from '../api'
import { haptic } from '../tg'
import { Section, Row, Icon, Blocks, MainButton, Spinner, Switch, kindColor, toast } from '../ui'
import { clean, dueHint } from '../../../shared/pretty'
import { endOfDay, ymd, hm, WEEKDAYS_SHORT, dayMon, pad } from '../../../shared/dates'

export type Preset = { subject?: string; anchor?: number; kind?: string; groups?: string[] }

type Due = { anchor: number; kind: string; options: DueOption[] }

export function Editor({ id, preset, me, nav, onSaved }: { id?: number; preset?: Preset; me: Me; nav: Nav; onSaved: () => void }) {
  const teacher = me.role === 'teacher'
  const [orig, setOrig] = useState<Homework | null>(null)
  const [loading, setLoading] = useState(!!id)
  const [subject, setSubject] = useState(preset?.subject ?? '')
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [important, setImportant] = useState(false)
  const [groupsText, setGroupsText] = useState((preset?.groups ?? []).join(', '))
  const [subjects, setSubjects] = useState<{ subject: string; kind: string; recent: boolean }[] | null>(null)
  const [due, setDue] = useState<Due | null>(null)
  const [choice, setChoice] = useState('')
  const [date, setDate] = useState(ymd(Date.now() + 86_400_000))
  const [time, setTime] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => groupsText.match(/\d{4,7}/g) ?? [], [groupsText])

  useEffect(() => {
    if (!id) return
    api.item(id).then(({ hw }) => {
      setOrig(hw); setSubject(hw.subject); setText(hw.text); setImportant(hw.important); setChoice('keep')
      if (teacher) setGroupsText(hw.groups.join(', '))
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }, [id, teacher])

  useEffect(() => { api.subjects(teacher ? groups : []).then(setSubjects).catch(() => setSubjects([])) }, [teacher, groups.join(',')])

  // варианты срока пересчитываем, когда выбран предмет
  useEffect(() => {
    if (!subject.trim()) { setDue(null); return }
    const t = setTimeout(() => {
      api.due(subject.trim(), groups, preset?.anchor, preset?.kind).then(d => {
        setDue(d)
        setChoice(c => (c === 'keep' || c === 'custom' || d.options.some(o => o.id === c) ? c : d.options[0]?.id ?? 'custom'))
      }).catch(() => setDue({ anchor: Date.now(), kind: '', options: [] }))
    }, typing ? 400 : 0)
    return () => clearTimeout(t)
  }, [subject, groups.join(','), preset?.anchor, preset?.kind])

  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  const picked = due?.options.find(o => o.id === choice)
  const customDue = (() => {
    if (!date) return null
    const [y, m, d] = date.split('-').map(Number)
    const t = new Date(y, m - 1, d)
    if (time) { const [hh, mm] = time.split(':').map(Number); t.setHours(hh, mm, 0, 0); return t.getTime() }
    return endOfDay(t.getTime())
  })()

  const save = async () => {
    if (busy) return
    if (!subject.trim()) { haptic.error(); return toast('Выбери предмет') }
    if (!text.trim() && !files.length && !orig?.photos.length) { haptic.error(); return toast('Напиши, что задали, или добавь фото') }
    if (teacher && !groups.length) { haptic.error(); return toast('Укажи группы') }
    let dueFields: Partial<HomeworkInput> = {}
    if (choice === 'custom') {
      if (!customDue) return toast('Выбери дату')
      dueFields = { due: customDue, rule: 'date', skip: 0, matchKind: '', dueKind: '', dueRoom: '', dueEstimated: false }
    } else if (picked) {
      dueFields = { due: picked.due, rule: picked.rule, skip: picked.skip, matchKind: picked.matchKind, dueKind: picked.kind, dueRoom: picked.room, dueEstimated: picked.estimated, anchor: due?.anchor }
    } else if (!orig) return toast('Выбери, когда сдавать')
    setBusy(true)
    try {
      let saved: Homework
      if (orig) saved = await api.update(orig.id, { subject: subject.trim(), text, important, ...dueFields })
      else saved = await api.create({ ...(dueFields as HomeworkInput), subject: subject.trim(), text, important, groups: teacher ? groups : undefined })
      for (const f of files) saved = await api.addPhoto(saved.id, await shrink(f))
      haptic.success()
      toast(orig ? 'Сохранено — у всех обновится' : teacher ? `Задано группам ${groups.join(', ')}` : 'Записал! Увидит вся группа')
      onSaved()
      nav.back()
    } catch (e) {
      haptic.error()
      toast((e as Error).message)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="page"><Spinner /></div>

  const pretty = text.trim() && clean(text) !== text.trim()
  const anchorNote = preset?.anchor ? `Задали на паре ${WEEKDAYS_SHORT[new Date(preset.anchor).getDay()]} ${dayMon(preset.anchor)}, ${hm(preset.anchor)}` : ''
  const who = teacher ? (groups.length ? `Увидят студенты групп ${groups.join(', ')}` : 'Выберите группы') : `Увидит вся группа ${me.group?.number ?? ''}`

  return (
    <div className="page">
      <div className="top"><div><div className="top-title">{orig ? 'Изменить ДЗ' : 'Новое ДЗ'}</div><div className="top-sub">{anchorNote || who}</div></div></div>

      {teacher && (
        <Section title="Группы" note={preset?.groups ? undefined : 'Номера через запятую. Или выберите пару во вкладке «Пары» — группы подставятся сами.'}>
          <input className="field" inputMode="numeric" placeholder="151621, 151622" value={groupsText} onChange={e => setGroupsText(e.target.value)} />
        </Section>
      )}

      <Section title="Предмет">
        <div style={{ padding: 12 }}>
          {subjects == null ? <Spinner /> : (
            <div className="chips">
              {subjects.slice(0, 14).map(s => (
                <button key={s.subject} className={`pick ${!typing && subject === s.subject ? 'on' : ''}`} style={{ ['--kind' as string]: kindColor(s.kind) }}
                  onClick={() => { haptic.select(); setTyping(false); setSubject(s.subject) }}>
                  <span className="dot" />{s.subject}{s.recent && ' · сейчас'}
                </button>
              ))}
              <button className={`pick ${typing ? 'on' : ''}`} onClick={() => { setTyping(true); if (subjects.some(s => s.subject === subject)) setSubject('') }}>✏️ Другой</button>
            </div>
          )}
          {(typing || (subjects && !subjects.length)) && (
            <input className="field" style={{ padding: '12px 2px 2px' }} autoFocus placeholder="Название предмета" value={subject} onChange={e => setSubject(e.target.value)} />
          )}
        </div>
      </Section>

      <Section title="Что задали" note={pretty ? undefined : 'Пиши как удобно — «стр 45 номер 5,6» оформится само.'}>
        <textarea className="field" placeholder={'Например:\n1) № 5, 6, стр. 45\n2) выучить § 3'} value={text} onChange={e => setText(e.target.value)} rows={5} />
      </Section>
      {pretty && <Section title="Будет выглядеть так"><Blocks text={text} /></Section>}

      <Section title="Фото доски">
        {(orig?.photos.length || files.length) ? (
          <div className="photos">
            {orig?.photos.map(p => <Existing key={p} id={p} />)}
            {previews.map((u, i) => (
              <div className="ph" key={u}><img src={u} alt="" /><button className="x" onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></div>
            ))}
          </div>
        ) : null}
        <label className="row link" style={{ cursor: 'pointer' }}>
          <Icon name="photo" />
          <div className="row-main"><div className="row-title">Добавить фото</div></div>
          <input type="file" accept="image/*" multiple hidden onChange={e => { const list = [...(e.target.files ?? [])]; setFiles([...files, ...list].slice(0, 10 - (orig?.photos.length ?? 0))); e.target.value = '' }} />
        </label>
      </Section>

      <Section title="Когда сдавать" note={due && !due.options.some(o => o.rule === 'pair') && subject ? 'Пар по этому предмету впереди в РУЗ нет — выбери дату.' : due?.options.some(o => o.rule === 'pair') ? 'Срок «к паре» сам переедет, если пару перенесут.' : undefined}>
        {!subject.trim() && <Row title="Сначала выбери предмет" />}
        {orig && <Option on={choice === 'keep'} title="Оставить как есть" sub={dueHint(orig.due, orig.dueKind, orig.dueRoom, orig.dueEstimated)} onClick={() => setChoice('keep')} />}
        {subject.trim() && !due && <Spinner />}
        {due?.options.map(o => <Option key={o.id} on={choice === o.id} title={o.label} sub={o.hint} onClick={() => { haptic.select(); setChoice(o.id) }} />)}
        {subject.trim() && <Option on={choice === 'custom'} title="Своя дата" sub={choice === 'custom' && customDue ? dueHint(customDue) : 'выбрать день и время'} onClick={() => { haptic.select(); setChoice('custom') }} />}
        {choice === 'custom' && (
          <div className="row" style={{ gap: 10 }}>
            <input type="date" className="field" style={{ padding: 8, background: 'var(--soft)', borderRadius: 10 }} value={date} min={ymd(Date.now())} onChange={e => setDate(e.target.value)} />
            <input type="time" className="field" style={{ padding: 8, background: 'var(--soft)', borderRadius: 10, maxWidth: 130 }} value={time} onChange={e => setTime(e.target.value)} placeholder={`${pad(23)}:59`} />
          </div>
        )}
      </Section>

      <Section>
        <Row title="❗️ Важное" sub="Контрольная, зачёт, сдача проекта" onClick={() => { haptic.select(); setImportant(!important) }} end={<Switch on={important} />} />
      </Section>

      <div style={{ height: 24 }} />
      <MainButton text={orig ? 'Сохранить' : teacher ? 'Задать ДЗ' : 'Записать ДЗ'} onClick={save} busy={busy} />
    </div>
  )
}

function Option({ on, title, sub, onClick }: { on: boolean; title: string; sub: string; onClick: () => void }) {
  return <Row icon={<span className={`radio ${on ? 'on' : ''}`} />} title={title} sub={sub} onClick={onClick} />
}

function Existing({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { photoURL(id).then(setUrl).catch(() => {}) }, [id])
  return <div className="ph">{url && <img src={url} alt="" />}</div>
}
