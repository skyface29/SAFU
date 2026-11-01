// Посещаемость через сайт старост arktika-app.ru/otmetki/: та же группа, те же пары и отметки, что на сайте.
// Отметил здесь — видно на сайте (и у студентов по их ссылкам), отметил на сайте — видно здесь.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Trash2, BarChart3, ExternalLink, RotateCw, Unlink, Link2, Save } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, Field, Segmented, toast, confirmDialog, KindBadge, Progress } from '../../ui/kit'
import { createCollection } from '../../lib/kv'
import { safu } from '../../lib/bridge'
import * as O from '../../lib/otmetki'

export type SiteLink = { code: string; who: string }
export const siteLinkStore = createCollection<SiteLink>('otmetki.link', { code: '', who: 'Староста' })
const ROLES = ['Староста', 'Зам старосты', 'Куратор']
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MON1 = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const human = (d: string) => { const t = new Date(d + 'T12:00:00Z'); return `${WD[t.getUTCDay()]}, ${t.getUTCDate()} ${MON[t.getUTCMonth()]}` }
const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const MARK = Object.fromEntries(O.SITE_MARKS.map(m => [m.id, m])) as Record<O.SiteMark, typeof O.SITE_MARKS[number]>
const lesOf = (x: O.DayItem): O.SiteLesson => x.saved ? JSON.parse(JSON.stringify(x.saved)) : O.newLesson(x.d, x.plan!)

// ---------- подключение по коду группы ----------

export function ConnectSiteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [who, setWho] = useState('Староста')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    const c = O.normCode(code)
    if (c.length !== 15) { toast(`В коде группы 15 символов, сейчас ${c.length}`, 'warn'); return }
    setBusy(true)
    try {
      const G = await O.openGroup(c)
      siteLinkStore.set({ code: c, who })
      toast(`Подключено: ${G.meta.name}`)
      onClose()
    } catch (e) { toast((e as Error).message, 'warn') } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Связать с сайтом старост" footer={<>
      <button className="btn" onClick={() => safu.shell.open(O.SITE_URL)}><ExternalLink size={15} /> Открыть сайт</button>
      <button className="btn primary" disabled={busy} onClick={go}><Link2 size={15} /> {busy ? 'Подключаю…' : 'Подключить'}</button>
    </>}>
      <div className="sub mb12">Отметки будут общими с сайтом {O.SITE_URL.replace('https://', '')}: отметил здесь, сразу видно на сайте, у зама, куратора и у студентов по их ссылкам. Код группы есть на сайте во вкладке «Группа». Всё шифруется этим кодом, на сервер он не уходит.</div>
      <Field label="Код группы">
        <input className="input mono" autoFocus value={code} placeholder="XXXXX-XXXXX-XXXXX" onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go() }} style={{ letterSpacing: 2, fontSize: 18 }} />
      </Field>
      <Field label="Кто ты в группе">
        <Segmented value={who} onChange={setWho} options={ROLES.map(r => ({ value: r, label: r === 'Зам старосты' ? 'Зам' : r }))} />
      </Field>
      <div className="tiny faint mt8">Группы ещё нет? Создай её на сайте: там вносится список и выбирается группа из расписания. Отметки, сделанные в приложении раньше, никуда не денутся: они вернутся, если отключить сайт.</div>
    </Sheet>
  )
}

// ---------- посещаемость через сайт ----------

export function SiteAttendance() {
  const link = siteLinkStore.use()
  const [G, setG] = useState<O.Group | null>(null)
  const [err, setErr] = useState('')
  const [months, setMonths] = useState<Record<string, Record<string, O.SiteLesson>>>({})
  const [items, setItems] = useState<O.DayItem[] | null>(null)
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState<O.SiteLesson | null>(null)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let off = false
    setErr(''); setG(null)
    O.openGroup(link.code).then(g => { if (!off) setG(g) }, e => { if (!off) setErr((e as Error).message) })
    return () => { off = true }
  }, [link.code, tick])

  // пары за неделю: по расписанию группы на сайте + всё, что уже отмечено
  useEffect(() => {
    if (!G) return
    let off = false
    const today = O.mskDate(Date.now()), now = O.mskTime(Date.now() + 3600_000)
    const days = Array.from({ length: 8 }, (_, i) => addDays(today, i - 7))
    const ms = [...new Set(days.map(d => d.slice(0, 7)))]
    Promise.all(ms.map(m => O.loadMonth(G, m).then(r => [m, r] as const))).then(async loaded => {
      const M = Object.fromEntries(loaded)
      const all = (await Promise.all(days.map(d => O.dayLessons(G, d, M[d.slice(0, 7)] || {})))).flat()
        .filter(x => x.saved || x.d < today || (x.plan && x.plan.t <= now))
        .reverse()
      if (off) return
      setMonths(M); setItems(all)
      setSel(s => all.some(x => x.k === s) ? s : (all[0]?.k || ''))
    }).catch(e => { if (!off) { setErr((e as Error).message); setItems([]) } })
    return () => { off = true }
  }, [G])

  const cur = items?.find(x => x.k === sel) || null
  const [base, setBase] = useState('{}')   // с чем сравнивать «есть несохранённое»: перезачёт, проставленный сам, правкой не считается
  useEffect(() => { const d = cur && G ? O.applyCredits(G, lesOf(cur)) : null; setDraft(d); setBase(JSON.stringify(d?.marks || {})) }, [cur, G])
  const dirty = !!(cur && draft && JSON.stringify(draft.marks) !== base)
  const unsaved = !!(cur && draft && JSON.stringify(draft.marks) !== JSON.stringify(cur.saved?.marks || {}))

  const setMark = (id: string, m: O.SiteMark | null) => setDraft(d => {
    if (!d) return d
    const marks = { ...d.marks }
    if (m) marks[id] = m; else delete marks[id]
    return { ...d, marks }
  })
  const save = useCallback(async () => {
    if (!G || !cur || !draft) return
    setBusy(true)
    try {
      const saved = await O.saveLesson(G, cur.k, draft, link.who)
      const m = cur.d.slice(0, 7)
      setMonths(M => ({ ...M, [m]: { ...(M[m] || {}), [cur.k]: saved } }))
      setItems(L => L && L.map(x => x.k === cur.k ? { ...x, saved } : x))
      toast('Сохранено на сайте')
    } catch (e) {
      const er = e as O.ApiError
      toast(er.status === 403 ? 'Код группы больше не подходит' : 'Не сохранилось: ' + er.message, 'warn')
    } finally { setBusy(false) }
  }, [G, cur, draft, link.who])
  const del = async () => {
    if (!G || !cur?.saved || !(await confirmDialog('Удалить отметки этой пары?', 'Пара пропадёт из журнала на сайте.', 'Удалить', true))) return
    try {
      await O.deleteLesson(G, cur.k)
      setItems(L => L && L.map(x => x.k === cur.k ? { ...x, saved: null } : x).filter(x => x.plan || x.k !== cur.k))
      toast('Пара удалена из журнала')
    } catch (e) { toast((e as Error).message, 'warn') }
  }
  const unlink = async () => {
    if (await confirmDialog('Отключить сайт?', 'Отметки на сайте останутся. Приложение вернётся к своему списку и отметкам на этом компьютере.', 'Отключить')) siteLinkStore.set({ code: '', who: link.who })
  }

  if (err && !G) return (
    <>
      <PageHeader title="Посещаемость" subtitle="через сайт старост" />
      <Empty emoji="📡" title="Не получилось открыть группу" text={err} action={<div className="row gap6">
        <button className="btn primary" onClick={() => setTick(t => t + 1)}><RotateCw size={15} /> Ещё раз</button>
        <button className="btn" onClick={unlink}><Unlink size={15} /> Отключить сайт</button>
      </div>} />
    </>
  )
  if (!G) return <><PageHeader title="Посещаемость" subtitle="открываю группу на сайте…" /><Card className="sub">Расшифровываю список группы…</Card></>

  const roster = G.meta.roster
  const c = draft ? O.countMarks(G, draft.marks) : null
  const tot = c ? c.p + c.l + c.a + c.e : 0
  const l = cur ? (cur.saved || cur.plan)! : null
  const credits = G.meta.credits || {}

  return (
    <>
      <PageHeader title={G.meta.name} subtitle={<>отметки общие с сайтом · {link.who.toLowerCase()}</>} right={<>
        <button className="btn" onClick={() => setStats(true)}><BarChart3 size={16} /> Журнал за месяц</button>
        <button className="btn icon" title="Обновить" onClick={() => { O.resetRuzCache(); setItems(null); setTick(t => t + 1) }}><RotateCw size={16} /></button>
        <button className="btn" onClick={() => safu.shell.open(O.SITE_URL)}><ExternalLink size={16} /> Сайт</button>
        <button className="btn ghost" onClick={unlink}><Unlink size={16} /> Отключить</button>
      </>} />
      <div className="grid" style={{ gridTemplateColumns: '320px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card className="col gap6" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <div className="tiny faint bold mb8">ПАРЫ ЗА НЕДЕЛЮ</div>
          {!items && <div className="sub">Загружаю…</div>}
          {items && !items.length && <div className="sub">{G.meta.ruz ? 'За неделю пар нет.' : 'К группе на сайте не подключено расписание. Пару можно добавить на сайте вручную.'}</div>}
          {items?.map(x => {
            const p = (x.saved || x.plan)!
            const cc = x.saved ? O.countMarks(G, x.saved.marks) : null
            return (
              <motion.div key={x.k} whileHover={{ x: 3 }} onClick={async () => { if (dirty && !(await confirmDialog('Перейти без сохранения?', 'Отметки этой пары не сохранятся.', 'Перейти'))) return; setSel(x.k) }} className="row"
                style={{ padding: '9px 10px', borderRadius: 12, cursor: 'pointer', background: sel === x.k ? 'rgba(var(--brand-rgb), .15)' : 'var(--fill)', border: `1.5px solid ${sel === x.k ? 'var(--brand)' : 'transparent'}` }}>
                <div className="grow"><div className="small bold ellipsis">{p.subj || 'Пара'}</div><div className="tiny muted">{human(x.d)}, {p.t}{O.subName(p.sub) ? ` · ${O.subName(p.sub)}` : ''}</div></div>
                {cc && <span className="tiny bold" style={{ color: '#22c55e' }}>{cc.p + cc.l}/{cc.p + cc.l + cc.a + cc.e}</span>}
                {cc && <Check size={15} color="#22c55e" />}
              </motion.div>
            )
          })}
        </Card>
        {cur && l && draft && c && (
          <Card>
            <div className="row top mb12">
              <div className="grow"><div className="h-card">{l.subj || 'Пара'}</div><div className="row gap6 mt4">{l.kind && <KindBadge kind={l.kind} />}<span className="sub">{human(cur.d)}, {l.t}{O.subName(l.sub) ? `, ${O.subName(l.sub)}` : ''}</span></div></div>
              <div className="tc"><div className="heavy" style={{ fontSize: '1.6rem' }}>{c.p + c.l}/{tot}</div><div className="tiny muted">на паре</div></div>
            </div>
            <Progress value={tot ? (c.p + c.l) / tot : 0} />
            <div className="row mt12 mb12 wrap-row gap6">
              <button className="btn sm" onClick={() => setDraft(d => { if (!d) return d; const marks = { ...d.marks }; for (const s of roster) if (!marks[s.id]) marks[s.id] = 'p'; return { ...d, marks } })}><Check size={14} /> Остальные были</button>
              <button className="btn sm" onClick={() => setDraft(O.applyCredits(G, { ...draft, marks: {} }))}>Сбросить</button>
              <button className="btn sm" onClick={() => { safu.clipboard.write(report(G, cur.d, draft)); toast('Отчёт скопирован, вставь в чат') }}><Copy size={14} /> Отчёт</button>
              <span className="spacer" />
              {cur.saved && <button className="btn sm ghost danger" onClick={del}><Trash2 size={14} /> Удалить</button>}
              <button className="btn sm primary" disabled={busy || (!unsaved && !!cur.saved)} onClick={save}><Save size={14} /> {busy ? 'Сохраняю…' : cur.saved ? (unsaved ? 'Сохранить изменения' : 'Сохранено') : 'Сохранить на сайт'}</button>
            </div>
            <div className="tiny faint mb8">+ был, О опоздал, У уважительная, − нет, П перезачёт. Повторное нажатие снимает отметку. Без отметки: «не на паре» (другая подгруппа).{cur.saved?.by ? ` Отметил: ${cur.saved.by.toLowerCase()}.` : ''}</div>
            <div className="col gap6">
              {roster.map((st, i) => (
                <div key={st.id} className="row" style={{ padding: '6px 6px 6px 12px', borderRadius: 12, background: 'var(--fill)' }}>
                  <span className="tiny faint mono" style={{ width: 20 }}>{i + 1}</span>
                  <span className="grow small bold">{st.n}{(credits[st.id] || []).includes(l.subj) && <span className="tiny" style={{ color: MARK.r.color, marginLeft: 8 }}>перезачёт</span>}</span>
                  {O.SITE_MARKS.map(m => {
                    const on = draft.marks[st.id] === m.id
                    return (
                      <motion.button key={m.id} title={m.title} whileTap={{ scale: 0.85 }} animate={{ scale: on ? 1.08 : 1 }} onClick={() => setMark(st.id, on ? null : m.id)}
                        style={{ width: 38, height: 32, borderRadius: 10, border: `1.5px solid ${on ? m.color : 'var(--line2)'}`, background: on ? m.color : 'transparent', color: on ? '#fff' : m.color, fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>{m.sym}</motion.button>
                    )
                  })}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <SiteStats open={stats} onClose={() => setStats(false)} G={G} months={months} />
    </>
  )
}

function report(G: O.Group, d: string, x: O.SiteLesson) {
  const c = O.countMarks(G, x.marks), by = (m: O.SiteMark) => G.meta.roster.filter(s => x.marks[s.id] === m).map(s => s.n)
  const out = [`${G.meta.name}, ${human(d)}`, `${x.t} ${x.subj}${x.kind ? ` (${x.kind.toLowerCase()})` : ''}: на паре ${c.p + c.l} из ${c.p + c.l + c.a + c.e}`]
  if (by('a').length) out.push('Нет: ' + by('a').join(', '))
  if (by('l').length) out.push('Опоздали: ' + by('l').join(', '))
  if (by('e').length) out.push('Уважительная: ' + by('e').join(', '))
  if (by('r').length) out.push('Перезачёт: ' + by('r').join(', '))
  if (!by('a').length && !by('l').length && !by('e').length) out.push('Все на месте')
  return out.join('\n')
}

function SiteStats({ open, onClose, G, months }: { open: boolean; onClose: () => void; G: O.Group; months: Record<string, Record<string, O.SiteLesson>> }) {
  const m = O.mskDate(Date.now()).slice(0, 7)
  const [data, setData] = useState<Record<string, O.SiteLesson> | null>(null)
  useEffect(() => {
    if (!open) return
    setData(months[m] || null)
    O.loadMonth(G, m).then(setData, e => toast((e as Error).message, 'warn'))
  }, [open, G, m])
  const L = useMemo(() => Object.values(data || {}), [data])
  const rows = G.meta.roster.map(s => {
    const c = { p: 0, a: 0, e: 0, l: 0, r: 0, t: 0 }
    for (const x of L) { const v = x.marks[s.id]; if (v) { c[v]++; if (v !== 'r') c.t++ } }
    return { s, c, pct: c.t ? Math.round((c.p + c.l + c.e) / c.t * 100) : null }
  })
  return (
    <Sheet open={open} onClose={onClose} title={`Журнал: ${MON1[+m.slice(5, 7) - 1].toLowerCase()}`} size="wide" footer={<button className="btn primary" onClick={() => safu.shell.open(O.SITE_URL)}><ExternalLink size={15} /> Полный журнал и Excel на сайте</button>}>
      <div className="sub mb12">Отмечено пар: {L.length}. Посещаемость: был, опоздал или по уважительной, от всех отмеченных. Перезачёт в процент не идёт.</div>
      <div className="col gap6">
        {rows.map(({ s, c, pct }) => (
          <div key={s.id} className="row" style={{ padding: '8px 12px', borderRadius: 12, background: 'var(--fill)' }}>
            <span className="grow small bold">{s.n}</span>
            <span className="tiny muted">был {c.p} · опоздал {c.l} · уваж. {c.e} · нет {c.a}{c.r ? ` · перезачёт ${c.r}` : ''}</span>
            <div style={{ width: 120 }}><Progress value={pct == null ? 0 : pct / 100} /></div>
            <span className="small heavy" style={{ width: 44, textAlign: 'right', color: pct == null ? 'var(--muted)' : pct >= 85 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444' }}>{pct == null ? '–' : pct + '%'}</span>
          </div>
        ))}
      </div>
      {!L.length && <div className="sub mt12">В этом месяце пока нет отмеченных пар.</div>}
    </Sheet>
  )
}
