/* =====================================================================
   Айсберг — проверка работы по правилам её вида.
   У каждого вида свои обязательные части, своё «нужно ли содержание», что искать во введении
   и обычный объём. Нормы объёма и числа источников — типичные для вузов: преподаватель
   или методичка кафедры могут требовать иначе, поэтому они — предупреждения, а не ошибки.
   Работает в браузере, файл никуда не отправляется.
   ===================================================================== */
(function (global) {
'use strict';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* части работы: как называется в отчёте и как ищется среди заголовков */
const PART = {
  toc: ['оглавление/содержание', /^(содержание|оглавление)$/],
  abstract: ['реферат (аннотация)', /^(реферат|аннотация|abstract)$/],
  annot: ['аннотация', /^(аннотация|abstract|резюме)$/],
  keywords: ['ключевые слова', /^ключевые\s+слова/],
  intro: ['введение', /^введение$/],
  concl: ['заключение', /^(заключение|выводы|вывод|общие\s+выводы)$/],
  bib: ['список литературы', /(список\s+(использованн\S*\s+|рекомендуем\S*\s+)?(литературы|источников)|библиографическ\S*\s+список|^литература$|^источники$)/],
  goal: ['цель работы', /^цель(\s+работы)?(?![а-яёa-z0-9])/],
  task: ['задание', /^(задание|постановка\s+задачи|условие)(?![а-яёa-z0-9])/],
  calc: ['расчётная часть', /(расч[её]тн\S*\s+част|расч[её]т(?![а-яёa-z0-9]))/],
  diary: ['дневник или характеристика с места практики', /(дневник|характеристик|отзыв\s+руководител)/],
};
/* как исправить вручную: коротко и с готовым началом фразы */
const HOW = {
  intro: 'Добавь раздел «ВВЕДЕНИЕ» перед первой главой: актуальность темы, цель и задачи работы.',
  concl: 'Добавь «ЗАКЛЮЧЕНИЕ» после последней главы: по абзацу на каждую задачу — что сделано и к какому выводу пришёл.',
  bib: 'Добавь раздел «СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ» в конце. Записи можно писать как попало — при оформлении приведу их к образцам СТО.',
  abstract: 'Добавь «РЕФЕРАТ» в начале: объём отчёта, число рисунков, таблиц, источников, ключевые слова и 1–2 абзаца о сути работы.',
  annot: 'Добавь «Аннотация:» — 3–5 предложений: о чём статья, что сделано, какой результат.',
  keywords: 'Добавь строку «Ключевые слова: …» — 5–10 слов или словосочетаний через запятую.',
  goal: 'Начни отчёт со строки «Цель работы: …» — чему ты учился или что исследовал.',
  task: 'Добавь «ЗАДАНИЕ» — условие и исходные данные твоего варианта.',
  calc: 'Обычно у курсового проекта есть расчётная часть — отдельная глава с расчётами и формулами.',
  diary: 'Приложи дневник практики и характеристику руководителя от организации — их обычно требуют вместе с отчётом.',
};
const HOW_INTRO = { actual: '«Актуальность темы заключается в том, что …»', goal: '«Цель работы — …»', tasks: '«Для достижения цели решаются задачи: 1) …; 2) …»',
  object: '«Объект исследования — …»', subject: '«Предмет исследования — …»', novelty: '«Научная новизна работы состоит в …»',
  practical: '«Практическая значимость: результаты можно применить …»', methods: '«Методы исследования: анализ, сравнение, …»' };
/* что ищем во введении */
const INTRO = {
  actual: ['актуальность', /актуальн/],
  goal: ['цель', /(?<![а-яёa-z0-9])(цель|целью|цели)(?![а-яёa-z0-9])/],
  tasks: ['задачи', /задач/],
  object: ['объект', /объект\S*\s+(исследования|работы|изучения)|(?<![а-яёa-z0-9])объектом(?![а-яёa-z0-9])/],
  subject: ['предмет', /предмет\S*\s+(исследования|работы|изучения)|(?<![а-яёa-z0-9])предметом(?![а-яёa-z0-9])/],
  novelty: ['научная новизна', /новизн/],
  practical: ['практическая значимость', /практическ\S*\s+(значимост|ценност|применени)/],
  methods: ['методы', /метод\S*\s+(исследования|работы)|(?<![а-яёa-z0-9])методы(?![а-яёa-z0-9])/],
};

/* виды работ — по таблице 1 СТО САФУ 2026 (п. 2.2): need — «+» (обязательно), soft — «р» (рекомендуется).
   pages и src — типичные нормы кафедр (в СТО их нет), поэтому они только предупреждения.
   Лабораторной, доклада-сообщения и тезисов в таблице 1 нет — для них правила обычные для таких работ. */
const KINDS = {
  esse:      { name: 'Эссе', hint: 'без содержания', toc: false, need: ['concl'], soft: ['intro', 'bib'], intro: [], pages: [3, 10], src: 0, sto: true },
  doklad:    { name: 'Доклад', hint: 'сообщение, выступление', toc: false, need: [], soft: ['intro', 'concl', 'bib'], intro: ['actual'], pages: [5, 15], src: 5 },
  referat:   { name: 'Реферат', hint: 'обзор по теме', toc: true, need: ['intro', 'concl', 'bib'], soft: ['toc'], intro: ['actual', 'goal', 'tasks'], pages: [10, 25], src: 8, sto: true },
  kontrol:   { name: 'Контрольная', hint: 'задания и ответы', toc: false, need: [], soft: ['intro', 'concl', 'bib'], intro: [], pages: [5, 20], src: 0, sto: true },
  laba:      { name: 'Лабораторная', hint: 'цель, ход, выводы', toc: false, need: ['goal', 'concl'], intro: [], pages: [2, 20], src: 0 },
  rgr:       { name: 'РГР', hint: 'расчётно-графическая', toc: true, need: [], soft: ['toc', 'task', 'intro', 'concl', 'bib'], intro: [], pages: [8, 25], src: 3, sto: true },
  kursovaya: { name: 'Курсовая работа', hint: 'введение, главы, заключение', toc: true, need: ['toc', 'intro', 'concl', 'bib'], soft: ['task'], intro: ['actual', 'goal', 'tasks', 'object', 'subject'], pages: [25, 40], src: 15, sto: true },
  kproekt:   { name: 'Курсовой проект', hint: 'с расчётной частью', toc: true, need: ['toc', 'intro', 'concl', 'bib'], soft: ['task', 'calc'], intro: ['actual', 'goal', 'tasks'], pages: [25, 50], src: 15, sto: true },
  praktika:  { name: 'Отчёт о практике', hint: 'дневник, характеристика', toc: true, need: ['toc'], soft: ['intro', 'concl', 'bib', 'diary'], intro: ['goal', 'tasks'], pages: [15, 30], src: 5, sto: true },
  nir:       { name: 'Отчёт о НИР', hint: 'по ГОСТ 7.32', toc: true, need: ['abstract', 'intro', 'concl'], soft: ['toc', 'bib', 'task'], intro: ['actual', 'goal', 'tasks'], pages: [20, 60], src: 15, sto: true },
  statya:    { name: 'Научная статья', hint: 'аннотация, ключевые слова', toc: false, notoc: true, need: ['annot', 'intro', 'concl', 'bib'], soft: ['keywords'], intro: [], pages: [4, 12], src: 8, sto: true },
  tezisy:    { name: 'Тезисы', hint: 'для конференции', toc: false, need: [], soft: ['bib'], intro: [], pages: [1, 4], src: 0 },
  vkr:       { name: 'ВКР бакалавра', hint: 'дипломная работа', toc: true, need: ['abstract', 'toc', 'intro', 'concl', 'bib'], soft: ['task'], intro: ['actual', 'goal', 'tasks', 'object', 'subject', 'practical'], pages: [50, 80], src: 40, sto: true },
  specialist:{ name: 'ВКР специалиста', hint: 'дипломный проект', toc: true, need: ['abstract', 'toc', 'intro', 'concl', 'bib'], soft: ['task'], intro: ['actual', 'goal', 'tasks', 'object', 'subject', 'practical'], pages: [60, 100], src: 40, sto: true },
  magistr:   { name: 'Магистерская диссертация', hint: 'ВКР магистра', toc: true, need: ['abstract', 'toc', 'intro', 'concl', 'bib'], soft: ['task'], intro: ['actual', 'goal', 'tasks', 'object', 'subject', 'novelty', 'practical', 'methods'], pages: [70, 110], src: 50, sto: true },
};
/* вид с титульника (StoTools.TITLE_TYPES) → вид проверки */
const FROM_TITLE = { referat: 'referat', esse: 'esse', kontrol: 'kontrol', rgr: 'rgr', kursovaya: 'kursovaya', kproekt: 'kproekt', praktika: 'praktika' };

const CHARS_PER_PAGE = 1800;   // Times New Roman 14, полуторный интервал, поля СТО: ≈ 1800 знаков с пробелами
const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, ' ').replace(/^[\s\d.]+(?=[a-zа-я])/i, '').replace(/[\s.:;]+$/, '').trim();
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };

async function docXml(buf) {
  const e = (await global.Formatter.unzip(buf)).find(x => x.name === 'word/document.xml');
  if (!e) throw new Error('В файле нет word/document.xml — это не .docx');
  return new TextDecoder().decode(e.data);
}
/** Абзацы тела документа (вне таблиц и надписей): текст, заголовок ли, стиль. */
function readParas(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'), body = doc.getElementsByTagNameNS(W, 'body')[0];
  const out = [];
  if (!body) return out;
  for (const p of body.getElementsByTagNameNS(W, 'p')) {
    let skip = false;
    for (let a = p.parentNode; a && a !== body; a = a.parentNode) if (a.localName === 'tbl' || a.localName === 'txbxContent') { skip = true; break; }
    if (skip) continue;
    let text = '';
    for (const e of p.getElementsByTagNameNS(W, '*')) {
      if (e.localName === 't') { let own = true; for (let a = e.parentNode; a && a !== p; a = a.parentNode) if (a.localName === 'txbxContent') { own = false; break; } if (own) text += e.textContent; }
      else if (e.localName === 'tab' || (e.localName === 'br' && e.getAttributeNS(W, 'type') !== 'page')) text += ' ';
    }
    text = text.replace(/\s+/g, ' ').trim();
    const pPr = [...p.childNodes].find(c => c.localName === 'pPr'), st = pPr && [...pPr.childNodes].find(c => c.localName === 'pStyle');
    const style = st ? (st.getAttributeNS(W, 'val') || '') : '', outline = pPr && [...pPr.childNodes].some(c => c.localName === 'outlineLvl');
    const toc = /^(toc|оглавление|содержание)\s*\d|^\d*toc/i.test(style) || p.getElementsByTagNameNS(W, 'instrText').length && /TOC/.test([...p.getElementsByTagNameNS(W, 'instrText')].map(x => x.textContent).join(''));
    out.push({ text, style, head: /heading|заголовок|^\d$|title/i.test(style) || outline, toc });
  }
  return out;
}

/** Проверка работы по правилам вида. buf — .docx (ArrayBuffer), kind — ключ KINDS. */
async function check(buf, kind, after) {
  const K = KINDS[kind] || KINDS.referat;
  const xml = await docXml(buf);
  const P = readParas(xml);
  const hasTocField = /TOC\s*\\[a-z]/i.test(xml) || /w:docPartGallery w:val="Table of Contents"/.test(xml);
  // кандидаты в заголовки: стиль заголовка или короткая строка без точки в конце
  const isHeadLike = x => x.text && x.text.length <= 90 && !x.toc && (x.head || !/[.;,]$/.test(x.text) && x.text.split(' ').length <= 10);
  const found = {};
  P.forEach((x, i) => { if (!isHeadLike(x) && !/^(цель|ключевые слова|аннотация)/i.test(x.text)) return; const n = norm(x.text);
    for (const [k, [, re]] of Object.entries(PART)) if (found[k] == null && re.test(n)) found[k] = i; });
  if (found.toc == null && hasTocField) found.toc = -1;
  // «Цель работы: …» и «Ключевые слова: …» пишут прямо в абзаце
  P.forEach((x, i) => { const n = norm(x.text);
    if (found.goal == null && /^цель(\s+работы)?\s*[:–-]/i.test(x.text)) found.goal = i;
    if (found.keywords == null && /^ключевые\s+слова\s*[:–-]/i.test(n)) found.keywords = i;
    if (found.annot == null && /^(аннотация|abstract)\s*[:.–-]/i.test(x.text)) found.annot = i; });

  const items = [];
  const add = (level, text, extra) => items.push(Object.assign({ level, text }, extra || {}));
  // обязательные части
  for (const k of K.need) {
    if (found[k] != null) continue;
    if (k === 'toc') add(after ? 'err' : 'fix', after ? `Нет содержания — для вида «${K.name}» оно нужно: включи «Содержание» в настройках и оформи ещё раз` : `Нет содержания — для вида «${K.name}» оно нужно. Добавлю автоматическое при оформлении`, { auto: !after, part: k });
    else add('err', `Нет раздела «${PART[k][0]}» — для вида «${K.name}» это обязательно${K.sto ? ' (СТО, п. 2.2, табл. 1)' : ''}`, { part: k, how: HOW[k] });
  }
  for (const k of K.soft || []) if (found[k] == null) add('warn', `Нет раздела «${PART[k][0]}» — для вида «${K.name}» ${K.sto && k !== 'diary' && k !== 'calc' ? 'СТО его рекомендует (п. 2.2)' : 'он обычно нужен'}`, { part: k, how: HOW[k] });
  if (K.notoc && found.toc != null && found.toc >= 0) add('warn', `У вида «${K.name}» содержания по СТО нет (п. 2.2, табл. 1) — лучше убрать`);

  // введение
  const introAt = found.intro;
  const introMissing = [];
  let introText = '';
  if (introAt != null && K.intro.length) {
    for (let i = introAt + 1; i < P.length; i++) {
      const x = P[i];
      if (x.head && x.text.length < 120 || /^(глава\s+\d|\d+(\.\d+)*\.?\s+\S)/i.test(x.text) && x.text.length < 120 && !/[.;]$/.test(x.text)) break;
      introText += ' ' + x.text.toLowerCase().replace(/ё/g, 'е');
      if (introText.length > 25000) break;
    }
    const miss = K.intro.filter(k => !INTRO[k][1].test(introText));
    miss.forEach(k => introMissing.push(INTRO[k][0]));
    if (miss.length) add('warn', `Во введении не нашёл: ${introMissing.join(', ')} — для вида «${K.name}» их обычно требуют`, { intro: true, how: 'Добавь во введение: ' + miss.map(k => HOW_INTRO[k]).join(', ') + '.' });
  }

  // объём основной части: от введения (или начала текста) до списка литературы / приложений
  const startAt = introAt != null ? introAt : (found.toc != null && found.toc >= 0 ? found.toc + 1 : 0);
  let endAt = P.length;
  for (const k of ['bib']) if (found[k] != null && found[k] > startAt) endAt = Math.min(endAt, found[k]);
  P.forEach((x, i) => { if (i > startAt && i < endAt && /^приложение(\s+[а-яa-z0-9]{1,2})?$/i.test(norm(x.text))) endAt = i; });
  let chars = 0, words = 0;
  for (let i = startAt; i < endAt; i++) if (!P[i].toc) { chars += P[i].text.length; words += P[i].text ? P[i].text.split(' ').length : 0; }
  const pages = Math.max(chars ? 1 : 0, Math.round(chars / CHARS_PER_PAGE));
  if (K.pages && chars > 300) {
    if (pages < K.pages[0]) add('warn', `Основная часть ≈ ${pages} ${plural(pages, 'страница', 'страницы', 'страниц')} — для вида «${K.name}» обычно ${K.pages[0]}–${K.pages[1]}`, { volume: true, how: `Не хватает примерно ${K.pages[0] - pages} стр. Объём считаю по тексту от введения до списка литературы; точную норму уточни в методичке кафедры.` });
    else if (pages > K.pages[1] * 1.25) add('warn', `Основная часть ≈ ${pages} ${plural(pages, 'страница', 'страницы', 'страниц')} — для вида «${K.name}» обычно ${K.pages[0]}–${K.pages[1]}, работа заметно длиннее`, { volume: true });
  }
  // источники: непустые абзацы после заголовка списка до приложений
  let sources = 0;
  if (found.bib != null) {
    for (let i = found.bib + 1; i < P.length; i++) {
      const t = P[i].text; if (!t) continue;
      if (/^приложение(?![а-яёa-z0-9])/i.test(t) && t.length < 80) break;
      if (P[i].head && t.length < 90 && !/\d{4}/.test(t)) break;
      if (t.length >= 15) sources++;
    }
    if (K.src && sources < K.src) add('warn', `В списке ${sources} ${plural(sources, 'источник', 'источника', 'источников')} — для вида «${K.name}» обычно не меньше ${K.src}`, { sources: true, how: `Добавь ещё ${K.src - sources}: учебники из ЭБС (Знаниум, Лань, Юрайт), статьи из eLibrary и КиберЛенинки, ГОСТы и законы по теме.` });
  }
  // п. 4.14.10: на каждый источник в тексте должна быть ссылка; п. 4.14.5: ссылка — номер по списку в [ ]
  const cited = new Set(), wrong = new Set();
  if (sources) {
    for (let i = startAt; i < endAt; i++) {
      for (const m of P[i].text.matchAll(/\[([^\[\]]{1,60})\]/g)) {
        const body = m[1].replace(/\s*[,;]\s*(с|стр|л|рис|табл)\.\s*[\d\s–—,-]+/gi, '');   // «[5, с. 25]» — номер 5
        if (!/^[\d\s,;–—-]+$/.test(body)) continue;
        for (const part of body.split(/[,;]/)) {
          const r = /^\s*(\d{1,3})\s*(?:[–—-]\s*(\d{1,3}))?\s*$/.exec(part); if (!r) continue;
          const a = +r[1], b = r[2] ? +r[2] : a;
          for (let n = a; n <= Math.min(b, a + 50); n++) (n >= 1 && n <= sources ? cited : wrong).add(n);
        }
      }
    }
    const never = []; for (let n = 1; n <= sources; n++) if (!cited.has(n)) never.push(n);
    if (wrong.size) add('err', `Ссылка на источник, которого нет в списке: ${[...wrong].sort((a, b) => a - b).map(n => '[' + n + ']').join(', ')} — в списке ${sources} ${plural(sources, 'источник', 'источника', 'источников')}`,
      { how: 'Проверь номера в квадратных скобках: ссылка — это номер источника по списку (п. 4.14.5).' });
    if (cited.size && never.length) add('warn', `На ${never.length === 1 ? 'источник' : 'источники'} ${never.join(', ')} нет ссылок в тексте — по СТО ссылка нужна на каждый (п. 4.14.10)`,
      { how: 'Поставь в тексте, где используешь источник, его номер в квадратных скобках: «…как показано в [3]» или «[3, с. 45]».' });
    if (!cited.size && sources >= 2) add('warn', 'В тексте нет ни одной ссылки вида [1] на список источников — по СТО ссылка нужна на каждый источник (п. 4.14.5, 4.14.10)',
      { how: 'После фразы, взятой из источника, ставь его номер по списку в квадратных скобках: [2] или [2, с. 15].' });
  }
  return { kind, name: K.name, items, found, pages, words, chars, sources, cited: cited.size, introMissing, ok: !items.some(x => x.level === 'err') };
}

/** Угадать вид по тексту, если титульника нет. */
function guess(buf, titleType) {
  if (titleType && FROM_TITLE[titleType]) return Promise.resolve(FROM_TITLE[titleType]);
  return docXml(buf).then(x => {
    const t = x.replace(/<[^>]+>/g, ' ').slice(0, 60000).toLowerCase();
    const has = re => re.test(t);
    if (has(/выпускн\S*\s+квалификационн\S*\s+работ/)) return has(/магистр/) ? 'magistr' : 'vkr';
    if (has(/магистерск\S*\s+диссертац/)) return 'magistr';
    if (has(/дипломн\S*\s+проект/)) return 'specialist';
    if (has(/курсов\S*\s+проект/)) return 'kproekt';
    if (has(/курсов\S*\s+работ/)) return 'kursovaya';
    if (has(/отч[её]т\S*\s+о\s+(прохождении\s+)?\S*\s*практик/)) return 'praktika';
    if (has(/научно-исследовательск\S*\s+работ/)) return 'nir';
    if (has(/лабораторн\S*\s+работ/)) return 'laba';
    if (has(/расч[её]тно-графическ/)) return 'rgr';
    if (has(/контрольн\S*\s+работ/)) return 'kontrol';
    if (has(/ключевые\s+слова/) && has(/аннотаци/)) return 'statya';
    if (has(/(?<![а-яёa-z0-9])эссе(?![а-яёa-z0-9])/)) return 'esse';
    if (has(/(?<![а-яёa-z0-9])доклад(?![а-яёa-z0-9])/)) return 'doklad';
    return 'referat';
  }).catch(() => 'referat');
}

global.WorkKinds = { KINDS, PART, INTRO, HOW, HOW_INTRO, check, guess, FROM_TITLE, CHARS_PER_PAGE };
})(typeof window !== 'undefined' ? window : globalThis);
