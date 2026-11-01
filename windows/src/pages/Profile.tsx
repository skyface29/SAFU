// Профиль и настройки: оформление, главная и меню, сайты, пароли, почта, копия, защита, автор
import React, { useEffect, useState } from 'react'
import { motion, Reorder } from 'framer-motion'
import {
  Palette, LayoutDashboard, Globe, KeyRound, Mail, ArchiveRestore, Lock, Info, Bell, Monitor, Camera, Pencil, RefreshCw, LogOut,
  Trash2, Plus, Eye, EyeOff, GripVertical, ExternalLink, Send, Sparkles, Shield, FolderOpen, Power, AppWindow, Keyboard, Heart, Code2, Check, X, QrCode
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
import { useFx, type FxChoice, type FxTier } from '../fx/perf'
import { relativeAgo } from '../lib/date'
import { hw, homeworkStore } from '../lib/homework'
import { tasksStore, notesStore } from '../lib/study'
import { gradesStore } from '../lib/grades'
import { openSite } from '../sites/sites'
import { celebrations } from '../fx/Celebrations'

import { L } from '../lib/i18n'
import { LanguageRow, LanguageNote } from '../ui/LanguagePicker'
export default function Profile() {
  const p = useProfile()
  const data = useSchedule(s => s.data)
  homeworkStore.use(); tasksStore.use(); notesStore.use(); gradesStore.use()
  const [editName, setEditName] = useState(false)
  const pickAvatar = async () => {
    const f = await safu.dialog.open({ filters: [{ name: L('Фото'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }], base64: true })
    if (!f) return
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d')!; const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); kv.set('user.avatar', c.toDataURL('image/jpeg', 0.85)) }
    img.src = `data:image/${f.name.split('.').pop()};base64,${f.data}`
  }
  const sections: { id: any; title: string; sub: string; Icon: any; color: string }[] = [
    { id: 'appearance', title: L('Оформление'), sub: L('Темы, живые фоны, карточки, шрифты'), Icon: Palette, color: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
    { id: 'customize', title: L('Главная и меню'), sub: L('Блоки главной, разделы, быстрые кнопки'), Icon: LayoutDashboard, color: 'linear-gradient(135deg,#3b82f6,#06b6d4)' },
    { id: 'settings', title: L('Приложение и Windows'), sub: L('Трей, автозапуск, мини-окно, уведомления'), Icon: Monitor, color: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
    { id: 'passwords', title: L('Пароли и сайты'), sub: L('Вход на сайты вуза, список сайтов'), Icon: KeyRound, color: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
    { id: 'mailnotify', title: L('Уведомления о почте'), sub: L('Новые письма в почте САФУ'), Icon: Mail, color: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
    { id: 'sync', title: L('Синхронизация с iPhone'), sub: L('ДЗ, задачи и заметки — одинаковые на телефоне и тут'), Icon: RefreshCw, color: 'linear-gradient(135deg,#22c55e,#0ea5e9)' },
    { id: 'transfer', title: L('Перенос с iPhone'), sub: L('Наведи телефон на QR-код — файлы перелетят сами'), Icon: QrCode, color: 'linear-gradient(135deg,#a855f7,#2563eb)' },
    { id: 'backup', title: L('Резервная копия'), sub: L('Сохранить, восстановить, перенести с iPhone'), Icon: ArchiveRestore, color: 'linear-gradient(135deg,#10b981,#059669)' },
    { id: 'developer', title: L('Автор и новости'), sub: L('Связаться, что нового'), Icon: Code2, color: 'linear-gradient(135deg,#64748b,#334155)' }
  ]
  return (
    <>
      <Card tilt className="row" style={{ gap: 22, padding: 24, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 240px at 0% 0%, rgba(var(--brand-rgb), .25), transparent)' }} />
        <div className="clickable hov-grow" onClick={pickAvatar} style={{ position: 'relative' }} title={L("Сменить фото")}>
          <Avatar size={96} />
          <div className="icon-tile" style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--line2)' }}><Camera size={14} /></div>
        </div>
        <div className="grow" style={{ position: 'relative' }}>
          <div className="row"><div style={{ fontSize: '2rem', fontWeight: 900 }}>{p.first || L('Студент')} {p.last}</div><button className="btn icon sm ghost" onClick={() => setEditName(true)}><Pencil size={15} /></button></div>
          <div className="muted">{p.teacher ? L`Преподаватель · ${kv.get('teacher.query', '')}` : `${p.group ? L`Группа ${p.group}` : L('Группа не указана')} · ${ROLE_TITLES[p.role]}`}</div>
          <div className="row gap8 mt12">
            <button className="btn sm" onClick={() => kv.set('onboarding.again', true)}><RefreshCw size={14} /> {L("Пройти регистрацию заново")}</button>
            {p.avatar && <button className="btn sm ghost" onClick={() => kv.set('user.avatar', '')}>{L("Убрать фото")}</button>}
          </div>
        </div>
        <div className="grid g2" style={{ gap: 10, position: 'relative' }}>
          {[[data.ruzEvents.length, L('пар в памяти')], [hw.active().length, L('ДЗ в работе')], [notesStore.get().length, L('заметок')], [gradesStore.get().length, L('предметов в БРС')]].map(([v, t]) => (
            <div key={t as string} className="tc" style={{ padding: '10px 16px', borderRadius: 14, background: 'var(--fill)' }}><div className="heavy" style={{ fontSize: '1.4rem' }}><AnimatedNumber value={v as number} /></div><div className="tiny muted">{t}</div></div>
          ))}
        </div>
      </Card>
      <div className="grid mt16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {sections.map((s, i) => (
          <Card key={s.id} press delay={0.05 + i * 0.03} onClick={() => go(s.id)} className="row">
            <div className="icon-tile hov-turn back" style={{ width: 46, height: 46, borderRadius: 14, background: s.color }}><s.Icon size={21} /></div>
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
      <div className="grow"><div className="bold">{L("Роль в группе")}</div><div className="tiny muted">{L("Старосте и заму открываются посещаемость, рассылка и опросы")}</div></div>
      <Segmented value={role} onChange={setRole} options={[{ value: 0, label: L('Студент') }, { value: 1, label: L('Староста') }, { value: 2, label: L('Зам') }]} />
    </Card>
  )
}

function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState(''); const [l, setL] = useState(''); const [m, setM] = useState('')
  useEffect(() => { if (open) { setF(kv.get('user.first', '')); setL(kv.get('user.last', '')); setM(kv.get('user.middle', '')) } }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={L("Имя")} footer={<button className="btn primary" onClick={() => { kv.set('user.first', f.trim()); kv.set('user.last', l.trim()); kv.set('user.middle', m.trim()); kv.set('user.name', [f, l].filter(Boolean).join(' ')); kv.set('report.student', [l, f, m].filter(Boolean).join(' ')); onClose() }}>{L("Сохранить")}</button>}>
      <Field label={L("Имя")}><input className="input" value={f} onChange={e => setF(e.target.value)} autoFocus /></Field>
      <Field label={L("Фамилия")}><input className="input" value={l} onChange={e => setL(e.target.value)} /></Field>
      <Field label={L("Отчество")}><input className="input" value={m} onChange={e => setM(e.target.value)} /></Field>
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
  const [backdropAnim, setBackdropAnim] = usePref('ui.siteBackdrop', false)
  const [blur, setBlur] = usePref('ui.blur', false)
  const Swatch = ({ a }: { a: typeof ACCENTS[0] }) => (
    <motion.button whileHover={{ scale: 1.12, y: -2 }} whileTap={{ scale: 0.9 }} title={a.title} onClick={() => { setTheme(a.id); setSeasonal(false); kv.set('look.pack', '') }}
      style={{ width: 46, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`, boxShadow: theme === a.id && !seasonal ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.c1}` : 'none', display: 'grid', placeItems: 'center' }}>
      {theme === a.id && !seasonal && <Check size={20} color="#fff" strokeWidth={3} />}
    </motion.button>
  )
  return (
    <>
      <PageHeader title={L("Оформление")} subtitle={L("Сделай Арктику своей")} right={<span className="kbd">Ctrl ,</span>} />
      <div className="h-sec" style={{ marginTop: 0 }}><Sparkles size={13} /> {L("Готовые наборы")}</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {PRESETS.map((pr, i) => {
          const a = ACCENTS.find(x => x.id === pr.theme)!
          return (
            <motion.div key={pr.id} className="card hover press tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => { applyPreset(pr); toast(L`Набор «${pr.title}»`) }}>
              <div style={{ height: 54, borderRadius: 12, background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`, display: 'grid', placeItems: 'center', fontSize: '1.6rem' }}>{pr.emoji}</div>
              <div className="bold small mt8 tc">{pr.title}</div>
            </motion.div>
          )
        })}
      </div>
      <div className="h-sec">{L("Тема")}</div>
      <Card>
        <div className="row mb12"><Segmented value={scheme} onChange={setScheme} options={[{ value: 'system', label: L('Как в Windows') }, { value: 'light', label: L('Светлая') }, { value: 'dark', label: L('Тёмная') }]} /></div>
        <div className="tiny faint mb8">{L("ЯРКИЕ")}</div>
        <div className="row wrap-row gap8 mb12">{ACCENTS.filter(a => !a.strict).map(a => <Swatch key={a.id} a={a} />)}</div>
        <div className="tiny faint mb8">{L("СТРОГИЕ")}</div>
        <div className="row wrap-row gap8 mb12">{ACCENTS.filter(a => a.strict).map(a => <Swatch key={a.id} a={a} />)}</div>
        <div className="row"><div className="grow"><b>{L("Цвет по сезону")}</b><div className="tiny muted">{L("Сейчас:")} {SEASON_TITLE[season()]}</div></div><Toggle on={seasonal} onChange={setSeasonal} /></div>
      </Card>
      <div className="h-sec">{L("Живой фон")}</div>
      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {BACKDROPS.map(b => (
            <motion.button key={b.id} whileTap={{ scale: 0.94 }} onClick={() => setBg(b.id)} className="col" style={{ alignItems: 'center', gap: 4, padding: '12px 6px', borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${bg === b.id ? 'var(--brand)' : 'var(--line)'}`, background: bg === b.id ? 'rgba(var(--brand-rgb), .14)' : 'var(--fill)' }}>
              <span style={{ fontSize: '1.4rem' }}>{b.emoji}</span><span className="tiny bold">{b.title}</span>
            </motion.button>
          ))}
        </div>
        <div className="row mt12"><span className="small grow">{L("Насыщенность")}</span><input type="range" min={0.3} max={1.8} step={0.1} value={intensity} onChange={e => setIntensity(+e.target.value)} style={{ width: 240, accentColor: 'var(--brand)' }} /></div>
        {isDesktop && <div className="row mt12"><div className="grow"><b>{L("Материал Mica (Windows 11)")}</b><div className="tiny muted">{L("Окно просвечивает обоями рабочего стола вместо живого фона")}</div></div><Toggle on={mica} onChange={v => { setMica(v); safu.app.mica(v) }} /></div>}
      </Card>
      <div className="h-sec">{L("Карточки")}</div>
      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {CARD_STYLES.map(c => <button key={c.id} className={`chip ${card === c.id ? 'on' : ''}`} style={{ height: 40, justifyContent: 'center' }} onClick={() => setCard(c.id)}>{c.title}</button>)}
        </div>
        <div className="row mt12"><div className="grow"><b className="small">{L("Настоящее стекло")}</b><div className="tiny muted">{L("Размытие фона под карточками. Красиво, но нагружает видеокарту — включай на мощном компьютере")}</div></div><Toggle on={blur} onChange={setBlur} /></div>
        <div className="row mt12"><span className="small grow">{L("Скругление углов")}</span><input type="range" min={0.3} max={1.4} step={0.05} value={radius} onChange={e => setRadius(+e.target.value)} style={{ width: 240, accentColor: 'var(--brand)' }} /></div>
      </Card>
      <div className="h-sec">{L("Текст")}</div>
      <Card className="col gap14">
        <div className="row"><span className="small grow">{L("Шрифт")}</span><Segmented value={font} onChange={setFont} options={FONTS.map(f => ({ value: f.id, label: <span style={{ fontFamily: f.css }}>{f.title}</span> }))} /></div>
        <div className="row"><span className="small grow">{L("Размер")}</span><Segmented value={size} onChange={setSize} options={[{ value: 1, label: L('Меньше') }, { value: 0, label: L('Обычный') }, { value: 2, label: L('Крупнее') }, { value: 3, label: L('Крупный') }]} /></div>
        <div className="row"><span className="small grow">{L("Заголовки градиентом")}</span><Toggle on={grad} onChange={setGrad} /></div>
      </Card>
      <div className="h-sec">{L("Тематические оформления")}</div>
      <div className="grid g4">{PACKS.map(pk => <Card key={pk.id} press onClick={() => applyPack(pk.id)} style={{ borderColor: pack === pk.id ? 'var(--brand)' : undefined }}><div className="bold">{pk.title}</div><div className="tiny muted mt4">{pk.subtitle}</div></Card>)}</div>
      <div className="h-sec">{L("Движение")}</div>
      <Card className="list" style={{ padding: 0 }}>
        <FxQualityRow />
        <ToggleRow title={L("Уменьшить анимации")} sub={L("Для слабых компьютеров и если укачивает")} on={motionOff} onChange={setMotionOff} />
        <GpuRow />
        <ToggleRow title={L("Приложение отъезжает под сайтом")} sub={L("Как в Telegram. На слабых компьютерах лучше выключить")} on={backdropAnim} onChange={setBackdropAnim} />
        <Row title={L("Показать салют")} sub={L("Проверить, как выглядят праздники")} onClick={() => celebrations.test()} />
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
      <PageHeader title={L("Главная и меню")} subtitle={L("Перетаскивай блоки мышью, чтобы поменять порядок")} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>{L("Блоки главной")}</div>
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
          <button className="btn ghost mt8" onClick={() => setOrder(DEFAULT_HOME)}>{L("Вернуть как было")}</button>
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>{L("Разделы в боковой панели")}</div>
          <Card className="list" style={{ padding: 0 }}>
            {ALL_TABS.map(t => (
              <Row key={t} title={TAB_META[t].title} sub={t === 'profile' ? L('Всегда на месте') : undefined} right={<Toggle on={tabs.includes(t)} disabled={t === 'profile'} onChange={v => setTabs((v ? [...tabs, t] : tabs.filter(x => x !== t)).sort((a, b) => ALL_TABS.indexOf(a) - ALL_TABS.indexOf(b)).join(','))} />} />
            ))}
          </Card>
          <div className="h-sec">{L("Быстрые кнопки сайтов")}</div>
          <Card className="list" style={{ padding: 0 }}>
            {list.map(r => (
              <Row key={r.id} icon={<SiteGlyph icon={r.icon} size={16} />} color={siteColor(r.url, r.title)} title={L(r.title)} sub={L(r.subtitle)}
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
  const [autoLogin, setAutoLogin] = usePref('sites.autoLogin', true)
  const [savePass, setSavePass] = usePref('sites.savePasswords', true)
  useEffect(() => { safu.app.info().then(setInfo); safu.widget.state().then(setWidget); safu.fs.root().then(setRoot) }, [])
  const setPin = async () => {
    const a = await promptDialog(L('Новый PIN-код'), '', L('4–8 цифр'))
    if (!a || !/^\d{4,8}$/.test(a)) { if (a) toast(L('Нужно от 4 до 8 цифр'), 'warn'); return }
    const b = await promptDialog(L('Повтори PIN-код'), '', '')
    if (a !== b) { toast(L('Коды не совпали'), 'warn'); return }
    kv.set('lock.pin', await hashPin(a)); setLockOn(true); toast(L('PIN-код установлен'))
  }
  return (
    <>
      <PageHeader title={L("Приложение и Windows")} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>{L("Язык")}</div>
          <Card className="list" style={{ padding: 0 }}><LanguageRow /></Card>
          <LanguageNote />
          <div className="h-sec">{L("Работа в фоне")}</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow icon={<AppWindow size={16} />} color="#0ea5e9" title={L("Сворачивать в трей при закрытии")} sub={L("Напоминания о парах, замены и почта работают дальше")} on={tray} onChange={setTray} />
            {info && <ToggleRow icon={<Power size={16} />} color="#22c55e" title={L("Запускать вместе с Windows")} sub={L("Тихо, сразу в трей")} on={info.autostart} onChange={async v => { await safu.app.autostart(v); setInfo({ ...info, autostart: v }) }} />}
            <ToggleRow icon={<Monitor size={16} />} color="#8b5cf6" title={L("Мини-окно пары поверх окон")} sub={L("Текущая пара с таймером — как Live Activity на iPhone")} on={widget} onChange={async v => setWidget(await safu.widget.toggle(v))} />
            <Row title={L("Вид мини-окна")} right={<Segmented value={liveTheme} onChange={v => { setLiveTheme(v); if (widget) { safu.widget.toggle(false).then(() => safu.widget.toggle(true)) } }} options={[{ value: 'night', label: L('Ночь') }, { value: 'light', label: L('День') }, { value: 'brand', label: L('Цвет темы') }]} />} />
          </Card>
          <div className="h-sec">{L("Защита")}</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow icon={<Lock size={16} />} color="#ef4444" title={L("Вход по PIN-коду")} sub={L("При запуске и после блокировки компьютера")} on={lockOn} onChange={v => v ? setPin() : setLockOn(false)} />
            {lockOn && <Row title={L("Блокировать, если окно скрыто дольше")} right={<Segmented value={lockAfter} onChange={setLockAfter} options={[1, 5, 15, 60].map(v => ({ value: v, label: L`${v} мин` }))} />} />}
            {lockOn && <Row title={L("Сменить PIN-код")} onClick={setPin} />}
            <ToggleRow icon={<Shield size={16} />} color="#64748b" title={L("Шторка, когда окно не в фокусе")} sub={L("Оценки и пароли не видно, когда переключаешься на другое окно")} on={shield} onChange={setShield} />
          </Card>
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}>{L("Файлы")}</div>
          <Card className="list" style={{ padding: 0 }}>
            <Row icon={<FolderOpen size={16} />} color="#f59e0b" title={L("Папка файлов")} sub={root} right={<button className="btn sm" onClick={async () => { const r = await safu.fs.chooseRoot(); if (r) { setRoot(r); toast(L('Папка изменена')) } }}>{L("Сменить")}</button>} />
            <Row title={L("Открыть в Проводнике")} onClick={() => safu.fs.openRoot('')} />
          </Card>
          <div className="h-sec">{L("Сайты")}</div>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title={L("Запоминать пароли")} sub={L("Вошёл один раз — пароль сохранится сам, зашифрованный Windows")} on={savePass} onChange={setSavePass} />
            <ToggleRow title={L("Подставлять сохранённый пароль")} on={autoFill} onChange={setAutoFill} />
            <ToggleRow title={L("И сразу входить")} sub={L("Нажимать «Войти» за тебя (если пароль не подошёл — не больше двух попыток)")} on={autoLogin} onChange={setAutoLogin} />
            <Row title={L("Выйти со всех сайтов")} sub={L("Удалить cookie и данные сайтов")} danger onClick={async () => { if (await confirmDialog(L('Выйти со всех сайтов?'), L('Сохранённые пароли останутся.'), L('Выйти'), true)) { await safu.sites.clear(); toast(L('Готово')) } }} />
          </Card>
          <div className="h-sec">{L("Горячие клавиши")}</div>
          <Card className="col gap6 small">
            {[['Ctrl+K', L('Поиск по всему')], ['Ctrl+N', L('Записать ДЗ')], ['Ctrl+1…8', L('Разделы')], ['Ctrl+,', L('Оформление')], ['Esc', L('Свернуть сайт или закрыть окно')], ['Ctrl+W', L('Закрыть вкладку сайта')], ['Ctrl+Alt+S', L('Показать Арктику из любого окна')]].map(([k, t]) => <div key={k} className="row"><span className="kbd" style={{ minWidth: 90, textAlign: 'center' }}>{k}</span><span>{t}</span></div>)}
          </Card>
          {info && <div className="tiny faint mt12">{L("Арктика")} {info.version} · Electron {info.electron} {L("· шифрование паролей:")} {info.encryption ? 'Windows DPAPI' : L('недоступно — пароли не сохраняются на диск')}</div>}
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
      <PageHeader title={L("Пароли и сайты")} subtitle={L("Пароли хранятся зашифрованными средствами Windows только на этом компьютере")} right={<button className="btn primary" onClick={async () => {
        const host = await promptDialog(L('Сайт'), 'edu.narfu.ru', L('адрес сайта')); if (!host) return
        const user = await promptDialog(L('Логин'), ''); if (user == null) return
        const pass = await promptDialog(L('Пароль'), ''); if (!pass) return
        await creds.set({ host: host.replace(/^https?:\/\//, '').split('/')[0], user, pass }); toast(L('Сохранено'))
      }}><Plus size={15} /> {L("Пароль")}</button>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}><KeyRound size={13} /> {L("Сохранённые входы")}</div>
          <Card className="list" style={{ padding: 0 }}>
            {!list.length && <Row title={L("Пока пусто")} sub={L("Войди на сайт в приложении — оно предложит сохранить пароль")} />}
            {list.map(c => (
              <Row key={c.host} icon={<Globe size={16} />} color={siteColor('https://' + c.host)} title={c.host} sub={<>{c.user || L('без логина')} · {show === c.host ? <span className="mono">{c.pass}</span> : '••••••••'}</>}
                right={<div className="row gap4">
                  <button className="btn icon sm ghost" onClick={() => setShow(show === c.host ? null : c.host)}>{show === c.host ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <button className="btn icon sm ghost" onClick={() => { safu.clipboard.write(c.pass); toast(L('Пароль скопирован')); setTimeout(() => safu.clipboard.write(''), 30_000) }}><KeyRound size={15} /></button>
                  <button className="btn icon sm ghost danger" onClick={async () => { if (await confirmDialog(L`Удалить пароль ${c.host}?`, undefined, L('Удалить'), true)) creds.remove(c.host) }}><Trash2 size={15} /></button>
                </div>} />
            ))}
          </Card>
          {list.length > 0 && <button className="btn danger ghost mt8" onClick={async () => { if (await confirmDialog(L('Удалить все пароли?'), undefined, L('Удалить'), true)) creds.removeAll() }}>{L("Удалить все")}</button>}
        </div>
        <div>
          <div className="h-sec" style={{ marginTop: 0 }}><Globe size={13} /> {L("Сайты")}</div>
          <Card className="list" style={{ padding: 0 }}>
            {sites.map(r => (
              <Row key={r.id} icon={<SiteGlyph icon={r.icon} size={16} />} color={siteColor(r.url, r.title)} title={L(r.title)} sub={`${L(r.category)} · ${r.url.replace(/^https?:\/\//, '')}`} onClick={() => setEdit(r)}
                right={<button className="btn icon sm ghost" onClick={e => { e.stopPropagation(); openSite(r) }}><ExternalLink size={15} /></button>} />
            ))}
          </Card>
          <div className="row mt8">
            <button className="btn" onClick={() => setEdit(resources.make('', '', 'https://', 'link', L('Мои ссылки')))}><Plus size={15} /> {L("Ссылка")}</button>
            <button className="btn ghost" onClick={async () => { if (await confirmDialog(L('Сбросить список сайтов?'), undefined, L('Сбросить'), true)) resources.reset() }}>{L("Сбросить")}</button>
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
    <Sheet open={!!r} onClose={onClose} title={exists ? L('Сайт') : L('Новая ссылка')} footer={<>
      {exists && <button className="btn danger" onClick={() => { resources.remove(v.id); onClose() }}><Trash2 size={15} /> {L("Удалить")}</button>}
      <span className="spacer" />
      <button className="btn primary" disabled={!resources.isValid(v)} onClick={() => { resources.upsert(v); onClose() }}>{L("Сохранить")}</button>
    </>}>
      <Field label={L("Название")}><input className="input" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} autoFocus /></Field>
      <Field label={L("Подпись")}><input className="input" value={v.subtitle} onChange={e => setV({ ...v, subtitle: e.target.value })} /></Field>
      <Field label={L("Адрес")}><input className="input" value={v.url} onChange={e => setV({ ...v, url: e.target.value })} /></Field>
      <Field label={L("Раздел")}><input className="input" list="cats" value={v.category} onChange={e => setV({ ...v, category: e.target.value })} /><datalist id="cats">{resources.categories(list).map(c => <option key={c} value={c} />)}</datalist></Field>
      <Field label={L("Значок")}><div className="row wrap-row gap6">{SITE_ICON_CHOICES.map(ic => <button key={ic} className={`chip ${v.icon === ic ? 'on' : ''}`} onClick={() => setV({ ...v, icon: ic })}><SiteGlyph icon={ic} size={15} /></button>)}</div></Field>
    </Sheet>
  )
}

/** Ускорение видеокартой: что сейчас и переключатель на случай чёрных сайтов (меняется после перезапуска) */
/** Качество анимаций: «Авто» — под железо; видно, что определилось */
function FxQualityRow() {
  const [choice, setChoice] = usePref<FxChoice>('fx.quality', 'auto')
  const fx = useFx()
  const name: Record<FxTier, string> = { high: L('максимум'), mid: L('баланс'), low: L('экономно') }
  const gpu = fx.gpu.replace(/^ANGLE \((.*)\)$/, '$1').replace(/,\s*(D3D|OpenGL|Direct3D).*$/i, '').replace(/\s*\(0x[0-9a-f]+\)/gi, '').slice(0, 70)
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="grow">
          <div className="bold">{L("Качество анимаций")}</div>
          <div className="tiny muted mt4">
            {L("Живой фон, переходы и наклон карточек — под твоё железо. Сейчас:")} <b>{name[fx.tier]}</b>
            {choice === 'auto' && gpu ? ` · ${gpu}` : ''}{!fx.accelerated ? L(' · без ускорения видеокартой') : ''}{L(". Если кадры не успевают, фон сам рисует проще")}
          </div>
        </div>
        <Segmented size="sm" value={choice} onChange={setChoice}
          options={[{ value: 'auto', label: L('Авто') }, { value: 'high', label: L('Максимум') }, { value: 'mid', label: L('Баланс') }, { value: 'low', label: L('Экономно') }]} />
      </div>
    </div>
  )
}

function GpuRow() {
  const [info, setInfo] = useState<{ safe: boolean; compositing: string } | null>(null)
  useEffect(() => { safu.app.info().then((i: any) => i?.gpu && setInfo(i.gpu)).catch(() => null) }, [])
  if (!info) return null
  const fast = info.compositing.startsWith('enabled')
  return (
    <ToggleRow title={L("Ускорение видеокартой")}
      sub={(fast ? L('Работает — анимации и прокрутка плавные') : L('Сейчас окно рисует процессор — может быть рывками')) + L('. Выключай, только если сайты чёрные или мерцают. Меняется после перезапуска')}
      on={!info.safe} onChange={async on => {
        await safu.app.gpuSafe(!on)
        setInfo({ ...info, safe: !on })
        if (await confirmDialog(L('Перезапустить Арктику?'), L('Настройка видеокарты применится после перезапуска.'), L('Перезапустить'))) safu.app.relaunch()
      }} />
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
      <PageHeader title={L("Уведомления о почте")} subtitle={L("Приложение само заходит в ящик САФУ и смотрит только отправителя и тему новых писем")} right={<div className="row"><b>{L("Включить")}</b><Toggle on={on} onChange={setOn} /></div>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="col gap14">
          <Card>
            <div className="row"><div className="icon-tile" style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}><Mail size={22} /></div>
              <div className="grow"><div className="h-card">{acc ? acc.user : L('Пароль не сохранён')}</div><div className="tiny muted">{acc ? L`Вход берётся из ${acc.source}` : L('Открой почту в приложении и войди — пароль сохранится')}</div></div>
              <div className="tc"><div className="heavy" style={{ fontSize: '1.8rem' }}>{unseen}</div><div className="tiny muted">{L("непрочит.")}</div></div></div>
            <div className="row mt12">
              <button className="btn primary" disabled={checking} onClick={async () => { setChecking(true); const r = await mailWatch.check(false); setChecking(false); r.ok ? toast(L`Почта на месте: ${r.unseen ?? 0} непрочитанных`) : alertDialog(L('Не получилось'), r.error) }}><RefreshCw size={15} className={checking ? 'spin' : ''} /> {L("Проверить сейчас")}</button>
              <button className="btn" onClick={() => { mailWatch.sendTest(); toast(L('Через 5 секунд придёт пробное уведомление'), 'info') }}><Bell size={15} /> {L("Пробное уведомление")}</button>
              <button className="btn" onClick={() => openSite({ title: L('Почта'), url: 'https://edu.narfu.ru', icon: 'envelope.fill' })}><ExternalLink size={15} /> {L("Открыть почту")}</button>
            </div>
            <div className="tiny faint mt12">{L("Последняя проверка:")} {lastCheck ? relativeAgo(lastCheck) : L('не было')} {L("· удачная:")} {lastSuccess ? relativeAgo(lastSuccess) : L('не было')}</div>
            {lastError && <div className="small mt8" style={{ color: '#f59e0b' }}>{lastError}</div>}
          </Card>
          <Card className="list" style={{ padding: 0 }}>
            <ToggleRow title={L("Число писем на значке в панели задач")} on={badge} onChange={setBadge} />
            <Row title={L("Способ")} right={<Segmented value={transport} onChange={setTransport} options={[{ value: 'auto', label: L('Авто') }, { value: 'ximss', label: L('Как сайт') }, { value: 'imap', label: 'IMAP' }]} />} />
            <Row title={L("Сервер")} right={<input className="input" style={{ width: 200 }} placeholder="edu.narfu.ru" value={server} onChange={e => setServer(e.target.value)} />} />
            <Row title={L("Порт IMAP")} right={<input className="input" type="number" style={{ width: 100 }} value={port} onChange={e => setPort(+e.target.value)} />} />
          </Card>
        </div>
        <Card>
          <div className="h-card mb12">{L("Последние письма")}</div>
          {!recent.length && <div className="sub">{L("Появятся после первой проверки")}</div>}
          <div className="col gap6">{recent.map(m => <div key={m.uid} className="row top" style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--fill)' }}>{!m.seen && <span className="dot" style={{ marginTop: 6 }} />}<div className="grow"><div className="bold small ellipsis">{m.from}</div><div className="tiny muted ellipsis">{m.subject}</div></div></div>)}</div>
          <div className="tiny faint mt12">{L("Письма не скачиваются и не помечаются прочитанными. Пока приложение открыто или в трее, почта проверяется каждую минуту. Когда компьютер спит или выключен — не проверяется; после пробуждения проверка продолжится сама.")}</div>
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
      <PageHeader title={L("Резервная копия")} subtitle={L("Расписание, ДЗ, задачи, заметки, оценки, посещаемость и настройки — одним файлом")} />
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#10b981,#059669)' }}><ArchiveRestore size={24} /></div>
          <div className="h-card">{L("Сохранить копию")}</div>
          <div className="sub mt4 mb12">{L("Файл .safu можно положить на флешку или в облако.")} {last ? L`Последняя — ${relativeAgo(last)}.` : ''}</div>
          <div className="row mb12"><div className="grow"><div className="small">{L("Вместе с паролями")}</div>{withPass && <div className="tiny faint">{L("Зашифруются паролем копии, который ты задашь")}</div>}</div><Toggle on={withPass} onChange={setWithPass} /></div>
          <button className="btn primary block" onClick={() => makeBackup(withPass)}>{L("Сохранить")}</button>
        </Card>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}><RefreshCw size={24} /></div>
          <div className="h-card">{L("Восстановить")}</div>
          <div className="sub mt4 mb12">{L("Из копии .safu (Windows) или .safubackup (iPhone). Текущие данные заменятся.")}</div>
          <button className="btn block" onClick={() => restoreBackupInteractive()}>{L("Выбрать файл…")}</button>
        </Card>
        <Card>
          <div className="icon-tile mb12" style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg,#a855f7,#2563eb)' }}><QrCode size={24} /></div>
          <div className="h-card">{L("Перенести с iPhone")}</div>
          <div className="sub mt4 mb12">{L("Покажем QR-код — наведи на него камеру iPhone, и файлы, фото доски, ДЗ и настройки перелетят по Wi‑Fi. Без кабеля и пересылки файлов.")}</div>
          <button className="btn primary block" onClick={() => go('transfer')}><QrCode size={16} /> {L("Показать QR-код")}</button>
        </Card>
      </div>
      <div className="tiny faint mt16">{L("Файлы предметов лежат обычными файлами в папке в «Документах» — их можно копировать как угодно.")}</div>
    </>
  )
}

// ---------- автор ----------

const CHANGELOG: { version: string; items: string[] }[] = [
  { version: '20.0 для Windows', items: [
    'Английский язык интерфейса: если Windows на английском, Арктика сразу откроется по-английски',
    'Язык меняется в Профиль → «Приложение и Windows» → «Язык» или кнопкой RU | EN на первом экране регистрации — окно сразу перезагружается на новом языке, меню трея тоже',
    'Переводится только интерфейс: предметы, ФИО преподавателей, аудитории, тексты ДЗ и письма остаются как в РУЗ и на сайтах университета'
  ] },
  { version: '19.8 для Windows', items: [
    'Приложение больше не вылетает и не перезапускается, когда открыто и свёрнуто много сайтов: снимок страницы для анимации теперь делает не окно, а фоновая часть приложения',
    'Живой фон больше не «в пикселях»: плавные переливы считаются как раньше, а на экран выводятся в полном разрешении — края сияния без лесенок, звёзды круглые и чёткие, зерно незаметное',
    'Если фону когда-то пришлось снизить качество (тяжёлая минута, много вкладок), он сам возвращает чёткость, как только нагрузка ушла; на мониторах 75 Гц фон больше не мутнеет без причины',
    'Работа с файлами больше не подвешивает приложение: открытие папок, поиск, добавление и перетаскивание файлов, восстановление копии идут в фоне — окно и сайты не замирают',
    'Папка с фотографиями открывается мгновенно: в плитках — миниатюры Windows, а не снимки целиком, памяти уходит в разы меньше; большие папки листаются плавно',
    'Запуск быстрее: окно отвечает сразу, без паузы на проверку видеокарты; разделы подгружаются по мере надобности (стартовая часть интерфейса вдвое меньше), а видеокарта больше не собирает шейдеры заново при каждом запуске',
    'Живой фон «Свет» и «Сияние» рисуется в своём потоке: переходы, прокрутка и анимации интерфейса не делят с ним время, а смена темы не пересобирает его заново',
    'Живой фон выглядит так же, но под открытым сайтом и в окне без фокуса не тратит видеокарту впустую; со стеклом на встроенной графике прокрутка стала плавной',
    'Свёрнутые сайты быстрее отпускают память (а когда Арктика в трее — через минуту), снимки закрытых сайтов больше не копятся; в стопке вкладок снимки чётче',
    'Меньше работы в трее: меню, мини-окно пары и статус iPhone обновляются, только когда что-то поменялось; салюты ждут, пока откроешь окно',
    'Синхронизация с iPhone больше не подтормаживает окно: телефон заходит раз в 10 секунд, и если ни там, ни здесь ничего не меняли, компьютер отвечает сразу, без пересчёта всех ДЗ, задач и заметок и без перезаписи файла данных; когда изменения есть, они сводятся вдвое быстрее',
    'Весь интерфейс двигается так же плавно, как окна: переход между разделами, появление карточек, подсветка в боковой панели и переключателях, наклон, наведение и нажатия теперь ведёт видеокарта, а не кадры в JavaScript. Анимации те же, с теми же пружинами, но больше не дёргаются, пока приложение собирает новый раздел',
    'Боковая панель отвечает на клик в тот же миг: подсветка уезжает к пункту сразу, а раздел появляется следующим кадром и въезжает целиком',
    'На слабых ноутбуках разделы открываются заметно быстрее: в длинных списках ДЗ и задач сначала рисуется то, что помещается в окно, остальное дорисовывается следом, а карточки ниже края окна раскладываются, только когда до них долистали. С сотнями ДЗ раздел больше не замирает на секунды',
    'Прокрутка легче: карточки под неподвижным курсором не подсвечиваются и не приподнимаются одна за другой, пока крутишь колесо',
    'Если видеокарта когда-то упала и приложение перешло в безопасный режим, новая версия снова пробует полное ускорение, а не остаётся в нём навсегда'
  ] },
  { version: '19.7 для Windows', items: [
    'Всё, что скачиваешь с сайтов, теперь попадает в «Файлы» приложения: с курса Sakai — сразу в папку предмета, остальное — в «Загрузки»',
    'Меню сайта → «Файлы на странице»: все учебники, лекции и документы со страницы списком, можно скачать по одному или все сразу',
    'Открыт файл (картинка, видео, документ) — «Сохранить этот файл в Файлы»; правой кнопкой по ссылке — «Скачать в Файлы»',
    'Скачалось — внизу подсказка, куда легло, и кнопка «Открыть»'
  ] },
  { version: '19.6 для Windows', items: [
    'Пароли больше никогда не пишутся на диск открытым текстом: если шифрование Windows недоступно, они живут только до закрытия приложения; старый файл без шифрования сам перешифровывается',
    'Резервная копия «Вместе с паролями» теперь шифрует пароли паролем копии (AES‑256); старые копии по-прежнему восстанавливаются',
    'Сохранённый пароль подставляется только на свой сайт; общий вход САФУ — только на сайты narfu.ru',
    'Перед первой отправкой текста лекции в Claude приложение спрашивает разрешение; удалил ключ — разрешение сбросилось'
  ] },
  { version: '19.5 для Windows', items: [
    'Сайты сворачиваются и разворачиваются плавно: карточку теперь двигает сама видеокарта (а не кадры в JavaScript), поэтому занятость приложения больше не даёт рывков',
    'Сворачивание — мгновенно: снимок страницы готовится заранее, когда на сайте затишье, а не в момент нажатия',
    'Первое открытие сайта больше не «выпрыгивает»: страница создаётся, когда карточка уже выросла из плитки, — раньше создание страницы съедало анимацию',
    'Открытие сайта больше не перерисовывает всё приложение; «Приложение отъезжает под сайтом» теперь по умолчанию выключено'
  ] },
  { version: '19.4 для Windows', items: [
    'Пароли — как на iPhone: вошёл на сайт один раз — пароль запоминается сам (зашифрован средствами Windows), дальше подставляется и «Войти» нажимается за тебя. Если сохранённый пароль не подошёл — не больше двух попыток, потом вводишь новый, и он обновится',
    'Вход на сайтах вуза переживает перезапуск Арктики: сессия сохраняется зашифрованной и возвращается при запуске (не дольше двух недель)',
    'Автонажатие ищет именно кнопку «Войти», а не первую попавшуюся (например, «показать пароль»)'
  ] },
  { version: '19.3 для Windows', items: [
    'Сайты вырастают прямо из плитки, на которую нажал (Sakai, почта, библиотеки…), и при закрытии садятся обратно в неё; свёрнутый — уходит в плашку внизу и вырастает из неё',
    'Пока карточка сайта едет или её тянут, вместо живой страницы — её полноразмерный снимок: анимация идёт с частотой экрана и не грузит компьютер',
    'Свернуть, потянув шапку вниз: карточка двигается, только пока кнопка мыши зажата, и больше не «прилипает» к курсору, если отпустить над страницей; нажатия на кнопки шапки не превращаются в перетаскивание',
    'Над профилем — маленькая пометка «iPhone на связи» (или когда телефон был последний раз)'
  ] },
  { version: '19.2 для Windows', items: [
    'Живые обои на видеокарте: «Свет» — переливающийся градиент в цветах темы, «Сияние» — северное сияние со звёздами; снег, листья и лепестки летят поверх переливов. Фон плавно следует за мышью',
    'Качество анимаций под железо (Оформление → «Качество анимаций»): «Авто» смотрит на видеокарту и процессор; если кадры не успевают, фон сам рисует проще. На мощном железе карточки чуть наклоняются за курсором',
    'Синхронизация с iPhone: при запуске Арктика сама предложит разрешить брандмауэр Windows (из-за него телефон «не видел» компьютер); на экране синхронизации — адрес компьютера и видел ли его телефон',
    'Файлы с iPhone приходят сами после синхронизации: файлы предметов, фото доски, записи лекций и фото к ДЗ — фото сразу прикрепляются к своему заданию'
  ] },
  { version: '19.1 для Windows', items: [
    'Синхронизация с iPhone без QR-кода: телефон сам находит компьютер в той же сети Wi‑Fi. Выбираешь его на iPhone, сверяешь код и нажимаешь здесь «Разрешить» — и всё',
    'Брандмауэр Windows больше не мешает: в «Синхронизация с iPhone» видно, пропускает ли он телефон, и кнопка «Разрешить синхронизацию» чинит это в одно нажатие (Windows спросит подтверждение)',
    'Компьютер ждёт телефон всегда, пока Арктика запущена; сменился адрес в сети — телефон найдёт компьютер сам'
  ] },
  { version: '19.0.3 для Windows', items: [
    'Снова плавно: вернули ускорение видеокартой, которое отключили в 19.0 — без него на многих ноутбуках окно рисовал процессор и прокрутка шла рывками, «как в 30 кадров». Если видеокарта падает, приложение само переходит в безопасный режим',
    'Сайты сворачиваются и закрываются плавно: пока карточка едет, вместо живой страницы — её снимок, а выгружается страница уже после анимации',
    'Фон замирает, пока листаешь, и рисуется в меньшем разрешении — прокрутка свободнее',
    'Больше никакого чёрного окна: если интерфейс не загрузился или упал, приложение само перезагружает его, а если не помогло — показывает экран с кнопками «Ещё раз», «Сбросить открытые сайты», «Без ускорения видеокартой». Ошибки пишутся в журнал',
    'Оформление → «Ускорение видеокартой»: видно, рисует ли окно видеокарта, и можно выключить, если сайты чёрные или мерцают'
  ] },
  { version: '19.0.2 для Windows', items: [
    'Уведомления о почте: исправлено, что новые письма могли не замечаться — если во «Входящих» не оставалось непрочитанных (через IMAP) или ящик пустел, следующее письмо проходило без уведомления',
    'Почта: новые письма находятся при любом порядке писем на сервере — раньше, если сервер не понимал сортировку, приложение смотрело только на самые старые'
  ] },
  { version: '19.0.1 для Windows', items: [
    'Исправлено: после обновления до 19.0 окно открывалось пустым (только фон) — приложение падало при запуске из-за сохранения открытых сайтов'
  ] },
  { version: '19.0 для Windows', items: [
    'Нажал на ДЗ — открывается красивая карточка: предмет, срок с парой и аудиторией, задание по пунктам, шаги и заметка. «Изменить» — сверху',
    'Пишешь как попало — показывается аккуратно: «решить номер 5,6 стр 45 , упр 3-7» станет «Решить № 5, 6 стр. 45, упр. 3–7», а «1) … 2) …» одной строкой — списком',
    '«Картинкой ребятам»: красивая карточка ДЗ копируется в буфер — вставь в чат группы (Ctrl+V). Или текстом, или сохранить PNG',
    '«Отправить ребятам» в «Домашке»: ДЗ на завтра, на неделю или всё — одним сообщением',
    'Открытые сайты и файлы переживают перезапуск: ждут в плашке и грузятся, только когда их развернёшь',
    'Если страница сайта упала, она сама перезагружается вместо белого экрана; если сайт молчит 45 секунд — так и говорим, с кнопкой «Ещё раз»',
    'Быстрее: данные пишутся на диск в фоне и пачкой — раньше каждая мелочь (проверка почты, переход по странице, перетаскивание окна) на миг замораживала приложение',
    'Быстрее: открытие листа или правка ДЗ больше не перерисовывают всё окно, главная не пересчитывается каждую секунду, вращения и покачивания — на видеокарте',
    'Меньше памяти: одновременно держится до 4 сайтов, а свёрнутый больше 10 минут выгружается и при открытии загружается там же',
    'Сайты видят обычный Chrome — некоторые страницы входа раньше не пускали; убраны принудительные настройки видеокарты, из-за которых на части ноутбуков сайты были белыми или чёрными'
  ] },
  { version: '18.9 для Windows', items: [
    'Кнопка «Библиотеки» на главной рядом с Sakai и почтой: Знаниум, Лань, Юрайт, IPR SMART, Консультант студента, eLibrary, КиберЛенинка, НЭБ и библиотека САФУ — в одном месте',
    'Значки сайтов — в цвет темы, как всё остальное: без пестроты'
  ] },
  { version: '18.6 для Windows', items: [
    'Синхронизация с iPhone: один раз свяжи телефон QR-кодом (Профиль → «Синхронизация с iPhone») — и ДЗ, задачи и заметки станут общими. Отметил ДЗ сделанным здесь — через пару секунд оно сделано и на телефоне, и наоборот',
    'Работает по домашнему Wi‑Fi, пока Арктика запущена (можно свёрнутой в трей). Без облаков и серверов, с шифрованием AES‑256; ключ — только в QR-коде',
    'Одно и то же поменяли в двух местах — побеждает поздняя правка, по каждому полю отдельно: «сделано» не сотрёт новый срок. В шапке «Домашки» видно, когда последний раз сверялись с iPhone',
  ] },
  { version: '18.3 для Windows', items: [
    'Фото доски — по полочкам: предметы с обложкой из последнего снимка → даты → фото этого дня. Стрелками ← → листаются снимки',
  ] },
  { version: '18.2 для Windows', items: [
    'Новое имя — «Арктика»: так приложение называется теперь и на iPhone',
    'Перенос с iPhone по QR-коду: наведи камеру телефона на код — и файлы предметов, фото доски, ДЗ, задачи, заметки, оценки и настройки перелетят по Wi‑Fi. Без кабеля, облаков и пересылки себе в Telegram',
    'Перенос шифруется AES‑256: ключ есть только в QR-коде и меняется каждый раз. Повторный перенос шлёт только новое, а после обрыва связи продолжает с того же места',
    'Фото доски с iPhone ложатся в папку «Доска» своего предмета с датой съёмки — сразу видны в «Фото доски»',
  ] },
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
      <PageHeader title={L("Автор")} />
      <div className="grid" style={{ gridTemplateColumns: '360px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, padding: 28 }}>
          <div className="icon-tile wobble slow" style={{ width: 90, height: 90, borderRadius: 28, background: 'var(--grad)' }}><Code2 size={44} /></div>
          <div className="h-card" style={{ fontSize: '1.4rem' }}>@skf29</div>
          <div className="sub">{L("Студент САФУ, группа 151621 (ВШИТАС). Сделал приложение, которым сам хотел бы пользоваться.")}</div>
          <button className="btn primary block" onClick={() => safu.shell.open('https://t.me/skf29')}><Send size={15} /> {L("Написать в Telegram")}</button>
          <button className="btn block" onClick={() => safu.shell.open('https://github.com/skyface29/SAFU')}><Code2 size={15} /> {L("Исходники на GitHub")}</button>
          <button className="btn ghost block" onClick={() => go('legal')}>{L("Конфиденциальность и условия")}</button>
          <div className="tiny faint row gap4">{L("Сделано с")} <Heart size={11} color="#ef4444" fill="#ef4444" /> {L("в Архангельске")}</div>
          <div className="tiny faint">{L("© 2026 Зарубин Кирилл. Все права защищены. Код открыт для чтения; изменять, копировать и распространять его без разрешения автора нельзя")}</div>
        </Card>
        <div className="col gap14">
          {CHANGELOG.map((c, i) => (
            <Card key={c.version} delay={i * 0.04}>
              <div className="row mb8"><span className="badge" style={{ background: i === 0 ? 'var(--grad)' : 'var(--fill2)', color: i === 0 ? '#fff' : 'var(--text2)', fontSize: '.8rem' }}>{c.version}</span>{i === 0 && <span className="pill">{L("новое")}</span>}</div>
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
      <PageHeader title={L("Конфиденциальность")} />
      <Card className="col gap12" style={{ lineHeight: 1.6, maxWidth: 820 }}>
        <p style={{ margin: 0 }}>{L("Арктика — неофициальное студенческое приложение для САФУ. Оно не связано с администрацией университета.")}</p>
        <p style={{ margin: 0 }}><b>{L("Где хранятся данные.")}</b> {L("Всё — расписание, ДЗ, файлы, оценки, пароли — хранится только на твоём компьютере. У приложения нет своего сервера. Пароли сайтов шифруются средствами Windows (DPAPI) и привязаны к твоей учётной записи Windows. Открытым текстом они не сохраняются никогда, а в резервную копию попадают только зашифрованными паролем копии.")}</p>
        <p style={{ margin: 0 }}><b>{L("Куда приложение обращается.")}</b> {L("К открытым сайтам университета (РУЗ и сайты, которые ты открываешь сам), к сервису погоды Open-Meteo. Если включены уведомления о почте — к серверу почты САФУ, только чтобы узнать отправителя и тему новых писем; письма не скачиваются и не помечаются прочитанными. Если ты добавил ключ Claude API и разрешил отправку — расшифровка лекции уходит в Anthropic для конспекта. Яндекс Карты, библиотеки и другие сайты открываются только по твоему нажатию. Модель распознавания речи скачивается один раз с Hugging Face, а сама запись лекции никуда не отправляется.")}</p>
        <p style={{ margin: 0 }}><b>{L("Удаление.")}</b> {L("Удали приложение, его папку с файлами в «Документах» и папку данных приложения в %APPDATA% — и данных не останется. Резервную копию можно сделать вручную: Профиль → Резервная копия.")}</p>
        <p style={{ margin: 0 }} className="faint small">{L("Расписание из РУЗ показывается как есть; сверяйся с официальным расписанием перед экзаменами.")}</p>
      </Card>
    </>
  )
}
void LogOut; void Info; void Keyboard; void X; void Chips; void openMenu; void scheduleStore
