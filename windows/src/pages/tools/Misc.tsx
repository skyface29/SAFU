// Дорога (автобусы), подъём к паре, расписание картинкой, фото доски, праздники, игра, все инструменты
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bus, Plus, Share2, Trash2, ClipboardPaste, MapPin, ExternalLink, Check, Image as ImageIcon, Download, Copy, Upload, AlarmClock, PartyPopper, FolderOpen, Gamepad2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, Field, Segmented, Toggle, ToggleRow, Row, toast, confirmDialog, alertDialog, useNow } from '../../ui/kit'
import { bus, busStore, BUS_DAYS, BUS_PALETTE, times, trips, routeTitle, routeText, mapURL, shareCode, fromShareCode, normalizeTimes, newRoute, commute, type BusRoute, type Direction, dayType } from '../../lib/bus'
import { useSchedule } from '../../lib/scheduleStore'
import { slotsOn, kindStyle, subjects, type Slot } from '../../lib/schedule'
import { hm, fullDay, startOfDay, addDays, untilText, isToday, isYesterday, plural, relDay, monday, DAY_NAMES, dayMon, weekday, ymd } from '../../lib/date'
import { usePref, kv } from '../../lib/kv'
import { safu, fileURL, type FileInfo } from '../../lib/bridge'
import { openURL } from '../../sites/sites'
import { notify, type Note } from '../../lib/notify'
import { weather, weatherLine, advice, useWeather } from '../../lib/weather'
import { celebrations, HOLIDAYS } from '../../fx/Celebrations'
import { go } from '../../lib/nav'
import { TOOLS } from './registry'
import { useProfile } from '../../lib/profile'
import { subjectFolder } from '../../lib/effects'
import { toBase64 } from '../../lib/zip'
import { OS } from '../../lib/os'

// ---------- дорога ----------

export function BusPage() {
  const routes = busStore.use()
  const data = useSchedule(s => s.data)
  const now = useNow(30_000)
  const [enabled, setEnabled] = usePref('commute.enabled', false)
  const [notifyOn, setNotifyOn] = usePref('commute.notify', true)
  const [walk, setWalk] = usePref('commute.walk', 15)
  const [home, setHome] = usePref('commute.home', 10)
  const [activeId, setActive] = usePref('bus.active', 'builtin-150')
  const [edit, setEdit] = useState<BusRoute | null>(null)
  const [dir, setDir] = useState<Direction>('toCampus')
  const [dt, setDt] = useState(dayType(Date.now()))
  const r = bus.active()
  const color = '#' + r.colorHex
  const list = times(r, dir, dt)
  const today = trips(r, dir, Date.now())
  const nextTrip = dt === dayType(Date.now()) ? today.find(t => t.departure > now) : undefined
  useEffect(() => { commute.scheduleNotifications(data) }, [enabled, notifyOn, walk, home, activeId, routes])
  return (
    <>
      <PageHeader title="Дорога" subtitle="Свой автобус: когда выезжать к первой паре и как вернуться домой" right={<>
        <button className="btn" onClick={async () => { const t = await safu.clipboard.read(); const nr = fromShareCode(t); if (nr) { bus.upsert(nr); toast(`${routeTitle(nr)} добавлен`) } else alertDialog('В буфере нет кода автобуса', 'Попроси одногруппника нажать «Поделиться» в его автобусе и скопируй код.') }}><ClipboardPaste size={15} /> Код от друга</button>
        <button className="btn primary" onClick={() => setEdit(newRoute())}><Plus size={15} /> Автобус</button>
      </>} />
      <div className="grid" style={{ gridTemplateColumns: '320px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div className="col gap8">
          {routes.map(x => (
            <motion.div key={x.id} whileHover={{ x: 3 }} className="card tight row" style={{ cursor: 'pointer', borderColor: x.id === r.id ? '#' + x.colorHex : undefined }} onClick={() => setActive(x.id)}>
              <div className="icon-tile heavy" style={{ width: 50, height: 40, borderRadius: 11, background: '#' + x.colorHex }}>{x.number || '?'}</div>
              <div className="grow"><div className="bold small">{routeText(x)}</div><div className="tiny muted">в пути {x.travelMinutes} мин</div></div>
              {x.id === r.id && <Check size={18} color={'#' + x.colorHex} />}
            </motion.div>
          ))}
          {!routes.some(x => x.id === 'builtin-150') && <button className="btn" onClick={() => bus.restore150()}>Вернуть автобус 150</button>}
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Езжу на автобусе" sub="Карточка «Дорога» на главной" on={enabled} onChange={setEnabled} />
            <ToggleRow title="«Через 10 мин выходи»" sub="Уведомление перед автобусом" on={notifyOn} onChange={setNotifyOn} />
            <Row title="До остановки от дома" right={<input className="input" type="number" style={{ width: 70 }} value={home} onChange={e => setHome(+e.target.value)} />} />
            <Row title="От корпуса до остановки" right={<input className="input" type="number" style={{ width: 70 }} value={walk} onChange={e => setWalk(+e.target.value)} />} />
          </Card>
        </div>
        <div className="col gap14">
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(500px 220px at 100% 0%, ${color}33, transparent)` }} />
            <div className="row" style={{ position: 'relative' }}>
              <motion.div animate={{ x: [0, 6, 0] }} transition={{ duration: 2, repeat: Infinity }} className="icon-tile heavy" style={{ width: 64, height: 50, borderRadius: 14, background: color, fontSize: '1.3rem' }}>{r.number}</motion.div>
              <div className="grow"><div className="h-card">{routeTitle(r)}</div><div className="sub">{r.homeStop || r.homeCity} ⇄ {r.campusStop || r.campusCity}</div></div>
              <button className="btn sm" onClick={() => openURL(mapURL(r), 'Яндекс Карты')}><MapPin size={14} /> На карте</button>
              <button className="btn sm" onClick={() => { safu.clipboard.write(shareCode(r)); toast('Код скопирован — скинь в чат группы') }}><Share2 size={14} /> Поделиться</button>
              <button className="btn sm" onClick={() => setEdit({ ...r })}>Изменить</button>
            </div>
            {nextTrip && <div className="mt12" style={{ position: 'relative' }}><span className="tiny muted">Ближайший {dir === 'toCampus' ? 'в город' : 'домой'}: </span><b style={{ fontSize: '1.4rem' }}>{hm(nextTrip.departure)}</b> <span className="sub">через {untilText(nextTrip.departure - now)}</span></div>}
          </Card>
          <Card>
            <div className="row wrap-row mb12">
              <Segmented value={dir} onChange={setDir} options={[{ value: 'toCampus', label: `→ ${r.campusCity || 'К универу'}` }, { value: 'toHome', label: `→ ${r.homeCity || 'Домой'}` }]} />
              <Segmented value={dt} onChange={setDt} options={BUS_DAYS.map(d => ({ value: d.id, label: d.title }))} />
            </div>
            {!list.length ? <div className="sub">Расписание не заполнено — нажми «Изменить»</div> : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
                {list.map((t, i) => {
                  const isNext = nextTrip && hm(nextTrip.departure) === t.replace(/^0/, '')
                  return <motion.div key={t} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }} className="tc mono bold" style={{ padding: '10px 4px', borderRadius: 12, background: isNext ? color : 'var(--fill)', color: isNext ? '#fff' : undefined }}>{t}</motion.div>
                })}
              </div>
            )}
          </Card>
          <Card>
            <div className="h-card mb12">Неделя: когда выезжать</div>
            <div className="col gap6">
              {Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i)).map(d => {
                const first = commute.firstPair(d, data)
                const t = first ? commute.morning(first) : null
                return (
                  <div key={d} className="row small" style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--fill)' }}>
                    <span className="bold cap" style={{ width: 150 }}>{isToday(d) ? 'Сегодня' : relDay(d).split(',')[0]}</span>
                    {first ? <><span className="grow muted">пара в {hm(first.start)} · {first.subject}</span>{t ? <b style={{ color }}>выезд {hm(t.departure)}</b> : <span className="faint">рейса нет</span>}</> : <span className="faint">пар в корпусе нет</span>}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
      <RouteEditor r={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function RouteEditor({ r, onClose }: { r: BusRoute | null; onClose: () => void }) {
  const [v, setV] = useState<BusRoute | null>(null)
  useEffect(() => setV(r), [r])
  if (!v) return <Sheet open={false} onClose={onClose} />
  const exists = busStore.get().some(x => x.id === v.id)
  const set = (p: Partial<BusRoute>) => setV({ ...v, ...p })
  return (
    <Sheet open={!!r} onClose={onClose} size="wide" title={exists ? routeTitle(v) : 'Новый автобус'} footer={<>
      {exists && busStore.get().length > 1 && <button className="btn danger" onClick={() => { bus.remove(v.id); onClose() }}><Trash2 size={15} /> Удалить</button>}
      <span className="spacer" />
      <button className="btn primary" onClick={() => { bus.upsert(v); if (busStore.get().length === 1) bus.activate(v.id); onClose() }}>Сохранить</button>
    </>}>
      <div className="grid g3">
        <Field label="Номер"><input className="input" value={v.number} onChange={e => set({ number: e.target.value })} /></Field>
        <Field label="В пути, минут"><input className="input" type="number" value={v.travelMinutes} onChange={e => set({ travelMinutes: +e.target.value })} /></Field>
        <Field label="Выезжать за, минут до пары"><input className="input" type="number" value={v.leadMinutes} onChange={e => set({ leadMinutes: +e.target.value })} /></Field>
        <Field label="Откуда (город)"><input className="input" value={v.homeCity} onChange={e => set({ homeCity: e.target.value })} /></Field>
        <Field label="Остановка у дома"><input className="input" value={v.homeStop} onChange={e => set({ homeStop: e.target.value })} /></Field>
        <Field label="Цвет"><div className="row gap6">{BUS_PALETTE.map(c => <button key={c} onClick={() => set({ colorHex: c })} style={{ width: 24, height: 24, borderRadius: 12, border: v.colorHex === c ? '3px solid var(--text)' : 'none', background: '#' + c, cursor: 'pointer' }} />)}</div></Field>
        <Field label="Куда (город)"><input className="input" value={v.campusCity} onChange={e => set({ campusCity: e.target.value })} /></Field>
        <Field label="Остановка у универа"><input className="input" value={v.campusStop} onChange={e => set({ campusStop: e.target.value })} /></Field>
        <Field label="Ссылка на Яндекс Карты"><input className="input" value={v.mapLink} onChange={e => set({ mapLink: e.target.value })} /></Field>
      </div>
      <div className="tiny faint mb8">Время рейсов — любым текстом: «6.20, 7:40; 8:15». Приложение само разложит по порядку.</div>
      {(['toCampus', 'toHome'] as Direction[]).map(d => (
        <div key={d} className="mb12">
          <div className="bold small mb8">{d === 'toCampus' ? `Из ${v.homeCity || 'дома'} → ${v.campusCity || 'к универу'}` : `Обратно → ${v.homeCity || 'домой'}`}</div>
          <div className="grid g3">{BUS_DAYS.map(t => (
            <Field key={t.id} label={t.title}><textarea className="textarea" style={{ minHeight: 70 }} defaultValue={times(v, d, t.id).join(' ')}
              onBlur={e => { const n = normalizeTimes(e.target.value); set(d === 'toCampus' ? { toCampus: { ...v.toCampus, [t.id]: n } } : { toHome: { ...v.toHome, [t.id]: n } }) }} /></Field>
          ))}</div>
        </div>
      ))}
    </Sheet>
  )
}

// ---------- подъём ----------

export function Wake() {
  const data = useSchedule(s => s.data)
  const [on, setOn] = usePref('wake.on', false)
  const [prep, setPrep] = usePref('wake.prep', 60)
  const [walkTo, setWalkTo] = usePref('wake.walk', 20)
  const { hours } = useWeather()
  const useBus = kv.get('commute.enabled', false)
  const plans = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(Date.now()), i)).map(d => {
    const first = slotsOn(d, data).find(s => !s.remote) || slotsOn(d, data)[0]
    if (!first) return { d, first: null, wake: 0, leave: 0, note: '' }
    let leave = first.start - walkTo * 60_000
    let note = `Идти ${walkTo} мин`
    if (useBus && !first.remote) { const t = commute.morning(first); if (t) { leave = t.departure - commute.homeMinutes() * 60_000; note = `Автобус ${bus.active().number} в ${hm(t.departure)}` } }
    if (first.remote) { leave = first.start - 5 * 60_000; note = 'Дистанционно' }
    const w = weather.hourAt(leave, hours)
    let extra = 0
    if (w && w.feels <= -25) { extra = 10; note += ' · мороз: +10 мин' } else if (w && ((w.code >= 71 && w.code <= 77) || w.code === 85 || w.code === 86) && w.precip >= 1) { extra = 10; note += ' · снегопад: +10 мин' }
    return { d, first, leave: leave - extra * 60_000, wake: leave - extra * 60_000 - prep * 60_000, note }
  }), [data, prep, walkTo, hours, useBus])
  useEffect(() => {
    if (!on) { notify.cancel('wake-'); return }
    const list: Note[] = plans.filter(p => p.first && p.wake > Date.now()).map(p => ({
      id: `wake-${p.d}`, at: p.wake, title: '⏰ Пора вставать', route: 'home',
      body: `${p.first!.subject} в ${hm(p.first!.start)}. Выйти в ${hm(p.leave)} — ${p.note}.`
    }))
    notify.schedule('wake-', list)
  }, [on, plans])
  return (
    <>
      <PageHeader title="Подъём" subtitle="Будильник к первой паре с учётом дороги и погоды" right={<div className="row"><span className="bold">Будить уведомлением</span><Toggle on={on} onChange={setOn} /></div>} />
      <div className="grid g2 mb16">
        <Card><Field label="На сборы, минут"><Segmented value={prep} onChange={setPrep} options={[30, 45, 60, 90].map(v => ({ value: v, label: `${v}` }))} /></Field></Card>
        <Card><Field label={useBus ? 'Дорога считается по автобусу' : 'Дорога пешком, минут'}>{useBus ? <div className="sub">Автобус {bus.active().number}: {routeText(bus.active())}</div> : <Segmented value={walkTo} onChange={setWalkTo} options={[10, 20, 30, 45].map(v => ({ value: v, label: `${v}` }))} />}</Field></Card>
      </div>
      <div className="col gap8">
        {plans.map((p, i) => (
          <motion.div key={p.d} className="card row" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div style={{ width: 150 }} className="bold cap">{isToday(p.d) ? 'Сегодня' : relDay(p.d).split(',')[0]}<div className="tiny muted">{dayMon(p.d)}</div></div>
            {p.first ? <>
              <div className="tc" style={{ width: 110 }}><div className="heavy grad-text" style={{ fontSize: '2rem' }}>{hm(p.wake)}</div><div className="tiny faint">подъём</div></div>
              <div className="grow"><div className="bold small">{p.first.subject} · {hm(p.first.start)}</div><div className="tiny muted">выйти в {hm(p.leave)} · {p.note}</div></div>
              <AlarmClock size={20} color={on ? 'var(--brand)' : 'var(--text3)'} />
            </> : <div className="sub">Пар нет — выспись 😴</div>}
          </motion.div>
        ))}
      </div>
      <div className="tiny faint mt12">Уведомление придёт, если Арктика запущена (она живёт в трее). Для надёжности включи «Запускать вместе с {OS}» в Профиле.</div>
      {hours.length > 0 && plans[0].first && <div className="tiny faint">{weatherLine(weather.hourAt(plans[0].leave, hours) || hours[0])}{advice(weather.hourAt(plans[0].leave, hours) || hours[0]) ? ' · ' + advice(weather.hourAt(plans[0].leave, hours) || hours[0]) : ''}</div>}
    </>
  )
}

// ---------- расписание картинкой ----------

export function ShareImage() {
  const data = useSchedule(s => s.data)
  const ref = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'day' | 'tomorrow' | 'week'>('day')
  const [theme, setTheme] = useState<'dark' | 'light' | 'brand'>('dark')
  const p = useProfile()
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const days = mode === 'week' ? Array.from({ length: 6 }, (_, i) => addDays(monday(Date.now()), i)) : [startOfDay(addDays(Date.now(), mode === 'tomorrow' ? 1 : 0))]
    const lists = days.map(d => slotsOn(d, data))
    const W = 1080
    const rowH = 92, dayHead = 70
    const H = Math.max(600, 220 + lists.reduce((a, l) => a + dayHead + Math.max(1, l.length) * rowH + 20, 0))
    cv.width = W; cv.height = H
    const css = getComputedStyle(document.documentElement)
    const c1 = css.getPropertyValue('--brand').trim(), c2 = css.getPropertyValue('--brand2').trim()
    const bg = ctx.createLinearGradient(0, 0, W, H)
    if (theme === 'brand') { bg.addColorStop(0, c1); bg.addColorStop(1, c2) } else if (theme === 'dark') { bg.addColorStop(0, '#0b0f1a'); bg.addColorStop(1, '#151b2e') } else { bg.addColorStop(0, '#f6f8fc'); bg.addColorStop(1, '#e8eef8') }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    const fg = theme === 'light' ? '#111827' : '#ffffff', sub = theme === 'light' ? '#6b7280' : 'rgba(255,255,255,.7)'
    ctx.fillStyle = fg; ctx.font = '800 56px "Segoe UI", sans-serif'; ctx.fillText(mode === 'week' ? 'Пары на неделю' : mode === 'tomorrow' ? 'Пары на завтра' : 'Пары на сегодня', 60, 110)
    ctx.fillStyle = sub; ctx.font = '500 30px "Segoe UI", sans-serif'; ctx.fillText(`${data.ruzGroupNumber || p.group ? 'Группа ' + (data.ruzGroupNumber || p.group) + ' · ' : ''}${mode === 'week' ? `${dayMon(days[0])} — ${dayMon(days[5])}` : fullDay(days[0])}`, 60, 158)
    let y = 210
    days.forEach((d, di) => {
      if (mode === 'week') { ctx.fillStyle = fg; ctx.font = '800 34px "Segoe UI", sans-serif'; ctx.fillText(`${DAY_NAMES[weekday(d) - 1]}, ${dayMon(d)}`, 60, y + 44); y += dayHead }
      const l = lists[di]
      if (!l.length) { ctx.fillStyle = sub; ctx.font = '500 30px "Segoe UI", sans-serif'; ctx.fillText('пар нет 🎉', 60, y + 50); y += rowH }
      for (const s of l) {
        const st = kindStyle(s.kind)
        ctx.fillStyle = theme === 'light' ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.08)'
        ctx.beginPath(); ctx.roundRect(48, y + 6, W - 96, rowH - 12, 22); ctx.fill()
        ctx.fillStyle = st.color; ctx.beginPath(); ctx.roundRect(64, y + 20, 8, rowH - 40, 4); ctx.fill()
        ctx.fillStyle = fg; ctx.font = '800 32px "Segoe UI", sans-serif'; ctx.fillText(hm(s.start), 92, y + 48)
        ctx.fillStyle = sub; ctx.font = '500 22px "Segoe UI", sans-serif'; ctx.fillText(hm(s.end), 92, y + 76)
        ctx.fillStyle = fg; ctx.font = '700 30px "Segoe UI", sans-serif'
        const subj = s.subject.length > 42 ? s.subject.slice(0, 41) + '…' : s.subject
        ctx.fillText(subj, 220, y + 48)
        ctx.fillStyle = st.color; ctx.font = '800 22px "Segoe UI", sans-serif'; ctx.fillText(st.label.toUpperCase(), 220, y + 78)
        ctx.fillStyle = sub; ctx.font = '500 22px "Segoe UI", sans-serif'; ctx.fillText(`${s.room ? 'ауд. ' + s.room : ''}${s.teacher ? '  ·  ' + s.teacher : ''}`, 220 + ctx.measureText(st.label.toUpperCase()).width + 30, y + 78)
        y += rowH
      }
      y += 20
    })
    ctx.fillStyle = sub; ctx.font = '600 22px "Segoe UI", sans-serif'; ctx.fillText('❄ Арктика — приложение для студентов САФУ', 60, H - 40)
  }, [mode, theme, data])
  const save = async () => {
    const url = ref.current!.toDataURL('image/png')
    const p2 = await safu.dialog.save({ name: `Пары ${ymd(Date.now())}.png`, base64: url.split(',')[1], filters: [{ name: 'Картинка', extensions: ['png'] }] })
    if (p2) toast('Картинка сохранена')
  }
  const copy = async () => {
    ref.current!.toBlob(async b => { if (!b) return; try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Картинка в буфере — вставь в чат (Ctrl+V)') } catch { toast('Не получилось скопировать — сохрани файлом', 'warn') } })
  }
  return (
    <>
      <PageHeader title="Расписание картинкой" subtitle="Красивая картинка для чата группы" right={<><button className="btn" onClick={copy}><Copy size={15} /> Копировать</button><button className="btn primary" onClick={save}><Download size={15} /> Сохранить PNG</button></>} />
      <div className="row mb16"><Segmented value={mode} onChange={setMode} options={[{ value: 'day', label: 'Сегодня' }, { value: 'tomorrow', label: 'Завтра' }, { value: 'week', label: 'Неделя' }]} /><Segmented value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }, { value: 'brand', label: 'Цвет темы' }]} /></div>
      <motion.canvas key={mode + theme} ref={ref} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} style={{ width: 'min(540px, 100%)', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,.4)', display: 'block' }} />
    </>
  )
}

// ---------- фото доски ----------

type BoardShot = FileInfo & { subj: string; day: number }

/** «Сегодня», «Вчера», «Понедельник, 12 октября» */
function boardDayTitle(t: number) {
  if (isToday(t)) return 'Сегодня'
  if (isYesterday(t)) return 'Вчера'
  const s = fullDay(t)
  const y = new Date(t).getFullYear()
  return s.charAt(0).toUpperCase() + s.slice(1) + (y !== new Date().getFullYear() ? ` ${y}` : '')
}

/** Фото доски: предметы → даты → фото. Снимки лежат в папке «Доска» каждого предмета */
export function Boards() {
  const data = useSchedule(s => s.data)
  const [shots, setShots] = useState<BoardShot[]>([])
  const [loaded, setLoaded] = useState(false)
  const [subject, setSubject] = useState<string | null>(null)
  const [day, setDay] = useState<number | null>(null)
  const [view, setView] = useState<number | null>(null)

  const load = async () => {
    const all: FileInfo[] = await safu.fs.walk('Предметы')
    setShots(all
      .filter(f => /\/Доска\//.test(f.rel) && /\.(png|jpe?g|webp|bmp)$/i.test(f.name))
      .map(f => ({ ...f, subj: f.rel.split('/')[1], day: startOfDay(f.mtime) }))
      .sort((a, b) => a.mtime - b.mtime))
    setLoaded(true)
  }
  useEffect(() => { load() }, [])

  // предметы: свежие сверху, обложка — последний снимок
  const bySubject = useMemo(() => {
    const m = new Map<string, BoardShot[]>()
    for (const f of shots) { if (!m.has(f.subj)) m.set(f.subj, []); m.get(f.subj)!.push(f) }
    return [...m.entries()]
      .map(([name, list]) => ({ name, list, days: new Set(list.map(f => f.day)).size, last: list[list.length - 1] }))
      .sort((a, b) => b.last.mtime - a.last.mtime)
  }, [shots])

  // даты выбранного предмета: новые сверху
  const days = useMemo(() => {
    if (!subject) return []
    const m = new Map<number, BoardShot[]>()
    for (const f of shots) if (f.subj === subject) { if (!m.has(f.day)) m.set(f.day, []); m.get(f.day)!.push(f) }
    return [...m.entries()].map(([d, list]) => ({ day: d, list })).sort((a, b) => b.day - a.day)
  }, [shots, subject])

  const photos = useMemo(() => (day == null ? [] : days.find(d => d.day === day)?.list ?? []), [days, day])

  // листать фото стрелками
  useEffect(() => {
    if (view == null) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setView(v => (v == null ? v : Math.min(photos.length - 1, v + 1)))
      if (e.key === 'ArrowLeft') setView(v => (v == null ? v : Math.max(0, v - 1)))
      if (e.key === 'Escape') { e.stopPropagation(); setView(null) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [view, photos.length])

  const add = async () => {
    const s = subject || slotsOn(Date.now(), data).find(x => x.start <= Date.now() && x.end > Date.now())?.subject || subjects(data)[0]
    if (!s) { toast('Сначала подключи расписание', 'warn'); return }
    const folder = subject ? `Предметы/${subject}/Доска` : `${subjectFolder(s)}/Доска`
    const r = await safu.fs.import(folder)
    if (r.length) { toast(`Добавлено в «${subject || s}»: ${r.length}`); load() }
  }

  const back = subject && day != null
    ? <button className="btn" onClick={() => setDay(null)}><ChevronLeft size={15} /> {subject}</button>
    : subject ? <button className="btn" onClick={() => setSubject(null)}><ChevronLeft size={15} /> Все предметы</button> : null

  const title = day != null ? boardDayTitle(day) : subject || 'Фото доски'
  const subtitle = day != null
    ? `${subject} · ${photos.length} фото · по времени съёмки`
    : subject ? `${days.length} ${plural(days.length, 'дата', 'даты', 'дат')} · нажми на дату, чтобы открыть фото`
    : 'Нажми на предмет — увидишь даты, когда фотографировал доску'

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} right={<>
        {back}
        {subject && <button className="btn" onClick={() => safu.fs.openRoot(`Предметы/${subject}/Доска`)}><FolderOpen size={15} /> Папка</button>}
        <button className="btn primary" onClick={add}><Upload size={15} /> Добавить фото</button>
      </>} />
      {loaded && !bySubject.length && <Empty emoji="📸" title="Фото пока нет" text="Перенеси фото с iPhone по QR-коду (Профиль → Перенос с iPhone) или добавь кнопкой выше. Снимки лягут в папку предмета, по датам." />}
      <AnimatePresence mode="wait">
        {!subject && (
          <motion.div key="subjects" className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {bySubject.map((s, i) => (
              <motion.div key={s.name} className="card flush press" onClick={() => { setSubject(s.name); setDay(null) }}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} whileHover={{ y: -3 }}>
                <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden' }}>
                  <img src={fileURL(s.last.rel)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 50%, rgba(0,0,0,.55))' }} />
                  <span className="pill" style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(0,0,0,.45)', color: '#fff' }}><ImageIcon size={12} /> {s.list.length}</span>
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div className="bold clamp2">{s.name}</div>
                  <div className="tiny faint mt4">{s.days} {plural(s.days, 'дата', 'даты', 'дат')} · последнее {isToday(s.last.mtime) ? 'сегодня' : isYesterday(s.last.mtime) ? 'вчера' : dayMon(s.last.mtime)}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {subject && day == null && (
          <motion.div key={'days-' + subject} className="col gap8" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {days.map((d, i) => (
              <motion.div key={d.day} className="card press row" style={{ gap: 18, padding: '12px 16px' }} onClick={() => setDay(d.day)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }} whileHover={{ x: 3 }}>
                <div style={{ position: 'relative', width: 78, height: 62, flexShrink: 0 }}>
                  {d.list.slice(-3).map((f, j, arr) => {
                    const depth = arr.length - 1 - j
                    return <img key={f.rel} src={fileURL(f.rel)} style={{ position: 'absolute', left: 8 - depth * 4, top: 4 - depth * 3, width: 62, height: 54, objectFit: 'cover', borderRadius: 10, border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 2px 6px rgba(0,0,0,.25)', transform: `rotate(${-depth * 6}deg)` }} />
                  })}
                </div>
                <div className="grow">
                  <div className="bold">{boardDayTitle(d.day)}</div>
                  <div className="sub mt4">{d.list.length} фото · {hm(d.list[0].mtime)}{d.list.length > 1 ? `–${hm(d.list[d.list.length - 1].mtime)}` : ''}</div>
                </div>
                <ChevronRight size={18} className="faint" />
              </motion.div>
            ))}
          </motion.div>
        )}
        {subject && day != null && (
          <motion.div key={'day-' + day} className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {photos.map((f, i) => (
              <motion.div key={f.rel} style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setView(i)}
                initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} whileHover={{ scale: 1.03 }}>
                <img src={fileURL(f.rel)} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 14, display: 'block' }} />
                <span className="pill" style={{ position: 'absolute', left: 8, top: 8, background: 'var(--grad)', color: '#fff' }}>{i + 1}</span>
                <span className="pill" style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.5)', color: '#fff' }}>{hm(f.mtime)}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {view != null && photos[view] && (
          <motion.div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.88)', display: 'grid', placeItems: 'center', cursor: 'zoom-out' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.img key={photos[view].rel} src={fileURL(photos[view].rel)} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ maxWidth: '90vw', maxHeight: '86vh', borderRadius: 12 }} />
            <div className="tiny" style={{ position: 'absolute', bottom: 22, color: 'rgba(255,255,255,.8)' }}>{view + 1} из {photos.length} · {hm(photos[view].mtime)} · ← → листать, Esc — закрыть</div>
            {view > 0 && <button className="btn icon round" style={{ position: 'absolute', left: 24 }} onClick={e => { e.stopPropagation(); setView(view - 1) }}><ChevronLeft size={20} /></button>}
            {view < photos.length - 1 && <button className="btn icon round" style={{ position: 'absolute', right: 24 }} onClick={e => { e.stopPropagation(); setView(view + 1) }}><ChevronRight size={20} /></button>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ---------- праздники ----------

export function CelebrationSettings() {
  const keys: [string, string, string][] = [['fx.on', 'Салюты и конфетти', 'Главный переключатель'], ['fx.dayEnd', 'Конец пар', 'Салют, когда закончилась последняя пара'], ['fx.weekEnd', 'Конец недели', 'Большой салют в пятницу или субботу'], ['fx.tasks', 'Сделанные задачи', 'Конфетти за ДЗ и задачи'], ['fx.exams', 'Сданные экзамены', 'Когда вписал оценку в БРС'], ['fx.holidays', 'Праздники', 'Новый год, Татьянин день, День программиста…'], ['fx.birthday', 'День рождения', 'Поздравление в твой день']]
  const [bday, setBday] = usePref<number | null>('user.birthday', null)
  return (
    <>
      <PageHeader title="Праздники" subtitle="Маленькие поводы порадоваться" right={<button className="btn primary" onClick={() => celebrations.test()}><PartyPopper size={15} /> Показать салют</button>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card className="list" style={{ padding: 0 }}>{keys.map(([k, t, s]) => <FlagRow key={k} k={k} t={t} s={s} />)}
          <Row title="Мой день рождения" right={<input type="date" className="input" style={{ width: 170 }} value={bday ? ymd(bday) : ''} onChange={e => setBday(e.target.value ? new Date(e.target.value + 'T12:00').getTime() : null)} />} />
        </Card>
        <Card><div className="h-card mb12">Праздники в приложении</div><div className="col gap6">{HOLIDAYS.map(h => <div key={h.id} className="row small"><span className="mono faint" style={{ width: 54 }}>{String(h.d).padStart(2, '0')}.{String(h.m).padStart(2, '0')}</span><span>{h.title}</span></div>)}</div></Card>
      </div>
    </>
  )
}
function FlagRow({ k, t, s }: { k: string; t: string; s: string }) { const [v, set] = usePref(k, true); return <ToggleRow title={t} sub={s} on={v} onChange={set} /> }

// ---------- игра «Автобус 150» ----------

export function Game() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'ready' | 'play' | 'over'>('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = usePref('game.best', 0)
  useEffect(() => {
    if (state !== 'play') return
    const cv = ref.current!, ctx = cv.getContext('2d')!
    const W = cv.width = 900, H = cv.height = 420
    let lane = 1, x = 140, t = 0, speed = 6, sc = 0, alive = true, raf = 0
    const lanes = [110, 210, 310]
    let busY = lanes[1]
    const obs: { x: number; lane: number; kind: number }[] = []
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowUp' || e.key === 'w') lane = Math.max(0, lane - 1); if (e.key === 'ArrowDown' || e.key === 's') lane = Math.min(2, lane + 1) }
    window.addEventListener('keydown', key)
    const frame = () => {
      t++; speed += 0.003; sc += speed / 10
      busY += (lanes[lane] - busY) * 0.25
      if (t % Math.max(28, 70 - Math.floor(speed * 3)) === 0) obs.push({ x: W + 40, lane: Math.floor(Math.random() * 3), kind: Math.floor(Math.random() * 3) })
      ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#374151'; ctx.fillRect(0, 60, W, 300)
      ctx.strokeStyle = '#f3f4f6'; ctx.setLineDash([40, 30]); ctx.lineDashOffset = (t * speed) % 70; ctx.lineWidth = 4
      for (const ly of [160, 260]) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke() }
      ctx.setLineDash([])
      // снег
      ctx.fillStyle = 'rgba(255,255,255,.6)'
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + t * 2) % W, (i * 53 + t * 3) % H, 2, 2)
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i]; o.x -= speed
        const oy = lanes[o.lane]
        ctx.font = '46px "Segoe UI Emoji"'; ctx.fillText(['🚗', '🕳️', '🚧'][o.kind], o.x - 23, oy + 16)
        if (Math.abs(o.x - x) < 60 && Math.abs(oy - busY) < 40) alive = false
        if (o.x < -60) obs.splice(i, 1)
      }
      ctx.fillStyle = '#F28C1A'; ctx.beginPath(); ctx.roundRect(x - 60, busY - 30, 120, 60, 12); ctx.fill()
      ctx.fillStyle = '#bfdbfe'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 50 + i * 26, busY - 22, 20, 18)
      ctx.fillStyle = '#fff'; ctx.font = '800 18px "Segoe UI"'; ctx.fillText('150', x - 16, busY + 22)
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - 34, busY + 30, 10, 0, 7); ctx.arc(x + 34, busY + 30, 10, 0, 7); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = '800 26px "Segoe UI"'; ctx.fillText(`${Math.floor(sc)} м`, 20, 40)
      setScore(Math.floor(sc))
      if (!alive) { setState('over'); setBest((b: number) => Math.max(b, Math.floor(sc))); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key) }
  }, [state])
  return (
    <>
      <PageHeader title="Автобус 150" subtitle="Доберись до Архангельска: ↑ и ↓ — смена полосы" right={<span className="pill">рекорд: {best} м</span>} />
      <Card flush style={{ position: 'relative' }}>
        <canvas ref={ref} width={900} height={420} style={{ width: '100%', display: 'block' }} />
        <AnimatePresence>
          {state !== 'play' && (
            <motion.div className="center" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', color: '#fff' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="col" style={{ alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: '3.5rem' }}>{state === 'over' ? '💥' : '🚌'}</div>
                <div className="h-card" style={{ fontSize: '1.6rem' }}>{state === 'over' ? `Проехал ${score} м` : 'Объезжай ямы и машины'}</div>
                <button className="btn primary lg" onClick={() => setState('play')}>{state === 'over' ? <><RotateCcw size={18} /> Ещё раз</> : <><Gamepad2 size={18} /> Поехали</>}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </>
  )
}

// ---------- все инструменты ----------

export function ToolsPage() {
  const p = useProfile()
  return (
    <>
      <PageHeader title="Инструменты" subtitle="Всё, что помогает учиться" />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
        {TOOLS.filter(t => !t.headOnly || p.head).map((t, i) => (
          <Card key={t.id} press tilt delay={i * 0.025} onClick={() => go(t.page)} style={{ overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -24, bottom: -24, opacity: 0.12 }}><t.Icon size={110} color={t.color} /></div>
            <motion.div whileHover={{ rotate: 10, scale: 1.1 }} className="icon-tile" style={{ width: 46, height: 46, borderRadius: 14, background: t.color }}><t.Icon size={22} /></motion.div>
            <div className="h-card mt12">{t.title}</div>
            <div className="sub">{t.subtitle}</div>
          </Card>
        ))}
      </div>
      {!p.head && <div className="tiny faint mt16">Посещаемость, рассылка и опросы появятся, если в Профиле выбрать роль «Староста» или «Зам».</div>}
    </>
  )
}
void Bus; void ExternalLink; void ImageIcon; void confirmDialog; void dayType
