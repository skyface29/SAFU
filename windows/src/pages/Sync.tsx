// Синхронизация с iPhone: один раз связать QR-кодом — дальше ДЗ, задачи и заметки одинаковые на обоих
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Smartphone, Wifi, ShieldCheck, Camera, Unlink, QrCode, Check, ArrowLeftRight } from 'lucide-react'
import { PageHeader, Card, softSpring, confirmDialog, toast } from '../ui/kit'
import { encodeQr, qrPath } from '../lib/qr'
import { usePref } from '../lib/kv'
import { sync, LAST_KEY, type SyncLast } from '../lib/sync'
import { relativeAgo } from '../lib/date'
import { go } from '../lib/nav'

export default function SyncPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [paired, setPaired] = useState<boolean | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [last] = usePref<SyncLast | null>(LAST_KEY, null)

  useEffect(() => {
    sync.link().then(u => { setPaired(!!u); setUrl(u); setShowQr(!u ? false : !last) })
  }, [])

  const pair = async () => {
    if (paired && !(await confirmDialog('Связать заново?', 'Старый код перестанет работать: телефон, связанный им, нужно будет связать ещё раз.', 'Новый код'))) return
    const u = await sync.pair()
    setUrl(u); setPaired(!!u); setShowQr(true)
  }
  const unpair = async () => {
    if (!(await confirmDialog('Отключить синхронизацию?', 'ДЗ, задачи и заметки останутся и тут, и на телефоне, но меняться вместе перестанут.', 'Отключить', true))) return
    await sync.unpair()
    setUrl(null); setPaired(false); setShowQr(false)
    toast('Синхронизация отключена')
  }

  return (
    <>
      <PageHeader title="Синхронизация с iPhone" subtitle="ДЗ, задачи и заметки — одинаковые на телефоне и компьютере. Отметил ДЗ сделанным здесь — через пару секунд оно сделано и на iPhone" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 26, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 260px at 10% 0%, rgba(var(--brand-rgb), .16), transparent)', pointerEvents: 'none' }} />
          <SyncStatus paired={paired} last={last} />
          <AnimatePresence initial={false}>
            {showQr && url && (
              <motion.div key="qr" className="col" style={{ alignItems: 'center', gap: 12, marginTop: 20 }}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={softSpring}>
                <SyncQr url={url} />
                <div className="small muted tc" style={{ maxWidth: 300 }}>Наведи камеру iPhone на код — или в Арктике на iPhone: <b>Профиль → Синхронизация с компьютером</b></div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="row gap8 mt16" style={{ position: 'relative', flexWrap: 'wrap' }}>
            {!paired && <button className="btn primary" onClick={pair}><QrCode size={16} /> Связать с iPhone</button>}
            {paired && !showQr && <button className="btn" onClick={() => setShowQr(true)}><QrCode size={15} /> Показать код ещё раз</button>}
            {paired && <button className="btn ghost" onClick={pair}><RefreshCw size={14} /> Новый код</button>}
            {paired && <button className="btn ghost" onClick={unpair}><Unlink size={14} /> Отключить</button>}
          </div>
        </Card>

        <Card style={{ padding: 26 }}>
          <div className="h-card mb12">Как это работает</div>
          <div className="col" style={{ gap: 16 }}>
            <Point icon={<Camera size={18} />} title="Один раз связываешь QR-кодом"
              sub="Код показывается здесь. Наведи на него камеру iPhone — и всё, больше ничего делать не нужно" />
            <Point icon={<ArrowLeftRight size={18} />} title="Дальше всё само"
              sub="Пока Арктика открыта на телефоне, он заглядывает на компьютер каждые несколько секунд: сделал ДЗ, добавил задачу, поправил заметку — изменение появится на другом устройстве" />
            <Point icon={<Wifi size={18} />} title="Нужна одна сеть Wi‑Fi"
              sub="Телефон и компьютер — дома в одном Wi‑Fi, Арктика на компьютере запущена (можно свёрнутой в трей). Разошлись по разным местам — догонит, как только окажетесь в одной сети" />
            <Point icon={<Check size={18} />} title="Ничего не теряется"
              sub="Если одно и то же поменяли и тут, и там — побеждает то, что сделали позже, по каждому полю отдельно: отметка «сделано» не сотрёт новый срок, и наоборот. Фото ДЗ остаются на своём устройстве" />
            <Point icon={<ShieldCheck size={18} />} title="Без облаков и чужих серверов"
              sub="Напрямую по домашней сети, с шифрованием AES‑256. Ключ есть только в этом QR-коде. «Новый код» или «Отключить» — и старый телефон больше не подключится" />
          </div>
          <div className="tiny faint mt16">Перенести файлы предметов, фото доски и записи лекций — по-прежнему в разделе <a className="clickable" style={{ color: 'var(--brand)' }} onClick={() => go('transfer')}>«Перенос с iPhone»</a>.</div>
        </Card>
      </div>
    </>
  )
}

function SyncStatus({ paired, last }: { paired: boolean | null; last: SyncLast | null }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  const fresh = !!last && Date.now() - last.at < 90_000
  return (
    <div className="row" style={{ gap: 16, position: 'relative' }}>
      <motion.div className="icon-tile" style={{ width: 58, height: 58, borderRadius: 18, background: paired ? 'linear-gradient(135deg,#22c55e,#0ea5e9)' : 'var(--grad)' }}
        animate={fresh ? { rotate: [0, 360] } : { rotate: 0 }} transition={fresh ? { duration: 2.4, repeat: Infinity, ease: 'linear' } : softSpring}>
        {paired ? <RefreshCw size={26} /> : <Smartphone size={26} />}
      </motion.div>
      <div className="grow">
        <div className="h-card" style={{ fontSize: '1.2rem' }}>
          {paired === null ? 'Проверяю…' : paired ? (last ? `Синхронизировано с «${last.device}»` : 'Связано — жду iPhone') : 'iPhone не связан'}
        </div>
        <div className="sub mt4">
          {paired ? (last ? `${fresh ? 'Телефон на связи · ' : ''}последний раз ${relativeAgo(last.at)}` : 'Отсканируй код камерой iPhone — и открой Арктику на телефоне') : 'Свяжи телефон QR-кодом — и ДЗ, задачи и заметки станут общими'}
        </div>
      </div>
    </div>
  )
}

function SyncQr({ url }: { url: string }) {
  const m = useMemo(() => encodeQr(url, 'M'), [url])
  const n = m.size + 8
  return (
    <div className="qr-box">
      <svg viewBox={`0 0 ${n} ${n}`} width={240} height={240} shapeRendering="crispEdges">
        <rect width={n} height={n} fill="#fff" />
        <path d={qrPath(m, 4)} fill="#0b1020" />
      </svg>
    </div>
  )
}

function Point({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="row top" style={{ gap: 12 }}>
      <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: 'var(--grad)' }}>{icon}</div>
      <div className="grow"><div className="bold">{title}</div><div className="sub mt4">{sub}</div></div>
    </div>
  )
}

/** Пометка в шапке «Домашки»: синхронизировано с iPhone N минут назад */
export function SyncBadge() {
  const [last] = usePref<SyncLast | null>(LAST_KEY, null)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  if (!last) return null
  return (
    <button className="btn sm ghost" onClick={() => go('sync')} title="Синхронизация с iPhone">
      <RefreshCw size={13} /> iPhone · {relativeAgo(last.at)}
    </button>
  )
}
