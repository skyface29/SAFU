// Колледжи САФУ, у которых пар в РУЗе нет (страницы групп пустые):
//   • Колледж ВШРиМТ (1036)    — ttt.narfu.ru («Расписание СПО»), открывается с серверов GitHub
//   • ТК Императора Петра I (1001) — недельные PDF на narfu.ru/ltk/…
//   • ТК Северодвинска (23)    — PDF на семестр и PDF с заменами на narfu.ru/sf/stc/forstud/
// narfu.ru с зарубежных серверов не открывается, поэтому PDF заранее кладёт в папку --inbox загрузчик из России
// (ruz/colleges/fetcher). Каждый источник возвращает { groups: {номер: {title, course, insts}}, byGroup: {номер: [пары]}, report: [строки] }.
// Ошибка одного источника не мешает остальным и РУЗу.
import { collectTtt } from './ttt.mjs';
import { collectLtk } from './ltk.mjs';
import { collectSevTk } from './sevtk.mjs';

const SOURCES = [['ttt', collectTtt], ['ltk', collectLtk], ['sevtk', collectSevTk]];

export async function collectColleges(ctx) {
  const out = { groups: {}, byGroup: {}, report: [] };
  for (const [name, fn] of SOURCES) {
    try {
      const r = await fn(ctx);
      Object.assign(out.groups, r.groups);
      for (const [n, l] of Object.entries(r.byGroup)) (out.byGroup[n] ||= []).push(...l);
      out.report.push(`${name}: групп ${Object.keys(r.byGroup).filter(n => r.byGroup[n].length).length}, пар ${Object.values(r.byGroup).reduce((s, l) => s + l.length, 0)}${r.note ? ' — ' + r.note : ''}`);
    } catch (e) { out.report.push(`${name}: ошибка — ${e.message}`); }
  }
  return out;
}
