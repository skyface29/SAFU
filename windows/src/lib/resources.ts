// Сайты университета: список, закрепления, недавние, последняя страница. Из Sources/Models.swift.
import { kv, createCollection, uid } from './kv'

export type Resource = { id: string; title: string; subtitle: string; url: string; icon: string; category: string; pinned: boolean }

const R = (title: string, subtitle: string, url: string, icon: string, category: string): Resource => ({ id: uid(), title, subtitle, url, icon, category, pinned: false })

export const defaultResources = (): Resource[] => [
  R('Sakai', 'Курсы и задания', 'https://sakai.narfu.ru', 'graduationcap.fill', 'Учёба'),
  R('РУЗ', 'Расписание', 'https://ruz.narfu.ru', 'clock.fill', 'Учёба'),
  R('Почта', 'Samoware', 'https://edu.narfu.ru', 'envelope.fill', 'Почта и документы'),
  R('Р7-Офис', 'Документы', 'https://office.edu.narfu.ru', 'doc.text.fill', 'Почта и документы'),
  R('САФУ', 'narfu.ru', 'https://narfu.ru', 'building.columns.fill', 'Университет'),
  R('Студенту', 'Справочник', 'https://narfu.ru/forstudent/', 'book.fill', 'Университет'),
  R('ВШИТАС', 'Высшая школа', 'https://narfu.ru/hsitas/', 'cpu', 'Университет'),
  R('Личный кабинет', 'Зачётная книжка', 'https://lk.narfu.ru', 'person.text.rectangle.fill', 'Университет'),
  R('Вход на сайт', 'narfu.ru', 'https://narfu.ru/user/authorization.php', 'person.crop.circle.fill', 'Университет')
]

export const teacherResources = (): Resource[] => [
  R('Антиплагиат.ВУЗ', 'Проверка ВКР и работ', 'https://narfu.antiplagiat.ru', 'checkmark.shield.fill', 'Преподавателю'),
  R('МООК САФУ', 'Онлайн-курсы Open edX', 'https://edx2.narfu.ru', 'play.rectangle.fill', 'Преподавателю'),
  R('Сотруднику', 'Сервисы и документы', 'https://narfu.ru/forstaff/', 'briefcase.fill', 'Преподавателю'),
  R('Инструкции ИТ', 'Учётные записи, почта, Sakai', 'https://narfu.ru/university/structure/upravleniya/it/manuals/', 'wrench.and.screwdriver.fill', 'Преподавателю'),
  R('Библиотека', 'Интеллектуальный центр', 'https://library.narfu.ru', 'books.vertical.fill', 'Преподавателю')
]

const initial = (() => {
  const saved = kv.get<Resource[] | null>('resources.v1', null)
  let list = saved && saved.length ? saved : defaultResources()
  list = list.filter(r => !r.url.includes('modeus'))
  if (!list.some(r => r.url.includes('lk.narfu.ru'))) list.push(R('Личный кабинет', 'Зачётная книжка', 'https://lk.narfu.ru', 'person.text.rectangle.fill', 'Университет'))
  kv.set('resources.v1', list)
  return list
})()
void initial

export const resourcesStore = createCollection<Resource[]>('resources.v1', defaultResources())
export const recentsStore = createCollection<string[]>('memory.recents', [])

export const resources = {
  categories(list = resourcesStore.get()) { return [...new Set(list.map(r => r.category))] },
  quick(): Resource[] {
    const list = resourcesStore.get()
    const chosen = kv.get('quick.ids', '').split(',').filter(Boolean)
    if (chosen.length) return chosen.map(id => list.find(r => r.id === id)).filter((r): r is Resource => !!r)
    return ['ruz.narfu', 'edu.narfu', 'sakai', 'office.edu'].map(k => list.find(r => r.url.includes(k))).filter((r): r is Resource => !!r)
  },
  recents(): Resource[] {
    const list = resourcesStore.get()
    return recentsStore.get().map(id => list.find(r => r.id === id)).filter((r): r is Resource => !!r)
  },
  markOpened(r: Resource) { recentsStore.set(ids => [r.id, ...ids.filter(i => i !== r.id)].slice(0, 8)) },
  lastURL(r: Resource): string | null { return kv.get<Record<string, string>>('memory.lastURLs', {})[r.id] || null },
  saveLastURL(url: string, r: Resource) {
    try {
      const home = new URL(r.url).host.toLowerCase(), host = new URL(url).host.toLowerCase()
      if (!(host === home || host.endsWith('.' + home) || home.endsWith('.' + host))) return
    } catch { return }
    const s = url.toLowerCase()
    const bad = ['login', 'logout', 'auth', 'adfs', 'saml', 'token', 'ticket', 'sso', 'signin', 'session', 'xlogin', 'relogin', 'error', 'redirect']
    if (bad.some(b => s.includes(b))) return
    kv.set('memory.lastURLs', { ...kv.get<Record<string, string>>('memory.lastURLs', {}), [r.id]: url })
  },
  clearLastURL(r: Resource) { const m = { ...kv.get<Record<string, string>>('memory.lastURLs', {}) }; delete m[r.id]; kv.set('memory.lastURLs', m) },
  clearMemory() { recentsStore.set([]); kv.set('memory.lastURLs', {}) },
  upsert(r: Resource) { resourcesStore.set(l => { const i = l.findIndex(x => x.id === r.id); if (i >= 0) { const c = [...l]; c[i] = r; return c } return [...l, r] }) },
  remove(id: string) { resourcesStore.set(l => l.filter(r => r.id !== id)); recentsStore.set(l => l.filter(i => i !== id)) },
  togglePin(id: string) { resourcesStore.set(l => l.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r)) },
  reset() { resourcesStore.set(defaultResources()); resources.clearMemory() },
  addTeacherSites() {
    const l = resourcesStore.get()
    const add = teacherResources().filter(t => !l.some(r => r.url === t.url))
    if (add.length) resourcesStore.set([...l, ...add])
  },
  isValid(r: { title: string; url: string }) {
    if (!r.title.trim()) return false
    try { const u = new URL(r.url); return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.host } catch { return false }
  },
  make: R
}
