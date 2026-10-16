// ДЗ по нажатию: красиво оформленная карточка (как на iPhone) и «Отправить ребятам» — картинкой или текстом
import React from 'react'
import { Check, Pencil, Copy, Image as ImageIcon, Download, CalendarDays, Undo2, ListChecks, MessageSquareText, Paperclip, AlertTriangle } from 'lucide-react'
import { Sheet, toast, burst } from '../ui/kit'
import { homeworkStore, hw, hwKind, chip, urgency, type Homework } from '../lib/homework'
import { blocks, parts, clean, dueLine, shareText, type Block } from '../lib/hwpretty'
import { openHomeworkEditor, go } from '../lib/nav'
import { subjectColor } from '../ui/icons'
import { safu } from '../lib/bridge'
import { celebrations } from '../fx/Celebrations'

export function HomeworkView({ id, onClose }: { id: string | null; onClose: () => void }) {
  const list = homeworkStore.use()
  const h = id ? list.find(x => x.id === id) || null : null
  return (
    <Sheet open={!!h} onClose={onClose} size="wide"
      title={h ? <span className="row gap8"><span style={{ width: 10, height: 10, borderRadius: 5, background: subjectColor(h.subject) }} />{h.subject || 'Без предмета'}</span> : ''}
      headRight={h && <button className="btn sm" onClick={() => { onClose(); openHomeworkEditor({ id: h.id }) }}><Pencil size={14} /> Изменить</button>}
      footer={h && <Footer h={h} />}>
      {h && <Body h={h} />}
    </Sheet>
  )
}

function Body({ h }: { h: Homework }) {
  const k = hwKind(h.kind)
  const b = blocks(h.text)
  const note = h.note.trim()
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap-row gap6">
        <span className="badge" style={{ background: `${k.color}26`, color: k.color }}>{k.emoji} {k.title}</span>
        {h.important && <span className="badge" style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>Важно</span>}
        {h.done && <span className="badge" style={{ background: 'rgba(34,197,94,.15)', color: '#22c55e' }}>Сделано</span>}
      </div>

      <div className="card tight" style={{ padding: '14px 16px' }}>
        <div className="row">
          <span className="tiny muted row gap4"><CalendarDays size={13} /> Сдать</span>
          <span className="spacer" />
          <span className="small bold" style={{ color: urgency(h.due, h.done) }}>{h.dueEstimated ? '≈ ' : ''}{chip(h.due, h.done)}</span>
        </div>
        <div className="bold mt4" style={{ fontSize: '1.05rem' }}>{cap(dueLine(h))}</div>
        {h.dueEstimated && <div className="tiny muted mt4">Срок посчитан по прошлым неделям — РУЗ ещё не выложил расписание</div>}
        {h.shiftNote && <div className="row tiny mt8" style={{ color: '#f59e0b' }}><AlertTriangle size={12} /> {h.shiftNote}</div>}
        <button className="btn sm ghost mt8" style={{ color: 'var(--brand)', paddingLeft: 0 }} onClick={() => go('schedule', { day: h.due })}>Показать в расписании →</button>
      </div>

      {b.length > 0 && (
        <div className="card tight" style={{ padding: '14px 16px', userSelect: 'text' }}>
          <div className="tiny muted mb8">Задание</div>
          <div className="col" style={{ gap: 10 }}>{b.map(x => <BlockRow key={x.id} b={x} />)}</div>
        </div>
      )}

      {h.steps.length > 0 && (
        <div className="card tight" style={{ padding: '14px 16px' }}>
          <div className="row mb8"><span className="tiny muted row gap4"><ListChecks size={13} /> Шаги</span><span className="spacer" /><span className="tiny muted">{h.steps.filter(s => s.done).length} из {h.steps.length}</span></div>
          <div className="col gap6">
            {h.steps.map(s => (
              <div key={s.id} className="row clickable" style={{ gap: 10 }} onClick={() => hw.toggleStep(h.id, s.id)}>
                <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${s.done ? '#22c55e' : 'var(--text3)'}`, background: s.done ? '#22c55e' : 'none', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {s.done && <Check size={13} color="#fff" strokeWidth={3.5} />}
                </span>
                <span style={{ textDecoration: s.done ? 'line-through' : undefined, opacity: s.done ? 0.6 : 1 }}><Rich text={clean(s.text)} /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {note && (
        <div className="card tight" style={{ padding: '14px 16px' }}>
          <div className="tiny muted mb8 row gap4"><MessageSquareText size={13} /> Заметка</div>
          <div className="sub" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{note}</div>
        </div>
      )}
      {h.photos.length > 0 && <div className="tiny muted row gap4"><Paperclip size={12} /> {h.photos.length} фото — на iPhone</div>}
    </div>
  )
}

function BlockRow({ b }: { b: Block }) {
  if (!b.marker) return <div style={{ fontSize: '1.02rem', lineHeight: 1.45 }}><Rich text={b.text} /></div>
  return (
    <div className="row top" style={{ gap: 10, fontSize: '1.02rem', lineHeight: 1.45 }}>
      <span style={{ minWidth: 22, fontWeight: 850, color: 'var(--brand)' }}>{b.marker}</span>
      <span className="grow"><Rich text={b.text} /></span>
    </div>
  )
}

/** Номера заданий, страницы и параграфы — жирным в цвет темы */
function Rich({ text }: { text: string }) {
  return <>{parts(text).map((p, i) => p.ref ? <b key={i} style={{ color: 'var(--brand)' }}>{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>)}</>
}

function Footer({ h }: { h: Homework }) {
  const copyText = () => { safu.clipboard.write(shareText(h)); toast('Текст скопирован — вставь в чат группы') }
  const copyImage = async () => {
    const c = drawCard(h)
    c.toBlob(async b => {
      if (!b) return
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Картинка в буфере — вставь в чат (Ctrl+V)') }
      catch { toast('Не получилось скопировать — сохрани файлом', 'warn') }
    })
  }
  const saveImage = async () => {
    const url = drawCard(h).toDataURL('image/png')
    const name = `ДЗ ${(h.subject || 'задание').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40)}.png`
    if (await safu.dialog.save({ name, base64: url.split(',')[1], filters: [{ name: 'Картинка', extensions: ['png'] }] })) toast('Картинка сохранена')
  }
  return (
    <div className="row wrap-row" style={{ gap: 8, width: '100%' }}>
      <button className="btn" onClick={e => {
        if (!h.done) burst(e.clientX, e.clientY)
        const nowDone = hw.toggle(h.id)
        if (nowDone) celebrations.taskDone(h.subject, hw.active().length)
      }}>{h.done ? <><Undo2 size={15} /> Вернуть</> : <><Check size={15} /> Сделано</>}</button>
      <span className="spacer" />
      <button className="btn" onClick={copyText}><Copy size={15} /> Текстом</button>
      <button className="btn" onClick={saveImage} title="Сохранить картинку"><Download size={15} /></button>
      <button className="btn primary" onClick={copyImage}><ImageIcon size={15} /> Картинкой ребятам</button>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- картинка для чата группы ----------

type Tok = { text: string; ref: boolean }

/** Перенос по словам с сохранением выделенных кусков */
function wrapRich(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string, bold: string): Tok[][] {
  const words: Tok[] = []
  for (const p of parts(text)) for (const w of p.text.split(/(\s+)/)) if (w) words.push({ text: w, ref: p.ref })
  const lines: Tok[][] = [[]]
  let width = 0
  for (const w of words) {
    ctx.font = w.ref ? bold : font
    const ww = ctx.measureText(w.text).width
    if (width + ww > maxW && width > 0 && w.text.trim()) { lines.push([]); width = 0 }
    if (!lines[lines.length - 1].length && !w.text.trim()) continue
    lines[lines.length - 1].push(w)
    width += ww
  }
  return lines
}

function wrapPlain(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w } else cur = t
  }
  if (cur) out.push(cur)
  return out
}

/** Карточка ДЗ: цветная шапка с предметом и сроком, задание по пунктам, шаги, заметка, подпись */
export function drawCard(h: Homework): HTMLCanvasElement {
  const css = getComputedStyle(document.documentElement)
  const brand = css.getPropertyValue('--brand').trim() || '#2973fa'
  const color = subjectColor(h.subject)
  const W = 760, PAD = 36, IN = 40
  const cw = W - PAD * 2
  const tw = cw - IN * 2
  const F = '"Segoe UI", sans-serif'
  const font = `500 30px ${F}`, bold = `750 30px ${F}`
  const b = blocks(h.text)
  const note = h.note.trim()

  const layout = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    // шапка
    let y = PAD + IN
    ctx.font = `800 52px ${F}`
    const subj = wrapPlain(ctx, h.subject || 'Без предмета', tw)
    ctx.font = `600 26px ${F}`
    const due = wrapPlain(ctx, 'Сдать: ' + dueLine(h), tw - 40)
    const headH = IN + 30 + 18 + subj.length * 62 + 12 + due.length * 36 + IN - 10
    if (draw) {
      const g = ctx.createLinearGradient(PAD, PAD, PAD + cw, PAD + headH)
      g.addColorStop(0, color); g.addColorStop(1, brand)
      ctx.save()
      ctx.beginPath(); ctx.roundRect(PAD, PAD, cw, 99999, 52); ctx.clip()
      ctx.fillStyle = g; ctx.fillRect(PAD, PAD, cw, headH)
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = `850 20px ${F}`
      ctx.fillText('ДОМАШНЕЕ ЗАДАНИЕ', PAD + IN, y + 20)
      if (h.important) {
        const w = ctx.measureText('ВАЖНО').width + 28
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(PAD + cw - IN - w, y - 6, w, 36, 18); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.fillText('ВАЖНО', PAD + cw - IN - w + 14, y + 19)
      }
    }
    y += 30 + 18
    if (draw) { ctx.fillStyle = '#fff'; ctx.font = `800 52px ${F}`; subj.forEach((l, i) => ctx.fillText(l, PAD + IN, y + 48 + i * 62)) }
    y += subj.length * 62 + 12
    if (draw) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.font = `600 26px ${F}`; due.forEach((l, i) => ctx.fillText((i ? '' : '📅 ') + l, PAD + IN, y + 28 + i * 36)) }
    y = PAD + headH + IN

    // задание
    const markW = 44
    for (const bl of b) {
      const x = PAD + IN + (bl.marker ? markW : 0)
      const lines = wrapRich(ctx, bl.text, tw - (bl.marker ? markW : 0), font, bold)
      if (draw) {
        if (bl.marker) { ctx.font = `850 30px ${F}`; ctx.fillStyle = brand; ctx.fillText(bl.marker, PAD + IN, y + 32) }
        lines.forEach((ln, i) => {
          let xx = x
          for (const t of ln) { ctx.font = t.ref ? bold : font; ctx.fillStyle = t.ref ? brand : '#1b1f2a'; ctx.fillText(t.text, xx, y + 32 + i * 42); xx += ctx.measureText(t.text).width }
        })
      }
      y += lines.length * 42 + 14
    }
    // шаги
    if (h.steps.length) {
      if (b.length) { if (draw) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(PAD + IN, y, tw, 2) } y += 18 }
      for (const s of h.steps) {
        ctx.font = `500 28px ${F}`
        const lines = wrapPlain(ctx, clean(s.text), tw - 48)
        if (draw) {
          ctx.strokeStyle = s.done ? '#22c55e' : color; ctx.lineWidth = 3
          ctx.beginPath(); ctx.roundRect(PAD + IN, y + 8, 28, 28, 8)
          if (s.done) { ctx.fillStyle = '#22c55e'; ctx.fill() } else ctx.stroke()
          ctx.fillStyle = '#2a2f3a'; ctx.font = `500 28px ${F}`
          lines.forEach((l, i) => ctx.fillText(l, PAD + IN + 48, y + 32 + i * 38))
        }
        y += lines.length * 38 + 12
      }
    }
    if (note) {
      ctx.font = `italic 500 26px ${F}`
      const lines = wrapPlain(ctx, note, tw)
      if (draw) { ctx.fillStyle = '#6b7280'; lines.forEach((l, i) => ctx.fillText(l, PAD + IN, y + 30 + i * 36)) }
      y += lines.length * 36 + 14
    }
    if (!b.length && !h.steps.length && !note) {
      if (draw) { ctx.font = font; ctx.fillStyle = '#6b7280'; ctx.fillText('Без описания', PAD + IN, y + 32) }
      y += 46
    }
    if (h.photos.length) {
      if (draw) { ctx.font = `600 24px ${F}`; ctx.fillStyle = '#6b7280'; ctx.fillText(`📎 ${h.photos.length} фото — пришлю следом`, PAD + IN, y + 28) }
      y += 42
    }
    y += 10
    if (draw) { ctx.font = `650 20px ${F}`; ctx.fillStyle = '#9aa1ad'; ctx.fillText('❄ Арктика', PAD + IN, y + 22) }
    y += 22 + IN
    return y + PAD
  }

  const c = document.createElement('canvas')
  const probe = c.getContext('2d')!
  const H = Math.ceil(layout(probe, false))
  const S = 2
  c.width = W * S; c.height = H * S
  const ctx = c.getContext('2d')!
  ctx.scale(S, S)
  // фон и белая карточка с тенью
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#eef2f8'); bg.addColorStop(1, '#e6ecf6')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.14)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(PAD, PAD, cw, H - PAD * 2, 52); ctx.fill()
  ctx.restore()
  layout(ctx, true)
  return c
}
