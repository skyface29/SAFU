// «Файлы»: папки предметов в «Документы\САФУ». Миниатюры Windows, перетаскивание туда и обратно, поиск.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder, FolderPlus, Upload, Search, LayoutGrid, List, ChevronRight, Home, FileText, FileImage, FileArchive, FileSpreadsheet,
  FileVideo, FileAudio, FileCode, Presentation, File, ExternalLink, FolderOpen, Pencil, Trash2, MoveRight, RefreshCw, StickyNote, X, PanelTop
} from 'lucide-react'
import { PageHeader, Card, Segmented, Empty, openMenu, promptDialog, confirmDialog, toast } from '../ui/kit'
import { safu, fileURL, isDesktop, type FileInfo } from '../lib/bridge'
import { usePref } from '../lib/kv'
import { openFileCard } from '../sites/sites'
import { relativeAgo, dayMon } from '../lib/date'
import { useSchedule } from '../lib/scheduleStore'
import { subjects } from '../lib/schedule'
import { subjectFolder } from '../lib/effects'

export const fileKind = (ext: string) => {
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'svg'].includes(ext)) return { Icon: FileImage, color: '#10b981', label: 'Изображение' }
  if (['pdf'].includes(ext)) return { Icon: FileText, color: '#ef4444', label: 'PDF' }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return { Icon: FileText, color: '#2563eb', label: 'Документ' }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return { Icon: FileSpreadsheet, color: '#16a34a', label: 'Таблица' }
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return { Icon: Presentation, color: '#ea580c', label: 'Презентация' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { Icon: FileArchive, color: '#a16207', label: 'Архив' }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return { Icon: FileVideo, color: '#9333ea', label: 'Видео' }
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) return { Icon: FileAudio, color: '#db2777', label: 'Аудио' }
  if (['txt', 'md', 'log'].includes(ext)) return { Icon: StickyNote, color: '#eab308', label: 'Текст' }
  if (['py', 'js', 'ts', 'c', 'cpp', 'cs', 'java', 'html', 'css', 'json', 'swift', 'go', 'rs', 'ipynb', 'sql'].includes(ext)) return { Icon: FileCode, color: '#0891b2', label: 'Код' }
  return { Icon: File, color: '#64748b', label: ext.toUpperCase() || 'Файл' }
}

export const fmtSize = (b: number) => b < 1024 ? `${b} Б` : b < 1048576 ? `${(b / 1024).toFixed(0)} КБ` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} МБ` : `${(b / 1073741824).toFixed(2)} ГБ`

const CARD_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'txt', 'md', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'json', 'csv', 'log', 'html', 'htm']

export function openFile(f: FileInfo, inCard = true) {
  if (inCard && CARD_EXT.includes(f.ext)) openFileCard(f.rel, f.name, f.ext)
  else safu.fs.open(f.rel)
}

export function Thumb({ f, size = 140 }: { f: FileInfo; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const k = fileKind(f.ext)
  useEffect(() => {
    let alive = true
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(f.ext)) setSrc(fileURL(f.rel))
    else if (isDesktop && !f.dir) safu.fs.thumb(f.rel, 256).then((d: string | null) => { if (alive && d) setSrc(d) })
    return () => { alive = false }
  }, [f.rel, f.mtime])
  if (f.dir) return <FolderIcon name={f.name} size={size * 0.5} />
  return src
    ? <img src={src} draggable={false} style={{ width: '100%', height: size, objectFit: 'cover', borderRadius: 12, display: 'block', background: 'var(--fill)' }} />
    : <div className="center" style={{ height: size, borderRadius: 12, background: `linear-gradient(160deg, ${k.color}33, ${k.color}10)` }}>
      <k.Icon size={size * 0.32} color={k.color} strokeWidth={1.8} />
      <span className="tiny heavy" style={{ color: k.color, marginTop: 6 }}>{f.ext.toUpperCase()}</span>
    </div>
}

export function FolderIcon({ name, size = 60 }: { name: string; size?: number }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = h % 360
  return (
    <div className="center" style={{ height: size * 2, position: 'relative' }}>
      <svg width={size * 1.4} height={size * 1.15} viewBox="0 0 56 46">
        <defs><linearGradient id={`f${hue}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={`hsl(${hue} 80% 66%)`} /><stop offset="1" stopColor={`hsl(${hue} 70% 50%)`} /></linearGradient></defs>
        <path d="M4 6a4 4 0 0 1 4-4h12l5 5h23a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill={`hsl(${hue} 60% 42%)`} />
        <path d="M2 14a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill={`url(#f${hue})`} />
      </svg>
    </div>
  )
}

export default function Files({ path: startPath }: { path?: string }) {
  const [path, setPath] = useState(startPath || '')
  const [items, setItems] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = usePref<'grid' | 'list'>('files.view', 'grid')
  const [sort, setSort] = usePref<'name' | 'date' | 'size'>('files.sort', 'name')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<FileInfo[] | null>(null)
  const [drag, setDrag] = useState(false)
  const [root, setRoot] = useState('')
  const data = useSchedule(s => s.data)

  const load = async () => {
    setLoading(true)
    try { setItems(await safu.fs.list(path)) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [path])
  useEffect(() => { safu.fs.root().then(setRoot) }, [])
  useEffect(() => {
    if (!q.trim()) { setFound(null); return }
    const t = setTimeout(async () => {
      const all: FileInfo[] = await safu.fs.walk('')
      setFound(all.filter(f => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200))
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => { safu.fs.ensureDirs(['Предметы', ...subjects(data).map(subjectFolder)]) }, [data])
  useEffect(() => safu.app.on('download:progress', (p: any) => { if (p.state === 'completed') load() }), [path])

  const sorted = useMemo(() => {
    const l = [...(found || items)]
    l.sort((a, b) => Number(b.dir) - Number(a.dir) || (sort === 'date' ? b.mtime - a.mtime : sort === 'size' ? b.size - a.size : a.name.localeCompare(b.name, 'ru', { numeric: true })))
    return l
  }, [items, found, sort])

  const crumbs = path ? path.split('/') : []

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const paths = [...e.dataTransfer.files].map(f => safu.fs.pathFor(f)).filter(Boolean)
    if (!paths.length) return
    const r: string[] = await safu.fs.importPaths(path, paths)
    toast(`Добавлено: ${r.length}`)
    load()
  }

  const menu = (e: React.MouseEvent, f: FileInfo) => openMenu(e, [
    { label: f.dir ? 'Открыть' : 'Открыть карточкой', icon: <PanelTop size={15} />, run: () => f.dir ? setPath(f.rel) : openFile(f) },
    ...(!f.dir ? [{ label: 'Открыть в программе', icon: <ExternalLink size={15} />, run: () => safu.fs.open(f.rel) }] : []),
    { label: 'Показать в Проводнике', icon: <FolderOpen size={15} />, run: () => safu.fs.reveal(f.rel) },
    { label: 'Переименовать', icon: <Pencil size={15} />, run: async () => { const n = await promptDialog('Новое имя', f.name); if (n && n !== f.name) { await safu.fs.rename(f.rel, n); load() } } },
    { label: 'Переместить в предмет…', icon: <MoveRight size={15} />, run: () => openMenu(e, subjects(data).slice(0, 20).map(s => ({ label: s, run: async () => { await safu.fs.move(f.rel, subjectFolder(s)); toast(`Перемещено в «${s}»`); load() } }))) },
    { sep: true, label: '' },
    { label: 'В корзину', icon: <Trash2 size={15} />, danger: true, run: async () => { if (await confirmDialog(`Удалить «${f.name}»?`, 'Файл попадёт в корзину Windows.', 'Удалить', true)) { await safu.fs.trash(f.rel); load() } } }
  ])

  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={onDrop}>
      <PageHeader title="Файлы" subtitle={<span className="clickable" onClick={() => safu.fs.openRoot('')}>{root || 'Документы\\САФУ'}</span>}
        right={<>
          <button className="btn icon" onClick={load} title="Обновить"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
          <button className="btn" onClick={async () => { const n = await promptDialog('Новая папка', '', 'Название'); if (n) { await safu.fs.mkdir((path ? path + '/' : '') + n.replace(/[\\/:*?"<>|]/g, '_')); load() } }}><FolderPlus size={16} /> Папка</button>
          <button className="btn" onClick={async () => { const n = await promptDialog('Новая заметка', '', 'Название'); if (n) { await safu.fs.writeText(`${path ? path + '/' : ''}${n.replace(/[\\/:*?"<>|]/g, '_')}.txt`, ''); load() } }}><StickyNote size={16} /> Текст</button>
          <button className="btn primary" onClick={async () => { const r = await safu.fs.import(path); if (r.length) { toast(`Добавлено: ${r.length}`); load() } }}><Upload size={16} /> Добавить файлы</button>
        </>} />

      <div className="row mb16 wrap-row">
        <div className="row" style={{ gap: 2, padding: 4, borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)' }}>
          <button className="btn sm ghost" onClick={() => setPath('')}><Home size={14} /> САФУ</button>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={14} className="faint" />
              <motion.button initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="btn sm ghost" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>{c}</motion.button>
            </React.Fragment>
          ))}
        </div>
        <span className="spacer" />
        <div className="row" style={{ padding: '0 12px', borderRadius: 12, background: 'var(--fill)', border: '1px solid var(--line)', height: 38, width: 260 }}>
          <Search size={15} className="faint" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по всем файлам" style={{ background: 'none', border: 'none', outline: 'none', flex: 1 }} />
          {q && <X size={14} className="clickable faint" onClick={() => setQ('')} />}
        </div>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'name', label: 'Имя' }, { value: 'date', label: 'Дата' }, { value: 'size', label: 'Размер' }]} />
        <Segmented value={view} onChange={setView} options={[{ value: 'grid', label: <LayoutGrid size={14} /> }, { value: 'list', label: <List size={14} /> }]} />
      </div>

      <div className={drag ? 'drop-zone' : ''} style={{ borderRadius: 20, minHeight: 300, padding: drag ? 10 : 0, transition: 'padding .2s' }}>
        {!sorted.length && !loading && <Empty emoji={q ? '🔍' : '📂'} title={q ? 'Ничего не нашлось' : 'Папка пустая'} text={q ? undefined : 'Перетащи сюда файлы из Проводника или нажми «Добавить файлы». Лекции, методички, фото доски — по папкам предметов.'} />}
        {view === 'grid' ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            <AnimatePresence>
              {sorted.map((f, i) => (
                <motion.div key={f.rel} layout initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: Math.min(i, 20) * 0.015, type: 'spring', stiffness: 300, damping: 26 }}
                  whileHover={{ y: -4 }} className="card hover" style={{ padding: 8, cursor: 'pointer' }}
                  draggable={!f.dir} onDragStart={e => { e.preventDefault(); safu.fs.dragOut(f.rel) }}
                  onDoubleClick={() => f.dir ? setPath(f.rel) : openFile(f)} onClick={() => f.dir ? setPath(f.rel) : openFile(f)} onContextMenu={e => menu(e, f)}>
                  <Thumb f={f} size={120} />
                  <div className="small bold ellipsis" style={{ marginTop: 8, padding: '0 4px' }} title={f.name}>{f.name}</div>
                  <div className="tiny faint" style={{ padding: '0 4px 2px' }}>{f.dir ? 'Папка' : `${fmtSize(f.size)} · ${dayMon(f.mtime)}`}</div>
                  {found && <div className="tiny muted ellipsis" style={{ padding: '0 4px' }}>{f.rel.split('/').slice(0, -1).join(' › ')}</div>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <Card flush className="list">
            {sorted.map(f => {
              const k = fileKind(f.ext)
              return (
                <div key={f.rel} className="list-row click" onClick={() => f.dir ? setPath(f.rel) : openFile(f)} onContextMenu={e => menu(e, f)} draggable={!f.dir} onDragStart={e => { e.preventDefault(); safu.fs.dragOut(f.rel) }}>
                  <div className="icon-tile" style={{ background: f.dir ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : k.color }}>{f.dir ? <Folder size={16} /> : <k.Icon size={16} />}</div>
                  <div className="grow"><div className="bold small ellipsis">{f.name}</div>{found && <div className="tiny faint">{f.rel}</div>}</div>
                  <span className="tiny muted" style={{ width: 90 }}>{f.dir ? '' : fmtSize(f.size)}</span>
                  <span className="tiny muted" style={{ width: 130 }}>{relativeAgo(f.mtime)}</span>
                </div>
              )
            })}
          </Card>
        )}
      </div>
      <AnimatePresence>
        {drag && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="toast" style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 300 }}><Upload size={18} /> Отпусти, чтобы добавить в «{crumbs[crumbs.length - 1] || 'САФУ'}»</motion.div>}
      </AnimatePresence>
    </div>
  )
}
