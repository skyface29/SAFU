// Профиль: имя, группа, роль
import { kv, usePref } from './kv'

export const profile = {
  first: () => kv.get('user.first', ''),
  last: () => kv.get('user.last', ''),
  middle: () => kv.get('user.middle', ''),
  name: () => kv.get('user.name', ''),
  group: () => kv.get('group', ''),
  /** 0 — студент, 1 — староста, 2 — зам, 3 — преподаватель */
  role: () => kv.get('user.role', 0),
  isTeacher: () => kv.get('user.kind', 'student') === 'teacher',
  isHead: () => [1, 2].includes(kv.get('user.role', 0)) || kv.get('user.kind', 'student') === 'teacher'
}

export function useProfile() {
  const [first] = usePref('user.first', '')
  const [last] = usePref('user.last', '')
  const [group] = usePref('group', '')
  const [role] = usePref('user.role', 0)
  const [kind] = usePref('user.kind', 'student')
  const [avatar] = usePref<string>('user.avatar', '')
  return { first, last, group, role, teacher: kind === 'teacher', head: role === 1 || role === 2 || kind === 'teacher', avatar, initials: ((first[0] || '') + (last[0] || '')).toUpperCase() || 'С' }
}

export const ROLE_TITLES = ['Студент', 'Староста', 'Зам. старосты', 'Преподаватель']
