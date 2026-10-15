// Инструменты (как Tool в Sources/Tools.swift)
import {
  UserCheck, Megaphone, BarChart3, Library, GraduationCap, Star, Image, PieChart, Users, Map, DoorOpen, ScanText,
  AlarmClock, Mic, Timer, FileText, Grid3x3, Bus, StickyNote, Gamepad2, PartyPopper
} from 'lucide-react'
import type { PageId } from '../../lib/nav'

export type ToolDef = { id: string; page: PageId; title: string; subtitle: string; Icon: any; color: string; headOnly?: boolean }

export const TOOLS: ToolDef[] = [
  { id: 'grades', page: 'grades', title: 'БРС', subtitle: 'Баллы и прогноз', Icon: Star, color: '#f59e0b' },
  { id: 'session', page: 'session', title: 'Сессия', subtitle: 'Билеты и отсчёт', Icon: GraduationCap, color: '#ef4444' },
  { id: 'subjects', page: 'subjects', title: 'Предметы', subtitle: 'Заметки и файлы', Icon: Library, color: '#3b82f6' },
  { id: 'teachers', page: 'teachers', title: 'Преподаватели', subtitle: 'Кто, где, когда', Icon: Users, color: '#8b5cf6' },
  { id: 'rooms', page: 'rooms', title: 'Свободные', subtitle: 'Пустые аудитории', Icon: DoorOpen, color: '#10b981' },
  { id: 'map', page: 'map', title: 'Карта корпусов', subtitle: 'Где твои пары', Icon: Map, color: '#06b6d4' },
  { id: 'bus', page: 'bus', title: 'Дорога', subtitle: 'Мой автобус', Icon: Bus, color: '#0ea5e9' },
  { id: 'notes', page: 'notes', title: 'Заметки', subtitle: 'Списки и мысли', Icon: StickyNote, color: '#eab308' },
  { id: 'boards', page: 'boards', title: 'Доски', subtitle: 'Фото по парам, поиск', Icon: ScanText, color: '#14b8a6' },
  { id: 'lectures', page: 'lectures', title: 'Лекции', subtitle: 'Запись и конспект', Icon: Mic, color: '#ec4899' },
  { id: 'focus', page: 'focus', title: 'Фокус', subtitle: 'Помодоро-таймер', Icon: Timer, color: '#f97316' },
  { id: 'report', page: 'report', title: 'Титульник', subtitle: 'По СТО САФУ, .docx', Icon: FileText, color: '#6366f1' },
  { id: 'matrix', page: 'matrix', title: 'Матрицы', subtitle: 'Калькулятор, Wolfram', Icon: Grid3x3, color: '#a855f7' },
  { id: 'share', page: 'share', title: 'Картинкой', subtitle: 'Пары в чат группы', Icon: Image, color: '#22c55e' },
  { id: 'stats', page: 'stats', title: 'Статистика', subtitle: 'Итоги семестра', Icon: PieChart, color: '#64748b' },
  { id: 'wake', page: 'wake', title: 'Подъём', subtitle: 'Будильник к паре', Icon: AlarmClock, color: '#f43f5e' },
  { id: 'attendance', page: 'attendance', title: 'Посещаемость', subtitle: 'Отметки группы', Icon: UserCheck, color: '#0d9488', headOnly: true },
  { id: 'broadcast', page: 'broadcast', title: 'Рассылка', subtitle: 'Сообщение группе', Icon: Megaphone, color: '#d946ef', headOnly: true },
  { id: 'polls', page: 'polls', title: 'Опросы', subtitle: 'Кто что ответил', Icon: BarChart3, color: '#2563eb', headOnly: true },
  { id: 'celebrations', page: 'celebrations', title: 'Праздники', subtitle: 'Салюты и поздравления', Icon: PartyPopper, color: '#fb7185' },
  { id: 'game', page: 'game', title: 'Автобус 150', subtitle: 'Игра на перемену', Icon: Gamepad2, color: '#84cc16' }
]
