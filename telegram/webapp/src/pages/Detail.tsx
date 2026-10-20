// Задание целиком: пункты, фото доски, срок, кто записал, сколько сделали, журнал правок
import { useEffect, useState } from 'react'
import type { Me, Homework, HistoryItem } from '../../../shared/types'
import type { Nav } from '../App'
import { api, photoURL } from '../api'
import { haptic, confirm, openTelegram } from '../tg'
import { Section, Row, Icon, Blocks, MainButton, Spinner, Empty, kindColor, toast } from '../ui'
import { dueHint, kindStyle, plain } from '../../../shared/pretty'
import { relDay, hm, chip, isEndOfDay, dayMonth } from '../../../shared/dates'

const TO_KIND: Record<string, string> = { 'лекция': 'лекции', 'практика': 'практике', 'лаба': 'лабе', 'семинар': 'семинару' }

export function Detail({ id, me, nav, onChange }: { id: number; me: Me; nav: Nav; onChange: () => void }) {
  const [hw, setHw] = useState<Homework | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.item(id).then(r => { setHw(r.hw); setHistory(r.history) }).catch(e => setError(e.message))
  useEffect(() => { void load() }, [id])

  if (error) return <div className="page"><Empty emoji="🤷" title="Не нашёл задание" text={error} /></div>
  if (!hw) return <div className="page"><Spinner /></div>

  const student = me.role === 'student'
  const toggle = async () => {
    const done = !hw.done
    done ? haptic.success() : haptic.tap()
    setHw({ ...hw, done, doneCount: hw.doneCount + (done ? 1 : -1) })
    try { await api.done(hw.id, done); onChange() } catch (e) { toast((e as Error).message); void load() }
  }
  const remove = async () => {
    if (!(await confirm('Удалить задание у всей группы? Его можно будет вернуть.'))) return
    setBusy(true)
    try { const h = await api.remove(hw.id); setHw(h); haptic.success(); toast('Удалено — можно вернуть'); onChange() } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  const restore = async () => {
    try { const h = await api.restore(hw.id); setHw(h); haptic.success(); toast('Вернул'); onChange() } catch (e) { toast((e as Error).message) }
  }
  const share = () => {
    const text = [`📚 ${hw.subject}${hw.important ? ' ❗️' : ''}`, ...plain(hw.text), `📅 Сдать: ${dueHint(hw.due, hw.dueKind, hw.dueRoom, hw.dueEstimated)}`].join('\n')
    openTelegram(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${me.bot}?start=hw${hw.id}`)}&text=${encodeURIComponent(text)}`)
  }

  const k = kindStyle(hw.dueKind)
  const pct = hw.memberCount ? Math.round((hw.doneCount / hw.memberCount) * 100) : 0

  return (
    <div className="page" style={{ ['--kind' as string]: kindColor(hw.dueKind) }}>
      <div className="detail-head">
        {hw.dueKind && <div className="detail-kind">{k.emoji} к {TO_KIND[k.short] ?? 'паре'}{hw.dueRoom ? ` · ${hw.dueRoom === 'дистант' ? 'дистант' : `ауд. ${hw.dueRoom}`}` : ''}</div>}
        <div className="detail-subject">{hw.deleted ? <s>{hw.subject}</s> : hw.subject}{hw.important ? ' ❗️' : ''}</div>
        {hw.deleted && <div className="chip red" style={{ marginTop: 8 }}>Удалено</div>}
      </div>

      {hw.shiftNote && <div className="banner"><span className="em">⏰</span><div className="row-main"><div className="row-title">Срок сдвинулся</div><div className="row-sub">{hw.shiftNote}</div></div></div>}

      {(hw.text || hw.photos.length > 0) && (
        <Section>
          {hw.text && <Blocks text={hw.text} />}
          {hw.photos.length > 0 && <div className="photos">{hw.photos.map((p, i) => <Photo key={p} id={p} onOpen={setViewer} onRemove={hw.canEdit ? async () => { try { setHw(await api.removePhoto(hw.id, i)); onChange() } catch (e) { toast((e as Error).message) } } : undefined} />)}</div>}
        </Section>
      )}

      <Section>
        <Row icon={<Icon name="calendar" style={{ color: 'var(--accent)' }} />} title={`Сдать ${relDay(hw.due)}${isEndOfDay(hw.due) ? '' : `, ${hm(hw.due)}`}`}
          sub={[dayMonth(hw.due), dueHint(hw.due, hw.dueKind, hw.dueRoom, hw.dueEstimated).split(' · ').slice(1).join(' · '), hw.rule === 'pair' ? 'переедет, если пару перенесут' : ''].filter(Boolean).join(' · ')}
          end={hw.due < Date.now() && !hw.done ? <span className="chip red">{chip(hw.due, hw.done)}</span> : undefined} />
        <Row icon={<Icon name="user" style={{ color: 'var(--accent)' }} />} title={hw.author.teacher ? `${hw.author.name} · преподаватель` : hw.author.name}
          sub={`записал(а) ${relDay(hw.created)} в ${hm(hw.created)}${hw.editedBy ? ` · правил(а) ${hw.editedBy}` : ''}`} />
        {hw.groups.length > 1 && <Row icon={<Icon name="users" style={{ color: 'var(--accent)' }} />} title={`Группы: ${hw.groups.join(', ')}`} />}
        {hw.memberCount > 0 && (
          <div className="row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>✅ Сделали</span><span style={{ color: 'var(--hint)' }}>{hw.doneCount} из {hw.memberCount}</span></div>
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </Section>

      <Section>
        {hw.canEdit && !hw.deleted && <Row icon={<Icon name="edit" />} title="Изменить" onClick={() => nav.push({ name: 'edit', id: hw.id })} className="link" chevron />}
        {!hw.deleted && <Row icon={<Icon name="share" />} title="Отправить в чат" onClick={share} className="link" />}
        {hw.canEdit && !hw.deleted && <Row icon={<Icon name="trash" />} title="Удалить" onClick={remove} className="danger" end={busy ? '…' : undefined} />}
        {hw.canEdit && hw.deleted && <Row icon={<Icon name="restore" />} title="Вернуть задание" onClick={restore} className="link" />}
      </Section>

      {history.length > 0 && (
        <Section title={<button onClick={() => setShowHistory(!showHistory)} style={{ color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', font: 'inherit' }}>История {showHistory ? '▾' : '▸'}</button>}>
          {showHistory ? history.map((h, i) => (
            <Row key={i} title={`${h.who} ${h.action}`} sub={[`${relDay(h.at)}, ${hm(h.at)}`, h.text].filter(Boolean).join(' · ')} />
          )) : <Row title={`${history.length} ${history.length === 1 ? 'запись' : 'записей'} — кто и когда менял`} onClick={() => setShowHistory(true)} chevron />}
        </Section>
      )}

      {student && !hw.deleted && <MainButton text={hw.done ? '↩️ Снять отметку' : '✅ Сделано'} onClick={toggle} />}
      {viewer && <div className="viewer" onClick={() => setViewer(null)}><img src={viewer} alt="" /></div>}
    </div>
  )
}

function Photo({ id, onOpen, onRemove }: { id: string; onOpen: (url: string) => void; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { photoURL(id).then(setUrl).catch(() => setUrl(null)) }, [id])
  return (
    <div className="ph" onClick={() => url && onOpen(url)}>
      {url && <img src={url} alt="Фото к заданию" loading="lazy" />}
      {onRemove && <button className="x" onClick={e => { e.stopPropagation(); void confirm('Убрать это фото?').then(ok => ok && onRemove()) }}><Icon name="x" size={14} /></button>}
    </div>
  )
}
