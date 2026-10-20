// Главная студента: ДЗ группы по дням сдачи, пары недели, архив
import { useEffect, useState } from 'react'
import type { Me, Homework } from '../../../shared/types'
import type { Nav } from '../App'
import { api } from '../api'
import { haptic, openTelegram } from '../tg'
import { Section, Icon, Check, OneLine, DueChip, kindColor, Empty, Skeletons, toast } from '../ui'
import { Schedule } from './Schedule'
import { relDay, startOfDay, plural, dayMonth } from '../../../shared/dates'
import { kindStyle } from '../../../shared/pretty'

type Tab = 'hw' | 'pairs' | 'archive'
const TAB_KEY = 'arktika.tab'

export function Home({ me, nav, list, setList, reload }: { me: Me; nav: Nav; list: Homework[] | null; setList: (l: Homework[]) => void; reload: () => Promise<void> }) {
  const [tab, setTabState] = useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || 'hw' } catch { return 'hw' } })
  const setTab = (t: Tab) => { haptic.select(); setTabState(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* приватный режим */ } }

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [reload])

  const toggle = async (h: Homework) => {
    const done = !h.done
    done ? haptic.success() : haptic.tap()
    setList((list ?? []).map(x => (x.id === h.id ? { ...x, done, doneCount: x.doneCount + (done ? 1 : -1) } : x)))
    try { await api.done(h.id, done) } catch (e) { toast((e as Error).message); void reload() }
  }

  const left = (list ?? []).filter(h => !h.done).length
  const invite = () => {
    const link = `https://t.me/${me.bot}?start=g${me.group?.number}`
    openTelegram(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Домашка группы ${me.group?.number} — в одном месте. Записал один — видят все 📚`)}`)
  }

  return (
    <div className="page">
      <div className="top">
        <div>
          <div className="top-title">Домашка</div>
          <div className="top-sub">Группа {me.group?.number} · {left ? `${left} ${plural(left, 'задание', 'задания', 'заданий')}` : 'всё сделано'}</div>
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => nav.push({ name: 'settings' })} aria-label="Настройки"><Icon name="gear" /></button>
      </div>

      {me.members <= 3 && tab === 'hw' && (
        <button className="banner" onClick={invite} style={{ width: '100%', textAlign: 'left' }}>
          <span className="em">👥</span>
          <div className="row-main">
            <div className="row-title">Позови группу</div>
            <div className="row-sub">{me.members <= 1 ? 'Пока здесь только ты' : `Здесь ${me.members} из группы`} — один записал, у всех появилось</div>
          </div>
          <Icon name="share" />
        </button>
      )}

      <div className="seg">
        <button className={tab === 'hw' ? 'on' : ''} onClick={() => setTab('hw')}>Задано</button>
        <button className={tab === 'pairs' ? 'on' : ''} onClick={() => setTab('pairs')}>Пары</button>
        <button className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>Архив</button>
      </div>

      {tab === 'hw' && (list == null ? <Skeletons /> : <ByDay list={list} nav={nav} onToggle={toggle} />)}
      {tab === 'pairs' && <Schedule me={me} nav={nav} />}
      {tab === 'archive' && <Archive nav={nav} />}

      {tab !== 'archive' && (
        <button className="fab" onClick={() => { haptic.tap(); nav.push({ name: 'edit' }) }}><Icon name="plus" />Записать ДЗ</button>
      )}
    </div>
  )
}

function ByDay({ list, nav, onToggle }: { list: Homework[]; nav: Nav; onToggle: (h: Homework) => void }) {
  if (!list.length) {
    return <Empty emoji="🎉" title="Ничего не задано" text="Задали что-то? Запиши — увидит вся группа." />
  }
  const now = Date.now()
  const overdue = list.filter(h => h.due < now && !h.done)
  const rest = list.filter(h => !(h.due < now && !h.done))
  const days = new Map<number, Homework[]>()
  for (const h of rest) {
    const d = startOfDay(h.due)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(h)
  }
  return (
    <>
      {overdue.length > 0 && (
        <Section title="Просрочено" count={overdue.length}>{overdue.map(h => <HwRow key={h.id} h={h} nav={nav} onToggle={onToggle} />)}</Section>
      )}
      {[...days.entries()].map(([d, items]) => {
        const rel = relDay(d)
        const title = rel === 'сегодня' || rel === 'завтра' ? `${rel[0].toUpperCase()}${rel.slice(1)} · ${dayMonth(d)}` : rel
        const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due)
        const open = items.filter(h => !h.done).length
        return <Section key={d} title={title} count={open ? open : '✓'}>{sorted.map(h => <HwRow key={h.id} h={h} nav={nav} onToggle={onToggle} />)}</Section>
      })}
    </>
  )
}

export function HwRow({ h, nav, onToggle, teacher }: { h: Homework; nav: Nav; onToggle?: (h: Homework) => void; teacher?: boolean }) {
  return (
    <button className={`hw ${h.done && !teacher ? 'done' : ''}`} style={{ ['--kind' as string]: kindColor(h.dueKind) }} onClick={() => { haptic.tap(); nav.push({ name: 'hw', id: h.id }) }}>
      <div className="hw-main">
        <div className="hw-subject"><span className="name">{h.subject}</span>{h.important && <span>❗️</span>}</div>
        {h.text && <div className="hw-text"><OneLine text={h.text} /></div>}
        <div className="hw-meta">
          <DueChip due={h.due} done={h.done && !teacher} />
          {h.dueKind && <span>{kindStyle(h.dueKind).short}{h.dueRoom ? ` · ${h.dueRoom === 'дистант' ? 'дистант' : `ауд. ${h.dueRoom}`}` : ''}</span>}
          {h.photos.length > 0 && <span>📎 {h.photos.length}</span>}
          {teacher ? <span>👥 {h.groups.join(', ')}</span> : h.author.teacher ? <span className="chip teacher">👩‍🏫 от преподавателя</span> : <span>✍️ {h.author.name}</span>}
          {h.shiftNote && <span className="chip amber">перенесли</span>}
        </div>
        {teacher && h.memberCount > 0 && (
          <>
            <div className="progress"><div style={{ width: `${Math.round((h.doneCount / h.memberCount) * 100)}%` }} /></div>
            <div className="row-sub" style={{ fontSize: 13, marginTop: 4 }}>Сделали {h.doneCount} из {h.memberCount}</div>
          </>
        )}
      </div>
      {onToggle && <Check on={h.done} onClick={() => onToggle(h)} />}
    </button>
  )
}

function Archive({ nav }: { nav: Nav }) {
  const [list, setList] = useState<Homework[] | null>(null)
  useEffect(() => { api.homework('archive').then(setList).catch(() => setList([])) }, [])
  if (!list) return <Skeletons />
  if (!list.length) return <Empty emoji="🗂" title="Архив пуст" text="Здесь будет всё, что задавали раньше, — за весь семестр." />
  const months = new Map<string, Homework[]>()
  for (const h of list) {
    const d = new Date(h.due)
    const k = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    if (!months.has(k)) months.set(k, [])
    months.get(k)!.push(h)
  }
  return <>{[...months.entries()].map(([m, items]) => <Section key={m} title={m} count={items.length}>{items.map(h => <HwRow key={h.id} h={h} nav={nav} />)}</Section>)}</>
}
