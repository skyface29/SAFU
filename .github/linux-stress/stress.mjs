// Стресс-тест Арктики для Linux: настоящее приложение (Electron) под виртуальным экраном, управление через Playwright.
// «Обезьяна» жмёт по всему интерфейсу, печатает мусор, крутит, тянет, меняет размер окна и тему системы, шлёт
// ссылки safu://, усыпляет и будит компьютер, убирает окно в трей. Отдельные этапы: первый запуск, без сети,
// убийство процесса на ходу, испорченное хранилище, вторые копии со ссылками, часовые пояса и «путешествия во времени».
// Итог — report.md (Markdown), при падениях — FAILED, если что-то не доделано — INCOMPLETE.
//
//   ARKTIKA_EXE=/opt/Арктика/arktika node stress.mjs out                 — установленный пакет
//   ARKTIKA_EXE=node_modules/electron/dist/electron ARKTIKA_APP=. ...    — сборка из исходников
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { _electron } = require(process.env.PLAYWRIGHT || 'playwright')

const OUT = path.resolve(process.argv[2] || 'stress-out')
const EXE = process.env.ARKTIKA_EXE
const APP = process.env.ARKTIKA_APP ? [path.resolve(process.env.ARKTIKA_APP)] : []
const EVENTS = Number(process.env.EVENTS || 3000)
const SEED = Number(process.env.SEED || Date.now() % 1_000_000_007)
const ONLY = (process.env.PHASES || '').split(',').filter(Boolean)
// под root песочница Chromium не запускается — это ограничение запуска от root, не приложения
const SANDBOX = process.getuid?.() === 0 ? ['--no-sandbox'] : []
if (!EXE) { console.error('ARKTIKA_EXE не задан'); process.exit(2) }

fs.rmSync(OUT, { recursive: true, force: true })
for (const d of ['logs', 'shots', 'homes', 'userdata']) fs.mkdirSync(path.join(OUT, d), { recursive: true })

// ---------- случайность с зерном: прогон можно повторить ----------
let seed = SEED >>> 0
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = a => a[Math.floor(rnd() * a.length)]
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TIMEOUT = Symbol('timeout')
const within = (p, ms) => Promise.race([Promise.resolve(p).catch(e => ({ __error: e })), sleep(ms).then(() => TIMEOUT)])

// ---------- что нашли ----------
const R = {
  phase: '',
  phases: [],          // { name, events, ms, launches, done }
  crashes: [],         // главный процесс завершился сам
  rendererGone: [],    // процесс окна упал (render-process-gone)
  childGone: [],       // GPU, утилиты
  hangs: [],           // не отвечает окно или главный процесс
  slow: [],            // ответило, но дольше 20 с
  fatal: [],           // экран «Что-то сломалось» / «Арктика не открылась»
  pageErrors: new Map(),
  consoleErrors: new Map(),
  mainErrors: new Map(),
  stderrFatal: new Map(),
  errorsLog: new Map(),
  startFail: [],       // не открылось после шага
  author: new Map(),   // имя автора в подсказках
  bus150: [],
  quits: [],           // приложение закрыли из интерфейса
  events: new Map(),   // счётчики событий главного процесса (диалоги, внешние ссылки…)
  memory: [],          // { phase, step, mb }
  screens: new Set(),
  startMs: [],
  siteConsole: 0,
  notes: []
}
const steps = fs.createWriteStream(path.join(OUT, 'steps.txt'))
const t0 = Date.now()
const stamp = () => `${String(Math.round((Date.now() - t0) / 1000)).padStart(5)} с`
function log(...a) { const s = `${stamp()} [${R.phase}] ${a.join(' ')}`; console.log(s); steps.write(s + '\n') }
function count(map, key, extra) {
  const k = String(key).slice(0, 400)
  const e = map.get(k) || { n: 0, phases: new Set(), extra }
  e.n += 1; e.phases.add(R.phase); map.set(k, e)
}
const recent = []
function did(what) { recent.push(what); if (recent.length > 14) recent.shift() }

// ---------- данные для запуска «как у студента» ----------
const DAY = 86_400_000
function seededStore() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const subjects = ['Математический анализ', 'Физика', 'Программирование на Python', 'История России', 'Иностранный язык (английский)',
    'Физическая культура и спорт', 'Очень длинное название дисциплины, которое не помещается ни в одну карточку и переносится на несколько строк 🙂',
    'Дискретная математика', 'Базы данных']
  const kinds = ['Лекция', 'Практическое занятие', 'Лабораторная работа', 'Консультация', 'Экзамен']
  const slots = [[8, 20], [10, 10], [12, 0], [14, 20], [16, 10], [18, 0]]
  const ruzEvents = []
  for (let d = -20; d <= 20; d++) {
    const day = today + d * DAY
    if (new Date(day).getDay() === 0) continue
    const n = (d * 7 + 3) % 4 + 1
    for (let i = 0; i < n; i++) {
      const [h, m] = slots[(i + (d & 1)) % slots.length]
      const start = day + (h * 60 + m) * 60_000
      ruzEvents.push({ start, end: start + 90 * 60_000, subject: subjects[(d + 20 + i * 3) % subjects.length], kind: kinds[(i + d + 20) % kinds.length],
        teacher: i % 3 ? 'Иванова Мария Петровна' : '', room: i % 4 ? `${200 + i * 13}` : '', address: i % 2 ? 'наб. Северной Двины, д. 17' : '', note: i === 2 ? 'Перенос с другого дня' : '' })
    }
  }
  // ещё пара, которая идёт прямо сейчас, и пара через полночь
  ruzEvents.push({ start: now.getTime() - 20 * 60_000, end: now.getTime() + 70 * 60_000, subject: 'Физика', kind: 'Лекция', teacher: 'Петров П. П.', room: '1220', address: 'ул. Смольный Буян, д. 1', note: '' })
  ruzEvents.push({ start: today + DAY + 23 * 3600_000 + 30 * 60_000, end: today + 2 * DAY + 60 * 60_000, subject: 'Ночная олимпиада', kind: 'Консультация', teacher: '', room: '', address: '', note: '' })
  ruzEvents.sort((a, b) => a.start - b.start)
  return {
    onboarded: true,
    'tour.seen': true,
    'user.first': 'Тест', 'user.last': 'Тестов', 'user.name': 'Тест Тестов', 'user.kind': 'student', 'user.role': 1,
    group: '151116',
    'schedule.v1': {
      lessons: [], buildings: [{ id: 'b1', name: 'А-НСД17', address: 'наб. Северной Двины, д. 17' }], semesterStart: today - 50 * DAY, history: {},
      source: 1, ruzGroupNumber: '151116', ruzInstitution: 3, ruzGroupID: '0', ruzEvents, lastSync: now.getTime() - 3600_000, syncInfo: '', teacherPrefs: {}
    },
    'bus.routes': [{ id: 'own-1', number: '42', homeCity: 'Новодвинск', homeStop: 'Центр', campusCity: 'Архангельск', campusStop: 'САФУ',
      travelMinutes: 45, leadMinutes: 20, colorHex: '3B82F6', toCampus: { weekday: '06:30 07:10 07:50 08:40 12:00', saturday: '08:00 10:00', sunday: '' },
      toHome: { weekday: '13:00 15:30 17:40 19:10 21:00', saturday: '14:00', sunday: '' }, mapLink: '', useGeo: false, builtIn: false }],
    'bus.active': 'own-1'
  }
}

let homeN = 0
function newHome(name, store) {
  const home = path.join(OUT, 'homes', `${String(++homeN).padStart(2, '0')}-${name}`)
  fs.mkdirSync(path.join(home, '.config', 'САФУ'), { recursive: true })
  if (store !== undefined) writeStore(home, store)
  return home
}
const userData = home => path.join(home, '.config', 'САФУ')
const storePath = home => path.join(userData(home), 'store.json')
function writeStore(home, store) { fs.writeFileSync(storePath(home), typeof store === 'string' || Buffer.isBuffer(store) ? store : JSON.stringify(store)) }

// ---------- запуск и сторожа ----------
let launchN = 0
async function launch(home, { env = {}, args = [], wait = true } = {}) {
  const n = ++launchN
  const logFile = fs.createWriteStream(path.join(OUT, 'logs', `${String(n).padStart(3, '0')}-${R.phase}.log`))
  const started = Date.now()
  const ea = await _electron.launch({
    executablePath: EXE,
    args: [...APP, ...SANDBOX, ...args],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), ...env },
    timeout: 120_000
  })
  const s = { n, ea, home, env, args, proc: ea.process(), exited: null, expectExit: false, page: null, phase: R.phase, logFile, tail: [] }
  const onData = d => {
    logFile.write(d)
    for (const line of String(d).split('\n')) {
      if (!line.trim()) continue
      s.tail.push(line); if (s.tail.length > 40) s.tail.shift()
      if (/FATAL:|Check failed|Segmentation fault|Trace\/breakpoint|Aborted|core dumped|A JavaScript error occurred/i.test(line)) count(R.stderrFatal, line.replace(/\[\d+:\d+\/\d+\.\d+:/, '[').trim())
    }
  }
  s.proc.stdout?.on('data', onData)
  s.proc.stderr?.on('data', onData)
  s.proc.on('exit', (code, signal) => { s.exited = { code, signal, at: Date.now() } })
  ea.on('window', p => attachPage(s, p))
  await within(installHooks(s), 20_000)
  s.page = await mainWindow(s)
  if (!s.page) throw new Error('окно не появилось')
  attachPage(s, s.page)
  if (wait) {
    const ok = await waitUI(s, 60_000)
    const ms = Date.now() - started
    R.startMs.push({ phase: R.phase, ms, ok })
    if (!ok) { R.startFail.push({ phase: R.phase, what: 'интерфейс не появился за 60 с', recent: [...recent] }); await shot(s, 'start-fail') }
  }
  return s
}

async function mainWindow(s) {
  for (let i = 0; i < 120; i++) {
    const p = s.ea.windows().find(w => !w.url().includes('#widget'))
    if (p) return p
    if (s.exited) return null
    await sleep(500)
  }
  return null
}

function attachPage(s, p) {
  if (p.__stress) return
  p.__stress = true
  const where = () => (p.url().includes('#widget') ? 'мини-окно' : 'окно')
  p.on('pageerror', e => count(R.pageErrors, `${where()}: ${e.name}: ${e.message}`, (e.stack || '').split('\n').slice(0, 8).join('\n')))
  p.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    // сеть в тесте бывает недоступна — неудачные запросы не считаем ошибкой приложения
    if (/net::ERR_|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_PROXY|ERR_CERT/.test(t)) return
    count(R.consoleErrors, `${where()}: ${t.replace(/\d{3,}/g, '#')}`)
  })
  p.on('dialog', d => { did(`диалог ${d.type()}`); (rnd() < 0.5 ? d.accept('тест') : d.dismiss()).catch(() => {}) })
  p.on('crash', () => log('страница упала (crash)'))
}

// Хуки в главном процессе: падения процессов, зависания, ошибки; системные окна выбора файлов и внешние
// ссылки не открываются по-настоящему (под виртуальным экраном их некому закрыть), а только записываются
async function installHooks(s) {
  await s.ea.evaluate(({ app, dialog, shell, webContents, session }) => {
    if (globalThis.__st) return
    const st = globalThis.__st = { ev: [], dropped: 0 }
    const push = (k, d) => { if (st.ev.length > 3000) { st.dropped++; return } st.ev.push({ t: Date.now(), k, d }) }
    const who = wc => { try { return `${wc.getType()} ${String(wc.getURL()).replace(/^file:.*\/dist\//, 'app/').slice(0, 100)}` } catch { return '?' } }
    app.on('render-process-gone', (_e, wc, d) => push('render-gone', { wc: who(wc), reason: d.reason, code: d.exitCode }))
    app.on('child-process-gone', (_e, d) => push('child-gone', { type: d.type, reason: d.reason, code: d.exitCode, name: d.name || d.serviceName || '' }))
    const watch = wc => {
      wc.on('unresponsive', () => push('unresponsive', who(wc)))
      wc.on('responsive', () => push('responsive', who(wc)))
      wc.on('preload-error', (_e, p, err) => push('preload-error', `${p}: ${err && err.stack || err}`))
      wc.on('console-message', (e, level) => { const l = typeof level === 'number' ? level : e && e.level; if (wc.getType() === 'webview' && (l === 3 || l === 'error')) push('site-console', '') })
    }
    webContents.getAllWebContents().forEach(watch)
    app.on('web-contents-created', (_e, wc) => watch(wc))
    process.on('uncaughtException', e => push('main-exception', String(e && e.stack || e)))
    process.on('unhandledRejection', e => push('main-rejection', String(e && e.stack || e)))
    const stub = (obj, name, ret, label) => { obj[name] = (...a) => { push('event', label || name); return typeof ret === 'function' ? ret(...a) : ret } }
    stub(dialog, 'showOpenDialog', () => Promise.resolve({ canceled: true, filePaths: [] }), 'окно «Открыть файл»')
    stub(dialog, 'showOpenDialogSync', undefined, 'окно «Открыть файл»')
    stub(dialog, 'showSaveDialog', () => Promise.resolve({ canceled: true, filePath: '' }), 'окно «Сохранить файл»')
    stub(dialog, 'showSaveDialogSync', undefined, 'окно «Сохранить файл»')
    stub(dialog, 'showMessageBox', () => Promise.resolve({ response: Math.random() < 0.5 ? 0 : 1, checkboxChecked: false }), 'системный вопрос')
    stub(dialog, 'showMessageBoxSync', () => (Math.random() < 0.5 ? 0 : 1), 'системный вопрос')
    stub(dialog, 'showErrorBox', undefined, 'системное окно ошибки')
    stub(shell, 'openExternal', () => Promise.resolve(), 'ссылка во внешнем браузере')
    stub(shell, 'openPath', () => Promise.resolve(''), 'открыть файл или папку')
    stub(shell, 'showItemInFolder', undefined, 'показать в папке')
    // перезапуск из интерфейса запустил бы копию мимо теста — её запускает сам тест
    stub(app, 'relaunch', undefined, 'перезапуск из интерфейса')
    app.on('before-quit', () => push('before-quit', new Error('quit').stack.split('\n').slice(2, 8).map(x => x.trim()).join(' ← ')))
    st.offline = on => {
      const all = new Set([session.defaultSession, ...webContents.getAllWebContents().map(w => w.session)])
      for (const ss of all) { try { on ? ss.enableNetworkEmulation({ offline: true }) : ss.disableNetworkEmulation() } catch {} }
    }
    app.on('session-created', ss => { if (st.isOffline) { try { ss.enableNetworkEmulation({ offline: true }) } catch {} } })
  })
}

const mainEval = (s, fn, arg, ms = 20_000) => within(s.ea.evaluate(fn, arg), ms)

// события главного процесса — в общий итог
async function drain(s) {
  if (s.exited) return
  const r = await mainEval(s, () => { const e = globalThis.__st ? globalThis.__st.ev : []; if (globalThis.__st) globalThis.__st.ev = []; return e }, undefined, 15_000)
  if (r === TIMEOUT || !Array.isArray(r)) return r
  for (const e of r) {
    if (e.k === 'render-gone') { R.rendererGone.push({ phase: R.phase, ...e.d, recent: [...recent] }); log(`окно упало: ${e.d.reason} ${e.d.code} ${e.d.wc}`); await shot(s, 'render-gone') }
    else if (e.k === 'child-gone') { if (e.d.reason !== 'clean-exit' && e.d.reason !== 'killed') { R.childGone.push({ phase: R.phase, ...e.d }); log(`процесс ${e.d.type} упал: ${e.d.reason}`) } }
    else if (e.k === 'unresponsive') { R.hangs.push({ phase: R.phase, what: `Chromium: окно не отвечает (${e.d})`, recent: [...recent] }); log(`не отвечает: ${e.d}`) }
    else if (e.k === 'main-exception' || e.k === 'main-rejection') count(R.mainErrors, `${e.k === 'main-exception' ? 'исключение' : 'необработанный промис'}: ${String(e.d).split('\n').slice(0, 4).join(' | ')}`)
    else if (e.k === 'preload-error') count(R.mainErrors, `preload: ${e.d}`)
    else if (e.k === 'event') count(R.events, e.d)
    else if (e.k === 'site-console') R.siteConsole += 1
    else if (e.k === 'before-quit') s.quitStack = e.d
  }
  return r
}

async function waitUI(s, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (s.exited) return false
    const r = await within(s.page.evaluate(() => {
      const root = document.getElementById('root')
      return { ok: !!root && root.children.length > 0 && document.body.innerText.trim().length > 10, text: document.body.innerText.slice(0, 200) }
    }), 5000)
    if (r && r !== TIMEOUT && r.ok) return true
    await sleep(500)
  }
  return false
}

let shotN = 0
async function shot(s, name) {
  if (!s?.page || s.exited || shotN > 160) return
  const f = path.join(OUT, 'shots', `${String(++shotN).padStart(3, '0')}-${R.phase}-${name}.jpg`)
  await within(s.page.screenshot({ path: f, type: 'jpeg', quality: 55 }), 12_000)
}

async function close(s) {
  if (!s || s.exited) return
  s.expectExit = true
  await drain(s)
  // обычный выход (как «Выход» в трее): Playwright зовёт app.quit() и отключается от процесса
  await within(s.ea.close(), 20_000)
  for (let i = 0; i < 20 && !s.exited; i++) await sleep(250)
  if (!s.exited) { try { process.kill(s.proc.pid, 'SIGKILL') } catch {} await sleep(500) }
  collectLog(s.home)
}

function collectLog(home) {
  const f = path.join(userData(home), 'logs', 'errors.log')
  if (!fs.existsSync(f)) return
  const text = fs.readFileSync(f, 'utf8')
  const done = (collectLog.seen ||= new Map()).get(f) || 0
  for (const line of text.slice(done).split('\n')) {
    const m = line.match(/^\[[^\]]+\] (.*)$/)
    if (!m) continue
    // «renderer: …» — это те же ошибки окна, что уже посчитаны по pageerror; оставляем остальные
    if (m[1].startsWith('renderer: ')) continue
    count(R.errorsLog, m[1].replace(/\d{2,}/g, '#').slice(0, 300))
  }
  collectLog.seen.set(f, text.length)
}

// ---------- проверки после шагов ----------
const FATAL_TEXT = /Что-то сломалось в интерфейсе|Арктика не открылась/
const AUTHOR = /Кирилл|Зарубин|151621/
async function health(s, where = '') {
  if (s.exited) return 'exited'
  let t = Date.now()
  let r = await within(s.page.evaluate(() => ({
    text: document.body ? document.body.innerText.slice(0, 20000) : '',
    heads: [...document.querySelectorAll('h1, h2')].map(h => h.textContent.trim()).filter(Boolean).slice(0, 2),
    ph: [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].map(i => i.placeholder),
    reg: !!document.querySelector('input') && /Привет!|Как тебя зовут|Твоя группа|Начать/.test(document.body.innerText.slice(0, 3000))
  })), 20_000)
  if (r === TIMEOUT || r?.__error) {
    if (s.exited) return 'exited'
    // второй шанс: под виртуальным экраном без видеокарты тяжёлые экраны рисуются медленно
    r = await within(s.page.evaluate(() => ({ text: document.body.innerText.slice(0, 20000), heads: [], ph: [], reg: false })), 25_000)
    if (r === TIMEOUT || r?.__error) {
      if (s.exited) return 'exited'
      const main = await mainEval(s, () => 1, undefined, 10_000)
      R.hangs.push({ phase: R.phase, what: `окно не отвечает больше 45 с${main === TIMEOUT ? ', главный процесс тоже' : ''} ${where}`, recent: [...recent] })
      log('ЗАВИСАНИЕ окна', where)
      return 'hang'
    }
    R.slow.push({ phase: R.phase, ms: Date.now() - t, recent: [...recent] })
  }
  const main = await mainEval(s, () => 1, undefined, 20_000)
  if (main === TIMEOUT) {
    if (s.exited) return 'exited'
    R.hangs.push({ phase: R.phase, what: `главный процесс не отвечает 20 с ${where}`, recent: [...recent] })
    log('ЗАВИСАНИЕ главного процесса', where)
    return 'hang'
  }
  for (const h of r.heads || []) if (h.length < 60) R.screens.add(h)
  for (const ph of r.ph || []) if (AUTHOR.test(ph)) count(R.author, `подсказка поля: «${ph}»`)
  if (r.reg && AUTHOR.test(r.text.slice(0, 3000))) count(R.author, `экран регистрации: ${r.text.match(new RegExp(`.{0,40}${AUTHOR.source}.{0,40}`))?.[0]}`)
  // «Автобус 150» — ещё и название игры на перемену: это не маршрут, его не считаем
  const noGame = r.text.replace(/Автобус 150\s*[·\n ]*\s*Игра на перемену|Автобус 150\s*\n?\s*Доберись до Архангельска/g, '')
  const b150 = noGame.match(/(Автобус|автобус|№)\s*150\b|\b150-?й\b/)
  if (b150) R.bus150.push({ phase: R.phase, text: noGame.slice(Math.max(0, b150.index - 60), b150.index + 60).replace(/\s+/g, ' ') })
  if (FATAL_TEXT.test(r.text)) {
    const msg = r.text.split('\n').filter(Boolean).slice(-1)[0]
    R.fatal.push({ phase: R.phase, msg, recent: [...recent] })
    log('ЭКРАН ОШИБКИ:', msg)
    await shot(s, 'fatal')
    // как сделал бы человек: «Попробовать ещё раз»
    await within(s.page.getByText('Попробовать ещё раз').first().click({ timeout: 5000 }), 8000)
    await sleep(3000)
  }
  s.regShown = r.reg
  return 'ok'
}

// ---------- «обезьяна» ----------
const TEXTS = ['Математика', 'Физика', 'тест', 'Иван', 'Иванов', '151116', '', ' ', '   \t ', 'а'.repeat(300), 'ы'.repeat(4000),
  '🙂🐻‍❄️👨‍👩‍👧‍👦', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"; DROP TABLE hw; --', "'", '\\', '%s%n%x%d', '{{7*7}}', '${7*7}',
  '../../../etc/passwd', '‮перевёрнуто', '\u0000нуль', 'null', 'undefined', 'NaN', '-1', '0', '99999999999999999999999', '1e308', '-0',
  '12:60', '25:00', '00:00', '23:59', '31.02.2026', '29.02.2027', '01.01.1970', '2038-01-19', 'https://example.com/?q=1&b=2', 'safu://hw:../../x',
  'mailto:test@example.com', 'test@', 'a@b', 'imap.example.com', '8.8.8.8', 'localhost:0', 'Ⅻ٣३', 'ДЗ: решить №1–20, стр. 45', '\n\n\n', 'Ёжик в тумане']
const KEYS = ['Escape', 'Escape', 'Enter', 'Enter', 'Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete',
  'Home', 'End', 'PageDown', 'PageUp', 'Space', 'Control+a', 'Control+c', 'Control+v', 'Control+x', 'Control+z', 'Control+Shift+z', 'Control+f',
  'Control+n', 'Control+1', 'Control+2', 'Control+3', 'Control+4', 'Control+5', 'Control+6', 'Control+7', 'Control+8', 'Control+Comma',
  'Alt+ArrowLeft', 'Alt+ArrowRight', 'Control+Equal', 'Control+Minus', 'Control+0', 'F11', 'Control+k', 'Control+s', 'Control+p']
const RARE_KEYS = ['F5', 'Control+r', 'Control+Shift+r', 'Control+w', 'Control+q', 'Alt+F4']
const ROUTES = ['home', 'schedule', 'homework', 'tasks', 'files', 'profile', 'boards', 'mail', 'sync', 'changes', 'hw', 'homework-new',
  'hwdone:nope', 'hwdone:', 'hw:nope', 'hw:', 'hwnew:0:Физика', 'hwnew:abc:', `hwnew:${Date.now()}:Математика:анализ`, 'site:nope', 'site:sakai',
  'site:mail', 'site:', 'pair?subject=Физика', 'pair?subject=', 'pair', 'schedule/../../x', '', '/', '%E0%A4%A', 'x'.repeat(5000)]
const CLIPS = ['Физика 10:00', 'https://ruz.narfu.ru/?timetable&group=151116', 'safu://hw', '{"bus":1}', 'АВТОБУС:42:06:30 07:10', '', 'q'.repeat(100000), '🙂']

async function candidates(p) {
  return within(p.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = []
    const seen = new Set()
    const add = el => {
      if (seen.has(el) || out.length > 400) return
      seen.add(el)
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return
      const r = el.getBoundingClientRect()
      if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 || r.top > H || r.left > W) return
      const x = Math.min(W - 2, Math.max(1, r.left + r.width * (0.2 + Math.random() * 0.6)))
      const y = Math.min(H - 2, Math.max(1, r.top + r.height * (0.2 + Math.random() * 0.6)))
      const top = document.elementFromPoint(x, y)
      if (!top || !(top === el || el.contains(top) || top.contains(el))) return
      const tag = el.tagName.toLowerCase()
      out.push({ x, y, tag, input: tag === 'input' || tag === 'textarea' || el.isContentEditable, type: el.type || '',
        text: (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40) })
    }
    document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=option], input, textarea, select, summary, label, [contenteditable=true], [tabindex]:not([tabindex="-1"]), webview').forEach(add)
    let n = 0
    for (const el of document.querySelectorAll('div, span, li, img, svg, p')) {
      if (++n > 4000) break
      if (getComputedStyle(el).cursor === 'pointer') add(el)
    }
    return { list: out, W, H }
  }), 15_000)
}

async function act(s) {
  const p = s.page
  const r = rnd()
  if (r < 0.47) {
    const c = await candidates(p)
    if (c === TIMEOUT) return 'timeout'
    if (!c || c.__error || !c.list.length) { did('пусто — клик в случайное место'); return p.mouse.click(int(5, 1200), int(5, 780)) }
    const el = pick(c.list)
    did(`клик «${el.text || el.tag}»`)
    await p.mouse.click(el.x, el.y)
    if (el.input && rnd() < 0.75) {
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'range' || el.type === 'color' || el.type === 'file') return
      const t = pick(TEXTS)
      did(`ввод «${t.slice(0, 20)}»`)
      if (rnd() < 0.4) await p.keyboard.press('Control+a')
      if (t.length > 40) await p.keyboard.insertText(t)
      else await p.keyboard.type(t, { delay: 5 })
      if (rnd() < 0.35) await p.keyboard.press('Enter')
    }
    return
  }
  if (r < 0.55) { const x = int(1, 1270), y = int(1, 810); did(`клик ${x},${y}`); return p.mouse.click(x, y) }
  if (r < 0.62) { const t = pick(TEXTS); did(`печать «${t.slice(0, 20)}»`); return t.length > 40 ? p.keyboard.insertText(t) : p.keyboard.type(t, { delay: 3 }) }
  if (r < 0.71) { const k = rnd() < 0.02 ? pick(RARE_KEYS) : pick(KEYS); did(`клавиша ${k}`); return p.keyboard.press(k) }
  if (r < 0.79) { const dy = pick([-1200, -400, -100, 100, 300, 800, 2500]); did(`прокрутка ${dy}`); await p.mouse.move(int(100, 1200), int(60, 780)); return p.mouse.wheel(pick([0, 0, 0, -200, 200]), dy) }
  if (r < 0.83) {
    const x = int(50, 1200), y = int(50, 780), x2 = x + int(-400, 400), y2 = y + int(-300, 300)
    did(`тянуть ${x},${y} → ${x2},${y2}`)
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x2, y2, { steps: int(2, 12) }); return p.mouse.up()
  }
  if (r < 0.85) { const x = int(1, 1270), y = int(1, 810); did(`двойной клик ${x},${y}`); return p.mouse.dblclick(x, y) }
  if (r < 0.865) { const x = int(1, 1270), y = int(1, 810); did(`правый клик ${x},${y}`); await p.mouse.click(x, y, { button: 'right' }); await sleep(200); return p.keyboard.press('Escape') }
  if (r < 0.885) {
    const how = pick(['size', 'size', 'min', 'max', 'unmax', 'fullscreen', 'unfullscreen'])
    const w = int(600, 1600), h = int(400, 1000)
    did(`окно: ${how} ${how === 'size' ? `${w}×${h}` : ''}`)
    return mainEval(s, ({ BrowserWindow }, a) => {
      const win = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget'))
      if (!win) return
      if (a.how === 'size') { win.unmaximize(); win.setSize(a.w, a.h) }
      else if (a.how === 'min') win.minimize()
      else if (a.how === 'max') win.maximize()
      else if (a.how === 'unmax') { win.unmaximize(); win.restore() }
      else win.setFullScreen(a.how === 'fullscreen')
      if (a.how !== 'min') win.show()
    }, { how, w, h })
  }
  if (r < 0.905) { const route = pick(ROUTES); did(`ссылка safu://${route.slice(0, 30)}`); return mainEval(s, ({ BrowserWindow }, route) => { const w = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget')); w?.webContents.send('app:route', route) }, route) }
  if (r < 0.915) { const t = pick(['dark', 'light', 'system']); did(`тема системы ${t}`); return mainEval(s, ({ nativeTheme }, t) => { nativeTheme.themeSource = t }, t) }
  if (r < 0.93) {
    const ev = pick(['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery'])
    did(`система: ${ev}`)
    return mainEval(s, ({ powerMonitor }, ev) => { powerMonitor.emit(ev) }, ev)
  }
  if (r < 0.94) { const t = pick(CLIPS); did(`буфер обмена «${t.slice(0, 20)}»`); return mainEval(s, ({ clipboard }, t) => { clipboard.writeText(t) }, t) }
  if (r < 0.95) {
    const how = pick(['hide', 'blur', 'minimize'])
    did(`окно убрано: ${how}`)
    await mainEval(s, ({ BrowserWindow }, how) => { const w = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget')); if (w) { how === 'hide' ? w.hide() : how === 'blur' ? w.blur() : w.minimize() } }, how)
    await sleep(int(200, 3000))
    return mainEval(s, ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget')); if (w) { w.restore(); w.show(); w.focus() } })
  }
  if (r < 0.96) { did('мини-окно пары'); return within(p.evaluate(() => window.safu?.widget?.toggle()), 8000) }
  if (r < 0.975) { did('пауза'); return sleep(int(500, 4000)) }
  { const k = pick(['Control+1', 'Control+2', 'Control+3', 'Control+4', 'Control+5', 'Control+6', 'Control+7', 'Control+8', 'Control+Comma']); did(`раздел ${k}`); return p.keyboard.press(k) }
}

// окно ушло в трей или свернулось — возвращаем, как человек из меню приложений
async function ensureShown(s) {
  const st = await mainEval(s, ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget'))
    if (!w) return 'none'
    const was = w.isVisible() && !w.isMinimized() ? 'ok' : 'hidden'
    if (was !== 'ok') { w.restore(); w.show() }
    return was
  }, undefined, 10_000)
  if (st === 'hidden') count(R.events, 'окно ушло в трей или свернулось — вернули')
  return st
}

/** Прогон «обезьяны»: N действий, проверка каждые 25, при выходе — перезапуск */
async function monkey(s, n, { relaunchEnv = {}, label = '' } = {}) {
  let done = 0
  let lastMem = 0
  while (done < n) {
    if (s.exited) {
      s = await afterExit(s, relaunchEnv)
      if (!s) return { s: null, done }
      continue
    }
    const res = await within(act(s), 25_000)
    done += 1
    if (res === TIMEOUT) {
      if (!s.exited) {
        const h = await health(s, `после «${recent[recent.length - 1]}»`)
        if (h === 'hang') { await shot(s, 'hang'); s = await restart(s, relaunchEnv, 'зависание'); if (!s) return { s: null, done } }
      }
      continue
    }
    if (done % 25 === 0 || res?.__error?.message?.includes('Target')) {
      await sleep(150)
      const h = await health(s, label)
      await drain(s)
      if (h === 'hang') { await shot(s, 'hang'); s = await restart(s, relaunchEnv, 'зависание'); if (!s) return { s: null, done }; continue }
      if (!s.exited) {
        const st = await ensureShown(s)
        if (st === 'none') { log('главного окна нет — перезапуск'); s = await restart(s, relaunchEnv, 'нет окна'); if (!s) return { s: null, done } }
      }
    }
    if (done % 250 === 0 && !s.exited) {
      const m = await mainEval(s, ({ app }) => app.getAppMetrics().reduce((a, x) => a + (x.memory?.workingSetSize || 0), 0), undefined, 10_000)
      if (typeof m === 'number') { R.memory.push({ phase: R.phase, step: done, mb: Math.round(m / 1024) }); lastMem = m }
      log(`${done}/${n} действий, память ${Math.round(lastMem / 1024)} МБ, экранов ${R.screens.size}`)
      if (done % 1000 === 0) await shot(s, `step${done}`)
    }
  }
  return { s, done }
}

async function afterExit(s, env) {
  await sleep(300)
  const e = s.exited
  collectLog(s.home)
  if (!s.expectExit) {
    const quit = s.quitStack
    if (quit && e.code === 0) {
      R.quits.push({ phase: R.phase, recent: [...recent], stack: quit })
      log(`приложение закрыли из интерфейса (${recent.slice(-1)[0]})`)
    } else {
      R.crashes.push({ phase: R.phase, code: e.code, signal: e.signal, recent: [...recent], tail: s.tail.slice(-15), quit })
      log(`ПАДЕНИЕ главного процесса: код ${e.code} сигнал ${e.signal}`)
    }
  }
  try { return await launch(s.home, { env: s.env, args: s.args }) } catch (err) {
    R.startFail.push({ phase: R.phase, what: `не запустилось после выхода: ${err.message.split('\n')[0]}`, recent: [...recent] })
    return null
  }
}

async function restart(s, env, why) {
  log(`перезапуск: ${why}`)
  s.expectExit = true
  try { process.kill(s.proc.pid, 'SIGKILL') } catch {}
  for (let i = 0; i < 20 && !s.exited; i++) await sleep(250)
  collectLog(s.home)
  try { return await launch(s.home, { env: s.env, args: s.args }) } catch (err) {
    R.startFail.push({ phase: R.phase, what: `не запустилось после «${why}»: ${err.message.split('\n')[0]}`, recent: [...recent] })
    return null
  }
}

// ---------- этапы ----------
const PHASES = []
const phase = (name, title, fn) => PHASES.push({ name, title, fn })

phase('first-run', 'Первый запуск и регистрация', async () => {
  const home = newHome('first-run')
  let s = await launch(home)
  await shot(s, 'start')
  await health(s, 'первый запуск')
  // регистрация как у человека: имя, группа, «Начать» — и случайные нажатия
  const r = await monkey(s, Math.round(EVENTS * 0.12))
  await close(r.s)
  return r.done
})

phase('main', 'Основной прогон по всему приложению', async () => {
  const home = newHome('main', seededStore())
  let s = await launch(home)
  await shot(s, 'start')
  const r = await monkey(s, EVENTS)
  if (r.s) { fs.copyFileSync(storePath(home), path.join(OUT, 'userdata', 'store-after-main.json')); await shot(r.s, 'end') }
  await close(r.s)
  return r.done
})

phase('offline', 'Без сети', async () => {
  const home = newHome('offline', seededStore())
  let s = await launch(home)
  await mainEval(s, () => { globalThis.__st.isOffline = true; globalThis.__st.offline(true) })
  let done = 0
  // сеть пропадает и возвращается посреди работы
  for (let k = 0; k < 4 && s; k++) {
    const r = await monkey(s, Math.round(EVENTS * 0.06))
    done += r.done; s = r.s
    if (s) await mainEval(s, (_e, on) => { globalThis.__st.isOffline = on; globalThis.__st.offline(on) }, k % 2 === 1)
  }
  await close(s)
  return done
})

phase('kill', 'Убийство процесса на ходу', async () => {
  const home = newHome('kill', seededStore())
  let done = 0
  for (let k = 0; k < 8; k++) {
    let s
    try { s = await launch(home) } catch (e) { R.startFail.push({ phase: R.phase, what: `не запустилось после kill -9 (${k}): ${e.message.split('\n')[0]}`, recent: [...recent] }); break }
    // хранилище после убийства должно читаться и не терять регистрацию
    const st = fs.existsSync(storePath(home)) ? fs.readFileSync(storePath(home), 'utf8') : ''
    try { const j = JSON.parse(st); if (!j.onboarded) R.notes.push(`после kill -9 №${k} пропала отметка регистрации`) } catch { R.notes.push(`после kill -9 №${k} store.json не читается (${st.length} байт)`) }
    const r = await monkey(s, Math.round(EVENTS * 0.03))
    done += r.done
    if (!r.s) break
    await sleep(int(0, 1600))
    r.s.expectExit = true
    await drain(r.s)
    did(`kill -9 №${k}`)
    try { process.kill(r.s.proc.pid, 'SIGKILL') } catch {}
    for (let i = 0; i < 20 && !r.s.exited; i++) await sleep(250)
    collectLog(home)
  }
  return done
})

phase('store', 'Испорченное хранилище', async () => {
  const base = fs.existsSync(path.join(OUT, 'userdata', 'store-after-main.json'))
    ? JSON.parse(fs.readFileSync(path.join(OUT, 'userdata', 'store-after-main.json'), 'utf8')) : seededStore()
  const wrong = v => pick(Array.isArray(v) ? ['строка', 5, { a: 1 }, null, true] : typeof v === 'object' && v ? ['строка', 5, [1, 2], null, false]
    : typeof v === 'string' ? [5, [], {}, null, true] : typeof v === 'number' ? ['5', [], {}, null, -1e308] : ['да', 0, [], {}])
  const variants = {
    'мусор': Buffer.from(Array.from({ length: 4096 }, () => int(0, 255))),
    'пустой файл': '',
    'обрезан посередине': JSON.stringify(base).slice(0, Math.round(JSON.stringify(base).length / 2)),
    'не объект': '[1,2,3]',
    'null': 'null',
    'чужие типы у трети ключей': Object.fromEntries(Object.entries(base).map(([k, v]) => [k, k === 'onboarded' || rnd() < 0.67 ? v : wrong(v)])),
    'огромное значение': { ...base, 'notes.v1': 'x'.repeat(30_000_000) }
  }
  let done = 0
  for (const [name, store] of Object.entries(variants)) {
    did(`хранилище: ${name}`)
    log(`хранилище: ${name}`)
    const home = newHome('store', store)
    // и запасная копия испорчена так же — худший случай
    if (name === 'мусор') fs.writeFileSync(storePath(home) + '.bak', store)
    let s
    try { s = await launch(home) } catch (e) { R.startFail.push({ phase: R.phase, what: `${name}: не запустилось: ${e.message.split('\n')[0]}`, recent: [...recent] }); continue }
    await health(s, name)
    await shot(s, name.replace(/\s+/g, '_'))
    const r = await monkey(s, Math.round(EVENTS * 0.04), { label: name })
    done += r.done
    await close(r.s)
    if (name === 'огромное значение') for (const f of [storePath(home), storePath(home) + '.bak']) fs.rmSync(f, { force: true })
  }
  return done
})

phase('links', 'Вторая копия и ссылки safu://', async () => {
  const home = newHome('links', seededStore())
  let s = await launch(home)
  let done = 0
  const links = [...ROUTES.map(r => `safu://${r}`), 'safu:', 'safu:///', 'safu://' + '🙂'.repeat(500), '--hidden', 'safu://home --disable-gpu', 'safu://hw:"; rm -rf ~']
  for (const link of links) {
    if (!s || s.exited) break
    did(`вторая копия с «${link.slice(0, 30)}»`)
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }
    const second = spawn(EXE, [...APP, ...SANDBOX, link], { env, stdio: 'ignore' })
    const exited = await new Promise(res => { const tm = setTimeout(() => res(false), 20_000); second.on('exit', () => { clearTimeout(tm); res(true) }) })
    if (!exited) { R.hangs.push({ phase: R.phase, what: `вторая копия с «${link.slice(0, 40)}» не закрылась за 20 с`, recent: [...recent] }); try { second.kill('SIGKILL') } catch {} }
    await sleep(800)
    const h = await health(s, link.slice(0, 40))
    if (h === 'hang') { s = await restart(s, {}, 'зависание'); continue }
    const r = await monkey(s, 12)
    done += r.done + 1; s = r.s
  }
  // трей: окно закрыли — оно прячется, вторая копия возвращает его
  for (let k = 0; k < 5 && s && !s.exited; k++) {
    did('закрыть окно (в трей)')
    await mainEval(s, ({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().includes('#widget'))?.close() })
    await sleep(1000)
    if (s.exited) break
    spawn(EXE, [...APP, ...SANDBOX], { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }, stdio: 'ignore' })
    await sleep(2500)
    const vis = await mainEval(s, ({ BrowserWindow }) => BrowserWindow.getAllWindows().some(x => !x.webContents.getURL().includes('#widget') && x.isVisible()))
    if (vis === false) R.notes.push('после закрытия в трей вторая копия не вернула окно')
    const r = await monkey(s, 20)
    done += r.done; s = r.s
  }
  await close(s)
  return done
})

phase('zones', 'Часовые пояса и язык системы', async () => {
  let done = 0
  for (const env of [{ TZ: 'Pacific/Kiritimati' }, { TZ: 'America/Los_Angeles', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }, { TZ: 'Asia/Kamchatka' }, { TZ: 'UTC', LANG: 'C', LC_ALL: 'C' }]) {
    did(`пояс ${env.TZ}`)
    log(`пояс ${env.TZ} ${env.LANG || ''}`)
    const home = newHome('zones', seededStore())
    const s = await launch(home, { env })
    const r = await monkey(s, Math.round(EVENTS * 0.04), { relaunchEnv: env })
    done += r.done
    await close(r.s)
  }
  return done
})

let FAKETIME = ''
try { FAKETIME = execFileSync('sh', ['-c', 'ls /usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1 /usr/lib/faketime/libfaketime.so.1 2>/dev/null | head -1']).toString().trim() } catch {}
phase('time', 'Путешествия во времени', async () => {
  if (!FAKETIME) { R.notes.push('libfaketime не установлен — этап «время» пропущен'); return 0 }
  let done = 0
  for (const when of ['2026-12-31 23:59:20', '2028-02-28 23:59:30', '2026-09-01 08:19:30', '2027-06-30 23:59:40', '2038-01-19 03:13:50', '2019-01-01 00:00:00']) {
    did(`время ${when}`)
    log(`время ${when}`)
    // время то же, что и у системы, плюс сдвиг; расписание засеяно относительно «сегодня» этого времени
    // монотонные часы не трогаем — на них таймеры Chromium; LD_PRELOAD не проходит через SUID-песочницу, поэтому
    // на этом этапе окна без песочницы — иначе в окне было бы настоящее время, а в главном процессе подставное
    const env = { LD_PRELOAD: FAKETIME, FAKETIME: `@${when}`, FAKETIME_DONT_RESET: '1', FAKETIME_NO_CACHE: '1', FAKETIME_DONT_FAKE_MONOTONIC: '1' }
    const home = newHome('time', seededStoreAt(when))
    let s
    try { s = await launch(home, { env, args: SANDBOX.length ? [] : ['--no-sandbox'] }) } catch (e) { R.startFail.push({ phase: R.phase, what: `${when}: не запустилось: ${e.message.split('\n')[0]}`, recent: [...recent] }); continue }
    const r = await monkey(s, Math.round(EVENTS * 0.03), { relaunchEnv: env })
    done += r.done
    await close(r.s)
  }
  return done
})
function seededStoreAt(when) {
  const real = Date.now
  const shift = new Date(when.replace(' ', 'T')).getTime() - real()
  Date.now = () => real() + shift
  try { return seededStore() } finally { Date.now = real }
}

// ---------- прогон ----------
const env = [`Зерно: ${SEED}`, `Действий в основном прогоне: ${EVENTS}`, `Система: ${os.type()} ${os.release()}, ${os.cpus().length} ядер, ${Math.round(os.totalmem() / 2 ** 30)} ГБ`,
  `Приложение: ${EXE}${APP.length ? ' ' + APP[0] : ''}${SANDBOX.length ? ' (без песочницы: запуск от root)' : ''}`]
for (const e of env) log(e)
for (const ph of PHASES) {
  if (ONLY.length && !ONLY.includes(ph.name)) continue
  R.phase = ph.name
  const st = Date.now(), l0 = launchN
  log(`== ${ph.title}`)
  let n = 0, ok = true
  try { n = await ph.fn() } catch (e) { ok = false; log(`этап прерван: ${e.stack || e}`); R.notes.push(`этап «${ph.title}» прерван: ${String(e.message || e).split('\n')[0]}`) }
  R.phases.push({ name: ph.name, title: ph.title, events: n, ms: Date.now() - st, launches: launchN - l0, done: ok })
}

// ---------- отчёт ----------
const out = []
const p = s => out.push(s)
const crashN = R.crashes.length + R.rendererGone.length
p('# Стресс-тест Арктики для Linux\n')
p(`Версия **${process.env.APP_VERSION || '?'}** · коммит \`${process.env.APP_SHA || '?'}\`  `)
for (const e of env) p(e + '  ')
p(`Время: ${Math.round((Date.now() - t0) / 60000)} мин, запусков приложения: ${launchN}\n`)
p('| Что | Найдено |')
p('|---|---|')
p(`| Падения главного процесса | **${R.crashes.length}** |`)
p(`| Падения окна (процесс отрисовки) | **${R.rendererGone.length}** |`)
p(`| Экран «Что-то сломалось» | **${R.fatal.length}** |`)
p(`| Зависания | **${R.hangs.length}** |`)
p(`| Не открылось | **${R.startFail.length}** |`)
p(`| Необработанные ошибки в интерфейсе, разных | ${R.pageErrors.size} (всего ${[...R.pageErrors.values()].reduce((a, e) => a + e.n, 0)}) |`)
p(`| Ошибки главного процесса, разных | ${R.mainErrors.size} |`)
p(`| Имя автора в подсказках | ${R.author.size ? '**да**' : 'нет'} |`)
p(`| Встроенный автобус 150 на экране | ${R.bus150.length ? '**да**' : 'нет'} |`)
p(`| Падения GPU и служебных процессов | ${R.childGone.length} |`)
p(`| Медленные ответы окна (20–45 с) | ${R.slow.length} |`)
p('')
const block = (title, list, fmt) => { if (!list.length) return; p(`## ${title}\n`); list.forEach((x, i) => p(`${i + 1}. ${fmt(x)}`)); p('') }
const steps10 = x => x.recent?.length ? `\n   <details><summary>последние действия</summary>\n\n   ${x.recent.slice(-10).join(' → ')}\n   </details>` : ''
block('Падения главного процесса', R.crashes, x => `этап **${x.phase}**: код ${x.code}, сигнал ${x.signal}${x.quit ? ` (перед этим before-quit: ${x.quit})` : ''}\n   \`\`\`\n   ${x.tail.join('\n   ')}\n   \`\`\`${steps10(x)}`)
block('Падения окна', R.rendererGone, x => `этап **${x.phase}**: ${x.reason} (код ${x.code}) — ${x.wc}${steps10(x)}`)
block('Экран ошибки', R.fatal, x => `этап **${x.phase}**: «${x.msg}»${steps10(x)}`)
block('Зависания', R.hangs, x => `этап **${x.phase}**: ${x.what}${steps10(x)}`)
block('Не открылось', R.startFail, x => `этап **${x.phase}**: ${x.what}${steps10(x)}`)
const table = (title, map, open = true) => {
  if (!map.size) return
  p(open ? `## ${title}\n` : `<details><summary>${title}</summary>\n`)
  p('| Раз | Этапы | Что |'); p('|---|---|---|')
  for (const [k, e] of [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) p(`| ${e.n} | ${[...e.phases].join(', ')} | ${k.replace(/\|/g, '\\|').replace(/\n/g, ' ')}${e.extra ? `<br><sub>${e.extra.replace(/\|/g, '\\|').replace(/\n/g, '<br>')}</sub>` : ''} |`)
  p(open ? '' : '\n</details>\n')
}
table('Необработанные ошибки в интерфейсе', R.pageErrors)
table('Ошибки главного процесса', R.mainErrors)
table('Имя автора', R.author)
if (R.bus150.length) { p('## Автобус 150\n'); R.bus150.slice(0, 5).forEach(b => p(`- ${b.phase}: «${b.text}»`)); p('') }
table('Фатальные строки в выводе Chromium', R.stderrFatal)
table('Журнал ошибок приложения (logs/errors.log)', R.errorsLog, false)
table('Ошибки в консоли интерфейса', R.consoleErrors, false)
block('Падения GPU и служебных процессов (под виртуальным экраном видеокарты нет — рисует процессор)', R.childGone, x => `${x.phase}: ${x.type} ${x.name} — ${x.reason} (${x.code})`)
block('Закрыли из интерфейса (не падение)', R.quits, x => `${x.phase}: после «${x.recent.slice(-1)[0]}»`)
if (R.notes.length) { p('## Заметки\n'); R.notes.forEach(n => p(`- ${n}`)); p('') }
p('## Этапы\n')
p('| Этап | Действий | Запусков | Время | Дошёл до конца |'); p('|---|---|---|---|---|')
for (const x of R.phases) p(`| ${x.title} | ${x.events} | ${x.launches} | ${Math.round(x.ms / 1000)} с | ${x.done ? 'да' : '**нет**'} |`)
p('')
const st = R.startMs.filter(x => x.ok).map(x => x.ms).sort((a, b) => a - b)
if (st.length) p(`Запуск до интерфейса: медиана ${(st[st.length >> 1] / 1000).toFixed(1)} с, худший ${(st[st.length - 1] / 1000).toFixed(1)} с\n`)
if (R.memory.length) {
  const main = R.memory.filter(m => m.phase === 'main')
  const mx = R.memory.reduce((a, m) => Math.max(a, m.mb), 0)
  p(`Память (все процессы): максимум ${mx} МБ` + (main.length > 1 ? `; основной прогон: ${main[0].mb} → ${main[main.length - 1].mb} МБ за ${main[main.length - 1].step - main[0].step} действий` : '') + '\n')
}
if (R.events.size) { p('<details><summary>Что ещё делала «обезьяна»</summary>\n'); for (const [k, e] of R.events) p(`- ${k}: ${e.n}`); p(`- ошибок в консоли сайтов университета: ${R.siteConsole}`); p('\n</details>\n') }
p(`<details><summary>Экраны, где побывала «обезьяна» (${R.screens.size})</summary>\n\n${[...R.screens].sort().join(' · ')}\n</details>\n`)
fs.writeFileSync(path.join(OUT, 'report.md'), out.join('\n') + '\n')
const bad = R.crashes.length || R.rendererGone.length || R.fatal.length || R.hangs.length || R.startFail.length || R.pageErrors.size || R.mainErrors.size || R.author.size || R.bus150.length
if (bad) fs.writeFileSync(path.join(OUT, 'FAILED'), `Падений: ${crashN}, экранов ошибки: ${R.fatal.length}, зависаний: ${R.hangs.length}, не открылось: ${R.startFail.length}, ошибок интерфейса: ${R.pageErrors.size}, ошибок главного процесса: ${R.mainErrors.size}\n`)
if (R.phases.some(x => !x.done)) fs.writeFileSync(path.join(OUT, 'INCOMPLETE'), R.phases.filter(x => !x.done).map(x => x.title).join(', ') + '\n')
console.log('\n' + out.join('\n'))
process.exit(0)
