// Все страницы приложения
import React from 'react'
import type { PageId } from '../lib/nav'
import Home from './Home'
import Schedule from './Schedule'
import HomeworkPage, { HomeworkSettings } from './Homework'
import Tasks from './Tasks'
import Files from './Files'
import Subjects from './Subjects'
import Notes from './Notes'
import Profile, { Appearance, Customize, AppSettings, Passwords, MailNotify, Backup, Developer, Legal } from './Profile'
import { Attendance, Broadcast, Polls } from './tools/Group'
import { Grades, Session } from './tools/Study'
import { Teachers, FreeRooms, CampusMap } from './tools/Places'
import { Focus, Report, Matrix, Stats } from './tools/Productivity'
import { Lectures } from './tools/Lectures'
import { BusPage, Wake, ShareImage, Boards, CelebrationSettings, Game, ToolsPage } from './tools/Misc'

export const PAGES: Partial<Record<PageId, React.ComponentType<any>>> = {
  home: Home, schedule: Schedule, homework: HomeworkPage, hwsettings: HomeworkSettings, tasks: Tasks, files: Files,
  subjects: Subjects, notes: Notes, profile: Profile, appearance: Appearance, customize: Customize, settings: AppSettings,
  passwords: Passwords, mailnotify: MailNotify, backup: Backup, developer: Developer, legal: Legal,
  attendance: Attendance, broadcast: Broadcast, polls: Polls, grades: Grades, session: Session, teachers: Teachers,
  rooms: FreeRooms, map: CampusMap, focus: Focus, report: Report, matrix: Matrix, stats: Stats, lectures: Lectures,
  bus: BusPage, wake: Wake, share: ShareImage, boards: Boards, celebrations: CelebrationSettings, game: Game, tools: ToolsPage
}
