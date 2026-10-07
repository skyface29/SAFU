// Профиль и настройки: оформление, главная и меню, сайты, пароли, почта, копия, защита, автор
import React, { useEffect, useState } from 'react'
import { motion, Reorder } from 'framer-motion'
import {
  Palette, LayoutDashboard, Globe, KeyRound, Mail, ArchiveRestore, Lock, Info, Bell, Monitor, Camera, Pencil, RefreshCw, LogOut,
  Trash2, Plus, Eye, EyeOff, GripVertical, ExternalLink, Send, Sparkles, Shield, FolderOpen, Power, AppWindow, Keyboard, Heart, Code2, Check, X
} from 'lucide-react'
import { PageHeader, Card, Sheet, Field, Segmented, Toggle, Row, ToggleRow, toast, confirmDialog, promptDialog, alertDialog, AnimatedNumber, Chips, openMenu } from '../ui/kit'
import { Avatar } from '../ui/Avatar'
import { useProfile, ROLE_TITLES } from '../lib/profile'
import { usePref, kv } from '../lib/kv'
import { go, parseTabs, ALL_TABS, TAB_META, DEFAULT_TABS } from '../lib/nav'
import { useSchedule, scheduleStore } from '../lib/scheduleStore'
import { safu, isDesktop } from '../lib/bridge'
import { ACCENTS, BACKDROPS, CARD_STYLES, FONTS, PRESETS, PACKS, applyPreset, applyPack, SEASON_TITLE, season } from '../lib/theme'
import { HOME_SECTIONS, DEFAULT_HOME } from './Home'
import { resourcesStore, resources, type Resource } from '../lib/resources'
import { SiteGlyph, siteColor, SITE_ICON_CHOICES } from '../ui/icons'
import { creds, useCreds } from '../lib/creds'
import { mailWatch } from '../lib/mail'
import { makeBackup, restoreBackupInteractive } from '../lib/backup'
import { hashPin } from './AppLock'
import { relativeAgo } from '../lib/date'
import { hw, homeworkStore } from '../lib/homework'
import { tasksStore, notesStore } from '../lib/study'
import { gradesStore } from '../lib/grades'
import { openSite } from '../sites/sites'
import { celebrations } from '../fx/Celebrations'

export default function Profile() {
  const p = useProfile()
  const data = useSchedule(s => s.data)
  homeworkStore.use(); tasksStore.use(); notesStore.use(); gradesStore.use()
  const [editName, setEditName] = useState(false)
  const pickAvatar = async () => {
    const f = await safu.dialog.open({ filters: [{ name: 'Фото', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], base64: true })
    if (!f) return
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d')!; const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); kv.set('user.avatar', c.toDataURL('image/jpeg', 0.85)) }
    img.src = `data:image/${f.name.split('.').pop()};base64,${f.data}`
  }
  const sections: { id: any; title: string; sub: string; Icon: any; color: string }[] = [
    { id: 'appearance', title: 'Оформление', sub: 'Темы, живые фоны, карточки, шрифты', Icon: Palette, color: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
    { id: 'customize', title: 'Главная и меню', sub: 'Блоки главной, разделы, быстрые кнопки', Icon: LayoutDashboard, color: 'linear-gradient(135deg,#3b82f6,#06b6d4)' },
    { id: 'settings', title: 'Приложение и Windows', sub: 'Трей, автозапуск, мини-окно, уведомления', Icon: Monitor, color: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
    { id: 'passwords', title: 'Пароли и сайты', sub: 'Вход на сайты вуза, список сайтов', Icon: KeyRound, color: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
    { id: 'mailnotify', title: 'Уведомления о почте', sub: 'Новые письма в почте САФУ', Icon: Mail, color: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
    { id: 'backup', title: 'Резервная копия', sub: 'Сохранить, восстановить, перенести с iPhone', Icon: ArchiveRestore, color: 'linear-gradient(135deg,#10b981,#059669)' },
    { id: 'developer', title: 'Автор и новости', sub: 'Связаться, что нового', Icon: Code2, color: 'linear-gradient(135deg,#64748b,#334155)' }
  ]
  return (
    <>
      <Card tilt className="row" style={{ gap: 22, padding: 24, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 240px at 0% 0%, rgba(var(--brand-rgb), .25), transparent)' }} />
        <motion.div whileHover={{ scale: 1.05 }} className="clickable" onClick={pickAvatar} style={{ position: 'relative' }} title="Сменить фото">
          <Avatar size={96} />
          <div className="icon-tile" style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--line2)' }}><Camera size={14} /></div>
        </motion.div>
        <div className="grow" style={{ position: 'relative' }}>
          <div className="row"><div style={{ fontSize: '2rem', fontWeight: 900 }}>{p.first || 'Студент'} {p.last}</div><button className="btn icon sm ghost" onClick={() => setEditName(true)}><Pencil size={15} /></button></div>
          <div className="muted">{p.teacher ? `Преподаватель · ${kv.get('teacher.query', '')}` : `${p.group ? `Группа ${p.group}` : 'Группа не указана'} · ${ROLE_TITLES[p.role]}`}</div>
          <div className="row gap8 mt12">
            <button className="btn sm" onClick={() => kv.set('onboarding.again', true)}><RefreshCw size={14} /> Пройти регистрацию заново</button>
            {p.avatar && <button className="btn sm ghost" onClick={() => kv.set('user.avatar', '')}>Убрать фото</button>}
          </div>
        </div>
        <div className="grid g2" style={{ gap: 10, position: 'relative' }}>
          {[[data.ruzEvents.length, 'пар в памяти'], [hw.active().length, 'ДЗ в работе'], [notesStore.get().length, 'заметок'], [gradesStore.get().length, 'предметов в БРС']].map(([v, t]) => (
            <div key={t as string} className="tc" style={{ padding: '10px 16px', borderRadius: 14, background: 'var(--fill)' }}><div className="heavy" style={{ fontSize: '1.4rem' }}><AnimatedNumber value={v as number} /></div><div className="tiny muted">{t}</div></div>
          ))}
        </div>
      </Card>
      <div className="grid mt16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {sections.map((s, i) => (
          <Card key={s.id} press delay={0.05 + i * 0.03} onClick={() => go(s.id)} className="row">
            <motion.div className="icon-tile" whileHover={{ rotate: -8, scale: 1.1 }} style={{ width: 46, height: 46, borderRadius: 14, background: s.color }}><s.Icon size={21} /></motion.div>
            <div className="grow"><div className="bold">{s.title}</div><div className="tiny muted">{s.sub}</div></div>
          </Card>
        ))}
      </div>
      <RoleCard />
      <NameSheet open={editName} onClose={() => setEditName(false)} />
    </>
  )
}

function RoleCard() {
  const [role, setRole] = usePref('user.role', 0)
  const [kind] = usePref('user.kind', 'student')
  if (kind === 'teacher') return null
  return (
    <Card className="mt16 row wrap-row">
      <div className="grow"><div className="bold">Роль в группе</div><div className="tiny muted">Старосте и заму открываются посещаемость, рассылка и опросы</div></div>
      <Segmented value={role} onChange={setRole} options={[{ value: 0, label: 'Студент' }, { value: 1, label: 'Староста' }, { value: 2, label: 'Зам' }]} />
    </Card>
  )
}

function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState(''); const [l, setL] = useState(''); const [m, setM] = useState('')
  useEffect(() => { if (open) { setF(kv.get('user.first', '')); setL(kv.get('user.last', '')); setM(kv.get('user.middle', '')) } }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Имя" footer={<button className="btn primary" onClick={() => { kv.set('user.first', f.trim()); kv.set('user.last', l.trim()); kv.set('user.middle', m.trim()); kv.set('user.name', [f, l].filter(Boolean).join(' ')); kv.set('report.student', [l, f, m].filter(Boolean).join(' ')); onClose() }}>Сохранить</button>}>
      <Field label="Имя"><input className="input" value={f} onChange={e => setF(e.target.value)} autoFocus /></Field>
      <Field label="Фамилия"><input className="input" value={l} onChange={e => setL(e.target.value)} /></Field>
      <Field label="Отчество"><input className="input" value={m} onChange={e => setM(e.target.value)} /></Field>
    </Sheet>
  )
}

// ---------- оформление ----------

export function Appearance() {
  const [theme, setTheme] = usePref('theme', 'blue')
  const [seasonal, setSeasonal] = usePref('theme.seasonal', false)
  const [bg, setBg] = usePref('bg.style', 'glow')
  const [intensity, setIntensity] = usePref('bg.intensity', 1)
  const [card, setCard] = usePref('cardStyle', 'glass')
  const [font, setFont] = usePref('ui.font', 'rounded')
  const [radius, setRadius] = usePref('ui.radius', 1)
  const [size, setSize] = usePref('ui.textSize', 0)
  const [scheme, setScheme] = usePref('ui.scheme', 'dark')
  const [grad, setGrad] = usePref('ui.gradTitle', false)
  const [motionOff, setMotionOff] = usePref('ui.reduceMotion', false)
  const [mica, setMica] = usePref('ui.mica', false)
  const [pack] = usePref('look.pack', '')
  const [backdropAnim, setBackdropAnim] = usePref('ui.siteBackdrop', true)
  const [blur, setBlur] = usePref('ui.blur', false)
  const Swatch = ({ a }: { a: typeof ACCENTS[0] }) => (
    <motion.button whileHover={{ scale: 1.12, y: -2 }} whileTap={{ scale: 0.9 }} title={a.title} onClick={() => { setTheme(a.id); setSeasonal(false); kv.set('look.pack', '') }}
      style={{ width: 46, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`, boxShadow: theme === a.id && !seasonal ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.c1}` : 'none', display: 'grid', placeItems: 'center' }}>
      {theme === a.id && !seasonal && <Check size={20} color="#fff" strokeWidth={3} />}
    </motion.button>
  )
  return (
    <>
      <PageHeader title="Оформление" subtitle="Сделай САФУ своим" right={<span className="kbd">Ctrl ,</span>} />
      <div className="h-sec" style={{ marginTop: 0 }}><Sparkles size={13} /> Готовые наборы</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {PRESETS.map((pr, i) => {
          const a = ACCENTS.find(x => x.id === pr.theme)!
          return (
            <motion.div key={pr.id} className="card hover press tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => { applyPreset(pr); toast(`Набор «${pr.title}»`) }}>
              <div style={{ height: 54, borderRadius: 12, background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`, display: 'grid', placeItems: 'center', fontSize: '1.6rem' }}>{pr.emoji}</div>
              <div className="bold small mt8 tc">{pr.title}</div>
            </motion.div>
          )
        })}
      </div>
      <div className="h-sec">Тема</div>
      <Card>
        <div className="row mb12"><Segmented value={scheme} onChange={setScheme} options={[{ value: 'system', label: 'Как в Windows' }, { value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' }]} /></div>
        <div className="tiny faint mb8">ЯРКИЕ</div>
        <div className="row wrap-row gap8 mb12">{ACCENTS.filter(a => !a.strict).map(a => <Swatch key={a.id} a={a} />)}</div>
        <div className="tiny faint mb8">СТРОГИЕ</div>
        <div className="row wrap-row gap8 mb12">{ACCENTS.filter(a => a.strict).map(a => <Swatch key={a.id} a={a} />)}</div>
        <div className="row"><div className="grow"><b>Цвет по сезону</b><div className="tiny muted">Сейчас: {SEASON_TITLE[season()]}</div></div><Toggle on={seasonal} onChange={setSeasonal} /></div>
      </Card>
      <div className="h-sec">Живой фон</div>
      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {BACKDROPS.map(b => (
            <motion.button key={b.id} whileTap={{ scale: 0.94 }} onClick={() => setBg(b.id)} className="col" style={{ alignItems: 'center', gap: 4, padding: '12px 6px', borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${bg === b.id ? 'var(--brand)' : 'var(--line)'}`, background: bg === b.id ? 'rgba(var(--brand-rgb), .14)' : 'var(--fill)' }}>
              <span style={{ fontSize: '1.4rem' }}>{b.emoji}</span><span className="tiny bold">{b.title}</span>
            </motion.button>
          ))}
        </div>
        <div className="row mt12"><span className="small grow">Насыщенность</span><input type="range" min={0.3} max={1.8} step={0.1} value={intensity} onChange={e => setIntensity(+e.target.value)} style={{ width: 240, accentColor: 'var(--brand)' }} /></div>
        {isDesktop && <div className="row mt12"><div className="grow"><b>Материал Mica (Windows 11)</b><div className="tiny muted">Окно просвечивает обоями рабочего стола вместо живого фона</div></div><Toggle on={mica} onChange={v => { setMica(v); safu.app.mica(v) }} /></div>}
      </Card>
      <div className="h-sec">Карточки</div>
      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {CARD_STYLES.map(c => <button key={c.id} className={`chip ${card === c.id ? 'on' : ''}`} style={{ height: 40, justifyContent: 'center' }} onClick={() => setCard(c.id)}>{c.title}</button>)}
        </div>
        <div className="row mt12"><div className="grow"><b className="small">Настоящее стекло</b><div className="tiny muted">Размытие фона под карточками. Красиво, но нагружает видеокарту — включай на мощном компьютере</div></div><Toggle on={blur} onChange={setBlur} /></div>
        <div className="row mt12"><span className="small grow">Скругление углов</span><input type="range" min={0.3} max={1.4} step={0.05} value={radius} onChange={e => setRadius(+e.target.value)} style={{ width: 240, accentColor: 'var(--brand)' }} /></div>
      </Card>
      <div className="h-sec">Текст</div>
      <Card className="col gap14">
        <div className="row"><span className="small grow">Шрифт</span><Segmented value={font} onChange={setFont} options={FONTS.map(f => ({ value: f.id, label: <span style={{ fontFamily: f.css }}>{f.title}</span> }))} /></div>
        <div className="row"><span className="small grow">Размер</span><Segmented value={size} onChange={setSize} options={[{ value: 1, label: 'Меньше' }, { value: 0, label: 'Обычный' }, { value: 2, label: 'Крупнее' }, { value: 3, label: 'Крупный' }]} /></div>
        <div className="row"><span className="small grow">Заголовки градиентом</span><Toggle on={grad} onChange={setGrad} /></div>
      </Card>
      <div className="h-sec">Тематические оформления</div>
      <div className="grid g4">{PACKS.map(pk => <Card key={pk.id} press onClick={() => applyPack(pk.id)} style={{ borderColor: pack === pk.id ? 'var(--brand)' : undefined }}><div className="bold">{pk.title}</div><div className="tiny muted mt4">{pk.subtitle}</div></Card>)}</div>
      <div className="h-sec">Движение</div>
      <Card className="list" style={{ padding: 0 }}>
        <ToggleRow title="Уменьшить анимации" sub="Для слабых компьютеров и если укачивает" on={motionOff} onChange={setMotionOff} />
        <ToggleRow title="Приложение отъезжает под сайтом" sub="Как в Telegram, когда открыта карточка сайта" on={backdropAnim} onChange={setBackdropAnim} />
        <Row title="Показать салют" sub="Проверить, как выглядят праздники" onClick={() => celebrations.test()} />
      </Card>
    </>
  )
}

// ---------- главная и меню ----------

export function Customize() {
  const [order, setOrder] = usePref('home.order', DEFAULT_HOME)
  const [tabsRaw, setTabs] = usePref('tabs.order', DEFAULT_TABS)
  const [quickIds, setQuickIds] = usePref('quick.ids', '')
  const list = resourcesStore.use()
  const on = order.split(',').filter(Boolean)
  const all = [...on.filter(id => HOME_SECTIONS.some(h => h.id === id)), ...HOME_SECTIONS.map(h => h.id).filter(id => !on.includes(id))]
  const tabs = parseTabs(tabsRaw)
  const quick = quickIds ? quickIds.split(',') : resources.quick().map(r => r.id)
  return (
    <>
      <PageHeader title="Главная и меню" subtitle="Перетаскивай блоки мышью, чтобы поменять порядок" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Блоки главной</div>
          <Reorder.Group axis="y" values={all} onReorder={v => setOrder(v.filter(id => on.includes(id)).join(','))} className="col gap6" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {all.map(id => {
              const h = HOME_SECTIONS.find(x => x.id === id)!
              const enabled = on.includes(id)
              return (
                <Reorder.Item key={id} value={id} className="card tight row" style={{ cursor: 'grab', opacity: enabled ? 1 : 0.55 }} whileDrag={{ scale: 1.03, boxShadow: '0 20px 40px rgba(0,0,0,.4)' }}>
                  <GripVertical size={16} className="faint" /><span className="grow bold small">{h.title}</span>
                  <Toggle on={enabled} onChange={v => setOrder((v ? [...on, id] : on.filter(x => x !== id)).join(','))} />
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
          <button className="btn ghost mt8" onClick={() => setOrder(DEFAULT_HOME)}>Вернуть как было</button>
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Разделы в боковой панели</div>
          <Card className="list" style={{ padding: 0 }}>
            {ALL_TABS.map(t => (
              <Row key={t} title={TAB_META[t].title} sub={t === 'profile' ? 'Всегда на месте' : undefined} right={<Toggle on={tabs.includes(t)} disabled={t === 'profile'} onChange={v => setTabs((v ? [...tabs, t] : tabs.filter(x => x !== t)).sort((a, b) => ALL_TABS.indexOf(a) - ALL_TABS.indexOf(b)).join(','))} />} />
            ))}
          </Card>
          <div className="h-sec">Быстрые кнопки сайтов</div>
          <Card className="list" style={{ padding: 0 }}>
            {list.map(r => (
              <Row key={r.id} icon={<SiteGlyph icon={r.icon} size={16} />} color={siteColor(r.url, r.title)} title={r.title} sub={r.subtitle}
                right={<Toggle on={quick.includes(r.id)} onChange={v => setQuickIds((v ? [...quick, r.id] : quick.filter(x => x !== r.id)).slice(0, 6).join(','))} />} />
            ))}
          </Card>
        </div>
      </div>
    </>
  )
}

// ---------- приложение и Windows ----------

export function AppSettings() {
  const [info, setInfo] = useState<any>(null)
  const [tray, setTray] = usePref('app.tray', true)
  const [widget, setWidget] = useState(false)
  const [liveTheme, setLiveTheme] = usePref('live.theme', 'night')
  const [shield, setShield] = usePref('privacy.shield', false)
  const [lockOn, setLockOn] = usePref('lock.enabled', false)
  const [lockAfter, setLockAfter] = usePref('lock.after', 1)
  const [root, setRoot] = useState('')
  const [autoFill, setAutoFill] = usePref('sites.autoFill', true)
  const [autoLogin, setAutoLogin] = usePref('sites.autoLogin', false)
  useEffect(() => { safu.app.info().then(setInfo); safu.widget.state().then(setWidget); safu.fs.root().then(setRoot) }, [])
  const setPin = async () => {
    const a = await promptDialog('Новый PIN-код', '', '4–8 цифр')
    if (!a || !/^\d{4,8}$/.test(a)) { if (a) toast('Нужно от 4 до 8 цифр', 'warn'); return }
    const b = await promptDialog('Повтори PIN-код', '', '')
    if (a !== b) { toast('Коды не совпали', 'warn'); return }
    kv.set('lock.pin', await hashPin(a)); setLockOn(true); toast('PIN-код установлен')
  }
  return (
    <>
      <PageHeader title="Приложение и Windows" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Работа в фоне</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow icon={<AppWindow size={16} />} color="#0ea5e9" title="Сворачивать в трей при закрытии" sub="Напоминания о парах, замены и почта работают дальше" on={tray} onChange={setTray} />
            {info && <ToggleRow icon={<Power size={16} />} color="#22c55e" title="Запускать вместе с Windows" sub="Тихо, сразу в трей" on={info.autostart} onChange={async v => { await safu.app.autostart(v); setInfo({ ...info, autostart: v }) }} />}
            <ToggleRow icon={<Monitor size={16} />} color="#8b5cf6" title="Мини-окно пары поверх окон" sub="Текущая пара с таймером — как Live Activity на iPhone" on={widget} onChange={async v => setWidget(await safu.widget.toggle(v))} />
            <Row title="Вид мини-окна" right={<Segmented value={liveTheme} onChange={v => { setLiveTheme(v); if (widget) { safu.widget.toggle(false).then(() => safu.widget.toggle(true)) } }} options={[{ value: 'night', label: 'Ночь' }, { value: 'light', label: 'День' }, { value: 'brand', label: 'Цвет темы' }]} />} />
          </Card>
          <div className="h-sec">Защита</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow icon={<Lock size={16} />} color="#ef4444" title="Вход по PIN-коду" sub="При запуске и после блокировки компьютера" on={lockOn} onChange={v => v ? setPin() : setLockOn(false)} />
            {lockOn && <Row title="Блокировать, если окно скрыто дольше" right={<Segmented value={lockAfter} onChange={setLockAfter} options={[1, 5, 15, 60].map(v => ({ value: v, label: `${v} мин` }))} />} />}
            {lockOn && <Row title="Сменить PIN-код" onClick={setPin} />}
            <ToggleRow icon={<Shield size={16} />} color="#64748b" title="Шторка, когда окно не в фокусе" sub="Оценки и пароли не видно, когда переключаешься на другое окно" on={shield} onChange={setShield} />
          </Card>
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>Файлы</div>
          <Card className="list" style={{ padding: 0 }}>
            <Row icon={<FolderOpen size={16} />} color="#f59e0b" title="Папка файлов" sub={root} right={<button className="btn sm" onClick={async () => { const r = await safu.fs.chooseRoot(); if (r) { setRoot(r); toast('Папка изменена') } }}>Сменить</button>} />
            <Row title="Открыть в Проводнике" onClick={() => safu.fs.openRoot('')} />
          </Card>
          <div className="h-sec">Сайты</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Подставлять сохранённый пароль" on={autoFill} onChange={setAutoFill} />
            <ToggleRow title="И сразу входить" sub="Нажимать «Войти» за тебя" on={autoLogin} onChange={setAutoLogin} />
            <Row title="Выйти со всех сайтов" sub="Удалить cookie и данные сайтов" danger onClick={async () => { if (await confirmDialog('Выйти со всех сайтов?', 'Сохранённые пароли останутся.', 'Выйти', true)) { await safu.sites.clear(); toast('Готово') } }} />
          </Card>
          <div className="h-sec">Горячие клавиши</div>
          <Card className="col gap6 small">
            {[['Ctrl+K', 'Поиск по всему'], ['Ctrl+N', 'Записать ДЗ'], ['Ctrl+1…8', 'Разделы'], ['Ctrl+,', 'Оформление'], ['Esc', 'Свернуть сайт или закрыть окно'], ['Ctrl+W', 'Закрыть вкладку сайта'], ['Ctrl+Alt+S', 'Показать САФУ из любого окна']].map(([k, t]) => <div key={k} className="row"><span className="kbd" style={{ minWidth: 90, textAlign: 'center' }}>{k}</span><span>{t}</span></div>)}
          </Card>
          {info && <div className="tiny faint mt12">САФУ {info.version} · Electron {info.electron} · шифрование паролей: {info.encryption ? 'Windows DPAPI' : 'недоступно'}</div>}
        </div>
      </div>
    </>
  )
}

// ---------- пароли и сайты ----------

export function Passwords() {
  const list = useCreds(s => s.list)
  const sites = resourcesStore.use()
  const [show, setShow] = useState<string | null>(null)
  const [edit, setEdit] = useState<Resource | null>(null)
  useEffect(() => { creds.load() }, [])
  return (
    <>
      <PageHeader title="Пароли и сайты" subtitle="Пароли хранятся зашифрованными средствами Windows только на этом компьютере" right={<button className="btn primary" onClick={async () => {
        const host = await promptDialog('Сайт', 'edu.narfu.ru', 'адрес сайта'); if (!host) return
        const user = await promptDialog('Логин', ''); if (user == null) return
        const pass = await promptDialog('Пароль', ''); if (!pass) return
        await creds.set({ host: host.replace(/^https?:\/\//, '').split('/')[0], user, pass }); toast('Сохранено')
      }}><Plus size={15} /> Пароль</button>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}><KeyRound size={13} /> Сохранённые входы</div>
          <Card className="list" style={{ padding: 0 }}>
            {!list.length && <Row title="Пока пусто" sub="Войди на сайт в приложении — оно предложит сохранить пароль" />}
            {list.map(c => (
              <Row key={c.host} icon={<Globe size={16} />} color={siteColor('https://' + c.host)} title={c.host} sub={<>{c.user || 'без логина'} · {show === c.host ? <span className="mono">{c.pass}</span> : '••••••••'}</>}
                right={<div className="row gap4">
                  <button className="btn icon sm ghost" onClick={() => setShow(show === c.host ? null : c.host)}>{show === c.host ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <button className="btn icon sm ghost" onClick={() => { safu.clipboard.write(c.pass); toast('Пароль скопирован'); setTimeout(() => safu.clipboard.write(''), 30_000) }}><KeyRound size={15} /></button>
                  <button className="btn icon sm ghost danger" onClick={async () => { if (await confirmDialog(`Удалить пароль ${c.host}?`, undefined, 'Удалить', true)) creds.remove(c.host) }}><Trash2 size={15} /></button>
                </div>} />
            ))}
          </Card>
          {list.length > 0 && <button className="btn danger ghost mt8" onClick={async () => { if (await confirmDialog('Удалить все пароли?', undefined, 'Удалить', true)) creds.removeAll() }}>Удалить все</button>}
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}><Globe size={13} /> Сайты</div>
          <Card className="list" style={{ padding: 0 }}>
            {sites.map(r => (
              <Row key={r.id} icon={<SiteGlyph icon={r.icon} size={16} />} color={siteColor(r.url, r.title)} title={r.title} sub={`${r.category} · ${r.url.replace(/^https?:\/\//, '')}`} onClick={() => setEdit(r)}
                right={<button className="btn icon sm ghost" onClick={e => { e.stopPropagation(); openSite(r) }}><ExternalLink size={15} /></button>} />
            ))}
          </Card>
          <div className="row mt8">
            <button className="btn" onClick={() => setEdit(resources.make('', '', 'https://', 'link', 'Мои ссылки'))}><Plus size={15} /> Ссылка</button>
            <button className="btn ghost" onClick={async () => { if (await confirmDialog('Сбросить список сайтов?', undefined, 'Сбросить', true)) resources.reset() }}>Сбросить</button>
          </div>
        </div>
      </div>
      <SiteEditor r={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function SiteEditor({ r, onClose }: { r: Resource | null; onClose: () => void }) {
  const [v, setV] = useState<Resource | null>(null)
  const list = resourcesStore.use()
  useEffect(() => setV(r), [r])
  if (!v) return <Sheet open={false} onClose={onClose} />
  const exists = list.some(x => x.id === v.id)
  return (
    <Sheet open={!!r} onClose={onClose} title={exists ? 'Сайт' : 'Новая ссылка'} footer={<>
      {exists && <button className="btn danger" onClick={() => { resources.remove(v.id); onClose() }}><Trash2 size={15} /> Удалить</button>}
      <span className="spacer" />
      <button className="btn primary" disabled={!resources.isValid(v)} onClick={() => { resources.upsert(v); onClose() }}>Сохранить</button>
    </>}>
      <Field label="Название"><input className="input" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} autoFocus /></Field>
      <Field label="Подпись"><input className="input" value={v.subtitle} onChange={e => setV({ ...v, subtitle: e.target.value })} /></Field>
      <Field label="Адрес"><input className="input" value={v.url} onChange={e => setV({ ...v, url: e.target.value })} /></Field>
      <Field label="Раздел"><input className="input" list="cats" value={v.category} onChange={e => setV({ ...v, category: e.target.value })} /><datalist id="cats">{resources.categories(list).map(c => <option key={c} value={c} />)}</datalist></Field>
      <Field label="Значок"><div className="row wrap-row gap6">{SITE_ICON_CHOICES.map(ic => <button key={ic} className={`chip ${v.icon === ic ? 'on' : ''}`} onClick={() => setV({ ...v, icon: ic })}><SiteGlyph icon={ic} size={15} /></button>)}</div></Field>
    </Sheet>
  )
}

// ---------- почта ----------

export function MailNotify() {
  const [on, setOn] = usePref('mail.notify', false)
  const [badge, setBadge] = usePref('mail.badge', true)
  const [transport, setTransport] = usePref('mail.transport', 'auto')
  const [server, setServer] = usePref('mail.server', '')
  const [port, setPort] = usePref('mail.port', 993)
  const [lastCheck] = usePref<number | null>('mail.lastCheck', null)
  const [lastSuccess] = usePref<number | null>('mail.lastSuccess', null)
  const [lastError] = usePref<string | null>('mail.lastError', null)
  const [unseen] = usePref('mail.unseen', 0)
  const [recent] = usePref<any[]>('mail.recent', [])
  const [checking, setChecking] = useState(false)
  useCreds(s => s.list)
  const acc = creds.mailAccount()
  return (
    <>
      <PageHeader title="Уведомления о почте" subtitle="Приложение само заходит в ящик САФУ и смотрит только отправителя и тему новых писем" right={<div className="row"><b>Включить</b><Toggle on={on} onChange={setOn} /></div>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="col gap14">
          <Card>
            <div className="row"><div className="icon-tile" style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}><Mail size={22} /></div>
              <div className="grow"><div className="h-card">{acc ? acc.user : 'Пароль не сохранён'}</div><div className="tiny muted">{acc ? `Вход берётся из ${acc.source}` : 'Открой почту в приложении и войди — пароль сохранится'}</div></div>
              <div className="tc"><div className="heavy" style={{ fontSize: '1.8rem' }}>{unseen}</div><div className="tiny muted">непрочит.</div></div></div>
            <div className="row mt12">
              <button className="btn primary" disabled={checking} onClick={async () => { setChecking(true); const r = await mailWatch.check(false); setChecking(false); r.ok ? toast(`Почта на месте: ${r.unseen ?? 0} непрочитанных`) : alertDialog('Не получилось', r.error) }}><RefreshCw size={15} className={checking ? 'spin' : ''} /> Проверить сейчас</button>
              <button className="btn" onClick={() => { mailWatch.sendTest(); toast('Через 5 секунд придёт пробное уведомление', 'info') }}><Bell size={15} /> Пробное уведомление</button>
              <button className="btn" onClick={() => openSite({ title: 'Почта', url: 'https://edu.narfu.ru', icon: 'envelope.fill' })}><ExternalLink size={15} /> Открыть почту</button>
            </div>
            <div className="tiny faint mt12">Последняя проверка: {lastCheck ? relativeAgo(lastCheck) : 'не было'} · удачная: {lastSuccess ? relativeAgo(lastSuccess) : 'не было'}</div>
            {lastError && <div className="small mt8" style={{ color: '#f59e0b' }}>{lastError}</div>}
          </Card>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title="Число писем на значке в панели задач" on={badge} onChange={setBadge} />
            <Row title="Способ" right={<Segmented value={transport} onChange={setTransport} options={[{ value: 'auto', label: 'Авто' }, { value: 'ximss', label: 'Как сайт' }, { value: 'imap', label: 'IMAP' }]} />} />
            <Row title="Сервер" right={<input className="input" style={{ width: 200 }} placeholder="edu.narfu.ru" value={server} onChange={e => setServer(e.target.value)} />} />
            <Row title="Порт IMAP" right={<input className="input" type="number" style={{ width: 100 }} value={port} onChange={e => setPort(+e.target.value)} />} />
          </Card>
        </div>
        <Card>
          <div className="h-card mb12">Последние письма</div>
          {!recent.length && <div className="sub">Появятся после первой проверки</div>}
          <div className="col gap6">{recent.map(m => <div key={m.uid} className="row top" style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--fill)' }}>{!m.seen && <span className="dot" style={{ marginTop: 6 }} />}<div className="grow"><div className="bold small ellipsis">{m.from}</div><div className="tiny muted ellipsis">{m.subject}</div></div></div>)}</div>
          <div className="tiny faint mt12">Письма не скачиваются и не помечаются прочитанными. Пока приложение открыто или в трее, почта проверяется каждую минуту.</div>
        </Card>
      </div>
    </>
  )
}

// ---------- резервная копия ----------

export function Backup() {
  const [last] = usePref<number | null>('backup.last', null)
  const [withPass, setWithPass] = useState(false)
  return (
    <>
      <PageHeader title="Резервная копия" subtitle="Расписание, ДЗ, задачи, заметки, оценки, посещаемость и настройки — одним файлом" />
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#10b981,#059669)' }}><ArchiveRestore size={24} /></div>
          <div className="h-card">Сохранить копию</div>
          <div className="sub mt4 mb12">Файл .safu можно положить на флешку или в облако. {last ? `Последняя — ${relativeAgo(last)}.` : ''}</div>
          <div className="row mb12"><span className="small grow">Вместе с паролями</span><Toggle on={withPass} onChange={setWithPass} /></div>
          <button className="btn primary block" onClick={() => makeBackup(withPass)}>Сохранить</button>
        </Card>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}><RefreshCw size={24} /></div>
          <div className="h-card">Восстановить</div>
          <div className="sub mt4 mb12">Из копии .safu (Windows) или .safubackup (iPhone). Текущие данные заменятся.</div>
          <button className="btn block" onClick={() => restoreBackupInteractive()}>Выбрать файл…</button>
        </Card>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#111827,#4b5563)' }}><Send size={24} /></div>
          <div className="h-card">Перенести с iPhone</div>
          <div className="sub mt4 mb12">На iPhone: Профиль → Резервная копия → отправь файл на компьютер (Telegram, почта, кабель). Здесь — «Восстановить» и выбери его. Файлы предметов лягут в «Документы\САФУ».</div>
        </Card>
      </div>
      <div className="tiny faint mt16">Файлы предметов лежат обычными файлами в папке «Документы\САФУ» — их можно копировать как угодно.</div>
    </>
  )
}

// ---------- автор ----------

const CHANGELOG: { version: string; items: string[] }[] = [
  { version: '17.0 для Windows', items: [
    'САФУ теперь на компьютере: всё, что есть на iPhone — пары, ДЗ, файлы, БРС, сессия, лекции, сайты вуза, почта',
    'Неделя колонками на большом экране, палитра команд Ctrl+K и горячие клавиши',
    'Мини-окно текущей пары поверх всех окон — как Live Activity',
    'Трей у часов: напоминания о парах, замены, почта и подъём работают, даже когда окно закрыто',
    'Сайты — карточками как мини-приложения Telegram: сворачиваются в плашку и стопку, пароли шифруются Windows',
    'Файлы предметов — обычные папки в «Документах»: перетаскивай из Проводника и обратно, миниатюры Windows',
    'Лекции: запись с микрофона, расшифровка прямо на компьютере и конспект через Claude',
    'Перенос данных с iPhone из резервной копии'
  ] },
  { version: '17.0', items: ['Файлы открываются карточкой со сворачиванием и стопкой отовсюду', 'Фото к ДЗ тоже открываются карточкой', 'Сайты и файлы живут в отдельном слое над всем приложением'] },
  { version: '16.9', items: ['Карточки в стопке больше не размыты', 'Стопка встаёт в плашку без наложения'] },
  { version: '16.8', items: ['Вернулась стопка окон как в Telegram', 'Почта — строгий тёмно-синий значок'] },
  { version: '16.5', items: ['Сайт сворачивается за пальцем, как в Telegram', 'Обратно тоже за пальцем'] },
  { version: '16.2', items: ['Плашка свёрнутых стала объёмной', 'Адрес корпуса открывается в Яндекс Картах сразу'] }
]

export function Developer() {
  return (
    <>
      <PageHeader title="Автор" />
      <div className="grid" style={{ gridTemplateColumns: '360px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, padding: 28 }}>
          <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 4, repeat: Infinity }} className="icon-tile" style={{ width: 90, height: 90, borderRadius: 28, background: 'var(--grad)' }}><Code2 size={44} /></motion.div>
          <div className="h-card" style={{ fontSize: '1.4rem' }}>@skf29</div>
          <div className="sub">Студент САФУ, группа 151621 (ВШИТАС). Сделал приложение, которым сам хотел бы пользоваться.</div>
          <button className="btn primary block" onClick={() => safu.shell.open('https://t.me/skf29')}><Send size={15} /> Написать в Telegram</button>
          <button className="btn block" onClick={() => safu.shell.open('https://github.com/skyface29/SAFU')}><Code2 size={15} /> Исходники на GitHub</button>
          <button className="btn ghost block" onClick={() => go('legal')}>Конфиденциальность и условия</button>
          <div className="tiny faint row gap4">Сделано с <Heart size={11} color="#ef4444" fill="#ef4444" /> в Архангельске</div>
        </Card>
        <div className="col gap14">
          {CHANGELOG.map((c, i) => (
            <Card key={c.version} delay={i * 0.04}>
              <div className="row mb8"><span className="badge" style={{ background: i === 0 ? 'var(--grad)' : 'var(--fill2)', color: i === 0 ? '#fff' : 'var(--text2)', fontSize: '.8rem' }}>{c.version}</span>{i === 0 && <span className="pill">новое</span>}</div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{c.items.map((x, j) => <li key={j} className="small">{x}</li>)}</ul>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}

export function Legal() {
  return (
    <>
      <PageHeader title="Конфиденциальность" />
      <Card className="col gap12" style={{ lineHeight: 1.6, maxWidth: 820 }}>
        <p style={{ margin: 0 }}>САФУ — неофициальное студенческое приложение. Оно не связано с администрацией университета.</p>
        <p style={{ margin: 0 }}><b>Где хранятся данные.</b> Всё — расписание, ДЗ, файлы, оценки, пароли — хранится только на твоём компьютере. У приложения нет своего сервера. Пароли сайтов шифруются средствами Windows (DPAPI) и привязаны к твоей учётной записи Windows.</p>
        <p style={{ margin: 0 }}><b>Куда приложение обращается.</b> К открытым сайтам университета (РУЗ и сайты, которые ты открываешь сам), к сервису погоды Open-Meteo. Если включены уведомления о почте — к серверу почты САФУ, только чтобы узнать отправителя и тему новых писем; письма не скачиваются и не помечаются прочитанными. Если ты добавил ключ Claude API — расшифровка лекции отправляется в Anthropic для конспекта. Модель распознавания речи скачивается один раз с Hugging Face, а сама запись лекции никуда не отправляется.</p>
        <p style={{ margin: 0 }}><b>Удаление.</b> Удали приложение и папку «Документы\САФУ» — и данных не останется. Резервную копию можно сделать вручную: Профиль → Резервная копия.</p>
        <p style={{ margin: 0 }} className="faint small">Расписание из РУЗ показывается как есть; сверяйся с официальным расписанием перед экзаменами.</p>
      </Card>
    </>
  )
}
void LogOut; void Info; void Keyboard; void X; void Chips; void openMenu; void scheduleStore
