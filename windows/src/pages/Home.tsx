// Главная: приветствие, сайты одной кнопкой, текущая пара, день, ДЗ, погода, дорога, сессия, инструменты
import React, { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, MapPin, User, BookMarked, Plus, ChevronRight, Check, Bus, GraduationCap, Wind, Settings2, Coffee, PartyPopper, Clock, Mail
} from 'lucide-react'
import { useSchedule, scheduleStore, teacherMode } from '../lib/scheduleStore'
import { nowAndNext, slotsOn, kindStyle, academicWeek, usesRuz, slotsRange, type Slot } from '../lib/schedule'
import { greeting, fullDay, hm, timer, untilText, addDays, startOfDay, isToday, isTomorrow, relDay, DAY_NAMES, plural, weekday } from '../lib/date'
import { useProfile } from '../lib/profile'
import { usePref } from '../lib/kv'
import { Card, KindBadge, Ring, useNow, Empty, burst, AnimatedNumber, openMenu, Progress } from '../ui/kit'
import { SlotRow } from '../ui/lesson'
import { go, openHomeworkEditor, openSubject, useModals } from '../lib/nav'
import { homeworkStore, hw, hwTitle, chip, urgency, hwKind } from '../lib/homework'
import { resources, resourcesStore, recentsStore } from '../lib/resources'
import { openSite } from '../sites/sites'
import { SiteGlyph, siteColor } from '../ui/icons'
import { useWeather, weather, weatherEmoji, deg, sky, outfit } from '../lib/weather'
import { bus, commute, busStore, routeTitle } from '../lib/bus'
import { session, daysLeft, isConsult } from '../lib/session'
import { TOOLS } from './tools/registry'
import { safu } from '../lib/bridge'
import { mapsURL } from '../lib/maps'
import { celebrations } from '../fx/Celebrations'

export const HOME_SECTIONS: { id: string; title: string }[] = [
  { id: 'now', title: 'Сейчас / следующая пара' },
  { id: 'quick', title: 'Быстрые кнопки сайтов' },
  { id: 'homework', title: 'Домашка' },
  { id: 'weather', title: 'Погода и что надеть' },
  { id: 'commute', title: 'Дорога (мой автобус)' },
  { id: 'session', title: 'Отсчёт до сессии' },
  { id: 'today', title: 'Неделя и дедлайны' },
  { id: 'tools', title: 'Инструменты' },
  { id: 'recents', title: 'Недавние сайты' },
  { id: 'sites', title: 'Все сайты' },
  { id: 'teacher', title: 'Преподавателю' }
]
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

export const DEFAULT_HOME = 'quick,now,homework,weather,today,tools,sites'

export default function Home() {
  const data = useSchedule(s => s.data)
  const syncing = useSchedule(s => s.syncing)
  const p = useProfile()
  const now = useNow(1000)
  const [order] = usePref('home.order', DEFAULT_HOME)
  const sections = order.split(',').filter(s => HOME_SECTIONS.some(h => h.id === s) && (s !== 'teacher' || p.teacher))
  const week = academicWeek(data.semesterStart)
  useEffect(() => { weather.refresh() }, [])

  const has = (id: string) => sections.includes(id)
  const side = sections.filter(s => ['weather', 'commute', 'session'].includes(s))
  const main = sections.filter(s => !['weather', 'commute', 'session', 'quick', 'now'].includes(s))

  return (
    <>
      <Hero name={p.first} week={week} syncing={syncing} />
      {has('quick') && <QuickSites />}
      {has('now') && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', marginTop: 16 }}>
          <NowCard now={now} />
          <DayTimeline now={now} />
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: side.length ? 'minmax(0, 1.55fr) minmax(0, 1fr)' : '1fr', marginTop: 14, alignItems: 'start' }}>
        <div className="col gap14">
          {main.map((s, i) => {
            switch (s) {
              case 'homework': return <HomeworkCard key={s} delay={i * 0.05} />
              case 'today': return <WeekCard key={s} delay={i * 0.05} />
              case 'tools': return <ToolsCard key={s} delay={i * 0.05} />
              case 'recents': return <RecentsCard key={s} />
              case 'sites': return <SitesCard key={s} delay={i * 0.05} />
              case 'teacher': return <TeacherCard key={s} />
              default: return null
            }
          })}
          {!sections.length && <Empty emoji="🏠" title="Главная пустая" text="Добавь блоки в настройках главной" action={<button className="btn primary" onClick={() => go('customize')}>Настроить главную</button>} />}
        </div>
        {side.length > 0 && (
          <div className="col gap14">
            {side.map((s, i) => s === 'weather' ? <WeatherCard key={s} delay={0.1 + i * 0.05} /> : s === 'commute' ? <CommuteCard key={s} now={now} /> : <SessionCard key={s} />)}
          </div>
        )}
      </div>
      <div className="row mt24" style={{ justifyContent: 'center' }}>
        <button className="btn ghost sm" onClick={() => go('customize')}><Settings2 size={15} /> Настроить главную</button>
      </div>
    </>
  )
}

function Hero({ name, week, syncing }: { name: string; week: number | null; syncing: boolean }) {
  const data = useSchedule(s => s.data)
  const msg = useSchedule(s => s.syncMessage)
  const today = slotsOn(Date.now(), data)
  const left = today.filter(s => s.end > Date.now()).length
  return (
    <motion.div className="row top" style={{ margin: '12px 4px 18px' }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="grow">
        <div className="muted" style={{ fontSize: '.95rem' }}>{cap(fullDay(Date.now()))}{week ? ` · ${week}-я учебная неделя` : ''}</div>
        <h1 className="h-page" style={{ marginTop: 4 }}>
          {greeting()}{name ? ', ' : ''}<span className="grad-text">{name}</span>
          <motion.span style={{ display: 'inline-block', marginLeft: 10, transformOrigin: '70% 80%' }} animate={{ rotate: [0, 18, -8, 18, 0] }} transition={{ duration: 1.6, delay: 0.6 }}>👋</motion.span>
        </h1>
        <div className="muted" style={{ marginTop: 6 }}>
          {today.length === 0 ? 'Сегодня пар нет — отдыхай 😌' : left === 0 ? 'Пары на сегодня закончились 🎉' : `Сегодня ${today.length} ${plural(today.length, 'пара', 'пары', 'пар')}, осталось ${left}`}
        </div>
      </div>
      {usesRuz(data) && (
        <button className="btn sm" onClick={() => scheduleStore.sync(true)} title={msg || ''}>
          <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Обновляю…' : scheduleStore.lastSyncText()}
        </button>
      )}
    </motion.div>
  )
}

function QuickSites() {
  const list = resourcesStore.use()
  const [unseen] = usePref('mail.unseen', 0)
  const [mailOn] = usePref('mail.notify', false)
  const quick = useMemo(() => resources.quick(), [list])
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(quick.length, 1)}, minmax(0, 1fr))`, gap: 12 }}>
      {quick.map((r, i) => (
        <motion.div key={r.id} className="card hover press tight row" style={{ gap: 12, padding: '12px 14px' }}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
          whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} onClick={() => openSite(r)}
          onContextMenu={e => openMenu(e, [{ label: 'Открыть с главной страницы', run: () => openSite(r, { fresh: true }) }, { label: 'Открыть в браузере', run: () => safu.shell.open(r.url) }, { label: 'Выбрать кнопки…', run: () => go('customize') }])}>
          <motion.div className="icon-tile" style={{ width: 42, height: 42, borderRadius: 13, background: siteColor(r.url, r.title), position: 'relative' }}
            whileHover={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 0.4 }}>
            <SiteGlyph icon={r.icon} size={20} />
            {mailOn && unseen > 0 && r.url.includes('edu.narfu') && (
              <motion.span className="side-badge" style={{ position: 'absolute', top: -6, right: -6, margin: 0 }} initial={{ scale: 0 }} animate={{ scale: 1 }}>{unseen}</motion.span>
            )}
          </motion.div>
          <div className="grow">
            <div className="bold ellipsis">{r.title}</div>
            <div className="tiny muted ellipsis">{r.subtitle}</div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function NowCard({ now }: { now: number }) {
  const data = useSchedule(s => s.data)
  const { current, next } = nowAndNext(now, data)
  const s = current || next
  if (!scheduleStore.isConfigured()) {
    return (
      <Card className="col" style={{ justifyContent: 'center', minHeight: 230 }}>
        <div style={{ fontSize: '2.4rem' }}>📅</div>
        <div className="h-card">Какая сейчас пара?</div>
        <div className="sub">Подключи расписание из РУЗ, и здесь будет текущая пара, аудитория и адрес</div>
        <div><button className="btn primary mt8" onClick={() => go('schedule')}>Подключить расписание</button></div>
      </Card>
    )
  }
  if (!s) {
    return <Card className="center" style={{ minHeight: 230 }}><Empty emoji="🏖️" title="На ближайшую неделю пар нет" text="Можно выдохнуть. Расписание обновится само." /></Card>
  }
  const st = kindStyle(s.kind)
  const live = !!current
  const total = s.end - s.start
  const progress = live ? (now - s.start) / total : 0
  const after = live ? next : nowAndNext(s.start + 60_000, data).next
  const sameDayAfter = after && startOfDay(after.start) === startOfDay(s.start) ? after : null
  const dayLabel = live ? 'Сейчас идёт' : isToday(s.start) ? 'Следующая пара' : `${relDay(s.start)[0].toUpperCase()}${relDay(s.start).slice(1)}`
  const left = live ? s.end - now : s.start - now

  return (
    <Card tilt style={{ overflow: 'hidden', minHeight: 230 }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(600px 300px at 0% 0%, ${st.color}33, transparent 60%)`, pointerEvents: 'none' }} />
      <AnimatePresence mode="wait">
        <motion.div key={s.key} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="row top" style={{ gap: 20, position: 'relative' }}>
          <div className="grow">
            <div className="row gap8">
              {live ? <span className="live-dot" /> : <Clock size={14} color="var(--brand)" />}
              <span className="tiny heavy" style={{ textTransform: 'uppercase', letterSpacing: '.08em', color: live ? '#22c55e' : 'var(--brand)' }}>{dayLabel}</span>
              <KindBadge kind={s.kind} size="md" />
              {s.pair > 0 && <span className="pill">{s.pair}-я пара</span>}
            </div>
            <div className="clickable" onClick={() => openSubject(s.subject)} style={{ fontSize: '1.7rem', fontWeight: 850, lineHeight: 1.15, margin: '12px 0 10px', letterSpacing: '-.02em' }}>{s.subject}</div>
            <div className="col gap6 muted">
              <div className="row gap8"><Clock size={15} /> {hm(s.start)}–{hm(s.end)}</div>
              {(s.room || s.address) && <div className="row gap8"><MapPin size={15} /> <span>{s.room && <b style={{ color: 'var(--text)' }}>ауд. {s.room}</b>}{s.room && s.address ? ' · ' : ''}{s.address}</span></div>}
              {s.teacher && <div className="row gap8"><User size={15} /> {s.teacher}</div>}
            </div>
            <div className="row gap8 mt16">
              {s.address && !s.remote && <button className="btn sm" onClick={() => safu.shell.open(mapsURL(s.address))}><MapPin size={14} /> На карте</button>}
              <button className="btn sm" onClick={() => openHomeworkEditor({ subject: s.subject, slotStart: s.start })}><BookMarked size={14} /> Записать ДЗ</button>
              <button className="btn sm ghost" onClick={() => useModals.getState().set({ lesson: s })}>Подробнее <ChevronRight size={14} /></button>
            </div>
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 8 }}>
            <Ring value={live ? progress : Math.max(0.02, 1 - Math.min(1, left / (3 * 3600_000)))} size={128} stroke={10} color={live ? st.color : undefined}>
              <div className="tc">
                <div className="heavy mono" style={{ fontSize: left < 3600_000 ? '1.6rem' : '1.25rem' }}>{left < 24 * 3600_000 ? timer(left) : untilText(left)}</div>
                <div className="tiny muted">{live ? 'до конца' : 'до начала'}</div>
              </div>
            </Ring>
          </div>
        </motion.div>
      </AnimatePresence>
      {live && <div className="mt16"><Progress value={progress} /></div>}
      {sameDayAfter && (
        <div className="row sub mt12" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="faint">Потом</span>
          <span className="bold ellipsis" style={{ color: 'var(--text)' }}>{sameDayAfter.subject}</span>
          <span>{hm(sameDayAfter.start)}{sameDayAfter.room ? ` · ауд. ${sameDayAfter.room}` : ''}</span>
        </div>
      )}
    </Card>
  )
}

function DayTimeline({ now }: { now: number }) {
  const data = useSchedule(s => s.data)
  let day = startOfDay(now)
  let list = slotsOn(day, data)
  if (list.length && list.every(s => s.end <= now)) { day = addDays(day, 1); list = slotsOn(day, data) }
  if (!list.length) {
    for (let i = 1; i < 8 && !list.length; i++) { day = addDays(startOfDay(now), i); list = slotsOn(day, data) }
  }
  return (
    <Card delay={0.05} className="col" style={{ gap: 10 }}>
      <div className="row">
        <div className="h-card grow">{isToday(day) ? 'Сегодня' : cap(relDay(day))}</div>
        <button className="btn sm ghost" onClick={() => go('schedule')}>Все пары <ChevronRight size={14} /></button>
      </div>
      {!list.length && <div className="sub">Пар нет</div>}
      <div className="col gap8" style={{ maxHeight: 320, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {list.map(s => <SlotRow key={s.key} s={s} now={now} compact />)}
      </div>
    </Card>
  )
}

function HomeworkCard({ delay }: { delay: number }) {
  homeworkStore.use()
  const active = hw.active()
  const stats = hw.weekStats()
  return (
    <Card delay={delay}>
      <div className="row mb12">
        <div className="icon-tile" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}><BookMarked size={17} /></div>
        <div className="grow">
          <div className="h-card">Домашка</div>
          <div className="tiny muted">{active.length ? `${active.length} ${plural(active.length, 'задание', 'задания', 'заданий')} · за неделю сделано ${stats.done} из ${stats.total}` : 'Всё сделано'}</div>
        </div>
        <button className="btn sm primary" onClick={() => openHomeworkEditor({})}><Plus size={14} /> Записать</button>
        <button className="btn sm ghost" onClick={() => go('homework')}><ChevronRight size={16} /></button>
      </div>
      {!active.length && <div className="row sub" style={{ padding: '6px 2px' }}><Coffee size={16} /> Дедлайнов нет, можно выдохнуть</div>}
      <div className="col gap6">
        <AnimatePresence initial={false}>
          {active.slice(0, 5).map(h => (
            <motion.div key={h.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, x: 40, height: 0 }}
              className="row" style={{ padding: '9px 10px', borderRadius: 12, background: 'var(--fill)', cursor: 'pointer' }} onClick={() => openHomeworkEditor({ id: h.id })}>
              <motion.button whileTap={{ scale: 0.8 }} onClick={e => { e.stopPropagation(); burst(e.clientX, e.clientY); hw.toggle(h.id); celebrations.taskDone(hwTitle(h), hw.active().length) }}
                style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${hwKind(h.kind).color}`, background: 'none', cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center' }} />
              <span style={{ fontSize: '1.05rem' }}>{hwKind(h.kind).emoji}</span>
              <div className="grow">
                <div className="bold ellipsis small">{hwTitle(h)}</div>
                <div className="tiny muted ellipsis">{h.subject}</div>
              </div>
              <span className="pill" style={{ color: urgency(h.due), background: 'var(--fill2)' }}>{chip(h.due)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  )
}

function WeekCard({ delay }: { delay: number }) {
  const data = useSchedule(s => s.data)
  homeworkStore.use()
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(Date.now()), i))
  const counts = days.map(d => slotsOn(d, data).length)
  const deadlines = days.map(d => hw.active().filter(h => startOfDay(h.due) === d).length)
  const max = Math.max(4, ...counts)
  return (
    <Card delay={delay}>
      <div className="row mb12">
        <div className="icon-tile" style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)' }}><Clock size={17} /></div>
        <div className="h-card grow">Неделя и дедлайны</div>
        <span className="sub">{counts.reduce((a, b) => a + b, 0)} пар за 7 дней</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 10, height: 130 }}>
        {days.map((d, i) => (
          <div key={d} className="col grow clickable" style={{ alignItems: 'center', gap: 6 }} onClick={() => go('schedule', { day: d })}>
            <div className="tiny bold" style={{ color: deadlines[i] ? '#f59e0b' : 'transparent' }}>{deadlines[i] ? `ДЗ ${deadlines[i]}` : '·'}</div>
            <motion.div initial={{ height: 0 }} animate={{ height: `${(counts[i] / max) * 80 + 4}px` }} transition={{ delay: delay + i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
              style={{ width: '100%', maxWidth: 40, borderRadius: 10, background: i === 0 ? 'var(--grad)' : 'var(--fill2)', boxShadow: i === 0 ? '0 6px 18px rgba(var(--brand-rgb),.4)' : undefined, display: 'grid', placeItems: 'end center', paddingBottom: 4 }}>
              {counts[i] > 0 && <span className="tiny heavy" style={{ color: i === 0 ? '#fff' : 'var(--text2)' }}>{counts[i]}</span>}
            </motion.div>
            <div className="tiny" style={{ fontWeight: i === 0 ? 800 : 600, color: i === 0 ? 'var(--brand)' : 'var(--text2)' }}>{DAY_NAMES[weekday(d) - 1]}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ToolsCard({ delay }: { delay: number }) {
  const p = useProfile()
  const [hidden] = usePref('tools.hidden', '')
  const list = TOOLS.filter(t => (!t.headOnly || p.head) && !hidden.split(',').includes(t.id)).slice(0, 12)
  return (
    <Card delay={delay}>
      <div className="row mb12">
        <div className="h-card grow">Инструменты</div>
        <button className="btn sm ghost" onClick={() => go('tools')}>Все <ChevronRight size={14} /></button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {list.map((t, i) => (
          <motion.div key={t.id} className="col" style={{ gap: 8, padding: 12, borderRadius: 16, background: 'var(--fill)', cursor: 'pointer', border: '1px solid var(--line)' }}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: delay + i * 0.025 }}
            whileHover={{ y: -3, background: 'var(--fill2)' }} whileTap={{ scale: 0.95 }} onClick={() => go(t.page)}>
            <div className="icon-tile" style={{ background: t.color, width: 32, height: 32 }}><t.Icon size={16} /></div>
            <div><div className="bold small">{t.title}</div><div className="tiny muted ellipsis">{t.subtitle}</div></div>
          </motion.div>
        ))}
      </div>
    </Card>
  )
}

function SitesCard({ delay }: { delay: number }) {
  const list = resourcesStore.use()
  const cats = resources.categories(list)
  return (
    <Card delay={delay}>
      <div className="row mb12">
        <div className="h-card grow">Сайты университета</div>
        <button className="btn sm ghost" onClick={() => go('profile', { section: 'sites' })}>Изменить</button>
      </div>
      {cats.map(c => (
        <div key={c} className="mb12">
          <div className="tiny faint bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{c}</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
            {list.filter(r => r.category === c).map(r => (
              <motion.div key={r.id} className="row" whileHover={{ x: 3 }} onClick={() => openSite(r)}
                onContextMenu={e => openMenu(e, [{ label: 'Открыть в браузере', run: () => safu.shell.open(r.url) }, { label: r.pinned ? 'Открепить' : 'Закрепить', run: () => resources.togglePin(r.id) }])}
                style={{ padding: 8, borderRadius: 12, cursor: 'pointer', background: 'var(--fill)', gap: 10 }}>
                <div className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9, background: siteColor(r.url, r.title) }}><SiteGlyph icon={r.icon} size={15} /></div>
                <div className="grow"><div className="bold small ellipsis">{r.title}</div><div className="tiny muted ellipsis">{r.subtitle}</div></div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}

function RecentsCard() {
  recentsStore.use()
  const list = resources.recents()
  if (!list.length) return null
  return (
    <Card>
      <div className="h-card mb12">Недавние сайты</div>
      <div className="row wrap-row gap8">
        {list.map(r => <button key={r.id} className="chip" onClick={() => openSite(r)}><SiteGlyph icon={r.icon} size={14} />{r.title}</button>)}
      </div>
    </Card>
  )
}

function WeatherCard({ delay }: { delay: number }) {
  const { hours, loading } = useWeather()
  const city = weather.city()
  const now = weather.hourAt(Date.now(), hours)
  if (!now) {
    return <Card delay={delay}><div className="h-card">Погода</div><div className="sub mt8">{loading ? 'Загружаю прогноз…' : 'Нет прогноза — проверь интернет'}</div></Card>
  }
  const soon = hours.filter(h => h.time > Date.now() && h.time < Date.now() + 8 * 3600_000)
  const strip = hours.filter(h => h.time > Date.now() - 3600_000).slice(0, 12)
  return (
    <Card delay={delay} style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, fontSize: '9rem', opacity: 0.12, pointerEvents: 'none' }}>{weatherEmoji(now.code)}</div>
      <div className="row">
        <motion.div style={{ fontSize: '3rem' }} animate={{ y: [0, -5, 0], rotate: [0, 4, 0] }} transition={{ duration: 4, repeat: Infinity }}>{weatherEmoji(now.code)}</motion.div>
        <div className="grow">
          <div style={{ fontSize: '2.3rem', fontWeight: 850, lineHeight: 1 }}>{deg(now.temp)}</div>
          <div className="sub">{sky(now.code)} · ощущается {deg(now.feels)}</div>
          <div className="tiny faint row gap4"><Wind size={11} /> {Math.round(now.wind)} м/с · {city === 'severodvinsk' ? 'Северодвинск' : 'Архангельск'}</div>
        </div>
      </div>
      <div className="col gap6 mt12">
        {outfit(now, soon).map((o, i) => (
          <motion.div key={i} className="row small" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: delay + 0.1 + i * 0.06 }}>
            <span>{o.emoji}</span><span>{o.text}</span>
          </motion.div>
        ))}
      </div>
      <div className="row mt12" style={{ gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {strip.map(h => (
          <div key={h.time} className="col tc" style={{ gap: 2, minWidth: 44, padding: '6px 4px', borderRadius: 10, background: 'var(--fill)' }}>
            <span className="tiny faint">{new Date(h.time).getHours()}:00</span>
            <span>{weatherEmoji(h.code)}</span>
            <span className="tiny bold">{deg(h.temp)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function CommuteCard({ now }: { now: number }) {
  const data = useSchedule(s => s.data)
  busStore.use()
  const r = bus.active()
  let day = startOfDay(now)
  let first = commute.firstPair(day, data)
  if (!first || first.start < now) { day = addDays(day, 1); first = commute.firstPair(day, data) }
  const morning = first ? commute.morning(first) : null
  const last = commute.lastPair(startOfDay(now), data)
  const home = last && last.end > now - 3 * 3600_000 ? commute.afterClasses(last.end) : commute.afterClasses(now)
  const color = '#' + r.colorHex
  return (
    <Card>
      <div className="row mb12">
        <div className="icon-tile heavy" style={{ background: color, width: 44 }}>{r.number || <Bus size={16} />}</div>
        <div className="grow"><div className="h-card">Дорога</div><div className="tiny muted">{routeTitle(r)} · в пути {r.travelMinutes} мин</div></div>
        <button className="btn sm ghost" onClick={() => go('bus')}><ChevronRight size={16} /></button>
      </div>
      {morning && first ? (
        <div style={{ padding: 12, borderRadius: 14, background: `${color}1f`, border: `1px solid ${color}55` }}>
          <div className="tiny muted">{isToday(first.start) ? 'Сегодня' : isTomorrow(first.start) ? 'Завтра' : relDay(first.start)} к паре в {hm(first.start)}</div>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 850 }}>{hm(morning.departure)}</span>
            <span className="sub">→ {hm(morning.arrival)}{r.homeStop ? ` · с ${r.homeStop}` : ''}</span>
          </div>
          {morning.departure > now && <div className="tiny bold" style={{ color }}>выезд через {untilText(morning.departure - now)}</div>}
        </div>
      ) : <div className="sub">Пар в корпусе в ближайшие дни нет</div>}
      {home.length > 0 && (
        <div className="mt12">
          <div className="tiny faint bold mb8">ДОМОЙ</div>
          <div className="row gap6">{home.map(t => <span key={t.departure} className="pill">{hm(t.departure)}</span>)}</div>
        </div>
      )}
    </Card>
  )
}

function SessionCard() {
  const data = useSchedule(s => s.data)
  const exams = session.exams(data).filter(e => !isConsult(e))
  const next = exams[0]
  return (
    <Card className="press" onClick={() => go('session')}>
      <div className="row">
        <div className="icon-tile" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}><GraduationCap size={17} /></div>
        <div className="h-card grow">Сессия</div>
      </div>
      {next ? (
        <div className="row mt12" style={{ alignItems: 'flex-end' }}>
          <div style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1 }} className="grad-text"><AnimatedNumber value={daysLeft(next)} /></div>
          <div className="grow"><div className="small muted">{plural(daysLeft(next), 'день', 'дня', 'дней')} до «{next.subject}»</div><div className="tiny faint">{next.kind} · {relDay(next.start)}</div></div>
        </div>
      ) : <div className="sub mt8">Экзаменов пока нет в РУЗ</div>}
    </Card>
  )
}

function TeacherCard() {
  const data = useSchedule(s => s.data)
  const syncing = useSchedule(s => s.syncing)
  const groups = teacherMode.myGroups(data)
  const today = slotsOn(Date.now(), data).length
  const week = slotsRange(Date.now(), 7, data).length
  return (
    <Card>
      <div className="row">
        <span className="tiny heavy" style={{ color: 'var(--brand)', textTransform: 'uppercase' }}>Преподаватель</span>
        <span className="badge" style={{ background: '#f59e0b', color: '#fff' }}>бета</span>
        <span className="spacer" />
        <button className="btn icon sm ghost" onClick={() => scheduleStore.sync(true)}><RefreshCw size={14} className={syncing ? 'spin' : ''} /></button>
      </div>
      <div className="grid g3 mt12">
        {[[today, 'сегодня'], [week, 'за 7 дней'], [groups.length, 'групп']].map(([v, t]) => (
          <div key={t as string}><div className="heavy" style={{ fontSize: '1.6rem' }}><AnimatedNumber value={v as number} /></div><div className="tiny muted">{t}</div></div>
        ))}
      </div>
      <div className="row wrap-row gap6 mt12">{groups.map(g => <span key={g} className="pill mono">{g}</span>)}</div>
      <div className="tiny faint mt12">В разработке: пары из РУЗ могут быть неполными</div>
      <div className="row mt12">
        <button className="btn sm grow" onClick={() => go('attendance')}>Посещаемость</button>
        <button className="btn sm grow" onClick={() => go('broadcast')}>Рассылка</button>
      </div>
    </Card>
  )
}

void Check; void PartyPopper; void Mail
