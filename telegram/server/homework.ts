// ДЗ группы: один записал — у всех появилось. Права, отметки «сделано», журнал правок, корзина.
import type { DB, HomeworkRow, UserRow } from './db'
import type { Ruz } from './ruz/client'
import type { Homework, HomeworkInput, HistoryItem, GroupInfo, Settings, Slot } from '../shared/types'
import { resolveDue, dueHint } from './schedule'
import { dayTime, DAY } from '../shared/dates'
import { randomUUID } from 'node:crypto'

export type TgUser = { id: number; first_name: string; last_name?: string; username?: string }

export const MAX_TEXT = 3000

export class Store {
  constructor(readonly db: DB, readonly ruz: Ruz, readonly admins: number[] = []) {}

  // ---------- люди ----------

  user(id: number): UserRow | undefined {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)
  }

  /** Запомнить человека из Telegram (имя могло поменяться) */
  touch(from: TgUser): UserRow {
    const now = Date.now()
    this.db.run(`INSERT INTO users(id, first_name, last_name, username, created, seen) VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
      username = excluded.username, seen = excluded.seen, blocked = 0`,
      from.id, from.first_name || '', from.last_name || '', from.username || '', now, now)
    return this.user(from.id)!
  }

  setStudent(userId: number, groupId: string) {
    this.db.run(`UPDATE users SET role = 'student', group_id = ?, lecturer_id = NULL, lecturer_name = '' WHERE id = ?`, groupId, userId)
  }

  setTeacher(userId: number, lecturerId: string, name: string) {
    const verified = this.isAdmin(userId) ? 1 : 0
    this.db.run(`UPDATE users SET role = 'teacher', lecturer_id = ?, lecturer_name = ?, group_id = NULL, verified = max(verified, ?) WHERE id = ?`,
      lecturerId, name, verified, userId)
  }

  verifyTeacher(userId: number, ok: boolean) {
    if (ok) this.db.run('UPDATE users SET verified = 1 WHERE id = ?', userId)
    else this.db.run(`UPDATE users SET verified = 0, role = NULL, lecturer_id = NULL, lecturer_name = '' WHERE id = ?`, userId)
  }

  settings(u: UserRow): Settings {
    return { notifyNew: !!u.notify_new, notifyEvening: !!u.notify_evening, eveningHour: u.evening_hour, notifyShift: !!u.notify_shift }
  }

  saveSettings(userId: number, s: Partial<Settings>) {
    const u = this.user(userId)
    if (!u) return
    const cur = this.settings(u)
    const n = { ...cur, ...s }
    const hour = Math.min(23, Math.max(15, Math.round(Number(n.eveningHour) || 20)))
    this.db.run('UPDATE users SET notify_new = ?, notify_evening = ?, notify_shift = ?, evening_hour = ? WHERE id = ?',
      n.notifyNew ? 1 : 0, n.notifyEvening ? 1 : 0, n.notifyShift ? 1 : 0, hour, userId)
  }

  markBlocked(userId: number) { this.db.run('UPDATE users SET blocked = 1 WHERE id = ?', userId) }

  members(groupId: string): UserRow[] {
    return this.db.all<UserRow>(`SELECT * FROM users WHERE group_id = ? AND role = 'student'`, groupId)
  }

  memberCount(groupId: string): number {
    return this.db.get<{ n: number }>(`SELECT count(*) AS n FROM users WHERE group_id = ? AND role = 'student'`, groupId)?.n ?? 0
  }

  isAdmin(userId: number) { return this.admins.includes(userId) }

  isModerator(userId: number, groupId: string | null): boolean {
    if (this.isAdmin(userId)) return true
    if (!groupId) return false
    return !!this.db.get('SELECT 1 FROM moderators WHERE group_id = ? AND user_id = ?', groupId, userId)
  }

  addModerator(groupId: string, userId: number, by: number | null) {
    this.db.run('INSERT OR IGNORE INTO moderators(group_id, user_id, added_by, at) VALUES(?, ?, ?, ?)', groupId, userId, by, Date.now())
  }

  removeModerator(groupId: string, userId: number) {
    this.db.run('DELETE FROM moderators WHERE group_id = ? AND user_id = ?', groupId, userId)
  }

  moderators(groupId: string): number[] {
    return this.db.all<{ user_id: number }>('SELECT user_id FROM moderators WHERE group_id = ?', groupId).map(r => r.user_id)
  }

  /** «Кирилл З.» у студентов, «Яковленкова А. О.» у преподавателей */
  name(u: UserRow | undefined): string {
    if (!u) return 'кто-то из группы'
    if (u.role === 'teacher' && u.lecturer_name) return shortName(u.lecturer_name)
    const last = u.last_name.trim()
    return [u.first_name.trim(), last ? last[0] + '.' : ''].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'без имени')
  }

  groupInfo(id: string | null): GroupInfo | null {
    if (!id) return null
    const g = this.ruz.group(id)
    if (!g) return null
    return { id: g.id, number: g.number, title: g.title, course: g.course, institution: g.institution, school: this.ruz.schoolName(g.institution) }
  }

  // ---------- ДЗ ----------

  hw(id: number): HomeworkRow | undefined {
    return this.db.get<HomeworkRow>('SELECT * FROM homework WHERE id = ?', id)
  }

  batchRows(row: HomeworkRow): HomeworkRow[] {
    if (!row.batch) return [row]
    return this.db.all<HomeworkRow>('SELECT * FROM homework WHERE batch = ? ORDER BY id', row.batch)
  }

  /** Актуальные: срок не раньше, чем полдня назад (вчерашние просроченные ещё видны) */
  upcoming(groupId: string, now = Date.now()): HomeworkRow[] {
    return this.db.all<HomeworkRow>('SELECT * FROM homework WHERE group_id = ? AND deleted = 0 AND due >= ? ORDER BY due, id', groupId, now - 12 * 3600_000)
  }

  /** Архив: всё, что уже сдали, — память группы за семестр */
  archive(groupId: string, limit = 100, now = Date.now()): HomeworkRow[] {
    return this.db.all<HomeworkRow>('SELECT * FROM homework WHERE group_id = ? AND deleted = 0 AND due < ? ORDER BY due DESC LIMIT ?', groupId, now - 12 * 3600_000, limit)
  }

  trash(groupId: string, limit = 50): HomeworkRow[] {
    return this.db.all<HomeworkRow>('SELECT * FROM homework WHERE group_id = ? AND deleted = 1 ORDER BY updated DESC LIMIT ?', groupId, limit)
  }

  dueBetween(groupId: string, from: number, to: number): HomeworkRow[] {
    return this.db.all<HomeworkRow>('SELECT * FROM homework WHERE group_id = ? AND deleted = 0 AND due >= ? AND due < ? ORDER BY due, id', groupId, from, to)
  }

  /** ДЗ, которые задал преподаватель (по одному на поток) */
  byAuthor(userId: number, limit = 100, now = Date.now()): HomeworkRow[] {
    return this.db.all<HomeworkRow>(`SELECT * FROM homework WHERE author_id = ? AND deleted = 0 AND due >= ?
      AND id IN (SELECT min(id) FROM homework WHERE author_id = ? GROUP BY CASE WHEN batch = '' THEN 'id' || id ELSE batch END)
      ORDER BY due LIMIT ?`, userId, now - 14 * DAY, userId, limit)
  }

  canEdit(u: UserRow, row: HomeworkRow): boolean {
    if (row.author_id === u.id || this.isAdmin(u.id)) return true
    // ДЗ преподавателя правит только он сам; ДЗ студентов — ещё и староста группы
    if (row.author_teacher) return false
    return this.isModerator(u.id, row.group_id)
  }

  canAdd(u: UserRow, groupId: string): boolean {
    if (u.role === 'student') return u.group_id === groupId
    if (u.role === 'teacher') return true
    return this.isAdmin(u.id)
  }

  create(author: UserRow, input: HomeworkInput, groupIds: string[]): HomeworkRow[] {
    const now = Date.now()
    const batch = groupIds.length > 1 ? randomUUID() : ''
    const text = input.text.trim().slice(0, MAX_TEXT)
    const subject = input.subject.trim().slice(0, 200)
    const ids = this.db.tx(() => groupIds.map(g => {
      const r = this.db.run(`INSERT INTO homework(group_id, subject, text, due, rule, anchor, skip, match_kind, due_kind, due_room, due_estimated,
        important, photos, author_id, author_teacher, batch, created, updated) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
        g, subject, text, input.due, input.rule, input.anchor ?? now, input.skip ?? 0, input.matchKind ?? '', input.dueKind ?? '',
        input.dueRoom ?? '', input.dueEstimated ? 1 : 0, input.important ? 1 : 0, author.id,
        author.role === 'teacher' && author.verified ? 1 : 0, batch, now, now)
      const id = Number(r.lastInsertRowid)
      this.db.run(`INSERT INTO history(hw_id, user_id, action, at) VALUES(?, ?, 'create', ?)`, id, author.id, now)
      return id
    }))
    return ids.map(id => this.hw(id)!)
  }

  /** Правка: для ДЗ на поток меняются копии всех групп */
  update(u: UserRow, id: number, patch: Partial<HomeworkInput>): HomeworkRow[] {
    const row = this.hw(id)
    if (!row) return []
    const now = Date.now()
    const rows = this.batchRows(row)
    this.db.tx(() => {
      for (const r of rows) {
        const n = {
          subject: patch.subject?.trim().slice(0, 200) || r.subject,
          text: patch.text !== undefined ? patch.text.trim().slice(0, MAX_TEXT) : r.text,
          due: patch.due ?? r.due,
          rule: patch.rule ?? r.rule,
          anchor: patch.anchor ?? r.anchor,
          skip: patch.skip ?? r.skip,
          matchKind: patch.matchKind ?? r.match_kind,
          dueKind: patch.dueKind ?? r.due_kind,
          dueRoom: patch.dueRoom ?? r.due_room,
          dueEstimated: patch.dueEstimated !== undefined ? (patch.dueEstimated ? 1 : 0) : r.due_estimated,
          important: patch.important !== undefined ? (patch.important ? 1 : 0) : r.important
        }
        this.db.run(`UPDATE homework SET subject = ?, text = ?, due = ?, rule = ?, anchor = ?, skip = ?, match_kind = ?, due_kind = ?,
          due_room = ?, due_estimated = ?, important = ?, shift_note = '', edited_by = ?, updated = ? WHERE id = ?`,
          n.subject, n.text, n.due, n.rule, n.anchor, n.skip, n.matchKind, n.dueKind, n.dueRoom, n.dueEstimated, n.important, u.id, now, r.id)
        this.db.run(`INSERT INTO history(hw_id, user_id, action, at, before) VALUES(?, ?, 'edit', ?, ?)`, r.id, u.id, now, snapshot(r))
      }
    })
    return rows.map(r => this.hw(r.id)!)
  }

  addPhotos(id: number, fileIds: string[]): HomeworkRow[] {
    const row = this.hw(id)
    if (!row) return []
    const rows = this.batchRows(row)
    for (const r of rows) {
      const list = [...parsePhotos(r.photos), ...fileIds].slice(0, 10)
      this.db.run('UPDATE homework SET photos = ?, updated = ? WHERE id = ?', JSON.stringify(list), Date.now(), r.id)
    }
    return rows.map(r => this.hw(r.id)!)
  }

  removePhoto(id: number, index: number): HomeworkRow[] {
    const row = this.hw(id)
    if (!row) return []
    const rows = this.batchRows(row)
    for (const r of rows) {
      const list = parsePhotos(r.photos).filter((_, i) => i !== index)
      this.db.run('UPDATE homework SET photos = ?, updated = ? WHERE id = ?', JSON.stringify(list), Date.now(), r.id)
    }
    return rows.map(r => this.hw(r.id)!)
  }

  setDeleted(u: UserRow, id: number, deleted: boolean): HomeworkRow[] {
    const row = this.hw(id)
    if (!row) return []
    const rows = this.batchRows(row)
    const now = Date.now()
    this.db.tx(() => {
      for (const r of rows) {
        this.db.run('UPDATE homework SET deleted = ?, edited_by = ?, updated = ? WHERE id = ?', deleted ? 1 : 0, u.id, now, r.id)
        this.db.run('INSERT INTO history(hw_id, user_id, action, at) VALUES(?, ?, ?, ?)', r.id, u.id, deleted ? 'delete' : 'restore', now)
      }
    })
    return rows.map(r => this.hw(r.id)!)
  }

  isDone(userId: number, hwId: number): boolean {
    return !!this.db.get('SELECT 1 FROM done WHERE user_id = ? AND hw_id = ?', userId, hwId)
  }

  setDone(userId: number, hwId: number, done: boolean) {
    if (done) this.db.run('INSERT OR IGNORE INTO done(user_id, hw_id, at) VALUES(?, ?, ?)', userId, hwId, Date.now())
    else this.db.run('DELETE FROM done WHERE user_id = ? AND hw_id = ?', userId, hwId)
  }

  toggleDone(userId: number, hwId: number): boolean {
    const now = !this.isDone(userId, hwId)
    this.setDone(userId, hwId, now)
    return now
  }

  doneSet(userId: number, ids: number[]): Set<number> {
    if (!ids.length) return new Set()
    const rows = this.db.all<{ hw_id: number }>(`SELECT hw_id FROM done WHERE user_id = ? AND hw_id IN (${ids.map(() => '?').join(',')})`, userId, ...ids)
    return new Set(rows.map(r => r.hw_id))
  }

  doneCount(hwId: number): number {
    return this.db.get<{ n: number }>('SELECT count(*) AS n FROM done WHERE hw_id = ?', hwId)?.n ?? 0
  }

  history(hwId: number): HistoryItem[] {
    const rows = this.db.all<{ user_id: number | null; action: string; at: number; before: string }>(
      'SELECT user_id, action, at, before FROM history WHERE hw_id = ? ORDER BY at DESC, id DESC LIMIT 30', hwId)
    const titles: Record<string, string> = { create: 'записал(а)', edit: 'изменил(а)', delete: 'удалил(а)', restore: 'вернул(а)', shift: 'срок сдвинулся' }
    return rows.map(r => {
      let text = ''
      if (r.before) { try { const b = JSON.parse(r.before); text = `было: ${b.text?.slice(0, 120) ?? ''} · ${dayTime(b.due)}` } catch { /* старая запись */ } }
      return { at: r.at, who: r.user_id ? this.name(this.user(r.user_id)) : 'РУЗ', action: titles[r.action] ?? r.action, text }
    })
  }

  dto(row: HomeworkRow, viewer: UserRow, done?: boolean): Homework {
    const author = this.user(row.author_id)
    const rows = row.batch ? this.batchRows(row) : [row]
    const groups = rows.map(r => this.ruz.group(r.group_id)?.number ?? r.group_id)
    const teacherView = viewer.role === 'teacher' && row.author_id === viewer.id
    const doneCount = teacherView ? rows.reduce((n, r) => n + this.doneCount(r.id), 0) : this.doneCount(row.id)
    const memberCount = teacherView ? rows.reduce((n, r) => n + this.memberCount(r.group_id), 0) : this.memberCount(row.group_id)
    return {
      id: row.id,
      groupId: row.group_id,
      groupNumber: this.ruz.group(row.group_id)?.number ?? '',
      subject: row.subject,
      text: row.text,
      due: row.due,
      rule: row.rule,
      dueKind: row.due_kind,
      dueRoom: row.due_room,
      dueEstimated: !!row.due_estimated,
      shiftNote: row.shift_note,
      important: !!row.important,
      photos: parsePhotos(row.photos).map((_, i) => `${row.id}-${i}`),
      author: { id: row.author_id, name: this.name(author), teacher: !!row.author_teacher },
      editedBy: row.edited_by && row.edited_by !== row.author_id ? this.name(this.user(row.edited_by)) : '',
      created: row.created,
      updated: row.updated,
      deleted: !!row.deleted,
      done: done ?? this.isDone(viewer.id, row.id),
      doneCount,
      memberCount,
      canEdit: this.canEdit(viewer, row),
      batch: row.batch,
      groups
    }
  }

  /** Расписание группы обновилось: сроки «к паре» едут вслед за парами. Возвращает сдвинутые ДЗ */
  reconcile(groupId: string, slots: Slot[], now = Date.now()): { row: HomeworkRow; before: number }[] {
    if (!slots.length) return []
    const moved: { row: HomeworkRow; before: number }[] = []
    for (const h of this.upcoming(groupId, now)) {
      if (h.rule !== 'pair' || h.due < now) continue
      const t = resolveDue(slots, h.subject, h.anchor, h.match_kind, h.skip, now)
      if (!t || t.start < now) continue
      const shifted = Math.abs(t.start - h.due) > 60_000
      if (!shifted && h.due_kind === t.kind && h.due_room === t.room && !!h.due_estimated === t.estimated) continue
      // сдвиг прогноза («по прошлым неделям») на реальную пару — не новость, а уточнение
      const note = shifted && !h.due_estimated ? `Пару перенесли: было ${dueHint(h.due)}` : h.shift_note
      this.db.run('UPDATE homework SET due = ?, due_kind = ?, due_room = ?, due_estimated = ?, shift_note = ?, updated = ? WHERE id = ?',
        t.start, t.kind, t.room, t.estimated ? 1 : 0, note, now, h.id)
      if (shifted) {
        this.db.run(`INSERT INTO history(hw_id, user_id, action, at, before) VALUES(?, NULL, 'shift', ?, ?)`, h.id, now, snapshot(h))
        if (!h.due_estimated) moved.push({ row: this.hw(h.id)!, before: h.due })
      }
    }
    return moved
  }

  /** Группы, где кто-то есть: им обновляем расписание в первую очередь */
  activeGroups(): string[] {
    return this.db.all<{ group_id: string }>(`SELECT DISTINCT group_id FROM users WHERE group_id IS NOT NULL AND role = 'student'
      UNION SELECT DISTINCT group_id FROM chats WHERE group_id IS NOT NULL AND active = 1`).map(r => r.group_id)
  }

  stats() {
    const n = (sql: string) => this.db.get<{ n: number }>(sql)?.n ?? 0
    return {
      users: n('SELECT count(*) AS n FROM users WHERE role IS NOT NULL'),
      teachers: n(`SELECT count(*) AS n FROM users WHERE role = 'teacher'`),
      groups: n(`SELECT count(DISTINCT group_id) AS n FROM users WHERE group_id IS NOT NULL`),
      chats: n('SELECT count(*) AS n FROM chats WHERE group_id IS NOT NULL AND active = 1'),
      homework: n('SELECT count(*) AS n FROM homework WHERE deleted = 0'),
      week: n(`SELECT count(*) AS n FROM homework WHERE created > ${Date.now() - 7 * DAY}`)
    }
  }
}

export const parsePhotos = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] } }

const snapshot = (r: HomeworkRow) => JSON.stringify({ subject: r.subject, text: r.text, due: r.due })

/** «Яковленкова Анна Олеговна» → «Яковленкова А. О.»; «Иванов И.И.» остаётся */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2 || /\./.test(full)) return full.trim()
  return [parts[0], ...parts.slice(1, 3).map(p => p[0] + '.')].join(' ')
}
