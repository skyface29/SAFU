// Лекции: запись, отметки «Важно», расшифровка на компьютере, конспект через Claude или без ИИ.
// Из Sources/Lectures.swift, LectureASR.swift, LectureAI.swift.
import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Pause, Play, Star, Trash2, Sparkles, FileText, KeyRound, FolderOpen, Copy, Wand2, Loader2 } from 'lucide-react'
import { PageHeader, Card, Sheet, Empty, Field, Segmented, toast, confirmDialog, Progress, promptDialog } from '../../ui/kit'
import { createCollection, uid, usePref } from '../../lib/kv'
import { useSchedule } from '../../lib/scheduleStore'
import { subjects, nowAndNext } from '../../lib/schedule'
import { safu, fileURL } from '../../lib/bridge'
import { timer, dayMonth, hm, plural } from '../../lib/date'
import { toBase64 } from '../../lib/zip'

type Segment = { start: number; end: number; text: string }
type Summary = { title: string; summary: string; keyPoints: string[]; sections: { heading: string; points: string[] }[]; terms: { term: string; definition: string }[]; formulas: string[]; questions: string[]; tasks: string[] }
type Lecture = { id: string; title: string; subject: string; created: number; duration: number; file: string; marks: number[]; segments: Segment[]; summary: Summary | null; summaryBy: string; notes: string }

const store = createCollection<Lecture[]>('lectures.win', [])
const STYLES = [
  { id: 'full', title: 'Подробный', instruction: 'Стиль: подробный конспект — все разделы, примеры и пояснения.' },
  { id: 'short', title: 'Кратко', instruction: 'Стиль: краткий конспект — только главное, каждый раздел 2–4 пункта.' },
  { id: 'cheat', title: 'Шпаргалка', instruction: 'Стиль: шпаргалка к экзамену — определения, формулы, вероятные вопросы, минимум воды.' }
]

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function transcriptForAI(l: Lecture) {
  let out = '', next = 0
  for (const s of l.segments) {
    if (s.start >= next) { out += `\n[${mmss(s.start)}] `; next = s.start + 120 }
    const important = l.marks.some(m => s.end >= m - 5 && s.start <= m + 40)
    out += (important ? '[ВАЖНО] ' : '') + s.text + ' '
  }
  return out.trim()
}

/** Конспект без ИИ: важные места и самые «насыщенные» предложения */
function localSummary(l: Lecture): Summary {
  const text = l.segments.map(s => s.text).join(' ')
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 30)
  const words = text.toLowerCase().match(/[а-яё]{5,}/g) || []
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1)
  const score = (s: string) => (s.toLowerCase().match(/[а-яё]{5,}/g) || []).reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.max(1, s.length / 60)
  const important = l.segments.filter(s => l.marks.some(m => s.end >= m - 5 && s.start <= m + 40)).map(s => s.text)
  const top = [...sentences].sort((a, b) => score(b) - score(a)).slice(0, 8)
  const terms = sentences.filter(s => / — это | называется | называют /i.test(s)).slice(0, 8).map(s => { const [t, ...d] = s.split(/ — это | называется | называют /i); return { term: t.trim().slice(0, 60), definition: d.join(' ').trim() } })
  return {
    title: l.title, summary: top.slice(0, 3).join(' '), keyPoints: [...important.slice(0, 6), ...top.slice(3, 8)],
    sections: [], terms, formulas: [], questions: [], tasks: sentences.filter(s => /(домашн|задани|к следующ|сдать|подготов)/i.test(s)).slice(0, 5)
  }
}

export function Lectures() {
  const list = store.use()
  const data = useSchedule(s => s.data)
  const [open, setOpen] = useState<string | null>(null)
  const [rec, setRec] = useState<{ start: number; paused: boolean; pausedTotal: number; pauseAt: number; marks: number[]; level: number } | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const media = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const analyser = useRef<AnalyserNode | null>(null)
  const [, tick] = useState(0)
  useEffect(() => { if (!rec) return; const t = setInterval(() => {
    if (analyser.current) { const a = new Uint8Array(analyser.current.fftSize); analyser.current.getByteTimeDomainData(a); let m = 0; for (const v of a) m = Math.max(m, Math.abs(v - 128)); setRec(r => r ? { ...r, level: m / 128 } : r) }
    tick(x => x + 1)
  }, 80); return () => clearInterval(t) }, [!!rec])

  const elapsed = rec ? ((rec.paused ? rec.pauseAt : Date.now()) - rec.start - rec.pausedTotal) / 1000 : 0

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); analyser.current = an
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000 })
      chunks.current = []
      mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      mr.start(5000)
      media.current = mr
      setRec({ start: Date.now(), paused: false, pausedTotal: 0, pauseAt: 0, marks: [], level: 0 })
    } catch { toast('Нет доступа к микрофону — разреши его в Параметрах Windows → Конфиденциальность', 'warn') }
  }
  const stop = async () => {
    const mr = media.current
    if (!mr || !rec) return
    const dur = elapsed
    await new Promise<void>(res => { mr.onstop = () => res(); mr.stop() })
    mr.stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(chunks.current, { type: 'audio/webm' })
    const { current, next } = nowAndNext(rec.start + 60_000, data)
    const subject = current?.subject || ''
    const id = uid()
    const rel = `Лекции/${dayMonth(rec.start)} ${hm(rec.start).replace(':', '-')}${subject ? ' — ' + subject.slice(0, 40).replace(/[\\/:*?"<>|]/g, '_') : ''}.webm`
    await safu.fs.writeBase64(rel, toBase64(new Uint8Array(await blob.arrayBuffer())))
    store.set(l => [{ id, title: subject ? `${subject}, ${dayMonth(rec.start)}` : `Запись ${dayMonth(rec.start)}, ${hm(rec.start)}`, subject, created: rec.start, duration: dur, file: rel, marks: rec.marks, segments: [], summary: null, summaryBy: '', notes: '' }, ...l])
    setRec(null); media.current = null; analyser.current = null
    setOpen(id)
    void next
  }
  const pause = () => {
    const mr = media.current; if (!mr || !rec) return
    if (rec.paused) { mr.resume(); setRec({ ...rec, paused: false, pausedTotal: rec.pausedTotal + Date.now() - rec.pauseAt }) }
    else { mr.pause(); setRec({ ...rec, paused: true, pauseAt: Date.now() }) }
  }

  const lec = list.find(l => l.id === open)
  return (
    <>
      <PageHeader title="Лекции" subtitle="Запиши лекцию — приложение сделает текст и конспект" right={<button className="btn" onClick={() => setKeyOpen(true)}><KeyRound size={15} /> ИИ для конспектов</button>} />
      <Card className="mb16" style={{ overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!rec ? (
            <motion.div key="idle" className="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }} onClick={start} className="btn primary round" style={{ width: 76, height: 76, borderRadius: 38, background: 'linear-gradient(135deg,#ef4444,#ec4899)', boxShadow: '0 10px 30px rgba(239,68,68,.45)' }}><Mic size={32} /></motion.button>
              <div className="grow"><div className="h-card">Начать запись</div><div className="sub">Положи ноутбук ближе к преподавателю. Во время записи жми «Важно» — эти места попадут в конспект обязательно.</div></div>
            </motion.div>
          ) : (
            <motion.div key="rec" className="col" style={{ alignItems: 'center', gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="row" style={{ gap: 3, height: 60, alignItems: 'center' }}>
                {Array.from({ length: 40 }, (_, i) => <motion.div key={i} animate={{ height: rec.paused ? 4 : 6 + Math.abs(Math.sin(i * 0.7 + Date.now() / 160)) * rec.level * 55 }} transition={{ duration: 0.08 }} style={{ width: 5, borderRadius: 3, background: 'linear-gradient(#ef4444,#ec4899)' }} />)}
              </div>
              <div className="mono heavy" style={{ fontSize: '3rem' }}>{timer(elapsed * 1000)}</div>
              <div className="row">
                <button className="btn lg" onClick={pause}>{rec.paused ? <><Play size={18} /> Продолжить</> : <><Pause size={18} /> Пауза</>}</button>
                <motion.button whileTap={{ scale: 0.9 }} className="btn lg" style={{ color: '#f59e0b' }} onClick={() => { setRec({ ...rec, marks: [...rec.marks, elapsed] }); toast('Отмечено как важное', 'info') }}><Star size={18} /> Важно {rec.marks.length > 0 && `(${rec.marks.length})`}</motion.button>
                <button className="btn lg danger solid" onClick={stop}><Square size={18} /> Стоп</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      {!list.length && <Empty emoji="🎙️" title="Записей пока нет" />}
      <div className="grid gauto">
        {list.map((l, i) => (
          <Card key={l.id} press delay={i * 0.03} onClick={() => setOpen(l.id)}>
            <div className="row"><div className="icon-tile" style={{ background: 'linear-gradient(135deg,#ec4899,#8b5cf6)' }}><Mic size={16} /></div><div className="grow"><div className="bold clamp2">{l.summary?.title || l.title}</div><div className="tiny muted">{dayMonth(l.created)} · {Math.round(l.duration / 60)} мин</div></div></div>
            <div className="row gap6 mt8">{l.segments.length ? <span className="pill">текст</span> : <span className="pill">без текста</span>}{l.summary && <span className="pill" style={{ color: 'var(--brand)' }}><Sparkles size={11} /> конспект</span>}{l.marks.length > 0 && <span className="pill"><Star size={11} /> {l.marks.length}</span>}</div>
          </Card>
        ))}
      </div>
      <LectureSheet l={lec || null} onClose={() => setOpen(null)} />
      <KeySheet open={keyOpen} onClose={() => setKeyOpen(false)} />
    </>
  )
}

function LectureSheet({ l, onClose }: { l: Lecture | null; onClose: () => void }) {
  const data = useSchedule(s => s.data)
  const [stage, setStage] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [style, setStyle] = usePref('lecture.style', 'full')
  const [tab, setTab] = useState<'summary' | 'text'>('summary')
  if (!l) return <Sheet open={false} onClose={onClose} />
  const upd = (p: Partial<Lecture>) => store.set(list => list.map(x => x.id === l.id ? { ...x, ...p } : x))

  const transcribe = async () => {
    setStage('Готовлю звук…'); setProgress(0)
    try {
      const b64: string = await safu.fs.readBase64(l.file)
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const ctx = new AudioContext({ sampleRate: 16000 })
      const buf = await ctx.decodeAudioData(bytes.buffer)
      const audio = buf.getChannelData(0)
      const worker = new Worker(new URL('../../workers/asr.ts', import.meta.url), { type: 'module' })
      await new Promise<void>((res, rej) => {
        worker.onmessage = e => {
          const m = e.data
          if (m.type === 'download') { setStage(`Скачиваю модель распознавания (один раз)…`); setProgress((m.progress || 0) / 100) }
          if (m.type === 'stage') { setStage(m.text); setProgress(0) }
          if (m.type === 'done') {
            const segs: Segment[] = (m.out.chunks || []).map((c: any) => ({ start: c.timestamp[0] || 0, end: c.timestamp[1] || c.timestamp[0] || 0, text: String(c.text).trim() })).filter((s: Segment) => s.text)
            upd({ segments: segs.length ? segs : [{ start: 0, end: l.duration, text: String(m.out.text || '').trim() }] })
            res()
          }
          if (m.type === 'error') rej(new Error(m.error))
        }
        worker.postMessage({ audio, model: 'onnx-community/whisper-base' }, [audio.buffer])
      })
      worker.terminate()
      toast('Текст лекции готов')
      setTab('text')
    } catch (e) {
      toast(`Не получилось распознать: ${(e as Error).message}`, 'warn')
    } finally { setStage(null) }
  }

  const summarize = async () => {
    if (!l.segments.length) { toast('Сначала сделай текст', 'warn'); return }
    setStage('Claude пишет конспект…')
    const st = STYLES.find(s => s.id === style) || STYLES[0]
    const r = await safu.ai.summarize({ subject: l.subject, minutes: Math.round(l.duration / 60), style: st.instruction, transcript: transcriptForAI(l) })
    setStage(null)
    if (r.ok) { upd({ summary: r.summary, summaryBy: 'Claude' }); setTab('summary'); toast('Конспект готов ✨') }
    else {
      toast(r.error || 'Ошибка', 'warn')
      upd({ summary: localSummary(l), summaryBy: 'без ИИ' }); setTab('summary')
    }
  }

  const s = l.summary
  const asText = () => s ? [`# ${s.title}`, s.summary, '', '## Главное', ...s.keyPoints.map(p => `- ${p}`), ...s.sections.flatMap(x => ['', `## ${x.heading}`, ...x.points.map(p => `- ${p}`)]),
    ...(s.terms.length ? ['', '## Термины', ...s.terms.map(t => `- **${t.term}** — ${t.definition}`)] : []), ...(s.formulas.length ? ['', '## Формулы', ...s.formulas.map(f => `- ${f}`)] : []),
    ...(s.questions.length ? ['', '## Вопросы к экзамену', ...s.questions.map(q => `- ${q}`)] : []), ...(s.tasks.length ? ['', '## Задания', ...s.tasks.map(t => `- ${t}`)] : [])].join('\n') : ''

  return (
    <Sheet open={!!l} onClose={onClose} size="xwide" title={s?.title || l.title}
      headRight={<>
        <button className="btn icon sm ghost" onClick={async () => { const t = await promptDialog('Название', l.title); if (t) upd({ title: t }) }}><FileText size={16} /></button>
        <button className="btn icon sm ghost" onClick={() => safu.fs.reveal(l.file)}><FolderOpen size={16} /></button>
        <button className="btn icon sm ghost danger" onClick={async () => { if (await confirmDialog('Удалить запись?', 'Аудиофайл попадёт в корзину.', 'Удалить', true)) { await safu.fs.trash(l.file).catch(() => null); store.set(x => x.filter(y => y.id !== l.id)); onClose() } }}><Trash2 size={16} /></button>
      </>}>
      <audio src={fileURL(l.file)} controls style={{ width: '100%', marginBottom: 12 }} />
      <div className="row wrap-row mb12">
        <select className="select" style={{ width: 280 }} value={l.subject} onChange={e => upd({ subject: e.target.value })}><option value="">Предмет не выбран</option>{subjects(data).map(x => <option key={x} value={x}>{x}</option>)}</select>
        <span className="spacer" />
        <button className="btn" disabled={!!stage} onClick={transcribe}><Wand2 size={15} /> {l.segments.length ? 'Распознать заново' : 'Сделать текст'}</button>
        <Segmented value={style} onChange={setStyle} options={STYLES.map(x => ({ value: x.id, label: x.title }))} />
        <button className="btn primary" disabled={!!stage || !l.segments.length} onClick={summarize}><Sparkles size={15} /> Конспект</button>
      </div>
      {stage && <div className="card tight mb12 row"><Loader2 size={18} className="spin" color="var(--brand)" /><div className="grow"><div className="small bold">{stage}</div>{progress > 0 && <div className="mt4"><Progress value={progress} /></div>}</div></div>}
      <Segmented value={tab} onChange={setTab} options={[{ value: 'summary', label: 'Конспект' }, { value: 'text', label: `Текст${l.segments.length ? ` · ${l.segments.length}` : ''}` }]} />
      <div className="mt12">
        {tab === 'summary' ? (s ? (
          <div className="col gap14">
            <div className="row"><span className="pill"><Sparkles size={11} /> {l.summaryBy}</span><span className="spacer" /><button className="btn sm" onClick={() => { safu.clipboard.write(asText()); toast('Конспект скопирован') }}><Copy size={13} /> Копировать</button>
              <button className="btn sm" onClick={async () => { const rel = l.file.replace(/\.webm$/, ' — конспект.md'); await safu.fs.writeText(rel, asText()); toast('Сохранено рядом с записью') }}>Сохранить .md</button></div>
            {s.summary && <Card tight style={{ background: 'rgba(var(--brand-rgb), .1)' }}><div style={{ lineHeight: 1.6 }}>{s.summary}</div></Card>}
            {s.keyPoints.length > 0 && <Block title="⭐ Главное" items={s.keyPoints} />}
            {s.sections.map((x, i) => <Block key={i} title={x.heading} items={x.points} />)}
            {s.terms.length > 0 && <Card tight><div className="bold mb8">📘 Термины</div>{s.terms.map((t, i) => <div key={i} className="small mb8"><b>{t.term}</b> — {t.definition}</div>)}</Card>}
            {s.formulas.length > 0 && <Block title="🧮 Формулы" items={s.formulas} mono />}
            {s.questions.length > 0 && <Block title="❓ Вероятные вопросы" items={s.questions} />}
            {s.tasks.length > 0 && <Block title="📝 Задания" items={s.tasks} />}
          </div>
        ) : <Empty emoji="✨" title="Конспекта пока нет" text="Сделай текст, затем нажми «Конспект». Без ключа Claude приложение соберёт конспект само — из важных мест и ключевых фраз." />)
          : l.segments.length ? (
            <div className="col gap6" style={{ userSelect: 'text' }}>
              {l.segments.map((x, i) => {
                const imp = l.marks.some(m => x.end >= m - 5 && x.start <= m + 40)
                return <div key={i} className="row top small" style={{ padding: '6px 10px', borderRadius: 10, background: imp ? 'rgba(245,158,11,.12)' : undefined }}><span className="mono faint" style={{ width: 48 }}>{mmss(x.start)}</span><span className="grow">{x.text}</span>{imp && <Star size={12} color="#f59e0b" />}</div>
              })}
            </div>
          ) : <Empty emoji="📝" title="Текста пока нет" text="Распознавание идёт на твоём компьютере: модель скачается один раз (~150 МБ), запись никуда не отправляется." />}
      </div>
    </Sheet>
  )
}

function Block({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  return <Card tight><div className="bold mb8">{title}</div><ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }} className={mono ? 'mono' : ''}>{items.map((p, i) => <li key={i} className="small">{p}</li>)}</ul></Card>
}

function KeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState('')
  const [has, setHas] = useState(false)
  useEffect(() => { if (open) safu.secret.get('claude.key').then(k => { setHas(!!k); setKey('') }) }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="ИИ для конспектов" footer={<>
      {has && <button className="btn danger" onClick={async () => { await safu.secret.set('claude.key', null); setHas(false); toast('Ключ удалён') }}>Удалить ключ</button>}
      <span className="spacer" />
      <button className="btn primary" disabled={!key.trim().startsWith('sk-')} onClick={async () => { await safu.secret.set('claude.key', key.trim()); toast('Ключ сохранён'); onClose() }}>Сохранить</button>
    </>}>
      <div className="sub mb12" style={{ lineHeight: 1.5 }}>Конспекты делает Claude (модель Claude Opus 5.5). Нужен свой ключ API с console.anthropic.com. Ключ хранится зашифрованным средствами Windows и отправляется только в Anthropic. Без ключа приложение соберёт конспект само, проще.</div>
      <div className="pill mb12">{has ? '✓ Ключ сохранён' : 'Ключ не задан'}</div>
      <Field label="Ключ Claude API"><input className="input" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-…" /></Field>
      <button className="btn ghost" onClick={() => safu.shell.open('https://console.anthropic.com/settings/keys')}>Получить ключ</button>
    </Sheet>
  )
}
void plural
