// Синхронизация с iPhone: один раз связать (телефон сам находит компьютер, сверяешь код — или QR-код),
// дальше ДЗ, задачи и заметки одинаковые на обоих
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Smartphone, Wifi, ShieldCheck, Unlink, QrCode, Check, ArrowLeftRight, Search, ShieldAlert, Loader2 } from 'lucide-react'
import { PageHeader, Card, Sheet, softSpring, confirmDialog, toast } from '../ui/kit'
import { safu } from '../lib/bridge'
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
    const load = (first: boolean) => sync.link().then(u => { setPaired(!!u); setUrl(u); if (first) setShowQr(false) })
    load(true)
    // телефон связался сам (без QR-кода) — обновляем экран
    return safu.sync.onChanged(() => { load(false); setShowQr(false) })
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
            {!paired && !showQr && <button className="btn" onClick={pair}><QrCode size={16} /> Связать по QR-коду</button>}
            {paired && !showQr && <button className="btn" onClick={() => setShowQr(true)}><QrCode size={15} /> Показать код ещё раз</button>}
            {paired && <button className="btn ghost" onClick={pair}><RefreshCw size={14} /> Новый код</button>}
            {paired && <button className="btn ghost" onClick={unpair}><Unlink size={14} /> Отключить</button>}
          </div>
        </Card>

        <div className="col" style={{ gap: 16 }}>
        <FirewallCard />
        <NetCard />
        <Card style={{ padding: 26 }}>
          <div className="h-card mb12">Как это работает</div>
          <div className="col" style={{ gap: 16 }}>
            <Point icon={<Search size={18} />} title="Телефон сам находит компьютер"
              sub="На iPhone: Профиль → «Синхронизация с компьютером» — Арктика найдёт этот компьютер в сети. Нажми на него, сверь код на обоих экранах и нажми здесь «Разрешить». Один раз — дальше ничего делать не нужно. QR-код — запасной способ" />
            <Point icon={<ArrowLeftRight size={18} />} title="Дальше всё само"
              sub="Пока Арктика открыта на телефоне, он заглядывает на компьютер каждые несколько секунд: сделал ДЗ, добавил задачу, поправил заметку — изменение появится на другом устройстве" />
            <Point icon={<Wifi size={18} />} title="Нужна одна сеть Wi‑Fi"
              sub="Телефон и компьютер — дома в одном Wi‑Fi, Арктика на компьютере запущена (можно свёрнутой в трей). Разошлись по разным местам — догонит, как только окажетесь в одной сети" />
            <Point icon={<Check size={18} />} title="Ничего не теряется"
              sub="Если одно и то же поменяли и тут, и там — побеждает то, что сделали позже, по каждому полю отдельно: отметка «сделано» не сотрёт новый срок, и наоборот. Файлы и фото к ДЗ с iPhone приходят сюда сами, фото — сразу к своему заданию" />
            <Point icon={<ShieldCheck size={18} />} title="Без облаков и чужих серверов"
              sub="Напрямую по домашней сети, с шифрованием AES‑256. Ключ передаётся зашифрованным только после твоего «Разрешить». «Новый код» или «Отключить» — и старый телефон больше не подключится" />
          </div>
          <div className="tiny faint mt16">Перенести файлы предметов, фото доски и записи лекций — по-прежнему в разделе <a className="clickable" style={{ color: 'var(--brand)' }} onClick={() => go('transfer')}>«Перенос с iPhone»</a>.</div>
        </Card>
        </div>
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
          {paired ? (last ? `${fresh ? 'Телефон на связи · ' : ''}последний раз ${relativeAgo(last.at)}` : 'Открой Арктику на телефоне — он зайдёт сам') : 'На iPhone: Профиль → «Синхронизация с компьютером» — телефон найдёт этот компьютер сам'}
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

/** Брандмауэр Windows: из-за него телефон в той же сети «не видит» компьютер. Проверка и починка в одно нажатие */
function FirewallCard() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof safu.sync.firewall>> | null>(null)
  const [busy, setBusy] = useState(false)
  const check = () => safu.sync.firewall().then(setSt).catch(() => setSt({ state: 'unknown' }))
  useEffect(() => { check() }, [])
  if (!st || st.state === 'na') return null
  const fix = async () => {
    setBusy(true)
    const r = await safu.sync.firewallFix().catch(() => 'failed' as const)
    setBusy(false)
    if (r === 'ok') toast('Брандмауэр больше не мешает синхронизации')
    else if (r === 'cancelled') toast('Нужно нажать «Да» в окне Windows', 'warn')
    else toast('Не вышло поменять настройки брандмауэра', 'warn')
    check()
  }
  const ok = st.state === 'ok'
  const text = ok
    ? 'Входящие подключения от телефона разрешены' + (st.network === 'Public' ? ' — и в «общественной» сети тоже' : '')
    : st.state === 'blocked'
      ? 'Windows запрещает Арктике входящие подключения (наверное, когда-то закрыли окно «Разрешить доступ?»). Из-за этого телефон в той же сети не видит компьютер'
      : st.state === 'missing'
        ? 'Входящие подключения от телефона могут блокироваться' + (st.network === 'Public' ? ' — сеть отмечена как «общественная»' : '') + '. Разреши один раз — Windows спросит подтверждение'
        : 'Не получилось проверить брандмауэр. Если телефон не находит компьютер — разреши подключения'
  return (
    <Card style={{ padding: 20 }}>
      <div className="row top" style={{ gap: 12 }}>
        <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: ok ? 'linear-gradient(135deg,#22c55e,#0ea5e9)' : 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
          {ok ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        </div>
        <div className="grow">
          <div className="bold">Брандмауэр Windows</div>
          <div className="sub mt4">{text}</div>
          {!ok && (
            <button className="btn primary sm mt12" onClick={fix} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />} Разрешить синхронизацию
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Адрес компьютера и видел ли его телефон: если телефон не находит компьютер — видно, в чём дело */
function NetCard() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof safu.sync.stats>> | null>(null)
  useEffect(() => {
    const load = () => safu.sync.stats().then(setSt).catch(() => null)
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])
  if (!st) return null
  const seen = st.seenAt > 0
  return (
    <Card style={{ padding: 20 }}>
      <div className="row top" style={{ gap: 12 }}>
        <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: seen ? 'linear-gradient(135deg,#22c55e,#0ea5e9)' : 'var(--grad)' }}><Wifi size={18} /></div>
        <div className="grow">
          <div className="bold">Этот компьютер в сети</div>
          <div className="sub mt4">
            {st.hosts.length
              ? <>Адрес: <b className="selectable">{st.hosts[0]}</b>{st.hosts.length > 1 && <span className="faint"> (ещё {st.hosts.slice(1).join(', ')})</span>} · порт {st.port}. Если iPhone не находит компьютер сам — введи этот адрес на телефоне: «Синхронизация с компьютером» → «Ввести адрес»</>
              : 'Компьютер не подключён к сети — подключись к тому же Wi‑Fi, что и телефон'}
          </div>
          <div className="small mt8" style={{ color: seen ? 'var(--ok, #22c55e)' : 'var(--text3)' }}>
            {seen ? `Телефон видел этот компьютер ${relativeAgo(st.seenAt)}${st.seenFrom ? ` (${st.seenFrom})` : ''}` : 'Телефон ещё не находил этот компьютер с момента запуска. Если на iPhone поиск ничего не находит — сеть не пропускает телефон к компьютеру: проверь брандмауэр выше или подключи компьютер к «Режиму модема» iPhone'}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** При запуске: брандмауэр не пропустит телефон — предлагаем разрешить (раз на версию; Windows спросит подтверждение) */
export function SyncFirewallAsk() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = usePref<string>('sync.fwAsked', '')
  useEffect(() => {
    const t = setTimeout(async () => {
      const info = await safu.app.info().catch(() => null) as { version?: string; platform?: string } | null
      if (!info || info.platform === 'browser' || asked === info.version) return
      const st = await safu.sync.firewall().catch(() => null)
      if (st && (st.state === 'blocked' || st.state === 'missing')) setOpen(true)
      setAsked(info.version || '')
    }, 9000)
    return () => clearTimeout(t)
  }, [])
  const fix = async () => {
    setBusy(true)
    const r = await safu.sync.firewallFix().catch(() => 'failed' as const)
    setBusy(false)
    setOpen(false)
    if (r === 'ok') toast('Готово: iPhone сможет находить компьютер сам')
    else if (r === 'cancelled') toast('Можно разрешить позже: Профиль → «Синхронизация с iPhone»', 'warn')
    else toast('Не вышло поменять брандмауэр — попробуй из «Синхронизации с iPhone»', 'warn')
  }
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Пусть iPhone находит компьютер сам"
      footer={<>
        <button className="btn" onClick={() => setOpen(false)}>Не сейчас</button>
        <button className="btn primary" autoFocus disabled={busy} onClick={fix}>
          {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Разрешить
        </button>
      </>}>
      <div className="col" style={{ gap: 12, alignItems: 'center', padding: '4px 0' }}>
        <div className="icon-tile" style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--grad)' }}><ArrowLeftRight size={26} /></div>
        <div className="muted tc" style={{ lineHeight: 1.55, maxWidth: 420 }}>
          ДЗ, задачи, заметки и файлы с телефона приходят сюда сами по Wi‑Fi. Сейчас брандмауэр Windows не пускает iPhone к Арктике — поэтому телефон «не видит» компьютер. Нажми «Разрешить», и в окне Windows — «Да». Это один раз.
        </div>
        <div className="tiny faint tc">Разрешаются только порты Арктики для синхронизации. Всё, что идёт по сети, зашифровано</div>
      </div>
    </Sheet>
  )
}

/** Телефон просит связаться без QR-кода: показываем его код, человек сверяет и разрешает */
export function SyncPairAsk() {
  const [req, setReq] = useState<{ rid: string; device: string; code: string } | null>(null)
  useEffect(() => {
    const a = safu.sync.onAsk((rid, info) => setReq({ rid, ...info }))
    const b = safu.sync.onAskDone(rid => setReq(r => (r?.rid === rid ? null : r)))
    return () => { a(); b() }
  }, [])
  const answer = (ok: boolean) => {
    if (!req) return
    safu.sync.answer(req.rid, ok)
    setReq(null)
    if (ok) toast(`«${req.device}» связан — ДЗ, задачи и заметки теперь общие`)
  }
  return (
    <Sheet open={!!req} onClose={() => answer(false)} title="Связать iPhone?"
      footer={<>
        <button className="btn" onClick={() => answer(false)}>Отклонить</button>
        <button className="btn primary" autoFocus onClick={() => answer(true)}><Check size={15} /> Разрешить</button>
      </>}>
      {req && (
        <div className="col" style={{ alignItems: 'center', gap: 14, padding: '6px 0 4px' }}>
          <div className="icon-tile" style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--grad)' }}><Smartphone size={26} /></div>
          <div className="muted tc" style={{ lineHeight: 1.5 }}><b>{req.device}</b> хочет синхронизировать ДЗ, задачи и заметки с этим компьютером</div>
          <div className="row" style={{ gap: 10 }}>
            {req.code.split('').map((d, i) => (
              <div key={i} style={{ width: 52, height: 64, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 700, background: 'rgba(var(--brand-rgb), .12)', color: 'var(--brand)' }}>{d}</div>
            ))}
          </div>
          <div className="small faint tc" style={{ maxWidth: 340 }}>Разрешай, только если на телефоне тот же код. Не ты просил — нажми «Отклонить»</div>
        </div>
      )}
    </Sheet>
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
