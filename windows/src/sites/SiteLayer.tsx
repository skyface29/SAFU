// Слой сайтов-«мини-приложений», как в Telegram: развёрнутая карточка, плашка свёрнутых и стопка.
// Все страницы остаются загруженными: свернул — и вернулся на то же место.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { create } from 'zustand'
import { CardMotion, REST, OPEN, CLOSE, BACK, fadeTo, type Pose } from './cardMotion'
import { setAmbientPaused } from '../fx/Ambient'
import {
  X, ChevronDown, ChevronUp, MoreHorizontal, ArrowLeft, ArrowRight, RotateCw, ExternalLink, Copy, KeyRound, Home,
  Moon, ZoomIn, ZoomOut, Layers, FileText, FolderOpen, Lock, Download, Printer
} from 'lucide-react'
import { useSites, sites, originRect, type SiteTab, type OriginRect } from './sites'
import { safu, fileURL } from '../lib/bridge'
import { resources, resourcesStore } from '../lib/resources'
import { creds, useCreds } from '../lib/creds'
import { kv, usePref } from '../lib/kv'
import { SiteGlyph, siteColor } from '../ui/icons'
import { openMenu, toast, spring, softSpring } from '../ui/kit'
import { useSchedule } from '../lib/scheduleStore'
import { subjects } from '../lib/schedule'
import { subjectFolder } from '../lib/effects'
import { bestSubject, looksLikeFile, FIND_FILES_SCRIPT, pageFileName, type PageFile } from '../lib/downloads'
import { isLinux } from '../lib/os'


let preloadURL = ''
safu.sites.preload().then(u => { preloadURL = u })

const webviews = new Map<string, any>()

// открыт сайт — фон замирает, приложение (по желанию) чуть отъезжает. Без перерисовки всего приложения:
// раньше от этого перерисовывались все страницы ровно в момент начала анимации
let prevMode = useSites.getState().mode
useSites.subscribe(st => {
  if (st.mode === prevMode) return
  prevMode = st.mode
  setAmbientPaused(st.mode !== 'closed')
  if (!kv.get('ui.siteBackdrop', false)) return
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!shell) return
  const on = st.mode === 'open'
  const from = getComputedStyle(shell).transform
  shell.style.willChange = 'transform'
  shell.style.transform = on ? 'scale(0.965)' : 'none'
  const a = shell.animate([{ transform: from }, { transform: on ? 'scale(0.965)' : 'none' }], { duration: OPEN.duration, easing: OPEN.easing })
  if (!on) a.finished.then(() => { shell.style.willChange = '' }, () => undefined)
})
/** Автонажатие «Войти»: не больше 2 раз за 5 минут на сайт — неверный сохранённый пароль не зациклит вход */
const autoAttempts = new Map<string, number[]>()
/** Карточка готовится уехать: снимает полноразмерный снимок страницы и прячет живую страницу */
const preparers = new Map<string, () => Promise<void>>()
/** Маленький снимок последней страницы — для стопки (большой живёт в карточке) */
const lastImages = new Map<string, string>()

function prepare(id: string | null) {
  const f = id ? preparers.get(id) : null
  if (f) void f()
}

/** Закрыть вкладку: живая страница сразу прячется под заранее снятый снимок, карточка уезжает без ожидания */
export function closeWithSnapshot(id: string) {
  const s = useSites.getState()
  if (s.active === id && s.mode === 'open') prepare(id)
  sites.close(id)
}

/** Куда садится свёрнутая карточка: плашка внизу по центру */
const pillRect = (): OriginRect => ({ x: window.innerWidth / 2 - 150, y: window.innerHeight - 64, w: 300, h: 46, radius: 23 })

export function SiteLayer() {
  const { tabs, active, mode } = useSites()
  const [pre, setPre] = useState(preloadURL)
  useEffect(() => { if (!pre) safu.sites.preload().then(u => setPre(u || 'none')) }, [])

  // Esc — свернуть, Ctrl+W — закрыть вкладку
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useSites.getState()
      if (s.mode === 'closed') return
      if (e.key === 'Escape' && !document.querySelector('.overlay .sheet')) { e.preventDefault(); s.mode === 'stack' ? sites.minimize() : minimizeWithSnapshot() }
      if (e.ctrlKey && e.key.toLowerCase() === 'w' && s.active) { e.preventDefault(); closeWithSnapshot(s.active) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ссылки «в новом окне» — в ту же карточку
  useEffect(() => safu.app.on('site:newWindow', ({ id, url }: { id: number; url: string }) => {
    for (const [tabId, wv] of webviews) {
      try { if (wv.getWebContentsId() === id) { wv.loadURL(url).catch(() => {}); sites.expand(tabId); return } } catch { /* ещё не готов */ }
    }
  }), [])

  if (!pre) return null
  const open = mode === 'open'
  // закрывающаяся вкладка уже не в плашке и не в стопке — только её карточка доезжает
  const listed = tabs.filter(t => !t.closing)
  const minimized = listed.length > 0 && mode === 'closed'

  return (
    <>
      <AnimatePresence>
        {open && <motion.div key="dim" style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.35)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={minimizeWithSnapshot} />}
      </AnimatePresence>
      {tabs.map(t => <SiteCard key={t.id} tab={t} visible={open && active === t.id} preload={pre === 'none' ? '' : pre} />)}
      <AnimatePresence>{minimized && <Pill key="pill" tabs={listed} />}</AnimatePresence>
      <AnimatePresence>{mode === 'stack' && <Stack key="stack" tabs={listed} />}</AnimatePresence>
    </>
  )
}

export function minimizeWithSnapshot() {
  const s = useSites.getState()
  const id = s.active
  // снимок уже готов (снят, когда на странице было затишье): прячем живую страницу и сразу едем
  prepare(id)
  sites.minimize()
  if (!id) return
  // маленький снимок для стопки — после того, как карточка доехала, чтобы не попасть на анимацию
  setTimeout(() => {
    const thumb = lastImages.get(id)
    if (thumb) sites.update(id, { snapshot: thumb })
  }, 600)
}

/** Свёрнутый сайт, который не открывали 5 минут, выгружается из памяти (снимок и адрес остаются).
 *  Каждый сайт — отдельный процесс на 150–400 МБ; окно убрали в трей — свёрнутые выгружаются через минуту */
const UNLOAD_AFTER = 5 * 60_000
const UNLOAD_HIDDEN = 60_000

/** Видно ли окно приложения (или оно в трее) */
const useAppVisible = create<{ visible: boolean }>(() => ({ visible: true }))
safu.app.on('app:visible', (v: boolean) => useAppVisible.setState({ visible: !!v }))

// одна вкладка обновилась (загрузка, заголовок) — перерисовывается только её карточка
const SiteCard = React.memo(function SiteCard({ tab, visible, preload }: { tab: SiteTab; visible: boolean; preload: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const motionRef = useRef<CardMotion | null>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLImageElement>(null)
  const [shown, setShown] = useState(visible)
  const [formHost, setFormHost] = useState<string | null>(null)
  const credList = useCreds(s => s.list)
  const [zoom, setZoom] = useState(1)
  const [dark, setDark] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const ref = useRef<any>(null)
  const res = tab.resourceId ? resourcesStore.get().find(r => r.id === tab.resourceId) : undefined
  // страница (webview) создаётся, когда карточка уже доехала: создание процесса страницы подвешивает окно
  // на десятые доли секунды, и раньше это съедало анимацию — карточка «внезапно появлялась»
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  liveRef.current = live
  // адрес, с которого страница стартует (при повторной загрузке — тот, где остановились)
  const [src, setSrc] = useState(tab.currentURL || tab.url)
  // пока карточка едет, живая страница спрятана (двигать страницу из другого процесса дорого),
  // а сверху — её снимок
  const [hideLive, setHideLiveState] = useState(true)
  const hideRef = useRef(true)
  const setHideLive = (v: boolean) => { hideRef.current = v; setHideLiveState(v) }
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // снимок страницы (JPEG в памяти) готовится заранее — когда на странице затишье, а не в момент сворачивания
  const [shot, setShot] = useState<string | null>(null)
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot) }, [shot])
  const lastGrab = useRef(0)
  const grab = async (force = false) => {
    const wv = ref.current
    if (!wv || tab.kind !== 'site' || !liveRef.current || hideRef.current || !visibleRef.current) return
    if (!force && performance.now() - lastGrab.current < 1500) return
    lastGrab.current = performance.now()
    try {
      // на экранах с масштабом — до размера окна: меньше кодировать и раскодировать
      const snap = await safu.sites.capture(wv.getWebContentsId(), wv.clientWidth)
      if (!snap || !liveRef.current) return
      lastImages.set(tab.id, snap.thumb)
      const url = URL.createObjectURL(new Blob([snap.jpeg], { type: 'image/jpeg' }))
      // раскодировать заранее: в начале анимации картинка уже готова
      const probe = new Image()
      probe.src = url
      await probe.decode().catch(() => undefined)
      setShot(url)
    } catch { /* страница ещё грузится */ }
  }
  // свернуть или закрыть: живую страницу — спрятать, снимок — показать (мгновенно, без ожидания)
  useEffect(() => {
    preparers.set(tab.id, async () => {
      setHideLive(true)
      if (veilRef.current) { for (const a of veilRef.current.getAnimations()) a.cancel(); veilRef.current.style.opacity = '1' }
    })
    return () => { preparers.delete(tab.id) }
  })

  const mountLive = () => {
    if (liveRef.current || tab.kind !== 'site') return
    const cur = useSites.getState().tabs.find(x => x.id === tab.id)
    setSrc(cur?.currentURL || cur?.url || tab.url)
    setLive(true)
    liveRef.current = true
    if (cur?.dormant) sites.update(tab.id, { dormant: false })
  }

  // появление и уход карточки — до первой отрисовки (useLayoutEffect), чтобы не мигнуло на старом месте
  const firstRun = useRef(true)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    if (!motionRef.current) motionRef.current = new CardMotion(el)
    const m = motionRef.current
    if (firstRun.current) {
      firstRun.current = false
      if (!visible) { m.set({ ...REST, o: 0 }); return }
    }
    const f = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth || 1, h: el.offsetHeight || 1 }
    const toward = (r: OriginRect, o: number): Pose => ({ x: r.x - f.x, y: r.y - f.y, sx: Math.max(0.02, r.w / f.w), sy: Math.max(0.02, r.h / f.h), o })
    const iconFrom = (p: Pose) => `scale(${(Math.min(p.sx, p.sy) / p.sx).toFixed(4)}, ${(Math.min(p.sx, p.sy) / p.sy).toFixed(4)})`
    const picture = tab.kind === 'file' || !!shot || !!tab.snapshot
    if (visible) {
      setShown(true)
      if (tab.kind === 'site') {
        setHideLive(true)
        if (veilRef.current) veilRef.current.style.opacity = '1'
      }
      const from = sites.expandedFrom(tab.id) ?? originRect(tab.id)
      const fresh = tab.kind === 'site' && !liveRef.current && !picture
      if (from) {
        // вырастает из плитки (или из плашки свёрнутых)
        const start = toward(from, 0.7)
        m.set(start)
        if (coverRef.current) coverRef.current.style.opacity = fresh ? '1' : '0'
        iconRef.current?.animate([{ transform: iconFrom(start) }, { transform: 'scale(1, 1)' }], { duration: OPEN.duration, easing: OPEN.easing })
      } else if (el.style.opacity === '0' || !el.style.opacity) {
        m.set({ x: 0, y: f.h * 0.25, sx: 0.96, sy: 0.96, o: 0 })
        if (coverRef.current) coverRef.current.style.opacity = fresh ? '1' : '0'
      }
      m.to(REST, OPEN, { duration: 140 }).then(ok => {
        if (!ok || !visibleRef.current) return
        if (tab.kind !== 'site') { fadeTo(coverRef.current, 0, 200); return }
        const first = !liveRef.current
        mountLive()
        setHideLive(false)
        // живая страница под снимком уже нарисовалась — снимок тает, а не исчезает рывком
        if (!first) fadeTo(veilRef.current, 0, 160, 90)
        else { if (veilRef.current) veilRef.current.style.opacity = '0' }
        if (!first) fadeTo(coverRef.current, 0, 200)
        // первая загрузка: заставка уходит, когда страница начала рисоваться (или через 1,5 с)
        else setTimeout(() => fadeTo(coverRef.current, 0, 260), 1500)
        // снимок для будущего сворачивания — когда страница успокоится
        setTimeout(() => { void grab() }, first ? 2500 : 700)
      })
    } else {
      if (tab.kind === 'site') {
        setHideLive(true)
        if (veilRef.current) { for (const a of veilRef.current.getAnimations()) a.cancel(); veilRef.current.style.opacity = '1' }
      }
      const mode = useSites.getState().mode
      const target = tab.closing ? originRect(tab.id) : mode === 'closed' ? pillRect() : null
      let done: Promise<boolean>
      if (target) {
        // садится обратно в плитку (закрыли) или в плашку внизу (свернули)
        const t = toward(target, 0)
        if (tab.closing) fadeTo(coverRef.current, 1, 150)
        done = m.to(t, CLOSE, { duration: 120, delay: Math.max(0, CLOSE.duration - 200) })
      } else if (mode === 'open') {
        done = m.to({ ...REST, o: 0 }, CLOSE, { duration: 120 })
      } else {
        done = m.to({ x: 0, y: f.h * 0.5, sx: 0.96, sy: 0.96, o: 0 }, CLOSE, { duration: 200 })
      }
      done.then(ok => {
        if (!ok || visibleRef.current) return
        setShown(false)
        m.set({ ...REST, o: 0 })
        if (coverRef.current) coverRef.current.style.opacity = '0'
      })
    }
  }, [visible])

  // шапка: потянуть вниз — свернуть. Тянется, только пока кнопка мыши зажата
  const drag = useRef<{ id: number; y0: number; on: boolean; lastY: number; lastT: number; v: number; off: number } | null>(null)
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (!d?.on) return
    if (d.off > 140 || d.v > 0.9) { minimizeWithSnapshot(); return }
    motionRef.current?.to(REST, BACK).then(ok => {
      if (!ok || drag.current || !visibleRef.current) return
      setHideLive(false)
      fadeTo(veilRef.current, 0, 140, 60)
    })
  }
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, y0: e.clientY, on: false, lastY: e.clientY, lastT: performance.now(), v: 0, off: 0 }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      // кнопку отпустили там, где мы этого не слышали, — тянуть перестаём
      if (e.buttons === 0) { endDrag(); return }
      const dy = e.clientY - d.y0
      if (!d.on) {
        if (dy < 6) return
        d.on = true
        if (tab.kind === 'site') {
          setHideLive(true)
          if (veilRef.current) { for (const a of veilRef.current.getAnimations()) a.cancel(); veilRef.current.style.opacity = '1' }
        }
      }
      const now = performance.now()
      d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
      d.lastY = e.clientY
      d.lastT = now
      d.off = Math.max(0, dy - 6)
      const k = 1 - Math.min(0.14, d.off / 2600)
      const w = boxRef.current?.offsetWidth || 0
      motionRef.current?.set({ x: (w * (1 - k)) / 2, y: d.off, sx: k, sy: k, o: 1 })
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture: endDrag
  }

  // долго свёрнута — отпускаем память; развернёшь — загрузится там же
  const appVisible = useAppVisible(s => s.visible)
  useEffect(() => {
    if (visible || !live || tab.kind !== 'site') return
    const t = setTimeout(() => {
      const cur = useSites.getState().tabs.find(x => x.id === tab.id)
      setLive(false)
      liveRef.current = false
      lastImages.delete(tab.id)
      sites.update(tab.id, { dormant: true, loading: false, url: cur?.currentURL || cur?.url || tab.url })
    }, appVisible ? UNLOAD_AFTER : UNLOAD_HIDDEN)
    return () => clearTimeout(t)
  }, [visible, live, appVisible])

  // вкладку закрыли — её снимок больше не нужен (раньше снимки всех закрытых сайтов копились в памяти)
  useEffect(() => () => { lastImages.delete(tab.id) }, [tab.id])

  useEffect(() => {
    const wv = ref.current
    if (!wv || tab.kind !== 'site' || !live) return
    webviews.set(tab.id, wv)
    const nav = () => {
      const url = wv.getURL()
      sites.update(tab.id, { currentURL: url, canBack: wv.canGoBack(), canForward: wv.canGoForward() })
      if (res) resources.saveLastURL(url, res)
      hintDownloads(wv.getTitle())
    }
    const onTitle = (e: any) => { sites.update(tab.id, { pageTitle: e.title }); hintDownloads(e.title) }
    // открыт курс Sakai — скачанное с него сразу ложится в папку этого предмета
    const hintDownloads = (title: string) => {
      let rel: string | null = null
      try {
        if (new URL(wv.getURL()).host.toLowerCase().includes('sakai')) {
          const s = bestSubject(title || '', subjects(useSchedule.getState().data))
          if (s) rel = subjectFolder(s)
        }
      } catch { /* адреса ещё нет */ }
      try { safu.sites.downloadHint(wv.getWebContentsId(), rel) } catch { /* страница ещё не готова */ }
    }
    // сайт молчит 45 секунд — честно говорим, а не держим полоску загрузки вечно
    let slow: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    const onStart = () => {
      formHere = false // новая страница: форма входа, если есть, найдётся заново
      sites.update(tab.id, { loading: true }); setFailed(null)
      if (slow) clearTimeout(slow)
      timedOut = false
      slow = setTimeout(() => { timedOut = true; setFailed('Сайт долго не отвечает — возможно, он на обслуживании или нет интернета') }, 45_000)
    }
    const onStop = () => {
      if (slow) { clearTimeout(slow); slow = null }
      if (timedOut) { timedOut = false; setFailed(null) }
      sites.update(tab.id, { loading: false }); nav()
      // после входа открылась страница без формы — вход удался, запоминаем пароль
      if (candidate) setTimeout(trySave, 1500)
    }
    // пароли, как на iPhone: ввёл один раз — вход удался — пароль запомнился сам (зашифрован Windows),
    // дальше он подставляется и «Войти» нажимается за тебя. Только на https и только с адреса самой страницы
    let candidate: { host: string; user: string; pass: string } | null = null
    let formHere = false
    const pageHost = (): string | null => {
      try { const u = new URL(wv.getURL()); return u.protocol === 'https:' ? u.host.toLowerCase() : null } catch { return null }
    }
    const trySave = () => {
      const c = candidate
      // форма входа всё ещё на странице — вход не удался (неверный пароль), не запоминаем
      if (!c || formHere || !kv.get('sites.savePasswords', true)) return
      candidate = null
      const old = creds.get(c.host)
      if (old && old.host === c.host && old.pass === c.pass && (!c.user || old.user === c.user)) return
      const user = c.user || (old?.host === c.host ? old.user : '')
      creds.set({ host: c.host, user, pass: c.pass }).then(() => {
        toast(old ? `Пароль для ${c.host} обновлён` : `Пароль для ${c.host} сохранён — дальше вход сам`, 'ok', {
          label: 'Не сохранять',
          run: () => { if (old && old.host === c.host) creds.set(old); else creds.remove(c.host) }
        })
      }).catch(() => undefined)
    }
    const onMsg = (e: any) => {
      if (e.channel === 'safu:idle') { void grab(); return }
      const host = pageHost()
      if (!host) return
      const [p] = e.args || []
      if (e.channel === 'safu:form') {
        formHere = true
        setFormHost(host)
        const c = creds.get(host)
        if (c && kv.get('sites.autoFill', true)) {
          const now = Date.now()
          const recent = (autoAttempts.get(host) || []).filter(t => now - t < 300_000)
          const submit = kv.get('sites.autoLogin', true) && recent.length < 2
          if (submit) autoAttempts.set(host, [...recent, now])
          wv.send('safu:fill', c.user, c.pass, submit)
        }
      }
      if (e.channel === 'safu:gone') {
        // форма входа исчезла без перезагрузки (почта и «одностраничные» сайты) — вход удался
        formHere = false
        setFormHost(null)
        setTimeout(trySave, 900)
      }
      if (e.channel === 'safu:creds' && p?.pass) candidate = { host, user: String(p.user || ''), pass: String(p.pass) }
    }
    // процесс страницы упал (не хватило памяти, сайт уронил вкладку) — просто загружаем заново, а не белый экран
    const onGone = () => { setFailed(null); setTimeout(() => { try { wv.reload() } catch { /* уже закрыта */ } }, 300) }
    const onFail = (e: any) => {
      if (e.errorCode === -3 || !e.isMainFrame) return
      sites.update(tab.id, { loading: false })
      if (slow) { clearTimeout(slow); slow = null }
      setFailed(e.errorCode <= -200 && e.errorCode >= -220 ? 'Не удалось проверить сертификат сайта — проверь дату и время на компьютере' : e.errorCode === -106 ? 'Нет интернета' : e.errorCode === -105 || e.errorCode === -102 || e.errorCode === -118 ? 'Сайт не отвечает — возможно, он на обслуживании' : `Не удалось открыть страницу (${e.errorDescription || e.errorCode})`)
    }
    wv.addEventListener('page-title-updated', onTitle)
    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', nav)
    wv.addEventListener('did-navigate-in-page', nav)
    wv.addEventListener('ipc-message', onMsg)
    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('render-process-gone', onGone)
    // страница начала рисоваться — заставка со значком тает
    const onReady = () => { if (visibleRef.current) setTimeout(() => fadeTo(coverRef.current, 0, 260), 250) }
    wv.addEventListener('dom-ready', onReady)
    return () => {
      wv.removeEventListener('dom-ready', onReady)
      webviews.delete(tab.id)
      wv.removeEventListener('page-title-updated', onTitle)
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', nav)
      wv.removeEventListener('did-navigate-in-page', nav)
      wv.removeEventListener('ipc-message', onMsg)
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('render-process-gone', onGone)
      if (slow) clearTimeout(slow)
    }
  }, [tab.id, live])

  const saved = formHost ? creds.get(formHost) : null
  void credList
  const host = (() => { try { return new URL(tab.currentURL || tab.url).host } catch { return '' } })()

  const menu = (e: React.MouseEvent) => {
    const wv = ref.current
    // методы <webview> бросают исключение, пока страница не готова: сайт ещё грузится или без сети не открылся
    const ready = (f: () => unknown) => { try { f() } catch { toast('Сайт ещё открывается — попробуй через пару секунд', 'info') } }
    const subj = subjects(useSchedule.getState().data)
    openMenu(e, tab.kind === 'site' ? [
      { label: 'Открыть в браузере', icon: <ExternalLink size={15} />, run: () => safu.shell.open(tab.currentURL || tab.url) },
      { label: 'Копировать ссылку', icon: <Copy size={15} />, run: () => { safu.clipboard.write(tab.currentURL || tab.url); toast('Ссылка скопирована') } },
      { label: 'На главную сайта', icon: <Home size={15} />, run: () => { if (res) resources.clearLastURL(res); ready(() => wv?.loadURL(res?.url || tab.url).catch(() => {})) } },
      { sep: true, label: '' },
      { label: dark ? 'Обычные цвета' : 'Тёмная тема для сайта', icon: <Moon size={15} />, run: () => ready(() => { wv?.send('safu:dark', !dark); setDark(!dark) }) },
      { label: 'Крупнее', icon: <ZoomIn size={15} />, run: () => ready(() => { const z = Math.min(2, zoom + 0.1); wv?.setZoomFactor(z); setZoom(z) }) },
      { label: 'Мельче', icon: <ZoomOut size={15} />, run: () => ready(() => { const z = Math.max(0.5, zoom - 0.1); wv?.setZoomFactor(z); setZoom(z) }) },
      { label: 'Печать', icon: <Printer size={15} />, run: () => ready(() => wv?.print()) },
      { sep: true, label: '' },
      ...(looksLikeFile(tab.currentURL || '') ? [{ label: 'Сохранить этот файл в Файлы', icon: <Download size={15} />, run: () => ready(() => wv?.downloadURL(tab.currentURL || '')) }] : []),
      { label: 'Файлы на странице…', icon: <FileText size={15} />, run: () => { if (wv) void showPageFiles(e, wv) } },
      { sep: true, label: '' },
      { label: kv.get('download.target', '') ? 'Скачивать в «Загрузки»' : 'Скачивать в папку предмета…', icon: <Download size={15} />, run: () => chooseDownloadTarget(e, subj) },
      ...(saved ? [{ label: 'Вставить пароль', icon: <KeyRound size={15} />, run: () => ready(() => wv?.send('safu:fill', saved.user, saved.pass, false)) }] : []),
      { sep: true, label: '' },
      { label: 'Все вкладки', icon: <Layers size={15} />, run: () => sites.stack() },
      { label: 'Закрыть', icon: <X size={15} />, danger: true, run: () => closeWithSnapshot(tab.id) }
    ] : [
      { label: 'Открыть в программе', icon: <ExternalLink size={15} />, run: () => tab.fileRel && safu.fs.open(tab.fileRel) },
      { label: 'Показать в папке', icon: <FolderOpen size={15} />, run: () => tab.fileRel && safu.fs.reveal(tab.fileRel) },
      { label: 'Все вкладки', icon: <Layers size={15} />, run: () => sites.stack() },
      { label: 'Закрыть', icon: <X size={15} />, danger: true, run: () => closeWithSnapshot(tab.id) }
    ])
  }

  return (
    <div
      ref={boxRef}
      style={{
        position: 'fixed', left: '4%', right: '4%', top: 'calc(var(--titlebar) + 6px)', bottom: 0, zIndex: 100,
        transformOrigin: '0 0', willChange: 'transform, opacity',
        borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden',
        background: 'var(--glass-strong)', border: '1px solid var(--line2)', borderBottom: 'none',
        boxShadow: '0 -20px 80px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column',
        pointerEvents: visible ? 'auto' : 'none', visibility: shown ? 'visible' : 'hidden'
      }}
    >
      {/* шапка: потяни вниз (зажав кнопку мыши), чтобы свернуть */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'grab', borderBottom: '1px solid var(--line)', flexShrink: 0, touchAction: 'none' }}
        {...dragHandlers}
      >
        <button className="btn icon sm ghost round" onClick={() => closeWithSnapshot(tab.id)} title="Закрыть (Ctrl+W)"><X size={18} /></button>
        {tab.kind === 'site' && <>
          <button className="btn icon sm ghost round" disabled={!tab.canBack} onClick={() => ref.current?.goBack()} title="Назад"><ArrowLeft size={17} /></button>
          <button className="btn icon sm ghost round" disabled={!tab.canForward} onClick={() => ref.current?.goForward()} title="Вперёд"><ArrowRight size={17} /></button>
          <button className="btn icon sm ghost round" onClick={() => ref.current?.reload()} title="Обновить"><RotateCw size={16} className={tab.loading ? 'spin' : ''} /></button>
        </>}
        <div className="grow row" style={{ justifyContent: 'center', gap: 10, minWidth: 0 }}>
          <div className="icon-tile" style={{ width: 28, height: 28, borderRadius: 8, background: tab.kind === 'file' ? 'linear-gradient(135deg,#64748b,#334155)' : siteColor(tab.url, tab.title) }}>
            {tab.kind === 'file' ? <FileText size={15} /> : <SiteGlyph icon={tab.icon} size={15} />}
          </div>
          <div style={{ minWidth: 0, textAlign: 'center' }}>
            <div className="bold ellipsis" style={{ fontSize: '.92rem' }}>{tab.title}</div>
            {tab.kind === 'site' && <div className="tiny faint ellipsis row gap4" style={{ justifyContent: 'center' }}><Lock size={9} />{host}</div>}
          </div>
        </div>
        <AnimatePresence>
          {saved && formHost && (
            <motion.button className="btn sm primary" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => ref.current?.send('safu:fill', saved.user, saved.pass, true)}>
              <KeyRound size={14} /> Войти
            </motion.button>
          )}
        </AnimatePresence>
        <div className="row" style={{ gap: 0, borderRadius: 999, background: 'var(--fill2)', border: '1px solid var(--line)' }}>
          <button className="btn icon sm ghost round" onClick={() => minimizeWithSnapshot()} title="Свернуть (Esc)"><ChevronDown size={18} /></button>
          <button className="btn icon sm ghost round" onClick={menu} title="Ещё"><MoreHorizontal size={18} /></button>
        </div>
      </div>

      {/* полоска загрузки */}
      <div style={{ height: 2, position: 'relative', flexShrink: 0 }}>
        <AnimatePresence>
          {tab.loading && <motion.div initial={{ width: '0%', opacity: 1 }} animate={{ width: '85%' }} exit={{ width: '100%', opacity: 0 }} transition={{ duration: 2.5, ease: 'easeOut' }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--grad)', boxShadow: '0 0 10px rgba(var(--brand-rgb),.8)' }} />}
        </AnimatePresence>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        {tab.kind === 'site' ? (live &&
          <webview ref={ref} src={src} partition="persist:sites" preload={preload || undefined} allowpopups={"true" as any}
            webpreferences="contextIsolation=yes, spellcheck=yes" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', visibility: hideLive ? 'hidden' : 'visible' }} />
        ) : <FileView tab={tab} />}
        {/* снимок страницы: всегда на месте (уже раскодирован), видимость — только прозрачностью */}
        {tab.kind === 'site' && (shot || tab.snapshot) && (
          <img ref={veilRef} src={shot || tab.snapshot} alt="" draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', pointerEvents: 'none', opacity: 0, willChange: 'opacity' }} />
        )}
        <AnimatePresence>
          {failed && tab.kind === 'site' && (
            <motion.div className="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}>
              <div className="col" style={{ alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <div className="wobble" style={{ fontSize: '3.5rem' }}>🔌</div>
                <div className="h-card">{failed}</div>
                <div className="sub">{host}</div>
                <div className="row"><button className="btn primary" onClick={() => { setFailed(null); ref.current?.reload() }}><RotateCw size={15} /> Ещё раз</button><button className="btn" onClick={() => safu.shell.open(tab.currentURL || tab.url)}><ExternalLink size={15} /> В браузере</button></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* заставка: карточка вырастает из плитки значком сайта, потом под ней показывается страница */}
      <div ref={coverRef} className="center" style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', zIndex: 5, willChange: 'opacity',
        background: tab.kind === 'file' ? 'linear-gradient(135deg,#64748b,#334155)' : 'var(--grad)' }}>
        <div ref={iconRef} style={{ color: '#fff', display: 'grid', placeItems: 'center' }}>
          {tab.kind === 'file' ? <FileText size={64} /> : <SiteGlyph icon={tab.icon} size={64} />}
        </div>
      </div>
    </div>
  )
})

/** Все файлы со страницы (учебники, лекции, ресурсы Sakai) — нажал, и файл скачался в «Файлы» */
async function showPageFiles(e: React.MouseEvent, wv: any) {
  let list: PageFile[] = []
  try { list = (await wv.executeJavaScript(FIND_FILES_SCRIPT)) || [] } catch { list = [] }
  if (!list.length) { toast('На этой странице не нашлось файлов', 'info'); return }
  const shown = list.slice(0, 25)
  openMenu(e, [
    ...(list.length > 1 ? [{ label: `Скачать все (${Math.min(list.length, 30)})`, icon: <Download size={15} />, run: () => { for (const f of list.slice(0, 30)) wv.downloadURL(f.u) } }, { sep: true, label: '' }] : []),
    ...shown.map(f => ({ label: pageFileName(f).slice(0, 70), icon: <FileText size={15} />, run: () => wv.downloadURL(f.u) }))
  ])
}

function chooseDownloadTarget(e: React.MouseEvent, subj: string[]) {
  if (kv.get('download.target', '')) { kv.set('download.target', ''); toast('Файлы будут скачиваться в «Загрузки» (а с курса Sakai — в папку предмета)', 'info'); return }
  openMenu(e, subj.slice(0, 18).map(s => ({
    label: s, run: () => { kv.set('download.target', `Предметы/${s.replace(/[\\/:*?"<>|]/g, '_')}`); toast(`Скачанное попадёт в папку «${s}»`) }
  })))
}

const VIEWABLE = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'txt', 'md', 'html', 'htm', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'json', 'csv', 'log']

function FileView({ tab }: { tab: SiteTab }) {
  const ext = (tab.ext || '').toLowerCase()
  const url = tab.fileRel ? fileURL(tab.fileRel) : ''
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (['txt', 'md', 'json', 'csv', 'log'].includes(ext) && tab.fileRel) safu.fs.readText(tab.fileRel).then(setText).catch(() => setText(''))
  }, [tab.fileRel])
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return <div className="center" style={{ position: 'absolute', inset: 0, background: '#0b0d12' }}>
      <motion.img src={url} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={softSpring} style={{ maxWidth: '96%', maxHeight: '96%', objectFit: 'contain', borderRadius: 8 }} />
    </div>
  }
  if (['mp4', 'webm'].includes(ext)) return <video src={url} controls autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }} />
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return <div className="center" style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}><audio src={url} controls autoPlay /></div>
  if (text !== null) return <pre className="wrap" style={{ position: 'absolute', inset: 0, margin: 0, padding: 24, overflow: 'auto', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, userSelect: 'text' }}>{text}</pre>
  if (['html', 'htm'].includes(ext) && tab.fileRel) return <HtmlFile rel={tab.fileRel} url={url} />
  if (VIEWABLE.includes(ext)) return <webview src={url} plugins={"true" as any} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  return (
    <div className="center" style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}>
      <div className="col" style={{ alignItems: 'center', gap: 14 }}>
        <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className="icon-tile" style={{ width: 96, height: 96, borderRadius: 26, background: 'var(--grad)' }}><FileText size={46} /></motion.div>
        <div className="h-card">{tab.title}</div>
        <div className="sub">Этот файл откроется в программе {isLinux ? 'компьютера' : 'Windows'} ({ext.toUpperCase() || 'файл'})</div>
        <div className="row">
          <button className="btn primary" onClick={() => tab.fileRel && safu.fs.open(tab.fileRel)}><ExternalLink size={16} /> Открыть</button>
          <button className="btn" onClick={() => tab.fileRel && safu.fs.reveal(tab.fileRel)}><FolderOpen size={16} /> В папке</button>
        </div>
      </div>
    </div>
  )
}

/** HTML (решебники, сохранённые страницы) открывается там, где его оставили: место помним по файлу */
function HtmlFile({ rel, url }: { rel: string; url: string }) {
  const ref = useRef<any>(null)
  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const key = 'file.place.' + rel
    const saved = kv.get(key, 0)
    // пока страница не вернулась на место, её прыжки (загрузка с верха) не запоминаем
    let settled = saved <= 0
    let restored = false
    // пока страница грузится или вкладку уже закрыли, webview бросает ошибку сразу, а не в промисе
    const run = (code: string): Promise<unknown> => { try { return wv.executeJavaScript(code) } catch (e) { return Promise.reject(e) } }
    const same = (href: string) => { try { return decodeURI(href) === decodeURI(url) } catch { return href === url } }
    const read = () => {
      if (!settled) return
      run('[location.href.split("#")[0], Math.round(scrollY)]').then(r => {
        // по ссылке могли уйти на соседнюю страницу — её место не наше
        if (Array.isArray(r) && same(String(r[0])) && typeof r[1] === 'number' && r[1] >= 0) kv.set(key, r[1])
      }).catch(() => {})
    }
    // картинки догружаются уже после загрузки, и страница ещё растёт — догоняем нужное место до трёх секунд
    const restore = () => {
      if (restored) return
      restored = true
      if (settled) return
      run(`new Promise(done => { let n = 0; const go = () => { scrollTo(0, ${saved}); if (scrollY < ${saved} - 2 && n++ < 12) setTimeout(go, 250); else done(scrollY) }; go() })`)
        .catch(() => {}).finally(() => { settled = true })
    }
    wv.addEventListener('did-finish-load', restore)
    const t = setInterval(read, 1500)
    return () => { clearInterval(t); wv.removeEventListener('did-finish-load', restore); read() }
  }, [rel, url])
  return <webview ref={ref} src={url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

/** Плашка свёрнутых сайтов внизу окна */
function Pill({ tabs }: { tabs: SiteTab[] }) {
  const last = tabs[tabs.length - 1]
  return (
    <motion.div
      style={{ position: 'fixed', bottom: 18, left: '50%', zIndex: 95, x: '-50%' }}
      initial={{ y: 80, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 80, opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}>
      <motion.div className="row" data-site-origin="pill" whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
        style={{ gap: 10, padding: '7px 8px 7px 8px', borderRadius: 999, background: 'var(--glass-strong)', border: '1px solid var(--line2)', boxShadow: '0 14px 40px rgba(0,0,0,.35)', cursor: 'pointer' }}
        onClick={() => sites.expand(last.id)}>
        <div className="row" style={{ gap: 0 }}>
          {tabs.slice(-4).map((t, i) => (
            <motion.div key={t.id} layout className="icon-tile" style={{ width: 30, height: 30, borderRadius: '50%', marginLeft: i ? -9 : 0, border: '2px solid var(--bg2)', background: t.kind === 'file' ? '#475569' : siteColor(t.url, t.title), zIndex: i }}>
              {t.kind === 'file' ? <FileText size={13} /> : <SiteGlyph icon={t.icon} size={13} />}
            </motion.div>
          ))}
        </div>
        <div style={{ maxWidth: 220 }}>
          <div className="bold small ellipsis">{last.title}</div>
          {tabs.length > 1 && <div className="tiny faint">ещё {tabs.length - 1}</div>}
        </div>
        <div className="row" style={{ gap: 0, borderRadius: 999, background: 'var(--fill2)' }}>
          <button className="btn icon sm ghost round" title="Развернуть" onClick={e => { e.stopPropagation(); sites.expand(last.id) }}><ChevronUp size={17} /></button>
          {tabs.length > 1 && <button className="btn icon sm ghost round" title="Все вкладки" onClick={e => { e.stopPropagation(); sites.stack() }}><Layers size={15} /></button>}
          <button className="btn icon sm ghost round" title="Закрыть" onClick={e => { e.stopPropagation(); sites.close(last.id) }}><X size={16} /></button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Стопка открытых сайтов: карточки веером */
function Stack({ tabs }: { tabs: SiteTab[] }) {
  const ordered = [...tabs].reverse()
  return (
    <motion.div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(5,8,14,.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 70, overflowY: 'auto' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => sites.minimize()}>
      <div className="row" style={{ width: 'min(760px, 90%)', marginBottom: 16, color: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="h-card grow">Открыто: {tabs.length}</div>
        <button className="btn sm" style={{ color: '#fff' }} onClick={() => sites.closeAll()}>Закрыть все</button>
      </div>
      <div style={{ width: 'min(760px, 90%)', position: 'relative', perspective: 1400 }}>
        {ordered.map((t, i) => (
          <motion.div key={t.id} layout data-site-origin={t.id} onClick={e => { e.stopPropagation(); sites.expand(t.id) }}
            initial={{ opacity: 0, y: 120, rotateX: 30 }} animate={{ opacity: 1, y: 0, rotateX: 12 }} exit={{ opacity: 0, y: 60 }}
            whileHover={{ rotateX: 0, y: -14, scale: 1.02, zIndex: 50 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, delay: i * 0.05 }}
            drag="x" dragSnapToOrigin onDragEnd={(_e, info) => { if (Math.abs(info.offset.x) > 220) sites.close(t.id) }}
            style={{ height: 280, marginTop: i ? -170 : 0, borderRadius: 22, overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--line2)', boxShadow: '0 -10px 50px rgba(0,0,0,.5)', cursor: 'pointer', position: 'relative', transformOrigin: '50% 0%' }}>
            <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--glass-strong)' }}>
              <div className="icon-tile" style={{ width: 26, height: 26, borderRadius: 8, background: t.kind === 'file' ? '#475569' : siteColor(t.url, t.title) }}>
                {t.kind === 'file' ? <FileText size={13} /> : <SiteGlyph icon={t.icon} size={13} />}
              </div>
              <div className="bold grow ellipsis">{t.title}</div>
              <button className="btn icon sm ghost round" onClick={e => { e.stopPropagation(); sites.close(t.id) }}><X size={16} /></button>
            </div>
            {t.snapshot
              ? <img src={t.snapshot} style={{ width: '100%', display: 'block' }} />
              : <div className="center faint" style={{ height: 220 }}>{t.pageTitle || t.title}</div>}
          </motion.div>
        ))}
      </div>
      <div className="tiny" style={{ color: 'rgba(255,255,255,.6)', margin: '26px 0' }}>Нажми на карточку, чтобы открыть · смахни в сторону, чтобы закрыть</div>
    </motion.div>
  )
}

/** Приложение под открытым сайтом отъезжает назад (по желанию; по умолчанию выключено — так быстрее) */
export function useSiteBackdrop() {
  const mode = useSites(s => s.mode)
  const [anim] = usePref('ui.siteBackdrop', false)
  return anim && mode !== 'closed'
}
