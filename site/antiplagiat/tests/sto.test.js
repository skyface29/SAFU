// Сквозные тесты оформления по СТО в настоящем браузере: определение вида работы, склейка строк из PDF,
// шапка → титульный лист, страница (режимы, карточки, статистика). Счётчик — настоящий stats-api/pulse.js в памяти.
// Запуск: node site/antiplagiat/tests/sto.test.js       (нужен playwright; свой Chrome — CHROME=/путь/к/chrome)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const SITE = path.resolve(__dirname, '..', '..');
const pulse = require(path.resolve(SITE, '..', 'stats-api', 'pulse.js'))._test;
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml' };

let fail = 0, n = 0;
const results = [];
async function T(name, fn) { n++; try { await fn(); results.push('✓ ' + name); } catch (e) { fail++; results.push('✗ ' + name + '\n   ' + (e && e.message || e)); } }
const assert = (c, msg) => { if (!c) throw new Error(msg || 'условие не выполнено'); };
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error((msg ? msg + ': ' : '') + 'получили ' + JSON.stringify(got) + ', ожидали ' + JSON.stringify(want)); };

(async () => {
  /* ---------- сервер: сайт + счётчик ---------- */
  const db = pulse.memoryDb(); pulse.resetSto();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/pulse') {
      let body = ''; for await (const c of req) body += c;
      const [code, obj] = await pulse.handle(req.method, body ? JSON.parse(body) : null, req.headers, db, Date.now());
      res.writeHead(code, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(obj));
    }
    let f = path.join(SITE, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://localhost:' + server.address().port;   // localhost — страница сама шлёт счётчик на /pulse
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  // обычный Chrome: безголовый браузер счётчик честно считает роботом и не учитывает
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  // шрифты и сторонние скрипты не нужны — тесты не зависят от сети
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|functions\.yandexcloud\.net/, r => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/antiplagiat/', { waitUntil: 'load' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sto-'));
  const fixture = async (name, key) => { const b64 = await page.evaluate(async k => { const b = new Uint8Array(await StoFixtures.docx(StoFixtures[k])); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }, key);
    const f = path.join(tmp, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };

  /* в странице: собрать .docx, оформить, вернуть абзацы результата (после каждой загрузки страницы — заново) */
  const setup = async () => { await page.addScriptTag({ path: path.join(__dirname, 'fixtures.js') }); await page.evaluate(helpers); };
  const helpers = () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    window.T_paras = async buf => {
      const z = await Formatter.unzip(buf), x = new TextDecoder().decode(z.find(e => e.name === 'word/document.xml').data);
      const doc = new DOMParser().parseFromString(x, 'application/xml'), body = doc.getElementsByTagNameNS(W, 'body')[0];
      return [...body.childNodes].filter(e => e.localName === 'p' || e.localName === 'tbl').map(p => {
        if (p.localName === 'tbl') return { tbl: true, t: '' };
        const pPr = [...p.childNodes].find(c => c.localName === 'pPr'), st = pPr && [...pPr.childNodes].find(c => c.localName === 'pStyle');
        let t = ''; for (const r of p.getElementsByTagNameNS(W, 'r')) for (const c of r.childNodes) { if (c.localName === 't') t += c.textContent; else if (c.localName === 'br' && c.getAttributeNS(W, 'type') !== 'page') t += '⏎'; }
        return { t: t.replace(/\s+/g, ' ').trim(), style: st ? st.getAttributeNS(W, 'val') : '', page: !!(pPr && [...pPr.childNodes].some(c => c.localName === 'pageBreakBefore')) };
      });
    };
    window.T_fmt = async (key, opts) => { const buf = await StoFixtures.docx(typeof key === 'string' ? StoFixtures[key] : key);
      const r = await Formatter.formatDocx(buf.slice(0), Object.assign({ profile: 'safu', toc: false, typography: true, size: 14 }, opts || {}));
      return { paras: await T_paras(await r.blob.arrayBuffer()), stats: r.stats, report: r.report, src: await T_paras(buf) }; };
    window.T_guess = async (key, title) => { const buf = await StoFixtures.docx(typeof key === 'string' ? StoFixtures[key] : key);
      const t = await Formatter.readTitle(buf.slice(0)).catch(() => null);
      return WorkKinds.guessDetailed(buf, title !== undefined ? title : t && t.found ? t.type || t.workKind : null); };
    // буквы и цифры подряд: так сравниваем, что текст не потерялся (типографика меняет тире, кавычки и пробелы)
    window.T_letters = ps => ps.map(p => p.t).join('').replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '');
  };
  await setup();
  const fmt = (key, opts) => page.evaluate(([k, o]) => T_fmt(k, o), [key, opts || {}]);
  const guess = (key, title) => page.evaluate(([k, t]) => T_guess(k, t), [key, title]);
  const titleXml = d => page.evaluate(d => StoTools.titleXml(d), d);

  /* ================= определение вида работы ================= */
  const G = [
    ['методичка из PDF → практическая по шапке', 'METOD_PDF', 'prakt', 'header'],
    ['отчёт, набранный в Word → практическая', 'REPORT_WORD', 'prakt', null],
    ['реферат с титульником → реферат', 'REFERAT', 'referat', null],
    ['лабораторная по шапке', ['ЛАБОРАТОРНАЯ РАБОТА № 3', 'Цель работы: изучить закон Ома.', 'Ход работы', 'Собрали схему.', 'Вывод', 'Закон подтверждён.'], 'laba', 'header'],
    ['«Отчёт по лабораторной работе №2»', ['Отчёт по лабораторной работе №2', 'Тема: «Шифр Цезаря»', 'Цель работы: изучить шифр.'], 'laba', null],
    ['«Отчёт по практической работе №5»', ['Отчет по практической работе № 5', 'Цель работы: настроить сеть.'], 'prakt', 'header'],
    ['без шапки: цель + ход + вывод → лабораторная', ['Цель работы: измерить сопротивление.', 'Оборудование', 'Мультиметр, резисторы.', 'Ход работы', 'Измерили сопротивление резисторов.', 'Вывод', 'Измерения совпали с номиналом.'], 'laba', 'structure'],
    ['без шапки, но слова «практическая работа» → практическая', ['Цель работы: в этой практической работе настроить сеть.', 'Задание', 'Настроить маршрутизатор.', 'Ход работы', 'Настроили маршрутизатор.', 'Вывод', 'Сеть работает.'], 'prakt', 'structure'],
    ['контрольная: вариант и задачи', ['Вариант 7', 'Задача 1', 'Найти производную функции.', 'Задача 2', 'Вычислить интеграл.', 'Задача 3', 'Решить уравнение.'], 'kontrol', 'structure'],
    ['статья: аннотация и ключевые слова', ['Защита персональных данных в вузе', 'Аннотация: в статье рассмотрены подходы к защите данных.', 'Ключевые слова: защита, данные, вуз.', 'Введение', 'Текст статьи.', 'Заключение', 'Итог.', 'Список литературы', 'Иванов И. И. Книга. – М., 2020.'], 'statya', 'structure'],
    ['курсовая по строке на титуле', [{ t: 'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ', jc: 'center' }, { t: 'КУРСОВАЯ РАБОТА', jc: 'center' }, 'по дисциплине «Сети»', 'на тему «Маршрутизация»', 'Выполнил: Иванов Иван Иванович', { t: 'Введение', page: true }, 'Текст.'], 'kursovaya', null],
    ['ВКР по строке на титуле', [{ t: 'ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА', jc: 'center' }, 'на тему «Система защиты»', 'РЕФЕРАТ', 'Отчёт 80 с.'], 'vkr', null],
    ['отчёт о практике', [{ t: 'ОТЧЕТ', jc: 'center' }, 'ОТЧЕТ о прохождении учебной практики', 'Место прохождения: САФУ'], 'praktika', null],
    ['НИР', ['ОТЧЕТ О НАУЧНО-ИССЛЕДОВАТЕЛЬСКОЙ РАБОТЕ', 'Реферат', 'Отчёт 40 с.'], 'nir', 'header'],
    ['эссе по шапке', ['Эссе', 'Почему я выбрал профессию', 'Я выбрал профессию потому что…'], 'esse', 'header'],
    ['шапка важнее слов в тексте («курсовая работа» в теле лабы)', ['Лабораторная работа №4', 'Цель работы: подготовиться к курсовой работе по сетям.'], 'laba', 'header'],
    ['пустой по признакам текст → реферат с низкой уверенностью', ['Просто текст без признаков.', 'Ещё один абзац текста.'], 'referat', 'default'],
    ['реферат по структуре без титула', ['Введение', 'Актуальность темы.', '1 Теория', 'Текст главы.', 'Заключение', 'Итоги.', 'Список использованных источников', 'Иванов И. И. Книга. – М., 2020.'], 'referat', 'structure'],
  ];
  for (const [name, key, kind, by] of G) await T('вид: ' + name, async () => { const g = await guess(key); eq(g.kind, kind, 'вид'); if (by) eq(g.by, by, 'основание'); });
  await T('вид: шапка даёт номер и тему', async () => { const g = await guess('METOD_PDF'); eq(g.header.num, '10'); eq(g.header.topic, 'Рассмотрение государственной политики в области информационной безопасности'); assert(g.conf >= .9); });
  await T('вид: титул из файла побеждает всё', async () => { const g = await guess('METOD_PDF', 'kursovaya'); eq([g.kind, g.by], ['kursovaya', 'title']); });
  await T('вид: guess() по-прежнему отдаёт строку', async () => eq(await page.evaluate(async () => WorkKinds.guess(await StoFixtures.docx(StoFixtures.METOD_PDF))), 'prakt'));
  await T('вид: битый файл не роняет определение', async () => eq((await page.evaluate(() => WorkKinds.guessDetailed(new Uint8Array([1, 2, 3]).buffer))).kind, 'referat'));

  /* ================= склейка строк из PDF ================= */
  const M = await fmt('METOD_PDF');
  const has = (ps, re) => ps.some(p => re.test(p.t));
  await T('PDF: «О стандартизации в Российской Федерации» — один абзац', () => assert(has(M.paras, /в Российской Федерации».*определение стандарта/), 'абзац разорван'));
  await T('PDF: хвост «Федерации» больше не отдельный абзац', () => assert(!M.paras.some(p => /^Федерации»/.test(p.t))));
  await T('PDF: «Требования».» приклеено к 2.2', () => assert(has(M.paras, /^2\.2\..*Требования»\.$/)));
  await T('PDF: разрыв строки внутри 2.3 заменён пробелом', () => { const p = M.paras.find(p => /^2\.3\./.test(p.t)); assert(p && !p.t.includes('⏎') && /подписи» \(стандарт ФСБ/.test(p.t), p && p.t); });
  await T('PDF: цель работы — один абзац из четырёх строк', () => assert(has(M.paras, /^1\. Цель работы: .*навыки работы с нормативными документами\.$/)));
  await T('PDF: «6.3 … 6.4 … 6.5 … 6.6» разделены по пунктам', () => { for (const k of ['6.3', '6.4', '6.5', '6.6']) assert(M.paras.some(p => p.t.startsWith(k + '.')), k); assert(!has(M.paras, /6\.3\..*6\.4\./)); });
  await T('PDF: пункты 3.1, 4.1 — не заголовки', () => { for (const k of ['3.1.', '3.2.', '4.1.', '4.2.', '5.1.']) { const p = M.paras.find(p => p.t.startsWith(k)); assert(p, k); assert(!/heading/i.test(p.style), k + ' стал заголовком'); } });
  await T('PDF: «(кроме закона № 162-ФЗ)» приклеено к 5.1', () => assert(has(M.paras, /^5\.1\..*литературы \(кроме закона/)));
  await T('PDF: тема из двух строк склеена', () => assert(has(M.paras, /^Рассмотрение государственной политики в области информационной безопасности$/)));
  await T('PDF: текст не потерян (буквы и цифры)', () => eq(page.evaluate ? M.paras.map(p => p.t).join('').replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').length : 0, M.src.map(p => p.t).join('').replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').length));
  await T('PDF: таблица на месте', () => assert(M.paras.some(p => p.tbl)));
  await T('PDF: в отчёте оформления есть строка про склейку', () => assert(M.report.some(r => /Склеены строки/.test(r)) && M.stats.unwrap >= 10, M.stats.unwrap));
  await T('PDF: склейку можно выключить', async () => { const r = await fmt('METOD_PDF', { unwrap: false }); eq(r.stats.unwrap, undefined); assert(r.paras.some(p => /^Федерации»/.test(p.t))); });
  const R = await fmt('REPORT_WORD');
  await T('Word: документ без разрывов не трогаем', () => eq(R.stats.unwrap, 0));
  const RF = await fmt('REFERAT');
  await T('Word: строки титульного листа не склеены', () => { eq(RF.stats.unwrap, 0); assert(RF.paras.some(p => p.t === 'высшего образования')); });
  await T('Word: заголовки 1 и 1.1 остались заголовками', () => { const a = RF.paras.find(p => /Первые экспедиции/.test(p.t)), b = RF.paras.find(p => /Ледоколы/.test(p.t)); assert(/Heading/i.test(a.style) && /Heading/i.test(b.style), a.style + ' / ' + b.style); });
  await T('Word: подраздел без стиля после текста — заголовок, после «:» — пункт', async () => {
    const r = await fmt(['Введение', 'Текст введения.', '1 Теория', 'Текст.', '1.1 Понятия', 'Текст раздела.', 'Задачи:', '1.2 Изучить источники', '1.3 Описать этапы', 'Заключение', 'Итог.']);
    const st = t => (r.paras.find(p => p.t.startsWith(t)) || {}).style || '';
    assert(/Heading/i.test(st('1.1 Понятия')), '1.1 должен быть заголовком'); assert(!/Heading/i.test(st('1.2 Изучить')), '1.2 после двоеточия — пункт'); assert(!/Heading/i.test(st('1.3 Описать')), '1.3 — тоже пункт'); });
  await T('Мало разрывов — склейка не включается', async () => { const r = await fmt(['Введение', 'Текст про', 'то самое.', 'Заключение', 'Итог.']); eq(r.stats.unwrap, 0); });
  await T('Перенос «инфор-/мации» снят', async () => { const r = await fmt(['Защита инфор-', 'мации — главная задача, и', 'её решают по', 'стандарту. Ещё', 'текст тут.']); assert(has(r.paras, /Защита информации – главная задача, и её решают по стандарту\. Ещё текст тут\./), JSON.stringify(r.paras.map(p => p.t))); });
  await T('Центрированные строки не склеиваются', async () => { const r = await fmt([{ t: 'ПРИЛОЖЕНИЕ А', jc: 'center' }, { t: '(обязательное)', jc: 'center' }, 'текст а', 'текст б', 'текст в', 'текст г.']); assert(r.paras.some(p => p.t === '(обязательное)')); });
  await T('Повторное оформление ничего не меняет', async () => { const again = await page.evaluate(async () => { const r1 = await Formatter.formatDocx(await StoFixtures.docx(StoFixtures.METOD_PDF), { profile: 'safu', toc: false });
      const b1 = await r1.blob.arrayBuffer(), r2 = await Formatter.formatDocx(b1.slice(0), { profile: 'safu', toc: false });
      return [JSON.stringify((await T_paras(b1)).map(p => p.t)), JSON.stringify((await T_paras(await r2.blob.arrayBuffer())).map(p => p.t)), r2.stats.unwrap]; });
    eq(again[1], again[0]); eq(again[2], 0); });

  /* ================= шапка → титульный лист ================= */
  const TD = { type: 'prakt', num: '10', topic: 'Рассмотрение государственной политики в области информационной безопасности', student: 'Зарубин Кирилл Вениаминович', group: '151621', course: '1', teacher: 'Конарский М. А.', year: '2026' };
  const H = await fmt('METOD_PDF', { titleXml: await titleXml(TD), dropHeader: true });
  await T('титул: «ПРАКТИЧЕСКАЯ РАБОТА № 10», а не «РЕФЕРАТ»', () => { assert(H.paras.some(p => /^ПРАКТИЧЕСКАЯ РАБОТА №\s?10$/.test(p.t))); assert(!H.paras.some(p => p.t === 'РЕФЕРАТ')); });
  await T('титул: тема из шапки', () => assert(has(H.paras, /На тему «Рассмотрение государственной политики в области информационной безопасности»/)));
  await T('титул: шапка из текста убрана, после титула сразу «1. Цель работы»', () => {
    assert(!H.paras.some(p => p.t === 'Практическая работа №10'), 'шапка осталась'); assert(!H.paras.some(p => p.t === 'Рассмотрение государственной политики в области информационной безопасности'), 'тема осталась');
    const i = H.paras.findIndex(p => /^Архангельск/.test(p.t)), next = H.paras.slice(i + 1).find(p => p.t); assert(/^1\. Цель работы/.test(next.t), next && next.t); });
  await T('титул: без dropHeader шапка остаётся', async () => { const r = await fmt('METOD_PDF', { titleXml: await titleXml(TD) }); assert(r.paras.some(p => p.t === 'Практическая работа №10')); });
  await T('титул: без титула dropHeader ничего не убирает', async () => { const r = await fmt('METOD_PDF', { dropHeader: true }); assert(r.paras.some(p => p.t === 'Практическая работа №10')); });
  await T('титул: у лабораторной номер, без номера — без «№»', async () => {
    const a = await titleXml({ type: 'laba', num: '3', topic: 'Х', student: 'И' }), b = await titleXml({ type: 'laba', topic: 'Х', student: 'И' });
    assert(/ЛАБОРАТОРНАЯ РАБОТА № 3/.test(a)); assert(/ЛАБОРАТОРНАЯ РАБОТА</.test(b) && !/РАБОТА №/.test(b)); });
  await T('титул: у реферата номер не печатается', async () => assert(!/№/.test(await titleXml({ type: 'referat', num: '5', topic: 'Х', student: 'И' }))));
  await T('readTitle узнаёт «ПРАКТИЧЕСКАЯ РАБОТА № 4» на титуле', async () => {
    const d = await page.evaluate(async () => Formatter.readTitle(await StoFixtures.docx([{ t: 'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ', jc: 'center' }, { t: 'ПРАКТИЧЕСКАЯ РАБОТА № 4', jc: 'center' }, 'По дисциплине «Сети»', 'На тему «Маршрутизация»', 'Выполнил обучающийся:', 'Иванов Иван Иванович', 'Архангельск 2026'])));
    eq([d.type, d.num, d.topic, d.discipline], ['prakt', '4', 'Маршрутизация', 'Сети']); });

  /* ===== выгрузка из Google Docs / Notion / Claude Docs: название документа, дата, «Титульный лист», потом сам титул ===== */
  const EXPORT = [{ t: 'Лабораторная работа №4', style: 'Heading1' }, 'Nov 17, 2026 · @kirill', { t: 'Титульный лист', style: 'Heading2' },
    'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ',
    'Федеральное государственное автономное образовательное учреждение высшего образования «Северный (Арктический) федеральный университет имени М. В. Ломоносова»',
    'Высшая школа информационных технологий и автоматизированных систем', { t: 'ОТЧЁТ ПО ЛАБОРАТОРНОЙ РАБОТЕ № 4', b: true },
    { t: '«Исследование процессов подготовки программ и сервисов»', b: true }, 'Дисциплина: ______________________',
    'Выполнил: студент 1 курса группы 151621, направление 10.03.01 «Информационная безопасность» Зарубин Кирилл Вениаминович',
    'Проверил: ______________________', 'Архангельск, 2026',
    { t: '1 Цель работы', style: 'Heading2' }, 'Изучить установку пакетов через dpkg.',
    { t: '2 Ход выполнения работы', style: 'Heading2' }, 'Содержимое поля Depends в ./pip_extracted/DEBIAN/control, пакет .deb и файл .gitignore.',
    { t: 'Depends: ca-certificates, python3-distutils', style: 'Code' },
    { t: '3 Ответы на контрольные вопросы', style: 'Heading2' },
    { t: '8.1 Каково принципиальное различие между dpkg -i и apt install?', b: true }, 'dpkg ставит только локальный файл.',
    { t: '8.5 Сравнение пакетных менеджеров', b: true }, 'Сравнение приведено ниже.',
    { t: '4 Вывод', style: 'Heading2' }, 'Пакет развёрнут.'];
  await T('выгрузка: readTitle берёт вид, номер, тему без «на тему» и пол по отчеству', async () => {
    const d = await page.evaluate(async x => Formatter.readTitle(await StoFixtures.docx(x)), EXPORT);
    eq([d.type, d.num, d.topic, d.student, d.gender, d.group], ['laba', '4', 'Исследование процессов подготовки программ и сервисов', 'Зарубин Кирилл Вениаминович', 'm', '151621']); });
  await T('readTitle: пол по отчеству — «…вна» женский, хотя написано «Выполнил»', async () => {
    const d = await page.evaluate(async () => Formatter.readTitle(await StoFixtures.docx(['МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ', 'РЕФЕРАТ', 'На тему «Арктика»', 'Выполнил: Иванова Мария Петровна', 'Архангельск 2026'])));
    eq([d.student, d.gender], ['Иванова Мария Петровна', 'f']); });
  const EX = await fmt(EXPORT, { titleXml: await titleXml({ type: 'laba', num: '4', topic: 'Исследование процессов подготовки программ и сервисов', student: 'Зарубин Кирилл Вениаминович', gender: 'm', group: '151621', course: '1', year: '2026' }) });
  await T('выгрузка: старый титул убран вместе с названием документа и датой', () => {
    for (const t of ['Лабораторная работа №4', 'Nov 17, 2026 · @kirill', 'Титульный лист', 'Проверил: ______________________']) assert(!EX.paras.some(p => p.t === t), 'остался «' + t + '»');
    assert(!EX.paras.some(p => /^отч[её]т по лабораторной/i.test(p.t)), 'остался «Отчёт по лабораторной работе»');
    eq(EX.paras.filter(p => /^Архангельск/.test(p.t)).length, 1, 'строк «Архангельск»'); eq(EX.paras.filter(p => /^МИНИСТЕРСТВО/.test(p.t)).length, 1, 'шапок министерства');
    const i = EX.paras.findIndex(p => /^Архангельск/.test(p.t)), next = EX.paras.slice(i + 1).find(p => p.t); eq(next.t, '1 Цель работы'); });
  await T('выгрузка: пути и расширения не склеены с предыдущим словом («в ./pip», «пакет .deb»)', () =>
    assert(has(EX.paras, /в \.\/pip_extracted\/DEBIAN\/control, пакет \.deb и файл \.gitignore\./), JSON.stringify(EX.paras.find(p => /Depends в/.test(p.t)))));
  await T('выгрузка: «8.1 …?» и «8.5 …» в главе 3 — пункты, а не заголовки', () => {
    for (const k of ['8.1 Каково', '8.5 Сравнение']) { const p = EX.paras.find(p => p.t.startsWith(k)); assert(p, k); assert(!/heading/i.test(p.style), k + ' стал заголовком'); }
    for (const k of ['1 Цель работы', '3 Ответы на контрольные вопросы', '4 Вывод']) assert(/heading/i.test((EX.paras.find(p => p.t === k) || {}).style || ''), k + ' перестал быть заголовком'); });
  await T('выгрузка: код со стилем «Code» — моноширинным шрифтом, слева, без отступа', async () => {
    const r = await page.evaluate(async x => { const res = await Formatter.formatDocx(await StoFixtures.docx(x), { profile: 'safu', toc: false });
      const files = await Formatter.unzip(await res.blob.arrayBuffer()), d = files.find(f => f.name === 'word/document.xml');
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(d.data), 'application/xml'), W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const p = [...doc.getElementsByTagNameNS(W, 'p')].find(p => p.textContent.startsWith('Depends:'));
      const f = p.getElementsByTagNameNS(W, 'rFonts')[0], jc = p.getElementsByTagNameNS(W, 'jc')[0], ind = p.getElementsByTagNameNS(W, 'ind')[0];
      return [f && f.getAttributeNS(W, 'ascii'), jc && jc.getAttributeNS(W, 'val'), ind && ind.getAttributeNS(W, 'firstLine')]; }, EXPORT);
    eq(r, ['Courier New', 'left', '0']); });

  /* ================= проверка по виду «Практическая работа» ================= */
  const kc = (paras, kind) => page.evaluate(async ([p, k]) => { const c = await WorkKinds.check(await StoFixtures.docx(p), k); return { ok: c.ok, errs: c.items.filter(x => x.level === 'err').map(x => x.part) }; }, [paras, kind]);
  await T('проверка: практическая без цели и вывода — ошибки', async () => { const c = await kc(['Задание', 'Настроить сеть.'], 'prakt'); assert(!c.ok); eq(c.errs.sort(), ['concl', 'goal']); });
  await T('проверка: «1. Цель работы:» с номером засчитывается', async () => { const c = await kc(['1. Цель работы: настроить сеть.', 'Задание', 'Настроить.', 'Вывод', 'Сеть настроена.'], 'prakt'); assert(c.ok, JSON.stringify(c)); });
  await T('проверка: у практической есть в списке видов', () => page.evaluate(() => !!WorkKinds.KINDS.prakt && WorkKinds.TO_TITLE.prakt === 'prakt' && !!StoTools.TITLE_TYPES.prakt).then(v => assert(v)));

  /* ================= страница ================= */
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await setup();
  await T('страница: по умолчанию открыто «Оформить по СТО»', async () => { eq(await page.evaluate(() => document.body.dataset.mode), 'sto'); assert(await page.isVisible('#sto')); assert(!(await page.isVisible('#check'))); });
  await T('страница: переключение на проверку и обратно, выбор запоминается', async () => {
    await page.click('#modes [data-mode=check]'); await page.waitForSelector('#check', { state: 'visible' }); assert(!(await page.isVisible('#sto')));   // смена шага — с анимацией перехода
    await page.reload({ waitUntil: 'load' }); await setup(); eq(await page.evaluate(() => document.body.dataset.mode), 'check');
    await page.click('#modes [data-mode=sto]'); await page.waitForSelector('#sto', { state: 'visible' }); });
  await T('страница: ссылка #check открывает проверку', async () => { await page.goto(base + '/antiplagiat/#check', { waitUntil: 'load' }); await setup(); eq(await page.evaluate(() => document.body.dataset.mode), 'check'); await page.click('#modes [data-mode=sto]'); });

  // старый титульник в браузере — от другой работы: тема и дисциплина не должны переехать
  await page.evaluate(() => localStorage.setItem('stoTitle', JSON.stringify({ topic: 'Работа со стипендиальной системой, достижения', discipline: 'Введение в профессию', type: 'referat',
    student: 'Зарубин Кирилл Вениаминович', group: '151621', course: '1', direction: '10.03.01 Информационная безопасность', teacher: 'Конарский М. А.' })));
  await page.evaluate(() => localStorage.setItem('arktika.pid', 'test-browser-0001'));
  await page.goto(base + '/antiplagiat/', { waitUntil: 'load' }); await setup();
  const metod = await fixture('prakt10.docx', 'METOD_PDF');
  await page.click('#modes [data-mode=sto]');
  await page.setInputFiles('#stoFile', metod);
  await page.waitForFunction(() => STO.kind && document.getElementById('kFound').textContent.length > 0, null, { timeout: 15000 })
    .catch(async e => { console.log('state:', metod, require('fs').statSync(metod).size, await page.evaluate(() => [STO.kind, STO.file && STO.file.name, stoErr.textContent, stoName.textContent, location.href]), errors); throw e; });
  await page.waitForTimeout(300);
  await T('страница: вид определён — «Практическая работа №10»', async () => { const t = await page.textContent('#kFound'); assert(/Практическая работа №10/.test(t) && /по заголовку/.test(t), t); });
  await T('страница: уверенно определённый вид не раскрывает список видов', async () => assert(!(await page.isVisible('#kChips'))));
  await T('страница: тема и дисциплина прошлой работы не переехали', async () => { const v = await page.evaluate(() => [tTopic.value, tDiscipline.value]); eq(v, ['Рассмотрение государственной политики в области информационной безопасности', '']); });
  await T('страница: вид титула и номер — из шапки', async () => eq(await page.evaluate(() => [tType.value, tNum.value]), ['prakt', '10']));
  await T('страница: ФИО и группа сохранились', async () => eq(await page.evaluate(() => [tStudent.value, tGroup.value]), ['Зарубин Кирилл Вениаминович', '151621']));
  await T('страница: карточка титула показывает тему и ФИО', async () => { const t = await page.textContent('#tSum'); assert(/Практическая работа №10/.test(t) && /Рассмотрение государственной/.test(t) && /Зарубин/.test(t), t); });
  await T('страница: тема и дисциплина не сохраняются в браузере', async () => { const s = await page.evaluate(() => JSON.parse(localStorage.getItem('stoTitle'))); assert(!s.topic && !s.discipline && !s.type && s.student, JSON.stringify(s)); });
  await T('страница: «Изменить» открывает виды, выбор меняет вид титула', async () => {
    await page.click('#kChange'); assert(await page.isVisible('#kChips'));
    await page.click('#kMore'); await page.click('#kChips [data-kind=laba]');
    eq(await page.evaluate(() => [STO.kind, tType.value]), ['laba', 'laba']); assert(/выбрано вручную/.test(await page.textContent('#kFound')));
    await page.click('#kChips [data-kind=prakt]'); });

  let sent = null; page.on('request', r => { if (r.url().endsWith('/pulse') && r.method() === 'POST') { const b = JSON.parse(r.postData() || '{}'); if (b.ev === 'sto') sent = b; } });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#stoGo')]).catch(async e => { console.log('run:', await page.evaluate(() => [stoErr.textContent, stoRes.textContent.slice(0, 200), stoGo.disabled])); throw e; });
  const outFile = path.join(tmp, 'out.docx'); await dl.saveAs(outFile);
  await page.waitForFunction(() => document.getElementById('stoCount').textContent.includes('1'), null, { timeout: 10000 }).catch(() => {});
  await T('страница: файл предлагается как «… (СТО САФУ).docx»', async () => { const n = await page.getAttribute('#stoDl', 'download'); assert(/^prakt10 \(СТО САФУ\)\.docx$/.test(n), n); });
  await T('страница: в файле титул практической с темой и без шапки в тексте', async () => {
    const ps = await page.evaluate(async b64 => T_paras(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer), fs.readFileSync(outFile).toString('base64'));
    assert(ps.some(p => /^ПРАКТИЧЕСКАЯ РАБОТА №\s?10$/.test(p.t)), 'нет заголовка титула'); assert(!ps.some(p => p.t === 'РЕФЕРАТ'), 'РЕФЕРАТ на титуле');
    assert(ps.some(p => /Рассмотрение государственной политики/.test(p.t)), 'нет темы'); assert(!ps.some(p => /стипендиальной/.test(p.t)), 'чужая тема');
    assert(!ps.some(p => p.t === 'Практическая работа №10'), 'шапка осталась в тексте'); });
  await T('статистика: страница отправила работу с видом и числом исправлений', () => { assert(sent, 'запрос не ушёл'); eq(sent.kind, 'prakt'); assert(sent.fixed > 0, 'fixed=' + sent.fixed); });
  await T('статистика: полоска на странице показывает сегодня, исправлено и всего', async () => { const t = await page.textContent('#stoCount'); assert(/1\s*работа сегодня/.test(t) && /1\s*работа всего/.test(t) && /нарушени/.test(t), t); });
  await T('страница: после оформления есть кнопка скачать', async () => assert(await page.isVisible('#stoDl')));
  await T('вид по имени файла: «Зарубин_КВ_ЛР3.docx» без шапки → лабораторная №3', async () => {
    const g = await page.evaluate(() => byFileName({ kind: 'referat', by: 'default', conf: .3 }, 'Зарубин_КВ_ЛР3_без_форматирования.docx')); eq([g.kind, g.by, g.header.num], ['laba', 'filename', '3']); });
  await T('вид по имени файла: шапка в тексте главнее имени', async () => eq(await page.evaluate(() => byFileName({ kind: 'prakt', by: 'header', conf: .95 }, 'ЛР3.docx').kind), 'prakt'));
  await T('вид по имени файла: «ПР-10 Сети», «Курсовая Иванов», «КР2»', async () => eq(await page.evaluate(() => ['ПР-10 Сети.docx', 'Курсовая Иванов.docx', 'КР2.docx', 'Документ1.docx', 'Проект.docx'].map(n => byFileName({ kind: 'referat', by: 'default', conf: .3 }, n).kind)), ['prakt', 'kursovaya', 'kontrol', 'referat', 'referat']));
  await T('старый титульник в браузере: тип и тема не восстанавливаются', async () => {
    await page.evaluate(() => localStorage.setItem('stoTitle', JSON.stringify({ type: 'praktika', topic: 'Старая тема', discipline: 'Старая', student: 'Иванов Иван' })));
    await page.reload({ waitUntil: 'load' }); await setup();
    eq(await page.evaluate(() => [tType.value !== 'praktika', tTopic.value, tDiscipline.value, tStudent.value]), [true, '', '', 'Иванов Иван']); });

  /* реферат с титулом: вид по титулу, тема из файла */
  await page.setInputFiles('#stoFile', await fixture('referat.docx', 'REFERAT'));
  await page.waitForFunction(() => document.getElementById('kFound').textContent.includes('Реферат'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  await T('страница: реферат определён по титулу, тема из файла', async () => { assert(/по титульному листу/.test(await page.textContent('#kFound'))); eq(await page.evaluate(() => [tType.value, tTopic.value, tDiscipline.value]), ['referat', 'Освоение Арктики в XX веке', 'История']); });

  /* неуверенный вид — список видов раскрыт сразу */
  await page.setInputFiles('#stoFile', await (async () => { const f = path.join(tmp, 'text.docx'); const b64 = await page.evaluate(async () => { const b = new Uint8Array(await StoFixtures.docx(['Просто текст.', 'Ещё текст.'])); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; })());
  await page.waitForFunction(() => document.getElementById('kFoundBox').classList.contains('unsure'), null, { timeout: 15000 }).catch(() => {});
  await T('страница: не уверен в виде — список видов раскрыт и карточка жёлтая', async () => { assert(await page.evaluate(() => document.getElementById('kFoundBox').classList.contains('unsure'))); assert(await page.isVisible('#kChips')); });
  await T('страница: нет ошибок JavaScript', () => eq(errors, []));

  /* мобильная ширина: ничего не вылезает за экран */
  await page.setViewportSize({ width: 390, height: 844 });
  await T('мобильный: страница не шире экрана', async () => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(w[0] <= w[1] + 1, JSON.stringify(w)); });

  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(fail ? `ПРОВАЛ: ${fail} из ${n}` : `${n} из ${n} проверок пройдено`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
