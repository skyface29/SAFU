// Первый вход: кто ты → группа из РУЗ (номером или по школе) или преподаватель из РУЗ
import { useEffect, useState } from 'react'
import type { Me, GroupInfo, LecturerInfo } from '../../../shared/types'
import { api } from '../api'
import { haptic } from '../tg'
import { Section, Row, Icon, Spinner, Empty, toast } from '../ui'

type Step = 'role' | 'group' | 'school' | 'teacher'

export function Onboarding({ me, onDone }: { me: Me; onDone: () => void }) {
  const [step, setStep] = useState<Step>(me.role === 'student' ? 'group' : me.role === 'teacher' ? 'teacher' : 'role')

  if (step === 'role') {
    return (
      <div className="page">
        <div className="hero">
          <img className="logo" src="/icon.svg" alt="" />
          <h1>Домашка группы</h1>
          <p>Один записал — у всей группы появилось.<br />Сроки сами встают к следующей паре по РУЗ.</p>
        </div>
        <Section>
          <button className="role" onClick={() => { haptic.tap(); setStep('group') }}>
            <span className="em">🎓</span>
            <div className="row-main"><div className="row-title">Я студент</div><div className="row-sub">Выбрать группу — и вся домашка здесь</div></div>
            <Icon name="chevron" />
          </button>
          <button className="role" onClick={() => { haptic.tap(); setStep('teacher') }}>
            <span className="em">👩‍🏫</span>
            <div className="row-main"><div className="row-title">Я преподаватель</div><div className="row-sub">Задавать ДЗ сразу всем группам потока</div></div>
            <Icon name="chevron" />
          </button>
        </Section>
      </div>
    )
  }

  if (step === 'teacher') return <TeacherPick onDone={onDone} onBack={() => setStep('role')} />
  if (step === 'school') return <SchoolPick onDone={onDone} onBack={() => setStep('group')} />
  return <GroupSearch onDone={onDone} onSchools={() => setStep('school')} />
}

function useJoin(onDone: () => void) {
  return async (g: GroupInfo) => {
    try {
      await api.register({ role: 'student', groupId: g.id })
      haptic.success()
      toast(`Ты в группе ${g.number}`)
      onDone()
    } catch (e) { haptic.error(); toast((e as Error).message) }
  }
}

function GroupRow({ g, onClick }: { g: GroupInfo; onClick: () => void }) {
  return <Row title={<b>{g.number}</b>} sub={[g.school, g.course ? `${g.course} курс` : '', g.title].filter(Boolean).join(' · ')} onClick={onClick} chevron />
}

function GroupSearch({ onDone, onSchools }: { onDone: () => void; onSchools: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<GroupInfo[] | null>(null)
  const join = useJoin(onDone)
  useEffect(() => {
    if (q.replace(/\D/g, '').length < 2) { setList(null); return }
    const t = setTimeout(() => api.groups(q).then(setList).catch(() => setList([])), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="page">
      <div className="top"><div><div className="top-title">Твоя группа</div><div className="top-sub">Номер — как в РУЗ САФУ</div></div></div>
      <div className="search" style={{ marginBottom: 16 }}>
        <Icon name="search" style={{ color: 'var(--hint)' }} />
        <input autoFocus inputMode="numeric" placeholder="Например, 151621" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {list && list.length > 0 && <Section>{list.map(g => <GroupRow key={g.id} g={g} onClick={() => join(g)} />)}</Section>}
      {list && !list.length && q.replace(/\D/g, '').length >= 6 && <Empty emoji="🔍" title="Не нашёл такую группу" text="Проверь номер или выбери по школе" />}
      <Section><Row title="Выбрать по школе" icon={<Icon name="book" />} onClick={onSchools} chevron className="link" /></Section>
    </div>
  )
}

function SchoolPick({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [schools, setSchools] = useState<{ id: number; name: string }[] | null>(null)
  const [school, setSchool] = useState<number | null>(null)
  const [groups, setGroups] = useState<GroupInfo[] | null>(null)
  const join = useJoin(onDone)
  useEffect(() => { api.schools().then(setSchools).catch(() => setSchools([])) }, [])
  useEffect(() => { if (school != null) { setGroups(null); api.schoolGroups(school).then(setGroups).catch(() => setGroups([])) } }, [school])
  if (school != null) {
    const courses = [...new Set((groups ?? []).map(g => g.course ?? 0))].sort()
    return (
      <div className="page">
        <div className="top"><div><div className="top-title">Группа</div><div className="top-sub">{schools?.find(s => s.id === school)?.name}</div></div></div>
        {!groups ? <Spinner /> : courses.map(c => (
          <Section key={c} title={c ? `${c} курс` : 'Другие'}>
            {groups.filter(g => (g.course ?? 0) === c).map(g => <GroupRow key={g.id} g={g} onClick={() => join(g)} />)}
          </Section>
        ))}
        <Section><Row title="← Другая школа" onClick={() => setSchool(null)} className="link" /></Section>
      </div>
    )
  }
  return (
    <div className="page">
      <div className="top"><div className="top-title">Школа</div></div>
      {!schools ? <Spinner /> : <Section>{schools.map(s => <Row key={s.id} title={s.name} onClick={() => setSchool(s.id)} chevron />)}</Section>}
      <Section><Row title="← Найти по номеру" onClick={onBack} className="link" /></Section>
    </div>
  )
}

function TeacherPick({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<LecturerInfo[] | null>(null)
  useEffect(() => {
    if (q.trim().length < 3) { setList(null); return }
    const t = setTimeout(() => api.lecturers(q).then(setList).catch(() => setList([])), 250)
    return () => clearTimeout(t)
  }, [q])
  const pick = async (l: LecturerInfo) => {
    try { await api.register({ role: 'teacher', lecturerId: l.id }); haptic.success(); toast(`Здравствуйте, ${l.name}`); onDone() } catch (e) { haptic.error(); toast((e as Error).message) }
  }
  return (
    <div className="page">
      <div className="top"><div><div className="top-title">Преподаватель</div><div className="top-sub">Фамилия и инициалы — как в РУЗ</div></div></div>
      <div className="search" style={{ marginBottom: 16 }}>
        <Icon name="search" style={{ color: 'var(--hint)' }} />
        <input autoFocus placeholder="Иванов И.И." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {list && list.length > 0 && <Section>{list.map(l => <Row key={l.id} title={l.name} onClick={() => pick(l)} chevron />)}</Section>}
      {list && !list.length && <Empty emoji="🔍" title="Не нашёл" text="Справочник преподавателей пополняется каждую ночь. Можно войти через бота: пришлите ему ссылку на своё расписание в ruz.narfu.ru." />}
      <Section note="Отметка «от преподавателя» у заданий появляется после короткой проверки."><Row title="← Я студент" onClick={onBack} className="link" /></Section>
    </div>
  )
}
