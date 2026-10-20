// Корень приложения: фон, каркас, страницы с анимированными переходами, слой сайтов, окна поверх
import React, { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { kv, usePref } from './lib/kv'
import { safu, isDesktop } from './lib/bridge'
import { applyThemeToDocument, currentAccent, firstLook } from './lib/theme'
import { useNav, go, useModals, openHomeworkEditor, openHomework, type PageId } from './lib/nav'
import { scheduleStore, useSchedule } from './lib/scheduleStore'
import { installEffects, startTicker } from './lib/effects'
import { hw, homeworkStore } from './lib/homework'
import { creds } from './lib/creds'
import { mailWatch } from './lib/mail'
import { serveSync } from './lib/sync'
import { SyncPairAsk, SyncFirewallAsk } from './pages/Sync'
import { Ambient, holdAmbient } from './fx/Ambient'
import { initFx, applyFx } from './fx/perf'
import { Titlebar, Sidebar, Splash, CommandPalette } from './ui/Shell'
import { DialogHost, ToastHost, MenuHost, toast, pageShown } from './ui/kit'
import { SiteLayer } from './sites/SiteLayer'
import { openSiteByKey, openFileCard } from './sites/sites'
import { PAGES, preloadPages } from './pages'
import { CelebrationOverlay, celebrations } from './fx/Celebrations'
import { LockGate, appLock } from './pages/AppLock'
import { Tour } from './pages/Tour'

function useDark() {
  const [scheme] = usePref('ui.scheme', 'dark')
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const sys = useSyncExternalStore(f => { mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, () => mq.matches)
  return scheme === 'dark' || (scheme === 'system' && sys)
}

firstLook()

// Окна поверх и знакомство — отдельными кусками: при запуске они не нужны
const loadRegistration = () => import('./pages/Registration')
const loadSubjects = () => import('./pages/Subjects')
const loadEditor = () => import('./pages/HomeworkEditor')
const loadView = () => import('./pages/HomeworkView')
const loadSchedule = () => import('./pages/Schedule')
const Registration = React.lazy(() => loadRegistration().then(m => ({ default: m.Registration })))
const SubjectSheet = React.lazy(() => loadSubjects().then(m => ({ default: m.SubjectSheet })))
const HomeworkEditor = React.lazy(() => loadEditor().then(m => ({ default: m.HomeworkEditor })))
const HomeworkView = React.lazy(() => loadView().then(m => ({ default: m.HomeworkView })))
const LessonSheet = React.lazy(() => loadSchedule().then(m => ({ default: m.LessonSheet })))

export default function App() {
  const dark = useDark()
  const [, force] = useState(0)
  const [splash, setSplash] = useState(true)
  const [onboarded] = usePref('onboarded', false)
  const [again, setAgain] = usePref('onboarding.again', false)
  const [mica] = usePref('ui.mica', false)

  // тема пересчитывается при любом изменении оформления
  useEffect(() => {
    const apply = () => {
      applyThemeToDocument(dark)
      const a = currentAccent()
      safu.app.titlebar('#00000000', dark ? '#ffffff' : '#111111')
      void a
      force(x => x + 1)
    }
    apply()
    const keys = ['theme', 'theme.seasonal', 'ui.font', 'ui.radius', 'ui.textSize', 'cardStyle', 'look.pack', 'ui.reduceMotion', 'ui.gradTitle', 'bg.style', 'ui.blur']
    const offs = keys.map(k => kv.subscribe(k, apply))
    return () => offs.forEach(f => f())
  }, [dark])

  useEffect(() => { document.body.classList.toggle('mica', !!mica && isDesktop) }, [mica])

  // качество анимаций под железо: видеокарта, ядра, память; выбор человека — Оформление → «Качество анимаций»
  useEffect(() => {
    initFx(null)
    safu.app.info().then((i: any) => initFx(i?.gpu)).catch(() => undefined)
    return kv.subscribe('fx.quality', applyFx)
  }, [])

  // запуск: расписание, напоминания, почта
  useEffect(() => {
    installEffects()
    creds.load()
    scheduleStore.init()
    startTicker()
    appLock.lockOnStart()
    const t1 = setTimeout(async () => {
      hw.cleanupFinished()
      await scheduleStore.sync()
      hw.reconcile(scheduleStore.data)
      celebrations.checkOnOpen(scheduleStore.data)
    }, 1600)
    // РУЗ — раз в 20 минут, почта — раз в минуту, пока приложение работает (в том числе в трее)
    const syncTimer = setInterval(() => scheduleStore.sync(), 20 * 60_000)
    const mailTimer = setInterval(() => mailWatch.checkIfEnabled(), 60_000)
    setTimeout(() => mailWatch.checkIfEnabled(), 5000)
    // салюты — только когда окно на экране: в трее они рисовались впустую, и их было не увидеть
    const celebrate = () => { if (!document.hidden) celebrations.checkOnOpen(scheduleStore.data) }
    const celebTimer = setInterval(celebrate, 60_000)
    const offVisible = safu.app.on('app:visible', (v: boolean) => { if (v) setTimeout(celebrate, 400) })
    return () => { clearTimeout(t1); clearInterval(syncTimer); clearInterval(mailTimer); clearInterval(celebTimer); offVisible() }
  }, [])

  // связанный iPhone заходит сам и сводит ДЗ, задачи и заметки — отвечаем, пока приложение запущено
  useEffect(() => serveSync(), [])

  // интерфейс собрался — сторож в главном процессе не будет показывать экран восстановления
  useEffect(() => { (safu.app as any).ready?.() }, [])

  // остальные страницы и окна — заранее, когда приложение запустилось и интерфейс свободен
  useEffect(() => {
    const t = setTimeout(() => preloadPages([loadEditor, loadView, loadSubjects, loadSchedule]), 2500)
    return () => clearTimeout(t)
  }, [])

  // переходы из уведомлений, трея и ссылок safu://
  useEffect(() => safu.app.on('app:route', (route: string) => handleRoute(route)), [])

  // скачал файл с сайта — говорим, куда он лёг, и даём сразу открыть
  useEffect(() => safu.app.on('download:progress', (p: any) => {
    if (p?.state === 'completed') {
      const name = String(p.name || 'Файл')
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
      toast(`Сохранено в «${p.folder || 'Загрузки'}»: ${name}`, 'ok', p.rel ? { label: 'Открыть', run: () => openFileCard(p.rel, name, ext) } : undefined)
    } else if (p?.state === 'interrupted') {
      toast(`Не удалось скачать: ${p.name || 'файл'}`, 'warn')
    }
  }), [])

  // горячие клавиши
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key.toLowerCase() === 'n' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); openHomeworkEditor({}) }
      const map: Record<string, PageId> = { '1': 'home', '2': 'schedule', '3': 'homework', '4': 'tasks', '5': 'files', '6': 'subjects', '7': 'tools', '8': 'profile' }
      if (map[e.key]) { e.preventDefault(); go(map[e.key]) }
      if (e.key === ',') { e.preventDefault(); go('appearance') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const accent = currentAccent()
  const showRegistration = !splash && ((!onboarded && !scheduleStore.isConfigured()) || again)

  return (
    <DialogHost>
      {!(mica && isDesktop) && <Ambient dark={dark} c1={dark && accent.c1d ? accent.c1d : accent.c1} c2={dark && accent.c2d ? accent.c2d : accent.c2} />}
      {/* приложение не перерисовывается, когда открывают сайт: фон и «отъезд» меняются в SiteLayer напрямую */}
      <div className="shell" style={{ transformOrigin: '50% 30%' }}>
        <Titlebar />
        <Sidebar />
        <main className="shell-main"><Pages /></main>
      </div>

      <SiteLayer />
      <ModalHost />
      <TaskbarBadge />
      <SyncPairAsk />
      <SyncFirewallAsk />
      <CommandPalette />
      <CelebrationOverlay />
      <Tour />
      <AnimatePresence>
        {showRegistration && <Suspense key="reg" fallback={null}><Registration canClose={again} onDone={() => { kv.set('onboarded', true); setAgain(false) }} /></Suspense>}
      </AnimatePresence>
      <LockGate />
      <AnimatePresence>{splash && <Splash key="splash" onDone={() => setSplash(false)} />}</AnimatePresence>
      <ToastHost />
      <MenuHost />
    </DialogHost>
  )
}

// Переход между разделами — прозрачность и сдвиг через transform: такие анимации framer-motion отдаёт видеокарте
// (как у окон), и кадры не ждут, пока соберётся новый раздел. Раньше сдвиг шёл кадрами в JavaScript.
// В конце transform снимается: со сдвигом внутри раздела съехали бы окна с position: fixed (просмотр фото, «Отпусти файл»)
const pageMotion = {
  enter: (dir: number) => ({ opacity: 0, transform: `translateY(${18 * dir}px)` }),
  show: { opacity: 1, transform: 'translateY(0px)', transitionEnd: { transform: 'none' } },
  leave: (dir: number) => ({ opacity: 0, transform: `translateY(${-10 * dir}px)` }),
}
const pageSpring = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.7 }

/** Новое значение — после кадра, в котором показано то, что уже изменилось (боковая панель ответила на клик).
 *  Раздел собирается одним проходом: по частям между кадрами (useDeferredValue) он на слабом ноутбуке появлялся
 *  вдвое позже. Пока он собирается, подсветка и уход старого раздела едут на видеокарте и не ждут его.
 *  Несколько кликов подряд — собирается только последний */
function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => {
    if (Object.is(value, shown)) return
    holdAmbient(700)
    const show = () => { pageShown.at = performance.now(); setShown(latest.current) }
    // окно свёрнуто — кадров нет, ждать нечего
    if (document.visibilityState === 'hidden') { show(); return }
    let t = 0
    const raf = requestAnimationFrame(() => { t = window.setTimeout(show) })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [value, shown])
  return shown
}

/** Разделы. Боковая панель отвечает на клик сразу (подсветка, иконка), а новый раздел — следующим кадром */
function Pages() {
  const page = useNav(s => s.page)
  const params = useNav(s => s.params)
  const dir = useNav(s => s.dir)
  const shown = useAfterPaint(useMemo(() => ({ page, params, dir }), [page, params, dir]))
  const Page = (PAGES[shown.page] || PAGES.home)!
  // Пока крутят колесо, раздел накрыт прозрачной шторкой: карточки под неподвижным курсором не подсвечиваются
  // и не приподнимаются одна за другой (их перерисовка на каждом кадре прокрутки). Колесо шторка пропускает
  // разделу — она внутри него. Показ шторки — смена visibility у одного элемента, без пересчёта всего раздела
  useEffect(() => {
    let t = 0
    let on: HTMLElement | null = null
    const onScroll = (e: Event) => {
      const s = e.target
      if (!(s instanceof HTMLElement) || !s.classList.contains('page-scroll')) return
      const shield = s.firstElementChild as HTMLElement | null
      if (!shield?.classList.contains('scroll-shield')) return
      if (on !== shield) { on?.classList.remove('on'); on = shield; shield.classList.add('on') }
      clearTimeout(t)
      t = window.setTimeout(() => { on?.classList.remove('on'); on = null }, 160)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => { document.removeEventListener('scroll', onScroll, true); clearTimeout(t) }
  }, [])
  // клик меняет nav сразу, а раздел — позже: в этот момент старый раздел не перерисовывается зря
  return useMemo(() => (
    <AnimatePresence mode="popLayout" initial={false} custom={shown.dir}>
      <motion.div key={shown.page + JSON.stringify(shown.params)} className="page-scroll" custom={shown.dir}
        variants={pageMotion} initial="enter" animate="show" exit="leave" transition={pageSpring}>
        <div className="scroll-shield" />
        <div className="page"><Suspense fallback={null}><Page {...shown.params} /></Suspense></div>
      </motion.div>
    </AnimatePresence>
  ), [shown, Page])
}

// Окна поверх: подписаны только они — открытие листа не перерисовывает всё приложение
const closeModal = (p: Parameters<ReturnType<typeof useModals.getState>['set']>[0]) => useModals.getState().set(p)
function ModalHost() {
  const subject = useModals(s => s.subject)
  const hwEdit = useModals(s => s.hwEdit)
  const hwView = useModals(s => s.hwView)
  const lesson = useModals(s => s.lesson)
  return (
    <>
      <OnceOpened open={!!subject}><SubjectSheet name={subject} onClose={() => closeModal({ subject: null })} /></OnceOpened>
      <OnceOpened open={!!hwEdit}><HomeworkEditor req={hwEdit} onClose={() => closeModal({ hwEdit: null })} /></OnceOpened>
      <OnceOpened open={!!hwView}><HomeworkView id={hwView} onClose={() => closeModal({ hwView: null })} /></OnceOpened>
      <OnceOpened open={!!lesson}><LessonSheet slot={lesson} onClose={() => closeModal({ lesson: null })} /></OnceOpened>
    </>
  )
}

/** Окно появляется в дереве, когда его впервые открыли, и дальше остаётся (чтобы закрывалось с анимацией).
 *  До этого оно не грузится и не перерисовывается на каждое изменение ДЗ и расписания */
function OnceOpened({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ever = useRef(false)
  if (open) ever.current = true
  return ever.current ? <Suspense fallback={null}>{children}</Suspense> : null
}

/** Число на значке в панели задач: ДЗ к сдаче + непрочитанные письма. Отдельно, чтобы правка ДЗ не перерисовывала всё */
function TaskbarBadge() {
  const items = homeworkStore.use()
  const [mailUnseen] = usePref('mail.unseen', 0)
  const [mailBadge] = usePref('mail.badge', true)
  const [mailOn] = usePref('mail.notify', false)
  const [hwBadge] = usePref('hw.badge', true)
  useEffect(() => {
    const n = (hwBadge ? hw.badgeCount() : 0) + (mailOn && mailBadge ? mailUnseen : 0)
    safu.app.badge(n)
  }, [items, mailUnseen, mailBadge, mailOn, hwBadge])
  return null
}

export function handleRoute(route: string) {
  const r = route.replace(/^\/+/, '')
  if (r === 'sync') { scheduleStore.sync(true); return }
  if (r === 'changes') { go('schedule', { changes: 1 }); return }
  if (r === 'hw' || r === 'homework-new') { openHomeworkEditor({}); return }
  if (r.startsWith('hwdone:')) { hw.markDone(r.slice(7)); return }
  if (r.startsWith('hwnew:')) {
    const [, start, ...subj] = r.split(':')
    openHomeworkEditor({ subject: subj.join(':'), slotStart: Number(start) })
    return
  }
  if (r.startsWith('hw:')) { openHomework(r.slice(3)); return }
  if (r.startsWith('site:')) { openSiteByKey(r.slice(5)); return }
  if (r.startsWith('pair')) {
    const subj = new URLSearchParams(r.split('?')[1] || '').get('subject')
    if (subj) useModals.getState().set({ subject: subj })
    return
  }
  const pages: Record<string, PageId> = { schedule: 'schedule', homework: 'homework', tasks: 'tasks', files: 'files', home: 'home', profile: 'profile', boards: 'boards', board: 'boards', mail: 'home' }
  for (const [k, p] of Object.entries(pages)) if (r.startsWith(k)) { go(p); if (k === 'mail') openSiteByKey('mail'); return }
  void useSchedule
}
