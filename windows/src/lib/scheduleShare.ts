// Расписание ребятам — как ДЗ: выбранный день или вся неделя красивой карточкой для чата группы (или текстом).
// Карточка в том же стиле, что у ДЗ и у iPhone: цветная шапка, белый лист с парами, подпись «Арктика».
import { type Slot, type ScheduleData, slotsOn, kindStyle, AddressFormat, groupParallel } from './schedule'
import { addDays, monday, startOfDay, isToday, isTomorrow, hm, dayMonth, fullDay, plural, WEEKDAYS } from './date'

export type ShareSpan = { kind: 'day' | 'week'; date: number }

/** Пара для карточки; параллельные (подгруппы) — одной строкой с несколькими аудиториями */
export type ShareRow = { slot: Slot; rooms: string[]; teachers: string[]; remote: boolean; note: string }
export type ShareDay = { date: number; rows: ShareRow[] }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const uniq = (a: string[]) => [...new Set(a.map(x => x.trim()).filter(Boolean))]

/** «Иванов Иван Иванович» → «Иванов И. И.»; уже сокращённое — как есть */
export function shortTeacher(raw: string): string {
  return (raw || '').split(',').map(p => {
    const w = p.trim().split(/\s+/)
    if (w.length !== 3 || w[1].length <= 2 || w[2].length <= 2) return p.trim()
    return `${w[0]} ${w[1][0]}. ${w[2][0]}.`
  }).filter(Boolean).join(', ')
}

function rowsOf(day: number, data: ScheduleData): ShareRow[] {
  const list = [...slotsOn(day, data)].sort((a, b) => a.start - b.start)
  return groupParallel(list).map(g => {
    const all = [g.slot, ...g.alts]
    return {
      slot: g.slot,
      rooms: uniq(all.map(s => s.room)),
      teachers: uniq(all.map(s => shortTeacher(s.teacher))),
      remote: all.every(s => s.remote),
      // у подгрупп примечания свои («Подгруппа 1») — одной строкой их не показываем
      note: g.alts.length ? '' : (g.slot.note || '').trim()
    }
  })
}

/** Дни для карточки. В неделе пн–пт всегда, суббота — только если в неё есть пары */
export function shareDays(span: ShareSpan, data: ScheduleData): ShareDay[] {
  if (span.kind === 'day') { const d = startOfDay(span.date); return [{ date: d, rows: rowsOf(d, data) }] }
  const m = monday(span.date)
  const out: ShareDay[] = []
  for (let i = 0; i < 6; i++) {
    const d = addDays(m, i)
    const rows = rowsOf(d, data)
    if (i === 5 && !rows.length) continue
    out.push({ date: d, rows })
  }
  return out
}

// ---------- подписи ----------

export function shareCaption(span: ShareSpan): string {
  if (span.kind === 'week') return 'ПАРЫ НА НЕДЕЛЮ'
  if (isToday(span.date)) return 'ПАРЫ НА СЕГОДНЯ'
  if (isTomorrow(span.date)) return 'ПАРЫ НА ЗАВТРА'
  return 'ПАРЫ НА ДЕНЬ'
}

/** «27 – 31 октября» или «27 октября – 1 ноября» */
export function rangeText(a: number, b: number): string {
  const da = new Date(a), db = new Date(b)
  if (da.getMonth() === db.getMonth()) return `${da.getDate()} – ${dayMonth(b)}`
  return `${dayMonth(a)} – ${dayMonth(b)}`
}

/** «Вторник, 28 октября» или «27 октября – 1 ноября» */
export function shareTitle(span: ShareSpan, days: ShareDay[]): string {
  if (span.kind === 'day') return cap(fullDay(span.date))
  if (!days.length) return 'Неделя'
  return rangeText(days[0].date, days[days.length - 1].date)
}

export const pairsText = (n: number) => `${n} ${plural(n, 'пара', 'пары', 'пар')}`

/** «4 пары · 8:20 – 16:05» или «18 пар · 5 учебных дней» */
export function shareSummary(span: ShareSpan, days: ShareDay[]): string {
  const all = days.flatMap(d => d.rows)
  if (!all.length) return 'Пар нет'
  if (span.kind === 'day') {
    const start = Math.min(...all.map(r => r.slot.start)), end = Math.max(...all.map(r => r.slot.end))
    return `${pairsText(all.length)} · ${hm(start)} – ${hm(end)}`
  }
  const busy = days.filter(d => d.rows.length).length
  return `${pairsText(all.length)} · ${busy} ${plural(busy, 'учебный день', 'учебных дня', 'учебных дней')}`
}

/** «ауд. 1405», «ауд. 1405, 1407», «спортзал» или «дистант» */
export function roomText(r: ShareRow): string {
  if (r.remote) return 'дистант'
  if (!r.rooms.length) return ''
  return /^\d/.test(r.rooms[0]) ? `ауд. ${r.rooms.join(', ')}` : r.rooms.join(', ')
}

/** Адрес корпуса — для тех, кто не помнит, где «НСД 17» */
export function addressText(r: ShareRow): string {
  if (r.remote) return ''
  const a = AddressFormat.full(r.slot.address)
  if (a && !AddressFormat.isRemote(r.slot.address)) return a
  return (r.slot.building || '').trim()
}

/** Окно между парами (обед после 3-й пары — 55 минут — окном не считаем) */
export function windowText(a: ShareRow, b: ShareRow): string | null {
  const min = Math.round((b.slot.start - a.slot.end) / 60_000)
  if (min <= 60) return null
  const h = Math.floor(min / 60), m = min % 60
  return 'Окно ' + (m ? `${h} ч ${m} мин` : `${h} ч`)
}

// ---------- текстом ----------

function line(r: ShareRow): string {
  const s = r.slot
  const place = [roomText(r), addressText(r)].filter(Boolean).join(', ')
  let out = `${hm(s.start)}–${hm(s.end)} ${s.subject} (${kindStyle(s.kind).label.toLowerCase()})`
  if (place) out += ` — ${place}`
  if (r.teachers.length) out += `, ${r.teachers.join(', ')}`
  return out
}

export function shareScheduleText(span: ShareSpan, data: ScheduleData, group = ''): string {
  const days = shareDays(span, data)
  const g = group ? ` · ${group}` : ''
  const out: string[] = []
  if (span.kind === 'day') {
    out.push(`📅 ${cap(fullDay(span.date))}${g}`)
    const rows = days[0]?.rows || []
    if (!rows.length) out.push('Пар нет 🎉')
    rows.forEach((r, i) => out.push(`${i + 1}. ${line(r)}`))
  } else {
    out.push(`📅 Пары на неделю: ${shareTitle(span, days)}${g}`)
    for (const d of days) {
      out.push('', `▫️ ${cap(fullDay(d.date))}`)
      if (!d.rows.length) out.push('пар нет')
      d.rows.forEach(r => out.push(line(r)))
    }
  }
  return out.join('\n')
}

// ---------- картинкой ----------

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w } else cur = t
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}

/** Не больше n строк: последняя — с многоточием */
function clamp(ctx: CanvasRenderingContext2D, lines: string[], n: number, maxW: number): string[] {
  if (lines.length <= n) return lines
  const keep = lines.slice(0, n)
  let last = keep[n - 1] + '…'
  while (ctx.measureText(last).width > maxW && last.length > 2) last = last.slice(0, -2) + '…'
  keep[n - 1] = last
  return keep
}

const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

type Icon = 'calendar' | 'clock' | 'pin' | 'person'

/** Маленькие значки рисуем сами, как SF Symbols на iPhone, — не зависят от шрифта с эмодзи */
function icon(ctx: CanvasRenderingContext2D, kind: Icon, x: number, y: number, s: number, color: string) {
  ctx.save()
  ctx.fillStyle = color; ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, s * 0.11); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const cx = x + s / 2
  ctx.beginPath()
  if (kind === 'calendar') {
    ctx.roundRect(x + s * 0.06, y + s * 0.16, s * 0.88, s * 0.78, s * 0.16); ctx.stroke()
    ctx.fillRect(x + s * 0.06, y + s * 0.16, s * 0.88, s * 0.24)
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.04); ctx.lineTo(x + s * 0.3, y + s * 0.22)
    ctx.moveTo(x + s * 0.7, y + s * 0.04); ctx.lineTo(x + s * 0.7, y + s * 0.22); ctx.stroke()
  } else if (kind === 'clock') {
    const cy = y + s / 2, r = s * 0.42
    ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.58); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.45, cy + r * 0.2); ctx.stroke()
  } else if (kind === 'pin') {
    const cy = y + s * 0.38, r = s * 0.32
    ctx.arc(cx, cy, r, Math.PI * 0.82, Math.PI * 0.18); ctx.lineTo(cx, y + s * 0.96); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.arc(cx, y + s * 0.3, s * 0.21, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(cx, y + s * 0.98, s * 0.38, s * 0.36, 0, Math.PI, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/** Карточка расписания: цветная шапка с датой, пары по порядку, подпись — как у ДЗ */
export function drawScheduleCard(span: ShareSpan, data: ScheduleData, group = ''): HTMLCanvasElement {
  const css = getComputedStyle(document.documentElement)
  const brand = css.getPropertyValue('--brand').trim() || '#2973fa'
  const brand2 = css.getPropertyValue('--brand2').trim() || brand
  const days = shareDays(span, data)
  const week = span.kind === 'week'
  const W = 760, PAD = 36, IN = 40
  const cw = W - PAD * 2
  const tw = cw - IN * 2
  const F = '"Segoe UI", sans-serif'
  const INK = '#1b1f2a', MUTED = '#7b8190', SOFT = '#9aa1ad', DETAIL = '#5d6370'

  const layout = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    // ----- шапка: что за расписание, группа, дата и итог -----
    let y = PAD + IN
    ctx.font = `800 50px ${F}`
    const title = wrap(ctx, shareTitle(span, days), tw)
    const headH = IN + 30 + 18 + title.length * 60 + 12 + 36 + IN - 10
    if (draw) {
      const g = ctx.createLinearGradient(PAD, PAD, PAD + cw, PAD + headH)
      g.addColorStop(0, brand2); g.addColorStop(1, brand)
      ctx.save()
      ctx.beginPath(); ctx.roundRect(PAD, PAD, cw, 99999, 52); ctx.clip()
      ctx.fillStyle = g; ctx.fillRect(PAD, PAD, cw, headH)
      ctx.restore()
      icon(ctx, 'calendar', PAD + IN, y + 1, 22, 'rgba(255,255,255,.88)')
      ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = `850 20px ${F}`
      ctx.fillText(shareCaption(span), PAD + IN + 32, y + 20)
      if (group) {
        const w = ctx.measureText(group).width + 28
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(PAD + cw - IN - w, y - 6, w, 36, 18); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.fillText(group, PAD + cw - IN - w + 14, y + 19)
      }
    }
    y += 30 + 18
    if (draw) { ctx.fillStyle = '#fff'; ctx.font = `800 50px ${F}`; title.forEach((l, i) => ctx.fillText(l, PAD + IN, y + 46 + i * 60)) }
    y += title.length * 60 + 12
    if (draw) {
      icon(ctx, 'clock', PAD + IN, y + 7, 26, 'rgba(255,255,255,.95)')
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.font = `600 26px ${F}`
      ctx.fillText(shareSummary(span, days), PAD + IN + 36, y + 28)
    }
    y = PAD + headH + (week ? 30 : 34)

    const x0 = PAD + (week ? 32 : 34)
    const inner = cw - (week ? 64 : 68)

    const rest = (text: string) => {
      if (draw) { ctx.font = `600 30px ${F}`; ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.fillText(text, W / 2, y + 44); ctx.textAlign = 'left' }
      y += 80
    }

    if (!week) {
      // ----- один день: подробно -----
      const rows = days[0]?.rows || []
      if (!rows.length) rest('Пар нет — отдыхаем')
      rows.forEach((r, i) => {
        if (i > 0) {
          const gap = windowText(rows[i - 1], r)
          if (gap) {
            if (draw) {
              ctx.font = `650 21px ${F}`
              const w = ctx.measureText(gap).width
              const cx = PAD + cw / 2
              const line = (inner - w) / 2 - 40
              ctx.fillStyle = '#e1e4ea'
              ctx.fillRect(x0 + 16, y + 20, line, 2)
              ctx.fillRect(cx + w / 2 + 24, y + 20, line, 2)
              ctx.fillStyle = SOFT; ctx.textAlign = 'center'; ctx.fillText(gap, cx, y + 28); ctx.textAlign = 'left'
            }
            y += 46
          }
        }
        const s = r.slot
        const st = kindStyle(s.kind)
        const timeW = 96, barX = x0 + 24 + timeW, tx = barX + 22
        const textW = x0 + inner - 24 - tx
        const ICON = 22, GAP = 30
        ctx.font = `750 31px ${F}`
        const subj = wrap(ctx, s.subject, textW)
        ctx.font = `500 23px ${F}`
        const addr = addressText(r)
        const addrLines = addr ? wrap(ctx, addr, textW - GAP) : []
        const teach = r.teachers.length ? wrap(ctx, r.teachers.join(', '), textW - GAP) : []
        const note = r.note
        ctx.font = `italic 500 22px ${F}`
        const noteLines = note && note.length <= 80 ? wrap(ctx, note, textW) : []
        const h = 22 + subj.length * 40 + 8 + 34 + (addrLines.length + teach.length) * 31 + (addrLines.length || teach.length ? 6 : 0) + noteLines.length * 30 + 22
        if (draw) {
          ctx.fillStyle = alpha(st.color, 0.08); ctx.beginPath(); ctx.roundRect(x0, y, inner, h, 30); ctx.fill()
          // время
          ctx.fillStyle = INK; ctx.font = `850 31px ${F}`; ctx.fillText(hm(s.start), x0 + 24, y + 22 + 30)
          ctx.fillStyle = MUTED; ctx.font = `600 23px ${F}`; ctx.fillText(hm(s.end), x0 + 24, y + 22 + 62)
          // полоска цвета типа пары
          ctx.fillStyle = st.color; ctx.beginPath(); ctx.roundRect(barX, y + 22, 7, h - 44, 4); ctx.fill()
          let yy = y + 22
          ctx.fillStyle = INK; ctx.font = `750 31px ${F}`
          subj.forEach((l, k) => ctx.fillText(l, tx, yy + 30 + k * 40))
          yy += subj.length * 40 + 8
          // плашка типа и аудитория
          ctx.font = `850 18px ${F}`
          const label = st.label.toUpperCase()
          const bw = ctx.measureText(label).width + 24
          ctx.fillStyle = alpha(st.color, 0.16); ctx.beginPath(); ctx.roundRect(tx, yy + 2, bw, 30, 15); ctx.fill()
          ctx.fillStyle = st.color; ctx.fillText(label, tx + 12, yy + 24)
          const room = roomText(r)
          if (room) { ctx.fillStyle = INK; ctx.font = `750 25px ${F}`; ctx.fillText(room, tx + bw + 12, yy + 26) }
          yy += 34 + (addrLines.length || teach.length ? 6 : 0)
          // адрес и преподаватель — со значками
          ctx.font = `500 23px ${F}`
          const detail = (kind: Icon, lines: string[]) => {
            if (!lines.length) return
            icon(ctx, kind, tx, yy + 8, ICON, SOFT)
            ctx.fillStyle = DETAIL; ctx.font = `500 23px ${F}`
            lines.forEach((l, k) => ctx.fillText(l, tx + GAP, yy + 26 + k * 31))
            yy += lines.length * 31
          }
          detail('pin', addrLines)
          detail('person', teach)
          ctx.fillStyle = MUTED; ctx.font = `italic 500 22px ${F}`
          noteLines.forEach((l, k) => ctx.fillText(l, tx, yy + 25 + k * 30))
        }
        y += h + 18
      })
    } else if (days.every(d => !d.rows.length)) {
      rest('На этой неделе пар нет')
    } else {
      // ----- неделя: компактно, по дням -----
      days.forEach((d, i) => {
        if (i > 0) { if (draw) { ctx.fillStyle = '#eceef2'; ctx.fillRect(x0, y + 4, inner, 2) } y += 22 }
        const today = isToday(d.date)
        if (draw) {
          ctx.font = `850 30px ${F}`; ctx.fillStyle = today ? brand : INK
          const name = cap(WEEKDAYS[new Date(d.date).getDay()])
          ctx.fillText(name, x0, y + 30)
          const nw = ctx.measureText(name).width
          ctx.font = `600 23px ${F}`; ctx.fillStyle = MUTED; ctx.fillText(dayMonth(d.date), x0 + nw + 12, y + 30)
          const cnt = d.rows.length ? pairsText(d.rows.length) : 'пар нет'
          ctx.font = `750 21px ${F}`; ctx.fillStyle = d.rows.length ? brand : SOFT
          ctx.textAlign = 'right'; ctx.fillText(cnt, x0 + inner, y + 30); ctx.textAlign = 'left'
        }
        y += 44
        for (const r of d.rows) {
          const s = r.slot
          const st = kindStyle(s.kind)
          const tx = x0 + 100
          const textW = x0 + inner - tx
          ctx.font = `650 27px ${F}`
          const subj = clamp(ctx, wrap(ctx, s.subject, textW), 2, textW)
          const h = subj.length * 34 + 32 + 12
          if (draw) {
            ctx.fillStyle = INK; ctx.font = `850 26px ${F}`; ctx.fillText(hm(s.start), x0, y + 28)
            ctx.fillStyle = st.color; ctx.beginPath(); ctx.roundRect(tx - 18, y + 4, 6, h - 16, 3); ctx.fill()
            ctx.fillStyle = INK; ctx.font = `650 27px ${F}`
            subj.forEach((l, k) => ctx.fillText(l, tx, y + 28 + k * 34))
            const my = y + subj.length * 34 + 24
            ctx.font = `750 21px ${F}`; ctx.fillStyle = st.color; ctx.fillText(st.label, tx, my)
            const room = roomText(r)
            if (room) { const lw = ctx.measureText(st.label).width; ctx.fillStyle = MUTED; ctx.fillText(' · ' + room, tx + lw, my) }
          }
          y += h
        }
      })
      y += 8
    }

    y += 6
    if (draw) { ctx.font = `650 20px ${F}`; ctx.fillStyle = SOFT; ctx.fillText('❄ Арктика', PAD + IN, y + 22) }
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
  // фон и белая карточка с тенью — как у ДЗ
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

/** Имя файла картинки: «Пары 28 октября.png», «Пары 27 – 31 октября.png» */
export function shareFileName(span: ShareSpan, data: ScheduleData): string {
  const t = span.kind === 'day' ? dayMonth(span.date) : shareTitle(span, shareDays(span, data))
  return `Пары ${t}.png`.replace(/[\\/:*?"<>|]/g, ' ')
}
