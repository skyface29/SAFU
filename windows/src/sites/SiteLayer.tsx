// Слой сайтов-«мини-приложений», как в Telegram: развёрнутая карточка, плашка свёрнутых и стопка.
// Все страницы остаются загруженными: свернул — и вернулся на то же место.
import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import {
  X, ChevronDown, ChevronUp, MoreHorizontal, ArrowLeft, ArrowRight, RotateCw, ExternalLink, Copy, KeyRound, Home,
  Moon, ZoomIn, ZoomOut, Layers, FileText, FolderOpen, Lock, Download, Printer
} from 'lucide-react'
import { useSites, sites, type SiteTab } from './sites'
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
      if (e.ctrlKey && e.key.toLowerCase() === 'w' && s.active) { e.preventDefault(); sites.close(s.active) }
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
  const minimized = tabs.length > 0 && mode === 'closed'

  return (
    <>
      <AnimatePresence>
        {open && <motion.div key="dim" style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.35)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={minimizeWithSnapshot} />}
      </AnimatePresence>
      {tabs.map(t => <SiteCard key={t.id} tab={t} visible={open && active === t.id} preload={pre === 'none' ? '' : pre} />)}
      <AnimatePresence>{minimized && <Pill key="pill" tabs={tabs} />}</AnimatePresence>
      <AnimatePresence>{mode === 'stack' && <Stack key="stack" tabs={tabs} />}</AnimatePresence>
    </>
  )
}

export async function minimizeWithSnapshot() {
  const s = useSites.getState()
  const id = s.active
  const wv = id ? webviews.get(id) : null
  sites.minimize()
  if (wv && id) {
    try {
      const img = await wv.capturePage()
      sites.update(id, { snapshot: img.resize({ width: 520 }).toDataURL() })
    } catch { /* страница ещё не загрузилась */ }
  }
}

function SiteCard({ tab, visible, preload }: { tab: SiteTab; visible: boolean; preload: string }) {
  const y = useMotionValue(0)
  const scale = useTransform(y, [0, 400], [1, 0.86])
  const radius = useTransform(y, [0, 200], [18, 30])
  const [formHost, setFormHost] = useState<string | null>(null)
  const [offer, setOffer] = useState<{ host: string; user: string; pass: string } | null>(null)
  const credList = useCreds(s => s.list)
  const [zoom, setZoom] = useState(1)
  const [dark, setDark] = useState(false)
  const ref = useRef<any>(null)
  const res = tab.resourceId ? resourcesStore.get().find(r => r.id === tab.resourceId) : undefined

  useEffect(() => { if (visible) animate(y, 0, spring) }, [visible])

  useEffect(() => {
    const wv = ref.current
    if (!wv || tab.kind !== 'site') return
    webviews.set(tab.id, wv)
    const nav = () => {
      const url = wv.getURL()
      sites.update(tab.id, { currentURL: url, canBack: wv.canGoBack(), canForward: wv.canGoForward() })
      if (res) resources.saveLastURL(url, res)
    }
    const onTitle = (e: any) => sites.update(tab.id, { pageTitle: e.title })
    const onStart = () => sites.update(tab.id, { loading: true })
    const onStop = () => { sites.update(tab.id, { loading: false }); nav() }
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
    const onFail = (e: any) => { if (e.errorCode !== -3) sites.update(tab.id, { loading: false }) }
    wv.addEventListener('page-title-updated', onTitle)
    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', nav)
    wv.addEventListener('did-navigate-in-page', nav)
    wv.addEventListener('ipc-message', onMsg)
    wv.addEventListener('did-fail-load', onFail)
    return () => {
      webviews.delete(tab.id)
      wv.removeEventListener('page-title-updated', onTitle)
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', nav)
      wv.removeEventListener('did-navigate-in-page', nav)
      wv.removeEventListener('ipc-message', onMsg)
      wv.removeEventListener('did-fail-load', onFail)
    }
  }, [tab.id])

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
      { label: 'Закрыть', icon: <X size={15} />, danger: true, run: () => sites.close(tab.id) }
    ] : [
      { label: 'Открыть в программе', icon: <ExternalLink size={15} />, run: () => tab.fileRel && safu.fs.open(tab.fileRel) },
      { label: 'Показать в папке', icon: <FolderOpen size={15} />, run: () => tab.fileRel && safu.fs.reveal(tab.fileRel) },
      { label: 'Все вкладки', icon: <Layers size={15} />, run: () => sites.stack() },
      { label: 'Закрыть', icon: <X size={15} />, danger: true, run: () => sites.close(tab.id) }
    ])
  }

  return (
    <motion.div
      style={{
        position: 'fixed', left: '4%', right: '4%', top: 'calc(var(--titlebar) + 6px)', bottom: 0, zIndex: 100,
        y, scale, borderTopLeftRadius: radius, borderTopRightRadius: radius, overflow: 'hidden',
        background: 'var(--glass-strong)', border: '1px solid var(--line2)', borderBottom: 'none',
        boxShadow: '0 -20px 80px rgba(0,0,0,.45)', backdropFilter: 'blur(40px)', display: 'flex', flexDirection: 'column',
        pointerEvents: visible ? 'auto' : 'none', transformOrigin: '50% 100%'
      }}
      initial={false}
      animate={visible ? { opacity: 1, translateY: 0, scaleX: 1 } : { opacity: 0, translateY: '105%', scaleX: 0.9 }}
      transition={visible ? { type: 'spring', stiffness: 300, damping: 32 } : { type: 'spring', stiffness: 360, damping: 38 }}
    >
      {/* шапка: тяни вниз, чтобы свернуть */}
      <motion.div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'grab', borderBottom: '1px solid var(--line)', flexShrink: 0 }}
        onPan={(_e, info) => { if (info.offset.y > 0) y.set(info.offset.y) }}
        onPanEnd={(_e, info) => {
          if (info.offset.y > 140 || info.velocity.y > 800) { minimizeWithSnapshot(); setTimeout(() => y.set(0), 500) }
          else animate(y, 0, spring)
        }}
      >
        <button className="btn icon sm ghost round" onClick={() => sites.close(tab.id)} title="Закрыть (Ctrl+W)"><X size={18} /></button>
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
      </motion.div>

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
        {tab.kind === 'site' ? (
          <webview ref={ref} src={tab.url} partition="persist:sites" preload={preload || undefined} allowpopups={"true" as any}
            webpreferences="contextIsolation=yes, spellcheck=yes" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        ) : <FileView tab={tab} />}
      </div>
    </motion.div>
  )
}

function chooseDownloadTarget(e: React.MouseEvent, subj: string[]) {
  if (kv.get('download.target', '')) { kv.set('download.target', ''); toast('Файлы будут скачиваться в «Загрузки\\САФУ»', 'info'); return }
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
      <motion.div className="row" whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
        style={{ gap: 10, padding: '7px 8px 7px 8px', borderRadius: 999, background: 'var(--glass-strong)', border: '1px solid var(--line2)', boxShadow: '0 14px 40px rgba(0,0,0,.35)', backdropFilter: 'blur(30px)', cursor: 'pointer' }}
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
    <motion.div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(5,8,14,.6)', backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 70, overflowY: 'auto' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => sites.minimize()}>
      <div className="row" style={{ width: 'min(760px, 90%)', marginBottom: 16, color: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="h-card grow">Открыто: {tabs.length}</div>
        <button className="btn sm" style={{ color: '#fff' }} onClick={() => sites.closeAll()}>Закрыть все</button>
      </div>
      <div style={{ width: 'min(760px, 90%)', position: 'relative', perspective: 1400 }}>
        {ordered.map((t, i) => (
          <motion.div key={t.id} layout onClick={e => { e.stopPropagation(); sites.expand(t.id) }}
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
