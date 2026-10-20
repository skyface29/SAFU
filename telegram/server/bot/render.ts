// Тексты сообщений бота (HTML-разметка Telegram)
import type { HomeworkRow } from '../db'
import type { Store } from '../homework'
import { parsePhotos } from '../homework'
import { dueHint } from '../schedule'
import { plain, line } from '../../shared/pretty'
import { relDay, startOfDay, hm, isEndOfDay, plural, chip } from '../../shared/dates'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const LIMIT = 3800

export const dueLine = (h: HomeworkRow) => dueHint(h.due, h.due_kind, h.due_room, !!h.due_estimated)

/** Карточка одного ДЗ */
export function card(store: Store, h: HomeworkRow, opts: { title?: string; done?: boolean; group?: boolean } = {}): string {
  const out: string[] = []
  if (opts.title) out.push(opts.title)
  const head = `📚 <b>${esc(h.subject || 'ДЗ')}</b>${h.important ? ' ❗️' : ''}${opts.done ? ' ✅' : ''}`
  out.push(h.deleted ? `<s>${head}</s> — удалено` : head)
  const body = plain(h.text)
  if (body.length) out.push(...body.map(l => esc(l)))
  out.push(`📅 Сдать: <b>${esc(dueLine(h))}</b>`)
  if (h.shift_note) out.push(`⏰ ${esc(h.shift_note)}`)
  const photos = parsePhotos(h.photos).length
  if (photos) out.push(`📎 ${photos} ${plural(photos, 'фото', 'фото', 'фото')}`)
  const author = store.user(h.author_id)
  const who = [`✍️ ${esc(store.name(author))}`]
  if (h.author_teacher) who.push('👩‍🏫 от преподавателя')
  if (opts.group) {
    const n = store.ruz.group(h.group_id)?.number
    if (n) who.push(`гр. ${n}`)
  }
  out.push(who.join(' · '))
  return out.join('\n')
}

/** Список ДЗ по дням сдачи */
export function list(rows: HomeworkRow[], done: Set<number>, title: string, opts: { links?: boolean; empty?: string } = {}): string {
  const out = [title]
  if (!rows.length) {
    out.push('', opts.empty ?? 'Ничего не задано 🎉')
    return out.join('\n')
  }
  let day = -1
  let shown = 0
  for (const h of rows) {
    const d = startOfDay(h.due)
    const chunk: string[] = []
    if (d !== day) {
      day = d
      const rel = relDay(h.due)
      chunk.push('', `<b>${esc(rel[0].toUpperCase() + rel.slice(1))}</b>`)
    }
    const isDone = done.has(h.id)
    const time = isEndOfDay(h.due) ? '' : ` · ${hm(h.due)}`
    const subject = isDone ? `<s>${esc(h.subject)}</s>` : `<b>${esc(h.subject)}</b>`
    const kind = h.due_kind ? ` · ${esc(dueLine(h).split(' · ').slice(1).join(' · '))}` : ''
    chunk.push(`${isDone ? '✅' : h.important ? '❗️' : '▫️'} ${subject}${time}${kind}${h.author_teacher ? ' 👩‍🏫' : ''}`)
    const text = line(h.text)
    if (text) chunk.push(`    ${esc(text.length > 160 ? text.slice(0, 157) + '…' : text)}${opts.links ? `  /h${h.id}` : ''}`)
    else if (opts.links) chunk.push(`    /h${h.id}`)
    const piece = chunk.join('\n')
    if (out.join('\n').length + piece.length > LIMIT) {
      out.push('', `…и ещё ${rows.length - shown} — открой приложение`)
      break
    }
    out.push(piece)
    shown++
  }
  return out.join('\n')
}

/** Вечерняя сводка: что сдавать завтра */
export function evening(rows: HomeworkRow[], done: Set<number>, links = true): string {
  const left = rows.filter(h => !done.has(h.id))
  const title = `🌙 <b>На завтра</b> — ${left.length} ${plural(left.length, 'задание', 'задания', 'заданий')}`
  return list(rows, done, title, { links })
}

/** Подпись кнопки ДЗ в списке */
export function button(h: HomeworkRow, done: boolean): string {
  const t = `${done ? '✅' : '⬜'} ${h.subject}`
  const c = chip(h.due, done)
  const s = `${t} · ${c}`
  return s.length > 60 ? s.slice(0, 59) + '…' : s
}
