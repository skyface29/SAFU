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
import { PageHeader, Empty } from '../ui/kit'

const Soon = (title: string) => () => <><PageHeader title={title} /><Empty emoji="🛠️" title="Скоро" /></>

export const PAGES: Partial<Record<PageId, React.ComponentType<any>>> = {
  home: Home,
  schedule: Schedule,
  homework: HomeworkPage,
  hwsettings: HomeworkSettings,
  tasks: Tasks,
  files: Files,
  subjects: Subjects,
  notes: Notes,
  tools: Soon('Инструменты'),
  profile: Soon('Профиль')
}
