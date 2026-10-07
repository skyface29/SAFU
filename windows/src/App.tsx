// Корень приложения: фон, каркас, страницы с анимированными переходами, слой сайтов, окна поверх
import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { kv, usePref } from './lib/kv'
import { safu, isDesktop } from './lib/bridge'
import { applyThemeToDocument, currentAccent, firstLook } from './lib/theme'
import { useNav, go, useModals, openHomeworkEditor, type PageId } from './lib/nav'
import { scheduleStore, useSchedule } from './lib/scheduleStore'
import { installEffects, startTicker } from './lib/effects'
import { hw, homeworkStore } from './lib/homework'
import { creds } from './lib/creds'
import { mailWatch } from './lib/mail'
import { Ambient } from './fx/Ambient'
import { Titlebar, Sidebar, Splash, CommandPalette } from './ui/Shell'
import { DialogHost, ToastHost, MenuHost } from './ui/kit'
import { SiteLayer, useSiteBackdrop } from './sites/SiteLayer'
import { openSiteByKey } from './sites/sites'
import { PAGES } from './pages'
import { Registration } from './pages/Registration'
import { SubjectSheet } from './pages/Subjects'
import { HomeworkEditor } from './pages/HomeworkEditor'
import { LessonSheet } from './pages/Schedule'
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

export default function App() {
  const dark = useDark()
  const [, force] = useState(0)
  const page = useNav(s => s.page)
  const params = useNav(s => s.params)
  const dir = useNav(s => s.dir)
  const [splash, setSplash] = useState(true)
  const [onboarded] = usePref('onboarded', false)
  const [again, setAgain] = usePref('onboarding.again', false)
  const [mica] = usePref('ui.mica', false)
  const backdrop = useSiteBackdrop()
  const modals = useModals()

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
    const keys = ['theme', 'theme.seasonal', 'ui.font', 'ui.radius', 'ui.textSize', 'cardStyle', 'look.pack', 'ui.reduceMotion', 'ui.gradTitle', 'bg.style']
    const offs = keys.map(k => kv.subscribe(k, apply))
    return () => offs.forEach(f => f())
  }, [dark])

  useEffect(() => { document.body.classList.toggle('mica', !!mica && isDesktop) }, [mica])

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
    const celebTimer = setInterval(() => celebrations.checkOnOpen(scheduleStore.data), 60_000)
    return () => { clearTimeout(t1); clearInterval(syncTimer); clearInterval(mailTimer); clearInterval(celebTimer) }
  }, [])

  // бейдж на значке в панели задач: ДЗ к сдаче + непрочитанные письма
  const items = homeworkStore.use()
  const [mailUnseen] = usePref('mail.unseen', 0)
  const [mailBadge] = usePref('mail.badge', true)
  const [mailOn] = usePref('mail.notify', false)
  useEffect(() => {
    const n = (kv.get('hw.badge', true) ? hw.badgeCount() : 0) + (mailOn && mailBadge ? mailUnseen : 0)
    safu.app.badge(n)
  }, [items, mailUnseen, mailBadge, mailOn])

  // переходы из уведомлений, трея и ссылок safu://
  useEffect(() => safu.app.on('app:route', (route: string) => handleRoute(route)), [])

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

  const Page = (PAGES[page] || PAGES.home)!
  const accent = currentAccent()
  const showRegistration = !splash && ((!onboarded && !scheduleStore.isConfigured()) || again)

  return (
    <DialogHost>
      <Ambient dark={dark} c1={dark && accent.c1d ? accent.c1d : accent.c1} c2={dark && accent.c2d ? accent.c2d : accent.c2} />
      <motion.div className="shell"
        animate={backdrop ? { scale: 0.94, opacity: 0.7, filter: 'blur(2px)', borderRadius: 24 } : { scale: 1, opacity: 1, filter: 'blur(0px)', borderRadius: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ transformOrigin: '50% 30%' }}>
        <Titlebar />
        <Sidebar />
        <main className="shell-main">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={page + JSON.stringify(params)} className="page-scroll"
              custom={dir}
              initial={{ opacity: 0, y: 24 * dir, scale: 0.985, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16 * dir, scale: 0.99, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
              <div className="page"><Page {...params} /></div>
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>

      <SiteLayer />
      <SubjectSheet name={modals.subject} onClose={() => modals.set({ subject: null })} />
      <HomeworkEditor req={modals.hwEdit} onClose={() => modals.set({ hwEdit: null })} />
      <LessonSheet slot={modals.lesson} onClose={() => modals.set({ lesson: null })} />
      <CommandPalette />
      <CelebrationOverlay />
      <Tour />
      <AnimatePresence>
        {showRegistration && <Registration key="reg" canClose={again} onDone={() => { kv.set('onboarded', true); setAgain(false) }} />}
      </AnimatePresence>
      <LockGate />
      <AnimatePresence>{splash && <Splash key="splash" onDone={() => setSplash(false)} />}</AnimatePresence>
      <ToastHost />
      <MenuHost />
    </DialogHost>
  )
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
  if (r.startsWith('hw:')) { openHomeworkEditor({ id: r.slice(3) }); return }
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
