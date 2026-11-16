// Сборка тестовых .docx без Word и без зависимостей: абзацы описываются массивом, архив собирает сам Айсберг (Formatter.zipFiles).
// Работает и в Node (require), и в браузере (fixtures.js подключается в страницу тестом).
(function (global) {
'use strict';
const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Абзац: строка или { t, b — полужирный, jc, style, br: [строки через разрыв], words — по прогону на слово, page — разрыв страницы перед } */
function p(x) {
  if (x === 'TABLE') return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>' +
    ['Наименование|Регулятор', 'ГОСТ Р 34.10-2012|Росстандарт'].map(r => '<w:tr>' + r.split('|').map(c => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${xe(c)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl>';
  const o = typeof x === 'string' ? { t: x } : x;
  const rPr = o.b ? '<w:rPr><w:b/></w:rPr>' : '';
  const run = t => `<w:r>${rPr}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  let runs;
  if (o.br) runs = o.br.map((t, i) => (i ? `<w:r>${rPr}<w:br/></w:r>` : '') + run(t)).join('');
  else if (o.words) runs = o.t.split(/(?<= )/).map(run).join('');
  else runs = run(o.t || '');
  const pPr = (o.style ? `<w:pStyle w:val="${o.style}"/>` : '') + (o.page ? '<w:pageBreakBefore/>' : '') + (o.jc ? `<w:jc w:val="${o.jc}"/>` : '');
  return `<w:p>${pPr ? '<w:pPr>' + pPr + '</w:pPr>' : ''}${o.t === '' && !o.br ? '' : runs}</w:p>`;
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  [1, 2].map(l => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>`).join('') + '</w:styles>';
const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOCRELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
function documentXml(paras) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paras.map(p).join('')}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
}
/** .docx из абзацев → ArrayBuffer */
async function docx(paras) {
  const enc = new TextEncoder();
  const blob = await global.Formatter.zipFiles([
    { name: '[Content_Types].xml', data: enc.encode(CT) }, { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOCRELS) }, { name: 'word/styles.xml', data: enc.encode(STYLES) },
    { name: 'word/document.xml', data: enc.encode(documentXml(paras)) }]);
  return blob.arrayBuffer();
}

/* ---------------- готовые работы ---------------- */
/** Методичка «Практическая работа №10», переведённая из PDF: каждая строка PDF — отдельный абзац (как делают конвертеры),
    пункты 6.3–6.6 слиты конвертером в один абзац, пара мест — разрыв строки внутри абзаца, слова по прогону на слово. */
const METOD_PDF = [
  { t: 'Практическая работа №10', words: true },
  { t: 'Рассмотрение государственной политики в области информационной', words: true, b: true },
  { t: 'безопасности', b: true },
  { t: '1. Цель работы: сформировать у обучающихся целостное представление о', words: true },
  { t: 'многоуровневой системе стандартов и нормативных актов в области информационной', words: true },
  { t: 'безопасности России, а также первичные навыки работы с нормативными', words: true },
  { t: 'документами.' },
  '2. Литература:',
  { t: '2.1. Федеральный закон от 29.06.2015 № 162-ФЗ «О стандартизации в Российской', words: true },
  'Федерации» (ст. 2 — определение стандарта).',
  '2.2. ГОСТ Р ИСО/МЭК 27001-2021 «Информационные технологии. Методы и средства',
  'обеспечения безопасности. Системы менеджмента информационной безопасности.',
  'Требования».',
  { br: ['2.3. ГОСТ Р 34.10-2012 «Информационная технология. Криптографическая защита', 'информации. Процессы формирования и проверки электронной цифровой подписи»', '(стандарт ФСБ России, не являющийся переводом ИСО).'] },
  '2.4. Приказ ФСТЭК России от 11.02.2013 № 17 «Об утверждении Требований о защите',
  'информации, не составляющей государственную тайну, в государственных',
  'информационных системах».',
  '2.5. ГОСТ Р 57580.1-2017 «Безопасность финансовых (банковских) операций. Защита',
  'информации финансовых организаций. Базовый состав организационных и',
  'технических мер».',
  '3. Подготовка к работе:',
  '3.1. Повторить материалы лекции по данной теме',
  '3.2. Ознакомиться с литературой',
  '4. Основное оборудование:',
  '4.1. Пакет офиса',
  '4.2. Веб обозреватель',
  '5. Задание:',
  '5.1. Заполнить сравнительную таблицу по четырём документам из списка литературы',
  '(кроме закона № 162-ФЗ).',
  'TABLE',
  '5.2. Сделать вывод (5–7 предложений), в котором объяснить, чем стандарт отличается от нормативного правового акта.',
  '6. Порядок выполнения работы:',
  '6.1. В текстовом редакторе создайте документ и постройте таблицу с указанными',
  'колонками.',
  '6.2. Последовательно изучите каждый документ, используя официальные сайты',
  'регуляторов или справочно-правовые системы.',
  '6.3. Заполните все графы таблицы. Будьте точны в названиях и номерах. 6.4. Проверьте таблицу на наличие фактических ошибок. 6.5. Напишите вывод по заданию (п. 5.2). 6.6. Оформите отчёт согласно требованиям (п. 7).',
  '7. Требования к отчету: работа должна быть оформлена по СТО САФУ.',
  '8. Контрольные вопросы:',
  '8.1. Дайте определение понятию «стандарт» по Федеральному закону № 162-ФЗ. Чем',
  'стандарт отличается от нормативного правового акта?',
  '8.2. Какой регулятор утвердил ГОСТ Р ИСО/МЭК 27001-2021? Для чего предназначен',
  'этот стандарт?',
];
/** Отчёт по той же работе, набранный в Word: шапка, заголовки стилями, таблица, вывод. Ни одной разорванной строки. */
const REPORT_WORD = [
  { t: 'Практическая работа №10', b: true },
  { t: 'Рассмотрение государственной политики в области информационной безопасности', b: true },
  'Выполнил: студент 1 курса направления «Информационная безопасность» Зарубин Кирилл Вениаминович',
  { t: 'Цель работы', style: 'Heading1' },
  'Сформировать целостное представление о многоуровневой системе стандартов и нормативных актов в области информационной безопасности России.',
  { t: 'Сравнительная таблица документов', style: 'Heading1' },
  'TABLE',
  { t: 'Вывод', style: 'Heading1' },
  'Стандарт и нормативный правовой акт различаются по своей природе: стандарт применяется добровольно, а нормативный правовой акт обязателен.',
  'ГОСТ Р ИСО/МЭК 27001 и приказ ФСТЭК № 17 дополняют друг друга, но работают на разных уровнях.',
];
/** Обычный реферат с титульным листом: строки шапки по центру — их склеивать нельзя. */
const REFERAT = [
  { t: 'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', jc: 'center' },
  { t: 'федеральное государственное автономное образовательное учреждение', jc: 'center' },
  { t: 'высшего образования', jc: 'center' },
  { t: '«Северный (Арктический) федеральный университет имени М.В. Ломоносова»', jc: 'center' },
  { t: 'РЕФЕРАТ', jc: 'center', b: true },
  { t: 'по дисциплине «История»', jc: 'center' },
  { t: 'на тему «Освоение Арктики в XX веке»', jc: 'center' },
  'Выполнил: студент 1 курса группы 151621',
  'Зарубин Кирилл Вениаминович',
  'Проверил: доцент Петров П. П.',
  { t: 'Архангельск 2026', jc: 'center' },
  { t: 'ВВЕДЕНИЕ', page: true },
  'Актуальность темы заключается в том, что Арктика становится важным регионом. Цель работы — описать освоение Арктики. Для достижения цели решаются задачи: изучить источники; описать этапы.',
  { t: '1 Первые экспедиции', style: 'Heading1' },
  'В начале века экспедиции шли на ледоколах. Первые станции появились в тридцатые годы.',
  { t: '1.1 Ледоколы', style: 'Heading2' },
  'Ледокольный флот рос быстро. Это позволило открыть Северный морской путь.',
  { t: 'ЗАКЛЮЧЕНИЕ', page: true },
  'Освоение Арктики шло в несколько этапов.',
  { t: 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ', page: true },
  'Иванов И.И. История Арктики. - М.: Наука, 2020. - 300 с.',
];

global.StoFixtures = { docx, documentXml, METOD_PDF, REPORT_WORD, REFERAT };
})(typeof window !== 'undefined' ? window : globalThis);
