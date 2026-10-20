// Демо-РУЗ: тот же HTML, что отдаёт ruz.narfu.ru, только выдуманный — чтобы запустить бота и мини-приложение
// без доступа к сайту вуза (DEMO=1) и в тестах. Разбирается настоящим парсером.
import type { Fetcher } from './client'
import { monday, addDays, pad } from '../../shared/dates'

const SCHOOLS: [number, string][] = [[3, 'Высшая школа информационных технологий и автоматизированных систем'], [15, 'Высшая инженерная школа']]
const GROUPS: [string, string, number, string, number][] = [
  ['101', '151621', 1, 'Информатика и вычислительная техника', 3],
  ['102', '151622', 1, 'Информатика и вычислительная техника', 3],
  ['201', '151512', 2, 'Программная инженерия', 3],
  ['301', '171101', 1, 'Строительство', 15]
]
const LECTURERS: Record<string, string> = {
  '555': 'Яковленкова Анна Олеговна', '556': 'Попов Сергей Викторович', '557': 'Белова Татьяна Михайловна',
  '558': 'Смирнов Пётр Петрович', '559': 'Смирнова Елена Викторовна'
}
const short = (full: string) => { const [s, n, p] = full.split(' '); return `${s} ${n[0]}.${p[0]}.` }

// [день недели 1…5, пара, вид, предмет, преподаватель, аудитория]
const WEEK: [number, number, string, string, string, string][] = [
  [1, 1, 'Лекции', 'Математический анализ', '555', 'ауд. 1405, А-НСД17'],
  [1, 2, 'Практические занятия', 'Математический анализ', '555', 'ауд. 1220, А-НСД17'],
  [2, 2, 'Лабораторные занятия', 'Программирование', '556', 'ауд. 2210, А-НСД17/2210'],
  [2, 3, 'Лекции', 'История России', '557', 'ауд. 508, АУК-10'],
  [3, 1, 'Практические занятия', 'Иностранный язык', '559', 'ауд. 312, АУК-10'],
  [3, 2, 'Лекции', 'Физика', '558', 'ауд. 1201, А-НСД17'],
  [4, 2, 'Практические занятия', 'Физика', '558', 'ауд. 1310, А-НСД17'],
  [4, 3, 'Практические занятия', 'История России', '557', 'ауд. 410, АУК-10'],
  [5, 1, 'Лекции', 'Программирование', '556', 'ауд. 1405, А-НСД17'],
  [5, 2, 'Практические занятия', 'Математический анализ', '555', 'ауд. 1220, А-НСД17'],
  [5, 3, 'Практические занятия', 'Физическая культура', '', 'ауд. спортзал, АУК-6']
]
const BELLS = ['08:20–09:55', '10:10–11:45', '12:00–13:35', '14:30–16:05']
const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница']

const dmy = (t: number) => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` }

function weekStart(url: string): number {
  const m = /date=(\d{2})\.(\d{2})\.(\d{4})/.exec(url)
  return m ? monday(new Date(+m[3], +m[2] - 1, +m[1]).getTime()) : monday(Date.now())
}

function page(mon: number, row: (w: typeof WEEK[number]) => string | null, link: string): string {
  let html = '<html><body><div class="list">'
  for (let d = 1; d <= 5; d++) {
    html += `<div class="dayofweek">${DAYS[d - 1]}, ${dmy(addDays(mon, d - 1))}</div>`
    for (const w of WEEK.filter(x => x[0] === d)) {
      const body = row(w)
      if (body) html += `<div class="timetable_sheet"><span class="num_para">${w[1]}</span><span class="time_para">${BELLS[w[1] - 1]}</span> ${body} <span>${w[5]}</span></div>`
    }
  }
  html += `</div><a href="${link}&date=${dmy(addDays(mon, 7))}">след. неделя</a>`
  for (const [id, name] of Object.entries(LECTURERS)) html += `<a href="?timetable&lecturer=${id}">${name}</a>`
  return html + '</body></html>'
}

export const demoFetcher: Fetcher = async (url) => {
  const u = url.replace('https://ruz.narfu.ru/', '')
  const g = /group=(\d+)/.exec(u)
  const l = /lecturer=(\d+)/.exec(u)
  const inst = /institution=(\d+)/.exec(u)
  if (u.includes('timetable') && g) {
    if (!GROUPS.some(x => x[0] === g[1])) return '<html>Расписание отсутствует</html>'
    return page(weekStart(u), w => `<span>${w[2]} ${w[3]}${w[4] ? ` ( ${short(LECTURERS[w[4]])})` : ''}</span>`, `?timetable&group=${g[1]}`)
  }
  if (u.includes('timetable') && l) {
    const id = l[1]
    return page(weekStart(u), w => (w[4] === id ? `<span>${w[2]} ${w[3]} Поток "151621, 151622"</span>` : null), `?timetable&lecturer=${id}`)
  }
  if (inst) {
    let html = '<html><body>'
    for (const c of [1, 2, 3]) {
      const list = GROUPS.filter(x => x[4] === +inst[1] && x[2] === c)
      if (!list.length) continue
      html += `<h3>${c} курс</h3>` + list.map(x => `<a href="?timetable&group=${x[0]}">${x[1]} ${x[3]}</a>`).join('')
    }
    return html + '</body></html>'
  }
  return '<html><body>' + SCHOOLS.map(([id, name]) => `<a href="?groups&institution=${id}">${name}</a>`).join('') + '</body></html>'
}
