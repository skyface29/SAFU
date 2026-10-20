// Мини-приложение: навигация стопкой экранов (кнопка «Назад» — в шапке Telegram), общие данные
import { useCallback, useEffect, useState } from 'react'
import type { Me, Homework } from '../../shared/types'
import { api } from './api'
import { backButton, startParam } from './tg'
import { Spinner, Toasts, Empty } from './ui'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Detail } from './pages/Detail'
import { Editor, type Preset } from './pages/Editor'
import { Settings } from './pages/Settings'
import { Teacher } from './pages/Teacher'
import { Trash } from './pages/Trash'

export type Screen =
  | { name: 'home' }
  | { name: 'hw'; id: number }
  | { name: 'edit'; id?: number; preset?: Preset }
  | { name: 'settings' }
  | { name: 'trash' }
  | { name: 'onboarding' }

export type Nav = { push(s: Screen): void; back(): void; reset(s?: Screen): void }

export function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState('')
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }])
  const [list, setList] = useState<Homework[] | null>(null)

  const loadMe = useCallback(() => api.me().then(setMe).catch(e => setError(e.message)), [])
  const reload = useCallback(async () => {
    try { setList(await api.homework('up')) } catch { /* покажем старое */ }
  }, [])

  useEffect(() => {
    void loadMe().then(() => {
      // открыли по ссылке на конкретное ДЗ: ?hw=12 из бота или startapp=hw12
      const p = startParam() || (new URLSearchParams(location.search).get('hw') ? `hw${new URLSearchParams(location.search).get('hw')}` : '')
      const m = /^hw(\d+)$/.exec(p)
      if (m) setStack([{ name: 'home' }, { name: 'hw', id: Number(m[1]) }])
    })
  }, [loadMe])

  useEffect(() => { if (me?.role) void reload() }, [me?.role, me?.group?.id, reload])

  const nav: Nav = {
    push: s => { setStack(st => [...st, s]); window.scrollTo(0, 0) },
    back: () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st)),
    reset: s => setStack([s ?? { name: 'home' }])
  }

  const depth = stack.length
  useEffect(() => backButton(depth > 1 ? () => setStack(st => st.slice(0, -1)) : null), [depth])

  if (error) return <div className="app"><Empty emoji="📡" title="Не получилось открыть" text={error} /></div>
  if (!me) return <div className="app"><Spinner /></div>

  const screen = stack[stack.length - 1]
  const done = () => { void loadMe(); void reload(); nav.reset() }

  let page
  if (!me.role || screen.name === 'onboarding') page = <Onboarding me={me} onDone={done} />
  else if (screen.name === 'hw') page = <Detail key={screen.id} id={screen.id} me={me} nav={nav} onChange={reload} />
  else if (screen.name === 'edit') page = <Editor key={screen.id ?? 'new'} id={screen.id} preset={screen.preset} me={me} nav={nav} onSaved={reload} />
  else if (screen.name === 'settings') page = <Settings me={me} nav={nav} onChange={loadMe} />
  else if (screen.name === 'trash') page = <Trash nav={nav} onChange={reload} />
  else if (me.role === 'teacher') page = <Teacher me={me} nav={nav} list={list} reload={reload} />
  else page = <Home me={me} nav={nav} list={list} setList={setList} reload={reload} />

  return <div className="app">{page}<Toasts /></div>
}
