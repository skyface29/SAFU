/* =====================================================================
   Айсберг — «Защита под ключ».
   Из готовой работы (.docx) собирает выступление по таймингу, слайды
   презентации (.pptx) и лист вероятных вопросов комиссии с заготовками
   ответов. Всё в браузере: ни байта на сервер.

   Zashita.build(buf, { minutes, title }) → { speech, slides, questions, pptx }
     buf      — ArrayBuffer файла .docx
     minutes  — длительность доклада (по умолчанию 7)
     title    — данные титула (как StoTools.titleData): topic, student,
                discipline, teacher, year… Если не передать — берём из файла.
   ===================================================================== */
(function (global) {
'use strict';

const WPM = 125;                 // средний темп доклада, слов в минуту
const esc = s => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const EMU = 914400;              // EMU в дюйме
const SLIDE_W = 12192000, SLIDE_H = 6858000;   // 16:9

/* ----------------------- разбор работы ----------------------- */
/* Текст абзацев из document.xml без DOMParser: делим по </w:p>, снимаем теги.
   Моноширинные листинги (команды, код) помечаем, чтобы не тащить их в речь. */
function paragraphs(xml) {
  const body = (xml.match(/<w:body[\s\S]*<\/w:body>/) || [''])[0];
  return body.split(/<\/w:p>/).map(chunk => {
    const mono = /w:ascii="(?:Courier|Consolas|[^"]*Mono[^"]*|Menlo)[^"]*"/i.test(chunk);
    const txt = clean((chunk.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
    const heading = /<w:pStyle[^>]*w:val="(?:[Hh]eading|[Зз]аголовок|\d)/i.test(chunk) || /<w:outlineLvl\b/.test(chunk);
    return { txt, mono, heading };
  }).filter(p => p.txt || p.heading);
}

/* Заголовок «1 Название» / «2.3 …» или помеченный стилем, короткий, без точки в конце. */
function isHead(p) {
  if (!p.txt) return false;
  if (/^\d+(\.\d+)*\.?\s+\S/.test(p.txt) && p.txt.length < 90) return true;
  return p.heading && p.txt.length < 90;
}
const stripNo = s => s.replace(/^\d+(\.\d+)*\.?\s+/, '').trim();

/* первое содержательное предложение абзаца (для краткого пересказа раздела) */
const sentences = (s, n) => { const m = clean(s).match(/[^.!?]+[.!?]+/g) || [clean(s)]; return m.slice(0, n || 1).join(' ').slice(0, 320); };
const firstSentence = s => sentences(s, 1).slice(0, 220);
const stripKind = n => stripNo(n).replace(/^(заключение|выводы?)\b.*/i, 'Выводы').trim();

/* Собираем структуру: тема, цель, задачи, разделы верхнего уровня (с кратким пересказом), выводы. */
function outline(ps) {
  // индексы заголовков верхнего уровня («1 …», «2 …») — реальные разделы
  const topIdx = [];
  ps.forEach((p, i) => { if (!isHead(p)) return; const name = stripNo(p.txt);
    if (/^\d+\s+\S/.test(p.txt) || (!/^\d/.test(p.txt) && p.heading && name.length > 3)) topIdx.push({ i, name }); });

  const SERVICE = /^(цель|задачи|содержание|оглавление|введение|заключение|вывод|список|приложени|реферат|аннотац|ответы|контрольн)/i;
  const summaryUnder = (from, to, n) => { for (let j = from; j < to; j++) { const p = ps[j]; if (p.mono || isHead(p) || /^(рисунок|таблица|\[встав)/i.test(p.txt) || p.txt.length < 40) continue; return sentences(p.txt, n || 1); } return ''; };
  const sections = [];
  topIdx.forEach((h, k) => {
    if (SERVICE.test(h.name)) return;
    const end = k + 1 < topIdx.length ? topIdx[k + 1].i : ps.length;
    sections.push({ name: h.name, summary: summaryUnder(h.i + 1, end) });
  });

  // подпункты «2.1 …», «2.3 …» — реальные этапы работы (особенно у лабораторных),
  // но только внутри содержательных глав (не под «Ответы на контрольные вопросы» и т.п.)
  const parentOf = i => { let best = null; for (const t of topIdx) if (t.i < i) best = t; else break; return best; };
  const subIdx = [];
  ps.forEach((p, i) => { if (!isHead(p) || !/^\d+\.\d+\.?\s+\S/.test(p.txt) || SERVICE.test(stripNo(p.txt))) return;
    const par = parentOf(i); if (par && SERVICE.test(par.name)) return; subIdx.push({ i, name: stripNo(p.txt) }); });
  const steps = subIdx.map((h, k) => ({ name: h.name, summary: summaryUnder(h.i + 1, k + 1 < subIdx.length ? subIdx[k + 1].i : ps.length, 2) })).slice(0, 10);

  const findAfter = re => {
    const i = ps.findIndex(p => re.test(p.txt));
    if (i < 0) return '';
    const self = ps[i].txt.replace(re, '').trim().replace(/^[:–—-]\s*/, '').trim();
    if (self.length > 15) return self;
    for (let j = i + 1; j < ps.length && j < i + 4; j++) if (!ps[j].mono && ps[j].txt.length > 15 && !isHead(ps[j])) return ps[j].txt;
    return self;
  };
  const goal = findAfter(/^\s*цель\s+работы|^\s*цель(?=[\s:–—-])/i);

  let tasks = [];
  const ti = ps.findIndex(p => /задач/i.test(p.txt) && p.txt.length < 140);
  if (ti >= 0) {
    const inline = ps[ti].txt.replace(/^.*?задач\S*\s*[:–—-]?\s*/i, '').split(/\s*\d\)\s*|\s*\d\.\s+|;\s*/).map(clean).filter(x => x.length > 8);
    if (inline.length >= 2) tasks = inline;
    else for (let j = ti + 1; j < ps.length && j < ti + 10; j++) { const t = ps[j].txt; if (isHead(ps[j])) break; if (/^(\d|[-–•])/.test(t) && t.length > 8) tasks.push(clean(t.replace(/^(\d+[).]?|[-–•])\s*/, ''))); }
  }

  let concl = [];
  const ci = ps.findIndex(p => isHead(p) && /^(заключение|выводы?|общие\s+выводы)(?![а-яёa-z])/i.test(stripNo(p.txt)));
  if (ci >= 0) for (let j = ci + 1; j < ps.length; j++) { const p = ps[j]; if (isHead(p) || /^(список|приложени)/i.test(p.txt)) break; if (p.txt.length > 25 && !p.mono) concl.push(p.txt); if (concl.length >= 4) break; }
  // если «Выводы» одним абзацем — разложим на предложения
  if (concl.length === 1) concl = (concl[0].match(/[^.!?]+[.!?]/g) || [concl[0]]).map(clean).filter(x => x.length > 20).slice(0, 4);

  return { sections, steps, goal: clean(goal), tasks: tasks.slice(0, 6), concl };
}

/* ----------------------- речь по таймингу -----------------------
   Живой доклад от первого лица, как на защите у кафедры: обращение,
   переходы между частями, акценты, уверенная концовка. */
const LEAD_IN = ['Прежде всего отмечу, что', 'Отдельно подчеркну, что', 'Здесь важно сказать, что', 'Замечу, что', 'Как показала работа,'];
const STEP_INTRO = ['Начну с того, что', 'Первым шагом', 'Далее', 'Затем', 'После этого', 'Следующим этапом', 'Отдельное внимание я уделил тому, что', 'Также', 'Наконец', 'В завершение практической части'];

function buildSpeech(meta, o, minutes) {
  const target = Math.round(minutes * WPM);
  const topic = meta.topic || 'представленной работы';
  const kind = meta.kindWord || 'работа';
  const S = [];

  // 1. Обращение
  S.push(`Уважаемый председатель, уважаемые члены комиссии! Вашему вниманию представляется ${kind} на тему «${topic}».`);

  // 2. Актуальность + цель, связно
  const goalTxt = o.goal.replace(/^цель[ьюи]?\s*(работы)?\s*[—:–-]?\s*/i, '').replace(/[.\s]+$/, '');
  if (goalTxt) S.push(`Тема работы актуальна: рассматриваемые в ней вопросы имеют прямое практическое значение. Исходя из этого, цель работы я определил как ${lower(goalTxt)}.`);
  else S.push(`Тема работы актуальна и имеет практическое значение. Цель работы — изучить и практически освоить вопросы, обозначенные в её названии.`);

  // 3. Задачи
  if (o.tasks.length) {
    S.push(`Для достижения этой цели я поставил перед собой несколько задач: ${o.tasks.map((t, i) => `${i === o.tasks.length - 1 && o.tasks.length > 1 ? 'и, наконец, ' : ''}${lower(t).replace(/[.;\s]+$/, '')}`).join('; ')}.`);
  }

  // 4. Переход к содержанию + проход по этапам/разделам с живыми связками
  const walk = o.steps && o.steps.length >= 3 ? o.steps : o.sections;
  if (walk.length) {
    S.push(walk === o.steps ? 'Позвольте коротко рассказать, что было сделано в практической части.' : 'Структурно работа построена следующим образом.');
    walk.forEach((s, i) => {
      const lead = walk === o.steps ? (STEP_INTRO[Math.min(i, STEP_INTRO.length - 1)] + ' ') : (ordinal(i + 1) + ' раздел посвящён теме «' + s.name + '». ');
      const bodyTxt = s.summary ? cap(s.summary) : 'здесь приведены ход выполнения и полученные результаты.';
      S.push(walk === o.steps ? `${lead}${lower(s.name)}: ${lower(bodyTxt)}` : `${lead}${bodyTxt}`);
    });
  }

  // 5. Выводы
  if (o.concl.length) {
    S.push('Позвольте перейти к основным выводам.');
    o.concl.forEach((c, i) => S.push((i === 0 ? '' : (i === o.concl.length - 1 ? 'И, наконец, ' : 'Кроме того, ')) + cap(c)));
    S.push('Таким образом, поставленная цель достигнута, а все задачи работы выполнены.');
  } else S.push('Подводя итог, отмечу: поставленная цель достигнута, а все задачи работы выполнены в полном объёме.');

  // 6. Концовка
  S.push('На этом мой доклад окончен. Благодарю за внимание и готов ответить на ваши вопросы.');

  // подгонка под тайминг: длинно — режем пояснения к этапам из середины
  let text = S.join('\n\n');
  if (wc(text) > target * 1.15) {
    while (wc(S.join('\n\n')) > target * 1.1) { const idx = S.findIndex((x, i) => i > 4 && i < S.length - 3 && x.length > 60); if (idx < 0) break; S.splice(idx, 1); }
  }
  return { text: S.join('\n\n'), words: wc(S.join('\n\n')), minutes, target };
}

/* ----------------------- вопросы комиссии ----------------------- */
function buildQuestions(meta, o) {
  const q = [];
  const add = (question, hint) => q.push({ q: question, a: hint });
  add(`В чём актуальность темы «${meta.topic || '…'}» сегодня?`, 'Свяжи с реальной задачей/проблемой из введения: почему это важно именно сейчас.');
  if (o.goal) add('Почему была выбрана именно такая цель работы?', 'Покажи связь цели с проблемой: что не решалось без неё.');
  if (o.sections[0]) add(`Что из раздела «${o.sections[0].name}» оказалось для вас новым?`, 'Назови 1–2 понятия/метода, которые разобрал впервые.');
  add('С какими трудностями вы столкнулись при выполнении работы?', 'Честно: 1 трудность + как решил (это ценят больше «всё было легко»).');
  if (o.tasks.length) add('Все ли поставленные задачи удалось выполнить полностью?', 'Пройдись по задачам из введения — по каждой короткий итог.');
  add('Где результаты вашей работы можно применить на практике?', 'Один конкретный сценарий применения.');
  add('Что бы вы улучшили или сделали иначе, будь больше времени?', 'Назови 1 направление развития — показывает глубину понимания.');
  return q.slice(0, 7);
}

/* ----------------------- презентация .pptx -----------------------
   Фирменный стиль «Айсберг»: тёмно-синий титул, акцентная полоса,
   номера слайдов и подвал с темой. */
const C = { dark: '1F3B57', accent: '2E6FB0', accent2: '4C9BD6', light: 'EAF2F8', muted: '7D93A6', white: 'FFFFFF' };
let SID = 1;
function rect(x, y, w, h, fill, paras, line) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${++SID}" name="s${SID}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') + (line ? `<a:ln w="${line.w || 12700}"><a:solidFill><a:srgbClr val="${line.c}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>') + `</p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${(paras && paras.anchor) || 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${(paras && paras.xml) || '<a:p/>'}</p:txBody></p:sp>`;
}
function run(t, o) { o = o || {}; return `<a:p>${o.bullet ? '<a:pPr marL="285750" indent="-285750"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:srgbClr val="' + C.accent + '"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="▪"/></a:pPr>' : '<a:pPr algn="' + (o.algn || 'l') + '"/>'}<a:r><a:rPr lang="ru-RU" sz="${o.sz || 2000}"${o.b ? ' b="1"' : ''}${o.i ? ' i="1"' : ''}><a:solidFill><a:srgbClr val="${o.c || C.dark}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p>`; }

function slideDoc(s, no, total) {
  SID = 1;
  const shapes = [];
  if (s.kind === 'title' || s.kind === 'end') {
    shapes.push(rect(0, 0, SLIDE_W, SLIDE_H, C.dark));                      // фон
    shapes.push(rect(0, 0, SLIDE_W, 220980, C.accent));                    // верхняя полоса
    shapes.push(rect(0, SLIDE_H - 220980, SLIDE_W, 220980, C.accent));     // нижняя полоса
  }
  if (s.kind === 'title') {
    shapes.push(rect(990600, 2360000, SLIDE_W - 1981200, 1700000, null, { anchor: 'b', xml: run(s.title, { sz: 3600, b: true, c: C.white, algn: 'ctr' }) }));
    shapes.push(rect(SLIDE_W / 2 - 457200, 4180000, 914400, 54000, C.accent2)); // акцентная черта
    shapes.push(rect(990600, 4360000, SLIDE_W - 1981200, 1500000, null, { anchor: 't', xml: s.body.map((b, i) => run(b, { sz: i === 0 ? 2200 : 1700, c: i === 0 ? C.white : C.light, algn: 'ctr' })).join('') }));
  } else if (s.kind === 'end') {
    shapes.push(rect(990600, 2600000, SLIDE_W - 1981200, 1200000, null, { anchor: 'b', xml: run(s.title, { sz: 4000, b: true, c: C.white, algn: 'ctr' }) }));
    shapes.push(rect(SLIDE_W / 2 - 457200, 4060000, 914400, 54000, C.accent2));
    shapes.push(rect(990600, 4240000, SLIDE_W - 1981200, 900000, null, { anchor: 't', xml: s.body.map(b => run(b, { sz: 1800, c: C.light, algn: 'ctr' })).join('') }));
  } else {
    shapes.push(rect(0, 0, SLIDE_W, SLIDE_H, C.white));
    shapes.push(rect(0, 0, 182880, SLIDE_H, C.accent));                     // левая акцентная полоса
    // номер-бейдж
    shapes.push(rect(609600, 400050, 700000, 700000, C.accent, { anchor: 'ctr', xml: run(String(no), { sz: 2400, b: true, c: C.white, algn: 'ctr' }) }));
    shapes.push(rect(1430000, 400050, SLIDE_W - 2100000, 760000, null, { anchor: 'ctr', xml: run(s.title, { sz: 2600, b: true, c: C.dark }) }));
    shapes.push(rect(1430000, 1230000, SLIDE_W - 2040000, 24000, C.light)); // тонкая линия под заголовком
    shapes.push(rect(1370000, 1480000, SLIDE_W - 2040000, 4400000, null, { anchor: 't', xml: s.body.map(b => run(b, { sz: 2000, c: C.dark, bullet: true })).join('') }));
    // подвал: тема слева, номер справа
    shapes.push(rect(609600, SLIDE_H - 520000, SLIDE_W - 2400000, 360000, null, { anchor: 'ctr', xml: run(s.footer || '', { sz: 1100, c: C.muted }) }));
    shapes.push(rect(SLIDE_W - 1700000, SLIDE_H - 520000, 1100000, 360000, null, { anchor: 'ctr', xml: run(no + ' / ' + total, { sz: 1100, c: C.muted, algn: 'r' }) }));
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes.join('') + `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;
}

function buildSlides(meta, o) {
  const foot = (meta.topic || '').length > 70 ? meta.topic.slice(0, 67) + '…' : (meta.topic || '');
  const slides = [];
  slides.push({ kind: 'title', title: meta.topic || 'Тема работы', body: [meta.student || '', meta.discipline ? '«' + meta.discipline + '»' : '', [meta.city, meta.year].filter(Boolean).join(' ')].filter(Boolean) });
  const gt = [];
  if (o.goal) gt.push('Цель: ' + o.goal.replace(/^цель[ью]?\s*(работы)?\s*[—:-]?\s*/i, ''));
  o.tasks.forEach((t, i) => gt.push('Задача ' + (i + 1) + ': ' + t));
  if (gt.length) slides.push({ kind: 'section', title: 'Цель и задачи', body: gt, footer: foot });
  const walk = o.steps && o.steps.length >= 3 ? o.steps : o.sections;
  walk.forEach(s => slides.push({ kind: 'section', title: s.name.length > 58 ? s.name.slice(0, 55) + '…' : s.name, body: s.summary ? splitBullets(s.summary) : ['Ключевые положения', 'Основные результаты'], footer: foot }));
  slides.push({ kind: 'section', title: 'Выводы', body: o.concl.length ? o.concl.slice(0, 5) : ['Цель работы достигнута', 'Поставленные задачи выполнены'], footer: foot });
  slides.push({ kind: 'end', title: 'Спасибо за внимание!', body: ['Готов ответить на ваши вопросы'] });
  return slides;
}
/* длинный пересказ → 1–2 пункта для слайда */
function splitBullets(s) { const parts = (s.match(/[^.!?]+[.!?]+/g) || [s]).map(clean).filter(x => x.length > 15); return parts.slice(0, 2).map(x => x.length > 160 ? x.slice(0, 157) + '…' : x); }

async function packPptx(slides) {
  const enc = new TextEncoder();
  const N = slides.length;
  const rels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');

  const files = {};
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + `</Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
  files['ppt/presentation.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  files['ppt/_rels/presentation.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${rels}</Relationships>`;
  files['ppt/theme/theme1.xml'] = THEME;
  files['ppt/slideMasters/slideMaster1.xml'] = MASTER;
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
  files['ppt/slideLayouts/slideLayout1.xml'] = LAYOUT;
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
  slides.forEach((s, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slideDoc(s, i + 1, slides.length);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
  });
  return global.Formatter.zipFiles(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })));
}

/* минимальные тема/мастер/макет — чтобы файл открывали PowerPoint, Keynote и LibreOffice */
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Айсберг"><a:themeElements><a:clrScheme name="Айсберг"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3B57"/></a:dk2><a:lt2><a:srgbClr val="EAF2F8"/></a:lt2><a:accent1><a:srgbClr val="2E6FB0"/></a:accent1><a:accent2><a:srgbClr val="4C9BD6"/></a:accent2><a:accent3><a:srgbClr val="6FB7E0"/></a:accent3><a:accent4><a:srgbClr val="9AD0EE"/></a:accent4><a:accent5><a:srgbClr val="C8E6F7"/></a:accent5><a:accent6><a:srgbClr val="1F3B57"/></a:accent6><a:hlink><a:srgbClr val="2E6FB0"/></a:hlink><a:folHlink><a:srgbClr val="6FB7E0"/></a:folHlink></a:clrScheme><a:fontScheme name="Айсберг"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Айсберг"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:solidFill><a:schemeClr val="dk2"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`;
const LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Пустой"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>`;

/* ----------------------- мелкие помощники ----------------------- */
const wc = s => (s.trim().match(/\S+/g) || []).length;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const lower = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
function numWord(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c)); }
const ORD = ['', 'Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой', 'Восьмой'];
const ordinal = n => ORD[n] || (n + '-й');

/* ----------------------- точка входа ----------------------- */
async function build(buf, opts) {
  opts = opts || {};
  const minutes = opts.minutes || 7;
  let title = opts.title;
  if (!title && global.Formatter && global.Formatter.readTitle) { try { title = await global.Formatter.readTitle(buf); } catch (e) { title = null; } }
  title = title || {};
  const TYPE_WORD = { laba: 'лабораторная работа', kursovaya: 'курсовая работа', kproekt: 'курсовой проект', referat: 'реферат', praktika: 'отчёт о практике', vkr: 'выпускная квалификационная работа', nir: 'научно-исследовательская работа' };
  const meta = { topic: clean(title.topic), student: clean(title.student), discipline: clean(title.discipline), teacher: clean(title.teacher), year: clean(title.year), city: clean(title.city) || 'Архангельск', kindWord: TYPE_WORD[title.type] || 'работа' };

  const ent = (await global.Formatter.unzip(buf)).find(x => x.name === 'word/document.xml');
  if (!ent) throw new Error('В файле нет word/document.xml — это не .docx');
  const xml = new TextDecoder().decode(ent.data);
  const ps = paragraphs(xml);
  if (!meta.topic) { const h = ps.find(isHead); if (h) meta.topic = stripNo(h.txt); }
  const o = outline(ps);

  const speech = buildSpeech(meta, o, minutes);
  const slides = buildSlides(meta, o);
  const questions = buildQuestions(meta, o);
  const pptx = await packPptx(slides);
  return { speech, slides, questions, pptx, meta, outline: o };
}

global.Zashita = { build, _outline: outline, _paragraphs: paragraphs, _buildSpeech: buildSpeech };
})(typeof window !== 'undefined' ? window : globalThis);
