/* =====================================================================
   Айсберг — инструменты СТО САФУ 2026:
   • титульный лист по формам приложения Б;
   • библиографические записи по образцам приложения М (ГОСТ Р 7.0.100);
   • сборка .docx с нуля (для отдельного титульника и списка).
   Без нейросетей и без сервера.
   ===================================================================== */
(function (global) {
'use strict';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FONT = 'Times New Roman';
const xe = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NB = ' ';

/* ----------------------------- титульный лист ----------------------------- */
const TITLE_TYPES = {
  referat: { name: 'Реферат', head: 'РЕФЕРАТ', mark: 'zachet' },
  esse: { name: 'Эссе', head: 'ЭССЕ', mark: 'zachet' },
  kontrol: { name: 'Контрольная работа', head: 'КОНТРОЛЬНАЯ РАБОТА', mark: 'zachet' },
  rgr: { name: 'Расчётно-графическая работа', head: 'РАСЧЕТНО-ГРАФИЧЕСКАЯ РАБОТА', mark: 'zachet' },
  kursovaya: { name: 'Курсовая работа', head: 'КУРСОВАЯ РАБОТА', mark: 'defense' },
  kproekt: { name: 'Курсовой проект', head: 'КУРСОВОЙ ПРОЕКТ', mark: 'defense' },
  praktika: { name: 'Отчёт о практике', head: 'ОТЧЕТ', sub: 'о прохождении практики', mark: 'report', practice: true }
};

function run(text, o) {
  o = o || {};
  const sz = Math.round((o.size || 14) * 2);
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>${o.bold ? '<w:b/><w:bCs/>' : ''}${o.italic ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${o.u ? '<w:u w:val="single"/>' : ''}</w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}
function para(runs, o) {
  o = o || {};
  const jc = o.jc || 'center';
  return `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${o.frameBottom ? '<w:framePr w:w="9638" w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="center" w:yAlign="bottom"/>' : ''}` +
    `<w:spacing w:before="${Math.round((o.before || 0) * 20)}" w:after="${Math.round((o.after || 0) * 20)}" w:line="${o.line || 240}" w:lineRule="auto"/>` +
    `<w:ind w:left="${o.left || 0}" w:firstLine="0" w:right="0"/><w:jc w:val="${jc}"/></w:pPr>${Array.isArray(runs) ? runs.join('') : runs}</w:p>`;
}
const P = (text, o) => para(run(text, o), o);
/** Строка с подчёркнутым значением и подписью мелким шрифтом под ней. */
function filled(value, caption, o) {
  o = o || {};
  const v = (value || '').trim();
  return para(run(v || '_'.repeat(o.blank || 40), { size: o.size || 14, u: !!v }), { after: 0, jc: o.jc || 'center', left: o.left }) +
    (caption ? para(run(caption, { size: 10 }), { after: o.after == null ? 6 : o.after, jc: o.jc || 'center', left: o.left }) : '');
}
/** Таблица без рамок: подпись руководителя и т. п. widths — в твипах. */
function grid(rows, widths, ind) {
  const tw = widths.reduce((a, b) => a + b, 0);
  const cell = (c, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${c.bottom ? '<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>' : ''}<w:vAlign w:val="bottom"/></w:tcPr>` +
    para(run(c.text || '', { size: c.size || 14 }), { jc: c.jc || 'left', after: 0 }) + '</w:tc>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/><w:jc w:val="left"/>${ind ? `<w:tblInd w:w="${ind}" w:type="dxa"/>` : ''}<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    rows.map(r => '<w:tr>' + r.map((c, k) => cell(c, widths[k])).join('') + '</w:tr>').join('') + '</w:tbl>';
}
const q = s => { s = (s || '').trim(); return s ? (/^[«"]/.test(s) ? s.replace(/^"|"$/g, m => m === '"' ? '' : m) : '«' + s + '»') : ''; };

/** Титульный лист СТО САФУ: XML абзацев и таблиц для вставки в <w:body>. */
function titleXml(d) {
  const t = TITLE_TYPES[d.type] || TITLE_TYPES.referat;
  const female = d.gender === 'f';
  const year = d.year || new Date().getFullYear();
  const L = 4536; // отступ блока «Выполнил…» ≈ 8 см — как в образцах
  const out = [];
  out.push(P('МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', { size: 12 }));
  out.push(P('федеральное государственное автономное образовательное учреждение', { size: 12 }));
  out.push(P('высшего образования', { size: 12 }));
  out.push(P('«Северный (Арктический) федеральный университет имени М.В.' + NB + 'Ломоносова»', { size: 14, bold: true, after: 12 }));
  out.push(filled(d.school, t.practice ? '(наименование высшей школы / филиала / института)' : '(наименование высшей школы / филиала / института / колледжа)', { blank: 60 }));
  out.push(para(run(t.head, { size: 16, bold: true }), { before: 60, after: t.sub ? 0 : 12 }));
  if (t.sub) out.push(P(t.sub, { size: 14, bold: true, after: 12 }));
  if (t.practice) {
    out.push(para([run('Вид практики: '), run(d.kind || '________________', { u: !!d.kind })], { jc: 'left' }));
    out.push(para([run('Тип практики: '), run(d.ptype || '________________', { u: !!d.ptype })], { jc: 'left' }));
    out.push(para([run('Место прохождения практики (база практики): '), run(d.place || '________________________', { u: !!d.place })], { jc: 'left' }));
    out.push(para([run('Срок прохождения: с ' + (d.from || '«___» __________ 20___ г.') + ' по ' + (d.to || '«___» __________ 20___ г.'))], { jc: 'left', after: 24 }));
  } else {
    out.push(para([run('По дисциплине '), run(q(d.discipline) || '_______________________________', { u: !d.discipline })], { after: 6 }));
    out.push(para([run('На тему '), run(q(d.topic) || '_______________________________', { bold: !!d.topic, u: !d.topic })], { after: 36, line: 276 }));
  }
  out.push(para(run(female ? 'Выполнила обучающаяся:' : 'Выполнил обучающийся:'), { jc: 'left', left: L }));
  out.push(filled(d.student, '(Ф.И.О.)', { jc: 'left', left: L, blank: 30 }));
  out.push(para(run('Направление подготовки / специальность:'), { jc: 'left', left: L }));
  out.push(filled(d.direction, '(код и наименование)', { jc: 'left', left: L, blank: 30 }));
  out.push(para(run('Курс: ' + (d.course || '____')), { jc: 'left', left: L }));
  out.push(para(run('Группа: ' + (d.group || '________')), { jc: 'left', left: L, after: 6 }));
  out.push(para(run(t.practice ? 'Руководитель практики от университета:' : 'Руководитель:'), { jc: 'left', left: L }));
  out.push(filled(d.teacher, '(Ф.И.О. руководителя, должность / уч. степень / звание)', { jc: 'left', left: L, blank: 30, after: 18 }));
  const markLabel = t.mark === 'zachet' ? 'Отметка о зачете' : t.mark === 'report' ? 'Признать, что отчет выполнен и защищен с отметкой' : 'Признать, что работа выполнена и защищена с отметкой';
  out.push(para(run(markLabel), { jc: 'left', left: L, after: 0 }));
  out.push(grid([[{ text: '', bottom: true }, { text: '' }, { text: '', bottom: true }], [{ text: '(отметка прописью)', size: 10, jc: 'center' }, { text: '' }, { text: '(дата)', size: 10, jc: 'center' }]], [2700, 300, 1900], L));
  out.push(para(run('Руководитель'), { jc: 'left', left: L, before: 6, after: 0 }));
  out.push(grid([[{ text: '', bottom: true }, { text: '' }, { text: shortName(d.teacher), bottom: true, jc: 'center' }], [{ text: '(подпись руководителя)', size: 10, jc: 'center' }, { text: '' }, { text: '(инициалы, фамилия)', size: 10, jc: 'center' }]], [2300, 300, 2300], L));
  out.push(para(run('Архангельск ' + year), { frameBottom: true }));
  // пустой крошечный абзац: на нём заканчивается раздел титульного листа, рамка с городом остаётся на титуле
  out.push(para(run('', { size: 1 }), { jc: 'left' }));
  return out.join('');
}
/** «Иванов Иван Иванович, доцент» → «И. И. Иванов». */
function shortName(s) {
  s = (s || '').split(',')[0].trim();
  const a = parseAuthor(s);
  return a ? a.inits + NB + a.fam : '';
}

/* ------------------------- библиографические записи ------------------------- */
/** «Иванов Иван Иванович», «Иванов И. И.», «Иванов И.И.», «И. И. Иванов» → {fam, inits}. */
function parseAuthor(s) {
  s = (s || '').replace(/\s+/g, ' ').replace(/,/g, ' ').trim();
  if (!s) return null;
  let m = /^((?:[A-ZА-ЯЁ]\.\s?){1,3})\s*([A-ZА-ЯЁ][\p{L}'-]+)$/u.exec(s);
  if (m) return { fam: m[2], inits: inits(m[1]) };
  m = /^([A-ZА-ЯЁ][\p{L}'-]+)\s+((?:[A-ZА-ЯЁ]\.\s?){1,3})$/u.exec(s);
  if (m) return { fam: m[1], inits: inits(m[2]) };
  const parts = s.split(' ');
  if (parts.length >= 2) return { fam: parts[0], inits: parts.slice(1, 3).map(p => p[0].toUpperCase() + '.').join(NB) };
  return { fam: s, inits: '' };
}
const inits = s => (s.match(/[A-ZА-ЯЁ]\./g) || []).join(NB);
const isLatin = s => /[A-Za-z]/.test(s) && !/[А-Яа-яЁё]/.test(s);
const authorsOf = s => (s || '').split(/;|\n/).map(parseAuthor).filter(Boolean);
const head = a => a.fam + ', ' + a.inits;
const resp = a => (a.inits ? a.inits + NB : '') + a.fam;
function dot(s) { s = (s || '').trim(); return !s ? '' : /[.!?…]$/.test(s) ? s : s + '.'; }
function today() { const d = new Date(); return [d.getDate(), d.getMonth() + 1].map(x => String(x).padStart(2, '0')).join('.') + '.' + d.getFullYear(); }
function urlTail(d, lat) {
  if (!d.url) return '';
  return ' – URL: ' + d.url.trim() + ' (' + (lat ? 'Accessed: ' : 'дата обращения: ') + (d.accessed || today()) + ').';
}
/** Заголовок и сведения об ответственности по правилу 1–3 / 4+ авторов (п. 4.13.6.1). */
function authorsPart(list, title, lat) {
  const etal = lat ? ' [et al.]' : ' [и' + NB + 'др.]';
  if (!list.length) return { lead: '', title, slash: '' };
  if (list.length <= 3) return { lead: head(list[0]) + ' ', title, slash: ' / ' + list.map(resp).join(', ') };
  return { lead: '', title, slash: ' / ' + list.slice(0, 3).map(resp).join(', ') + etal };
}
const BIB_TYPES = {
  book: { name: 'Книга, учебник, монография', fields: ['authors', 'title', 'subtitle', 'edition', 'city', 'publisher', 'year', 'pages', 'url'] },
  article: { name: 'Статья из журнала', fields: ['authors', 'title', 'journal', 'year', 'volume', 'issue', 'pagesRange', 'doi', 'url'] },
  chapter: { name: 'Статья из сборника', fields: ['authors', 'title', 'collection', 'collectionSub', 'city', 'publisher', 'year', 'pagesRange', 'url'] },
  web: { name: 'Сайт, интернет-статья', fields: ['authors', 'title', 'site', 'url', 'accessed'] },
  law: { name: 'Закон, кодекс', fields: ['lawTitle', 'lawKind', 'lawNumber', 'lawDate', 'source', 'url', 'accessed'] },
  gost: { name: 'ГОСТ, стандарт', fields: ['gostNumber', 'title', 'introduced', 'city', 'publisher', 'year', 'pages', 'url'] }
};
function bibEntry(type, d) {
  d = Object.assign({}, d);
  for (const k of Object.keys(d)) if (typeof d[k] === 'string') d[k] = d[k].trim();
  const list = authorsOf(d.authors);
  const lat = isLatin((d.title || '') + (d.authors || ''));
  const pg = lat ? 'p.' : 'с.', P_ = lat ? 'P.' : 'С.';
  const A = authorsPart(list, d.title || '', lat);
  const tail = urlTail(d, lat);
  const sub = d.subtitle ? ': ' + d.subtitle.replace(/^:\s*/, '') : '';
  switch (type) {
    case 'book': {
      let s = A.lead + A.title + sub + A.slash + '.';
      if (d.edition) s += ' – ' + dot(d.edition);
      s += ' – ' + [d.city || (lat ? '' : 'Москва'), d.publisher].filter(Boolean).join(': ') + (d.year ? ', ' + d.year : '') + '.';
      if (d.pages) s += ' – ' + d.pages + NB + pg;
      return s + tail;
    }
    case 'article': {
      let s = A.lead + A.title + A.slash;
      if (d.doi) s += '. – DOI ' + d.doi.replace(/^https?:\/\/doi\.org\//, '');
      s += ' // ' + (d.journal || '') + '. – ' + (d.year || '') + '.';
      const vi = [d.volume ? (lat ? 'Vol. ' : 'Т.' + NB) + d.volume : '', d.issue ? '№' + NB + d.issue : ''].filter(Boolean).join(', ');
      if (vi) s += ' – ' + vi + '.';
      if (d.pagesRange) s += ' – ' + P_ + NB + d.pagesRange.replace(/\s*[-—]\s*/, '–') + '.';
      return s + tail;
    }
    case 'chapter': {
      let s = A.lead + A.title + A.slash + ' // ' + (d.collection || '') + (d.collectionSub ? ': ' + d.collectionSub : '') + '.';
      s += ' – ' + [d.city, d.publisher].filter(Boolean).join(': ') + (d.year ? ', ' + d.year : '') + '.';
      if (d.pagesRange) s += ' – ' + P_ + NB + d.pagesRange.replace(/\s*[-—]\s*/, '–') + '.';
      return s + tail;
    }
    case 'web': {
      const site = d.site ? ' // ' + d.site + (/\[/.test(d.site) ? '' : ': [сайт]') : '';
      let s = A.lead + (d.title || '') + (list.length && list.length <= 3 ? '' : A.slash) + site + '.';
      return s + (tail || ' – URL: (дата обращения: ' + today() + ').');
    }
    case 'law': {
      const kind = d.lawKind || 'Федер. закон';
      let s = 'Российская Федерация. Законы. ' + (d.lawTitle || '') + ': ' + kind + (d.lawNumber ? ' №' + NB + d.lawNumber.replace(/^№\s*/, '') : '') + (d.lawDate ? ' от ' + d.lawDate : '');
      s += d.source ? ' // ' + d.source + (/\[/.test(d.source) ? '' : ': [нормативно-правовая база данных]') + '.' : '.';
      return s + tail;
    }
    case 'gost': {
      let s = (/^гост/i.test(d.gostNumber || '') ? d.gostNumber : 'ГОСТ ' + (d.gostNumber || '')) + '. ' + dot(d.title);
      if (d.introduced) s += ' – Введ. ' + d.introduced + '.';
      if (d.publisher || d.city) s += ' – ' + [d.city || 'Москва', d.publisher].filter(Boolean).join(': ') + (d.year ? ', ' + d.year : '') + '.';
      if (d.pages) s += ' – ' + d.pages + NB + 'с.';
      return s + tail;
    }
  }
  return '';
}
/** Алфавитный порядок, иностранные источники в конце (п. 4.13.4.1). */
function sortBib(entries) {
  const key = s => s.replace(/^[«"“]/, '').toLowerCase();
  return entries.slice().sort((a, b) => (isLatin(a.slice(0, 20)) - isLatin(b.slice(0, 20))) || key(a).localeCompare(key(b), 'ru'));
}

/* ------------------------------ .docx с нуля ------------------------------ */
async function docxFromBody(bodyXml) {
  const enc = new TextEncoder();
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
    'word/settings.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W}"><w:defaultTabStop w:val="709"/><w:autoHyphenation w:val="true"/><w:compat/></w:settings>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1417" w:header="709" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
  };
  return global.Formatter.zipFiles(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })));
}
/** Список источников как .docx по п. 4.13.6.15: 1,5 интервала, по ширине, «1 …» с абзацного отступа. */
function bibDocx(entries) {
  const head = `<w:p><w:pPr><w:spacing w:before="0" w:after="240" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>${run('Список использованных источников', { bold: true })}</w:p>`;
  const items = entries.map((e, i) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr>${run((i + 1) + ' ' + e)}</w:p>`).join('');
  return docxFromBody(head + items);
}

global.StoTools = { TITLE_TYPES, titleXml, BIB_TYPES, bibEntry, sortBib, parseAuthor, docxFromBody, bibDocx, today };
})(typeof window !== 'undefined' ? window : globalThis);
