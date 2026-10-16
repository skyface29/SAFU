// Слой сайтов-«мини-приложений», как в Telegram: развёрнутая карточка, плашка свёрнутых и стопка.
// Все страницы остаются загруженными: свернул — и вернулся на то же место.
import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
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


let preloadURL = ''
safu.sites.preload().then(u => { preloadURL = u })

const webviews = new Map<string, any>()
/** Карточка готовится уехать: снимает полноразмерный снимок страницы и прячет живую страницу */
const preparers = new Map<string, () => Promise<void>>()
/** Последний снимок страницы (из него же — маленький для плашки и стопки) */
const lastImages = new Map<string, any>()

async function prepare(id: string | null) {
  const f = id ? preparers.get(id) : null
  if (f) await Promise.race([f(), new Promise(r => setTimeout(r, 180))])
}

/** Закрыть вкладку: сначала снимок, чтобы карточка уезжала гладко, а не с живой страницей */
export async function closeWithSnapshot(id: string) {
  const s = useSites.getState()
  if (s.active === id && s.mode === 'open') await prepare(id)
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
      try { if (wv.getWebContentsId() === id) { wv.loadURL(url); sites.expand(tabId); return } } catch { /* ещё не готов */ }
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

export async function minimizeWithSnapshot() {
  const s = useSites.getState()
  const id = s.active
  // полноразмерный снимок — до анимации: карточка едет с картинкой, живая страница спрятана
  await prepare(id)
  sites.minimize()
  if (!id) return
  // маленький снимок для стопки — после того, как карточка доехала, чтобы не попасть на анимацию
  setTimeout(() => {
    const img = lastImages.get(id)
    try { if (img) sites.update(id, { snapshot: img.resize({ width: 420 }).toDataURL() }) } catch { /* страница ещё не загрузилась */ }
  }, 600)
}

/** Свёрнутый сайт, который не открывали 10 минут, выгружается из памяти (снимок и адрес остаются) */
const UNLOAD_AFTER = 10 * 60_000

// одна вкладка обновилась (загрузка, заголовок) — перерисовывается только её карточка
const SiteCard = React.memo(function SiteCard({ tab, visible, preload }: { tab: SiteTab; visible: boolean; preload: string }) {
  // карточка двигается только трансформацией (на видеокарте): сдвиг, масштаб по осям и прозрачность
  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const sx = useMotionValue(1)
  const sy = useMotionValue(1)
  const op = useMotionValue(visible ? 1 : 0)
  // заставка с значком сайта: карточка вырастает из плитки ею, пока страница грузится
  const cover = useMotionValue(0)
  // значок на заставке не сплющивается вместе с карточкой
  const iconSX = useTransform([sx, sy], ([a, b]: number[]) => Math.min(a, b) / Math.max(a, 0.001))
  const iconSY = useTransform([sx, sy], ([a, b]: number[]) => Math.min(a, b) / Math.max(b, 0.001))
  const boxRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(visible)
  const [formHost, setFormHost] = useState<string | null>(null)
  const [offer, setOffer] = useState<{ host: string; user: string; pass: string } | null>(null)
  const credList = useCreds(s => s.list)
  const [zoom, setZoom] = useState(1)
  const [dark, setDark] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const ref = useRef<any>(null)
  const res = tab.resourceId ? resourcesStore.get().find(r => r.id === tab.resourceId) : undefined
  // вкладка после перезапуска: страница грузится, только когда её впервые развернули
  const [live, setLive] = useState(!tab.dormant)
  // адрес, с которого страница стартует (при повторной загрузке — тот, где остановились)
  const [src, setSrc] = useState(tab.currentURL || tab.url)
  // пока карточка едет (свернуть, закрыть, развернуть), живая страница спрятана, а вместо неё — снимок:
  // двигать живую страницу из другого процесса тяжело, отсюда и были рывки «как в 30 кадров»
  const [still, setStillState] = useState(!visible)
  const stillRef = useRef(!visible)
  const setStill = (v: boolean) => { stillRef.current = v; setStillState(v) }
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  // полноразмерный снимок страницы (JPEG в памяти): на нём карточка и едет
  const [shot, setShot] = useState<string | null>(null)
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot) }, [shot])
  const grab = async () => {
    const wv = ref.current
    if (!wv || tab.kind !== 'site' || !live || stillRef.current) return
    try {
      const img = await wv.capturePage()
      if (!img || img.isEmpty()) return
      lastImages.set(tab.id, img)
      setShot(URL.createObjectURL(new Blob([img.toJPEG(86)], { type: 'image/jpeg' })))
    } catch { /* страница ещё грузится */ }
  }
  useEffect(() => {
    preparers.set(tab.id, async () => { await grab(); setStill(true) })
    return () => { preparers.delete(tab.id) }
  })

  // появление и уход карточки
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; if (!visible) return }
    const el = boxRef.current
    if (!el) return
    const f = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth || 1, h: el.offsetHeight || 1 }
    const toward = (r: OriginRect) => ({ x: r.x - f.x, y: r.y - f.y, sx: Math.max(0.02, r.w / f.w), sy: Math.max(0.02, r.h / f.h) })
    const running: { stop: () => void }[] = []
    const go = (mv: any, to: number, tr: any) => { const c = animate(mv, to, tr); running.push(c); return c }
    const picture = tab.kind === 'file' || !!shot || !!tab.snapshot
    if (visible) {
      setShown(true)
      setStill(true)
      const from = sites.expandedFrom(tab.id) ?? originRect(tab.id)
      if (from) {
        // вырастает из плитки (или из плашки свёрнутых)
        const t = toward(from)
        tx.set(t.x); ty.set(t.y); sx.set(t.sx); sy.set(t.sy); op.set(0.6)
        cover.set(picture ? 0 : 1)
      } else if (op.get() < 0.05) {
        tx.set(0); ty.set(f.h * 0.3); sx.set(0.96); sy.set(0.96); op.set(0)
        cover.set(0)
      }
      const sp = { type: 'spring', stiffness: 240, damping: 29, mass: 0.85, restDelta: 0.001 }
      go(op, 1, { duration: 0.14, ease: 'easeOut' })
      go(tx, 0, sp); go(sx, 1, sp); go(sy, 1, sp)
      go(ty, 0, sp).then(() => {
        if (!visibleRef.current) return
        setStill(false)
        go(cover, 0, { duration: 0.24, ease: 'easeOut' })
      })
    } else {
      setStill(true)
      const mode = useSites.getState().mode
      const target = tab.closing ? originRect(tab.id) : mode === 'closed' ? pillRect() : null
      const sp = { type: 'spring', stiffness: 330, damping: 34, mass: 0.8, restDelta: 0.001 }
      let done: { then: (f: () => void) => unknown }
      if (target) {
        // садится обратно в плитку (закрыли) или в плашку внизу (свернули)
        const t = toward(target)
        if (tab.closing) go(cover, 1, { duration: 0.16 })
        go(tx, t.x, sp); go(sx, t.sx, sp); go(sy, t.sy, sp)
        done = go(ty, t.y, sp)
        go(op, 0, { duration: 0.12, delay: 0.2 })
      } else if (mode === 'open') {
        done = go(op, 0, { duration: 0.12 })
      } else {
        go(ty, f.h * 0.55, sp)
        done = go(op, 0, { duration: 0.22 })
      }
      done.then(() => {
        if (visibleRef.current) return
        setShown(false)
        tx.set(0); ty.set(0); sx.set(1); sy.set(1); cover.set(0)
      })
    }
    return () => running.forEach(c => c.stop())
  }, [visible])

  // шапка: потянуть вниз — свернуть. Тянется, только пока кнопка мыши зажата
  const drag = useRef<{ id: number; y0: number; on: boolean; lastY: number; lastT: number; v: number } | null>(null)
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (!d?.on) return
    if (ty.get() > 140 || d.v > 0.9) { minimizeWithSnapshot(); return }
    const sp = { type: 'spring' as const, stiffness: 420, damping: 34 }
    animate(tx, 0, sp); animate(sx, 1, sp); animate(sy, 1, sp)
    animate(ty, 0, sp).then(() => { if (drag.current === null && visibleRef.current) setStill(false) })
  }
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, y0: e.clientY, on: false, lastY: e.clientY, lastT: performance.now(), v: 0 }
      void grab() // снимок заранее: если потянут — карточка поедет уже с ним
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
        setStill(true)
      }
      const now = performance.now()
      d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
      d.lastY = e.clientY
      d.lastT = now
      const off = Math.max(0, dy - 6)
      const k = 1 - Math.min(0.14, off / 2600)
      const w = boxRef.current?.offsetWidth || 0
      ty.set(off); sx.set(k); sy.set(k); tx.set((w * (1 - k)) / 2)
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture: endDrag
  }

  useEffect(() => {
    if (!visible) {
      // долго свёрнута — отпускаем память; развернёшь — загрузится там же
      if (!live || tab.kind !== 'site') return
      const t = setTimeout(() => {
        const cur = useSites.getState().tabs.find(x => x.id === tab.id)
        setLive(false)
        sites.update(tab.id, { dormant: true, loading: false, url: cur?.currentURL || cur?.url || tab.url })
      }, UNLOAD_AFTER)
      return () => clearTimeout(t)
    }
    if (!live) {
      const cur = useSites.getState().tabs.find(x => x.id === tab.id)
      setSrc(cur?.currentURL || cur?.url || tab.url)
      setLive(true)
      sites.update(tab.id, { dormant: false })
    }
  }, [visible])

  useEffect(() => {
    const wv = ref.current
    if (!wv || tab.kind !== 'site' || !live) return
    webviews.set(tab.id, wv)
    const nav = () => {
      const url = wv.getURL()
      sites.update(tab.id, { currentURL: url, canBack: wv.canGoBack(), canForward: wv.canGoForward() })
      if (res) resources.saveLastURL(url, res)
    }
    const onTitle = (e: any) => sites.update(tab.id, { pageTitle: e.title })
    // сайт молчит 45 секунд — честно говорим, а не держим полоску загрузки вечно
    let slow: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    const onStart = () => {
      sites.update(tab.id, { loading: true }); setFailed(null)
      if (slow) clearTimeout(slow)
      timedOut = false
      slow = setTimeout(() => { timedOut = true; setFailed('Сайт долго не отвечает — возможно, он на обслуживании или нет интернета') }, 45_000)
    }
    const onStop = () => {
      if (slow) { clearTimeout(slow); slow = null }
      if (timedOut) { timedOut = false; setFailed(null) }
      sites.update(tab.id, { loading: false }); nav()
    }
    const onMsg = (e: any) => {
      const [p] = e.args || []
      if (e.channel === 'safu:form') {
        setFormHost(p.host)
        const c = creds.get(p.host)
        if (c && kv.get('sites.autoFill', true)) wv.send('safu:fill', c.user, c.pass, kv.get('sites.autoLogin', false))
      }
      if (e.channel === 'safu:gone') setFormHost(null)
      if (e.channel === 'safu:creds' && p.pass) {
        const c = creds.get(p.host)
        if (!c || c.pass !== p.pass || (p.user && c.user !== p.user)) setOffer(p)
      }
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
    return () => {
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
    const subj = subjects(useSchedule.getState().data)
    openMenu(e, tab.kind === 'site' ? [
      { label: 'Открыть в браузере', icon: <ExternalLink size={15} />, run: () => safu.shell.open(tab.currentURL || tab.url) },
      { label: 'Копировать ссылку', icon: <Copy size={15} />, run: () => { safu.clipboard.write(tab.currentURL || tab.url); toast('Ссылка скопирована') } },
      { label: 'На главную сайта', icon: <Home size={15} />, run: () => { if (res) resources.clearLastURL(res); wv?.loadURL(res?.url || tab.url) } },
      { sep: true, label: '' },
      { label: dark ? 'Обычные цвета' : 'Тёмная тема для сайта', icon: <Moon size={15} />, run: () => { wv?.send('safu:dark', !dark); setDark(!dark) } },
      { label: 'Крупнее', icon: <ZoomIn size={15} />, run: () => { const z = Math.min(2, zoom + 0.1); setZoom(z); wv?.setZoomFactor(z) } },
      { label: 'Мельче', icon: <ZoomOut size={15} />, run: () => { const z = Math.max(0.5, zoom - 0.1); setZoom(z); wv?.setZoomFactor(z) } },
      { label: 'Печать', icon: <Printer size={15} />, run: () => wv?.print() },
      { sep: true, label: '' },
      { label: kv.get('download.target', '') ? 'Скачивать в «Загрузки»' : 'Скачивать в папку предмета…', icon: <Download size={15} />, run: () => chooseDownloadTarget(e, subj) },
      ...(saved ? [{ label: 'Вставить пароль', icon: <KeyRound size={15} />, run: () => wv?.send('safu:fill', saved.user, saved.pass, false) }] : []),
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
    <motion.div
      ref={boxRef}
      style={{
        position: 'fixed', left: '4%', right: '4%', top: 'calc(var(--titlebar) + 6px)', bottom: 0, zIndex: 100,
        x: tx, y: ty, scaleX: sx, scaleY: sy, opacity: op, transformOrigin: '0 0', willChange: 'transform, opacity',
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

      {/* предложение сохранить пароль */}
      <AnimatePresence>
        {offer && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', flexShrink: 0 }}>
            <div className="row" style={{ padding: '10px 16px', background: 'rgba(var(--brand-rgb), .12)', borderBottom: '1px solid var(--line)' }}>
              <KeyRound size={18} color="var(--brand)" />
              <div className="grow small"><b>Сохранить пароль</b> для {offer.host}{offer.user ? ` (${offer.user})` : ''}? Он будет зашифрован средствами Windows.</div>
              <button className="btn sm" onClick={() => setOffer(null)}>Не сейчас</button>
              <button className="btn sm primary" onClick={async () => { await creds.set(offer); setOffer(null); toast('Пароль сохранён') }}>Сохранить</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        {tab.kind === 'site' ? (live &&
          <webview ref={ref} src={src} partition="persist:sites" preload={preload || undefined} allowpopups={"true" as any}
            webpreferences="contextIsolation=yes, spellcheck=yes" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', visibility: still ? 'hidden' : 'visible' }} />
        ) : <FileView tab={tab} />}
        {still && tab.kind === 'site' && (shot || tab.snapshot) && (
          <img src={shot || tab.snapshot} alt="" draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', pointerEvents: 'none' }} />
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
      <motion.div className="center" style={{ position: 'absolute', inset: 0, opacity: cover, pointerEvents: 'none', zIndex: 5,
        background: tab.kind === 'file' ? 'linear-gradient(135deg,#64748b,#334155)' : 'var(--grad)' }}>
        <motion.div style={{ scaleX: iconSX, scaleY: iconSY, color: '#fff', display: 'grid', placeItems: 'center' }}>
          {tab.kind === 'file' ? <FileText size={64} /> : <SiteGlyph icon={tab.icon} size={64} />}
        </motion.div>
      </motion.div>
    </motion.div>
  )
})

function chooseDownloadTarget(e: React.MouseEvent, subj: string[]) {
  if (kv.get('download.target', '')) { kv.set('download.target', ''); toast('Файлы будут скачиваться в «Загрузки\\Арктика»', 'info'); return }
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
  if (VIEWABLE.includes(ext)) return <webview src={url} plugins={"true" as any} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  return (
    <div className="center" style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}>
      <div className="col" style={{ alignItems: 'center', gap: 14 }}>
        <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className="icon-tile" style={{ width: 96, height: 96, borderRadius: 26, background: 'var(--grad)' }}><FileText size={46} /></motion.div>
        <div className="h-card">{tab.title}</div>
        <div className="sub">Этот файл откроется в программе Windows ({ext.toUpperCase() || 'файл'})</div>
        <div className="row">
          <button className="btn primary" onClick={() => tab.fileRel && safu.fs.open(tab.fileRel)}><ExternalLink size={16} /> Открыть</button>
          <button className="btn" onClick={() => tab.fileRel && safu.fs.reveal(tab.fileRel)}><FolderOpen size={16} /> В папке</button>
        </div>
      </div>
    </div>
  )
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

/** Приложение под открытым сайтом отъезжает назад */
export function useSiteBackdrop() {
  const mode = useSites(s => s.mode)
  const [anim] = usePref('ui.siteBackdrop', true)
  return anim && mode !== 'closed'
}
