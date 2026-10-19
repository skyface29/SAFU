// Перенос с iPhone по QR: показал код — навёл телефон — файлы перелетают на компьютер
import React, { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, Laptop, Wifi, ShieldCheck, Check, RefreshCw, FolderOpen, RotateCcw, AlertTriangle, X, Camera } from 'lucide-react'
import { PageHeader, Card, Ring, softSpring, bouncy } from '../ui/kit'
import { useTransfer, transfer, formatBytes, type FlyingFile } from '../lib/transfer'
import { encodeQr, qrPath } from '../lib/qr'
import { safu } from '../lib/bridge'
import { go } from '../lib/nav'
import { plural } from '../lib/date'
import { isLinux } from '../lib/os'

export default function TransferPage() {
  return (
    <>
      <PageHeader title="Перенос с iPhone" subtitle="Файлы предметов, фото доски, ДЗ и настройки — по Wi‑Fi, напрямую: без кабеля, облаков и пересылки себе в Telegram" />
      <TransferPanel />
    </>
  )
}

/** Сам перенос — на странице и в окне при первом запуске */
export function TransferPanel({ onClose }: { onClose?: () => void }) {
  const s = useTransfer()

  useEffect(() => {
    const st = useTransfer.getState()
    if (st.phase === 'idle' || st.phase === 'error') transfer.start()
    return () => {
      // ушли с экрана, пока телефон не подключился, — приём закрываем; идущий перенос не трогаем
      const p = useTransfer.getState().phase
      if (p === 'waiting' || p === 'starting') transfer.stop()
    }
  }, [])

  return (
    <Card style={{ padding: 28, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 320px at 15% 0%, rgba(var(--brand-rgb), .18), transparent)', pointerEvents: 'none' }} />
      {onClose && <button className="btn icon sm ghost" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }} title="Закрыть"><X size={16} /></button>}
      <AnimatePresence mode="wait">
        {(s.phase === 'starting' || s.phase === 'waiting' || s.phase === 'connected' || (s.phase === 'idle' && !s.expired)) && <Waiting key="wait" />}
        {s.phase === 'idle' && s.expired && <Expired key="expired" />}
        {s.phase === 'sending' && <Sending key="send" />}
        {s.phase === 'done' && <Done key="done" onClose={onClose} />}
        {s.phase === 'error' && <Failed key="err" />}
      </AnimatePresence>
    </Card>
  )
}

const enter = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: softSpring }

// ---------- QR и подсказки ----------

function QrBox({ url, connected }: { url: string; connected: boolean }) {
  const m = useMemo(() => (url ? encodeQr(url, 'M') : null), [url])
  const n = m ? m.size + 8 : 0
  return (
    <div className="qr-wrap">
      <motion.div className="qr-ring" animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
      <div className="qr-box">
        <AnimatePresence mode="wait">
          {connected ? (
            <motion.div key="ok" className="center" style={{ width: 264, height: 264 }} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy}>
              <div className="col" style={{ alignItems: 'center', gap: 12, color: '#0b1020' }}>
                <motion.div className="icon-tile" style={{ width: 84, height: 84, borderRadius: 26, background: 'linear-gradient(135deg,#22c55e,#10b981)' }}
                  animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
                  <Smartphone size={40} />
                </motion.div>
                <div className="bold">Телефон подключился</div>
              </div>
            </motion.div>
          ) : m ? (
            <motion.svg key="qr" viewBox={`0 0 ${n} ${n}`} width={264} height={264} shapeRendering="crispEdges"
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring}>
              <rect width={n} height={n} fill="#fff" />
              <path d={qrPath(m, 4)} fill="#0b1020" />
            </motion.svg>
          ) : (
            <div className="center" style={{ width: 264, height: 264 }}><RefreshCw className="spin" size={28} color="#94a3b8" /></div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Step({ n, icon, title, sub, warn }: { n: number; icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <motion.div className="row top" style={{ gap: 14 }} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...softSpring, delay: 0.08 * n }}>
      <div className="icon-tile" style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: warn ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--grad)' }}>{icon}</div>
      <div className="grow">
        <div className="bold">{title}</div>
        {sub && <div className="sub mt4">{sub}</div>}
      </div>
    </motion.div>
  )
}

function Waiting() {
  const s = useTransfer()
  const connected = s.phase === 'connected'
  return (
    <motion.div {...enter} className="row top wrap-row" style={{ gap: 36, position: 'relative' }}>
      <div className="col" style={{ alignItems: 'center', gap: 14 }}>
        <QrBox url={s.url} connected={connected} />
        <div className="small muted tc" style={{ maxWidth: 296 }}>
          {connected ? <>Выбери на iPhone, что перенести, и нажми <b>«Перенести»</b></> : <>Наведи камеру iPhone на код</>}
        </div>
      </div>
      <div className="col grow" style={{ gap: 20, minWidth: 300, paddingTop: 6 }}>
        <div>
          <div className="h-card" style={{ fontSize: '1.35rem' }}>{connected ? `${s.device} на связи` : 'Перенеси всё с iPhone за минуту'}</div>
          <div className="sub mt4">Файлы предметов, фото доски по парам, ДЗ, задачи, заметки, оценки и настройки. Повторный перенос шлёт только новое.</div>
        </div>
        <Step n={1} icon={<Camera size={20} />} title="Открой камеру iPhone и наведи на код"
          sub={<>Откроется Арктика. Или в самой Арктике: <b>Профиль → Перенос на компьютер</b></>} />
        {s.hosts.length ? (
          <Step n={2} icon={<Wifi size={20} />} title="Телефон и компьютер — в одной сети Wi‑Fi"
            sub={<>Этот компьютер в сети: <span className="mono">{s.hosts[0]}</span>. Нет общего Wi‑Fi — включи на iPhone «Режим модема», подключи к нему компьютер и нажми «Новый код»</>} />
        ) : (
          <Step n={2} warn icon={<Wifi size={20} />} title="Компьютер не подключён к сети"
            sub="Подключи его к Wi‑Fi (к той же сети, что и телефон) или включи на iPhone «Режим модема» и подключи к нему компьютер — и нажми «Новый код»" />
        )}
        <Step n={3} icon={<ShieldCheck size={20} />} title={isLinux ? 'Файлы идут напрямую и зашифрованы' : 'Windows спросит про доступ к сети — нажми «Разрешить»'}
          sub={'Файлы идут напрямую, по воздуху, и шифруются AES‑256. Ключ есть только в этом QR-коде и меняется каждый раз — в общей сети их никто не подсмотрит' +
            (isLinux ? '. Если включён брандмауэр (ufw, firewalld) и телефон не подключается — разреши порты Арктики в «Синхронизации с iPhone»' : '')} />
        <div className="row gap8">
          <button className="btn sm" onClick={() => transfer.start()}><RefreshCw size={14} /> Новый код</button>
          <span className="tiny faint">Код работает 15 минут{s.pc ? ` · ${s.pc}` : ''}</span>
        </div>
      </div>
    </motion.div>
  )
}

function Expired() {
  return (
    <motion.div {...enter} className="col center" style={{ gap: 14, padding: '40px 0' }}>
      <div className="icon-tile" style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#64748b,#334155)' }}><RotateCcw size={28} /></div>
      <div className="h-card">Код устарел</div>
      <div className="sub tc" style={{ maxWidth: 380 }}>Телефон долго не подключался, и приём закрылся — так безопаснее. Новый код — одной кнопкой.</div>
      <button className="btn primary" onClick={() => transfer.start()}><RefreshCw size={15} /> Показать новый код</button>
    </motion.div>
  )
}

function Failed() {
  const s = useTransfer()
  return (
    <motion.div {...enter} className="col center" style={{ gap: 14, padding: '40px 0' }}>
      <div className="icon-tile" style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}><AlertTriangle size={28} /></div>
      <div className="h-card">Не получилось</div>
      <div className="sub tc" style={{ maxWidth: 420 }}>{s.error}</div>
      <button className="btn primary" onClick={() => transfer.start()}><RefreshCw size={15} /> Попробовать снова</button>
    </motion.div>
  )
}

// ---------- перенос: файлы летят с телефона на компьютер ----------

const LANE = 340

function extColor(ext: string): string {
  if (/^(JPG|JPEG|PNG|HEIC|WEBP|GIF)$/.test(ext)) return 'linear-gradient(135deg,#14b8a6,#0ea5e9)'
  if (ext === 'PDF') return 'linear-gradient(135deg,#ef4444,#f97316)'
  if (/^(DOC|DOCX|RTF|ODT|TXT)$/.test(ext)) return 'linear-gradient(135deg,#2563eb,#6366f1)'
  if (/^(XLS|XLSX|CSV)$/.test(ext)) return 'linear-gradient(135deg,#16a34a,#22c55e)'
  if (/^(PPT|PPTX|KEY)$/.test(ext)) return 'linear-gradient(135deg,#f97316,#f59e0b)'
  if (/^(M4A|MP3|WAV|AAC|CAF)$/.test(ext)) return 'linear-gradient(135deg,#a855f7,#ec4899)'
  return 'linear-gradient(135deg,#64748b,#475569)'
}

function Flyer({ f }: { f: FlyingFile }) {
  const lift = 30 + (f.id % 3) * 18
  return (
    <motion.div className="xfer-file" style={{ background: extColor(f.ext) }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.5, rotate: -8 }}
      animate={{ x: [0, LANE / 2, LANE], y: [0, -lift, 0], opacity: [0, 1, 1, 0], scale: [0.5, 1.05, 0.6], rotate: [-8, 0, 6] }}
      transition={{
        default: { duration: 1.2, ease: [0.3, 0.1, 0.3, 1], times: [0, 0.5, 1] },
        opacity: { duration: 1.2, times: [0, 0.15, 0.85, 1] }
      }}>
      {f.ext || 'FILE'}
    </motion.div>
  )
}

function Sending() {
  const s = useTransfer()
  const frac = s.total ? s.done / s.total : 0
  const left = s.speed > 0 ? Math.max(0, (s.total - s.done) / s.speed) : 0
  const eta = left < 60 ? `${Math.max(1, Math.round(left))} с` : `${Math.round(left / 60)} мин`
  return (
    <motion.div {...enter} className="col" style={{ gap: 26, alignItems: 'center', padding: '10px 0' }}>
      <div className="row" style={{ gap: 24, alignItems: 'center' }}>
        <div className="col" style={{ alignItems: 'center', gap: 8, width: 120 }}>
          <div className="icon-tile" style={{ width: 70, height: 70, borderRadius: 22, background: 'linear-gradient(135deg,#111827,#4b5563)' }}><Smartphone size={34} /></div>
          <div className="small bold ellipsis" style={{ maxWidth: 120 }}>{s.device || 'iPhone'}</div>
        </div>
        <div className="xfer-lane" style={{ width: LANE }}>
          <div className="xfer-dash" />
          <AnimatePresence>{s.flying.map(f => <Flyer key={f.id} f={f} />)}</AnimatePresence>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 8, width: 120 }}>
          <motion.div className="icon-tile" style={{ width: 70, height: 70, borderRadius: 22, background: 'var(--grad)' }}
            animate={{ scale: s.flying.length ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.5, repeat: s.flying.length ? Infinity : 0 }}>
            <Laptop size={34} />
          </motion.div>
          <div className="small bold ellipsis" style={{ maxWidth: 120 }}>{s.pc || 'Компьютер'}</div>
        </div>
      </div>
      <Ring value={frac} size={150} stroke={11}>
        <div className="col" style={{ alignItems: 'center', gap: 0 }}>
          <div style={{ fontSize: '2.1rem', fontWeight: 900 }} className="mono">{Math.floor(frac * 100)}%</div>
          <div className="tiny faint">{s.total ? formatBytes(s.done) : 'готовлю…'}</div>
        </div>
      </Ring>
      <div className="col" style={{ alignItems: 'center', gap: 6 }}>
        <div className="bold">
          {s.filesTotal ? `${s.files} из ${s.filesTotal} ${plural(s.filesTotal, 'файла', 'файлов', 'файлов')}` : 'Телефон готовит список…'}
          {s.total ? ` · ${formatBytes(s.done)} из ${formatBytes(s.total)}` : ''}
        </div>
        <div className="sub">
          {s.speed > 0 ? `${formatBytes(s.speed)}/с · осталось ≈ ${eta}` : 'Считаю скорость…'}
          {s.skipped ? ` · ${s.skipped} уже ${plural(s.skipped, 'был', 'были', 'были')} на компьютере` : ''}
        </div>
        <div className="tiny faint ellipsis" style={{ maxWidth: 520 }}>{s.name}</div>
      </div>
    </motion.div>
  )
}

function Done({ onClose }: { onClose?: () => void }) {
  const s = useTransfer()
  const sum = s.summary
  return (
    <motion.div {...enter} className="col" style={{ alignItems: 'center', gap: 14, padding: '26px 0' }}>
      <motion.div className="icon-tile" style={{ width: 92, height: 92, borderRadius: 46, background: 'linear-gradient(135deg,#22c55e,#10b981)', boxShadow: '0 12px 40px rgba(34,197,94,.45)' }}
        initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={bouncy}>
        <Check size={46} strokeWidth={3} />
      </motion.div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>Всё на компьютере</div>
      <div className="sub tc" style={{ maxWidth: 520 }}>
        {sum && sum.files ? `${sum.files} ${plural(sum.files, 'файл', 'файла', 'файлов')}, ${formatBytes(sum.bytes)} — за ${sum.seconds < 60 ? `${Math.max(1, sum.seconds)} с` : `${Math.round(sum.seconds / 60)} мин`}.` : 'Новых файлов не было — всё уже лежало на месте.'}
        {sum && sum.skipped ? ` Ещё ${sum.skipped} уже ${plural(sum.skipped, 'был', 'были', 'были')} здесь — их не трогали.` : ''}
        {s.dataApplied ? ' ДЗ, задачи, заметки, оценки, расписание и настройки — тоже.' : ''}
      </div>
      {s.error && <div className="small tc" style={{ color: '#f59e0b', maxWidth: 520 }}>{s.error}</div>}
      <div className="row gap8 mt8">
        {s.dataApplied ? (
          <button className="btn primary lg" onClick={() => safu.app.relaunch()}><RefreshCw size={16} /> Перезапустить и открыть</button>
        ) : (
          <button className="btn primary lg" onClick={() => { transfer.reset(); onClose?.(); go('files') }}><FolderOpen size={16} /> Открыть файлы</button>
        )}
        <button className="btn lg" onClick={() => transfer.start()}><RotateCcw size={16} /> Перенести ещё</button>
      </div>
      {s.dataApplied && <div className="tiny faint">Данные уже сохранены — перезапуск нужен, чтобы все разделы их подхватили</div>}
    </motion.div>
  )
}
