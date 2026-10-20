// Общие типы сервера и мини-приложения (ответы /api)

export type Role = 'student' | 'teacher'

export type GroupInfo = {
  id: string          // id группы в РУЗ (ruz.narfu.ru/?timetable&group=…)
  number: string      // «151621»
  title: string       // направление
  course: number | null
  institution: number
  school: string      // «ВШИТАС»
}

export type LecturerInfo = { id: string; name: string }

export type Settings = {
  notifyNew: boolean      // присылать новые ДЗ группы
  notifyEvening: boolean  // вечером — что сдавать завтра
  eveningHour: number     // 17…23
  notifyShift: boolean    // пару перенесли — срок сдвинулся
}

export type Me = {
  id: number
  name: string
  role: Role | null       // null — ещё не зарегистрирован
  verified: boolean       // преподаватель подтверждён
  group: GroupInfo | null
  lecturer: LecturerInfo | null
  moderator: boolean      // староста группы (может править чужие ДЗ)
  admin: boolean
  settings: Settings
  bot: string             // username бота — для ссылок «позвать ребят»
  members: number         // сколько человек группы уже в боте
}

export type Slot = {
  start: number
  end: number
  subject: string
  kind: string
  teacher: string
  room: string
  address: string
  note: string
  remote: boolean
  groups?: string[]       // у пар преподавателя — номера групп
  hw?: number             // сколько ДЗ сдавать к этой паре
}

export type DueRule = 'pair' | 'date'

export type DueOption = {
  id: string
  label: string           // «К следующей паре»
  hint: string            // «пт 24 окт, 10:10 · практика · ауд. 1405»
  due: number
  rule: DueRule
  skip: number
  matchKind: string
  kind: string
  room: string
  estimated: boolean      // пара ещё не в РУЗ — посчитана по ритму прошлых недель
}

export type Author = { id: number; name: string; teacher: boolean }

export type Homework = {
  id: number
  groupId: string
  groupNumber: string
  subject: string
  text: string
  due: number
  rule: DueRule
  dueKind: string
  dueRoom: string
  dueEstimated: boolean
  shiftNote: string
  important: boolean
  photos: string[]        // id фото для /api/photo/…
  author: Author
  editedBy: string        // кто правил последним (имя), если не автор
  created: number
  updated: number
  deleted: boolean
  done: boolean           // отмечено мной
  doneCount: number       // сколько из группы отметили
  memberCount: number
  canEdit: boolean
  batch: string           // ДЗ преподавателя на поток: общий id для всех групп
  groups: string[]        // номера всех групп этого ДЗ
}

export type HistoryItem = { at: number; who: string; action: string; text: string }

export type HomeworkInput = {
  subject: string
  text: string
  due: number
  rule: DueRule
  anchor?: number
  skip?: number
  matchKind?: string
  dueKind?: string
  dueRoom?: string
  dueEstimated?: boolean
  important?: boolean
  groups?: string[]       // преподаватель: номера групп (студент всегда пишет своей группе)
}
