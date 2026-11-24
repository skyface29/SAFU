/* =====================================================================
   Айсберг — отчёт проверки по СТО САФУ.
   Собирает .docx: готовность, ошибки и рекомендации с пунктами стандарта
   и подсказками «как исправить». Работает в браузере, никуда не отправляет.
   ===================================================================== */
(function (global) {
'use strict';

const FONT = 'Times New Roman';
const xe = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function run(text, o) {
  o = o || {};
  const sz = Math.round((o.size || 12) * 2);
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>${o.bold ? '<w:b/><w:bCs/>' : ''}${o.italic ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}
function p(inner, o) {
  o = o || {};
  return `<w:p><w:pPr><w:keepNext w:val="0"/><w:spacing w:before="${o.before || 0}" w:after="${o.after || 0}" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="${o.indent || 0}"/><w:jc w:val="${o.jc || 'left'}"/></w:pPr>${inner}</w:p>`;
}
const P = (text, o) => p(run(text, o), o);

function fmtDate() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

/** .docx с отчётом. ins — результат StoInspect.inspect, file — { name } (необязательно). */
function docx(ins, file) {
  const body = [];
  body.push(P('ОТЧЁТ ПРОВЕРКИ ОФОРМЛЕНИЯ', { size: 14, bold: true, jc: 'center', after: 60 }));
  body.push(P('по СТО САФУ 2026', { size: 12, jc: 'center', after: 120 }));
  body.push(P('Файл: ' + ((file && file.name) || 'работа.docx'), { size: 12, after: 40 }));
  body.push(P('Дата проверки: ' + fmtDate(), { size: 12, after: 40 }));
  const grade = ins.grade || (ins.ok ? 'Готово к сдаче' : 'Есть замечания');
  body.push(P('Готовность: ' + grade + ' — ' + (ins.score != null ? ins.score : 100) + '%', { size: 12, bold: true, after: 40 }));
  const errs = (ins.issues || []).length, warns = (ins.warnings || []).length;
  body.push(P('Ошибок: ' + errs + ' · рекомендаций: ' + warns + ' · проверено абзацев: ' + (ins.checked || 0), { size: 12, after: 160 }));

  const sec = (title) => body.push(P(title, { size: 12, bold: true, after: 60 }));
  const line = (x) => {
    const head = (x.clause ? 'п. ' + x.clause + ' — ' : '') + x.rule + (x.where ? ' — «' + x.where + '»' : '');
    body.push(P('• ' + head, { size: 12, after: 20, indent: 425 }));
    body.push(P('   у вас: ' + (x.found || '—') + ' · нужно: ' + (x.need || '—'), { size: 11, after: 20, indent: 425 }));
    if (x.hint) body.push(P('   как исправить: ' + x.hint, { size: 11, italic: true, after: 40, indent: 425 }));
  };
  if (errs) { sec('Ошибки оформления'); (ins.issues || []).forEach(line); }
  if (warns) { sec('Рекомендации'); (ins.warnings || []).forEach(line); }
  if (!errs && !warns) body.push(P('Замечаний нет: оформление соответствует СТО САФУ.', { size: 12, after: 60 }));
  body.push(P('Сформировано автоматически. Источник норм: СТО САФУ 2026.', { size: 10, italic: true, before: 160 }));

  return global.StoTools.docxFromBody(body.join(''));
}

global.StoReport = { docx };
})(typeof window !== 'undefined' ? window : globalThis);
