// Профиль и уведомления: группа, напоминания, приглашение группы, чат группы, корзина старосты
import { useState } from 'react'
import type { Me, Settings as S } from '../../../shared/types'
import type { Nav } from '../App'
import { api } from '../api'
import { haptic, openTelegram } from '../tg'
import { Section, Row, Icon, Switch, toast } from '../ui'

export function Settings({ me, nav, onChange }: { me: Me; nav: Nav; onChange: () => void }) {
  const [s, setS] = useState<S>(me.settings)
  const teacher = me.role === 'teacher'

  const save = async (patch: Partial<S>) => {
    haptic.select()
    const next = { ...s, ...patch }
    setS(next)
    try { setS(await api.settings(patch)); onChange() } catch (e) { toast((e as Error).message); setS(s) }
  }

  const g = me.group
  const invite = () => {
    const link = `https://t.me/${me.bot}?start=g${g?.number}`
    openTelegram(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Домашка группы ${g?.number} — в одном месте. Записал один — видят все 📚`)}`)
  }

  return (
    <div className="page">
      <div className="top"><div className="top-title">Настройки</div></div>

      <Section title="Профиль">
        <Row icon={<Icon name="user" style={{ color: 'var(--accent)' }} />} title={me.name}
          sub={teacher ? `Преподаватель${me.verified ? ' · подтверждён' : ' · на проверке'}` : me.moderator ? 'Староста — может править любые ДЗ группы' : 'Студент'} />
        {teacher
          ? <Row icon={<Icon name="book" style={{ color: 'var(--accent)' }} />} title={me.lecturer?.name ?? ''} sub="Расписание из РУЗ" />
          : <Row icon={<Icon name="users" style={{ color: 'var(--accent)' }} />} title={`Группа ${g?.number ?? '—'}`} sub={[g?.school, g?.course ? `${g.course} курс` : '', `${me.members} в боте`].filter(Boolean).join(' · ')}
              onClick={() => nav.push({ name: 'onboarding' })} end="Сменить" />}
      </Section>

      {!teacher && (
        <Section title="Уведомления в Telegram" note="Приходят от бота в личные сообщения.">
          <Row title="Новые ДЗ группы" sub="Кто-то записал задание" onClick={() => save({ notifyNew: !s.notifyNew })} end={<Switch on={s.notifyNew} />} />
          <Row title="Вечером — что сдавать завтра" sub="Только если что-то не сделано" onClick={() => save({ notifyEvening: !s.notifyEvening })} end={<Switch on={s.notifyEvening} />} />
          {s.notifyEvening && (
            <div className="row">
              <div className="row-main"><div className="row-title">Во сколько</div></div>
              <select value={s.eveningHour} onChange={e => save({ eveningHour: Number(e.target.value) })} style={{ border: 0, background: 'var(--soft)', borderRadius: 8, padding: '6px 10px' }}>
                {[17, 18, 19, 20, 21, 22, 23].map(h => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </div>
          )}
          <Row title="Пару перенесли" sub="Срок ДЗ сдвинулся вслед за парой" onClick={() => save({ notifyShift: !s.notifyShift })} end={<Switch on={s.notifyShift} />} />
        </Section>
      )}

      {!teacher && g && (
        <Section title="Группа" note="Добавь бота в чат группы и напиши там /group — новые ДЗ будут приходить в чат, а записать задание можно прямо оттуда.">
          <Row icon={<Icon name="share" />} title="Позвать ребят" onClick={invite} className="link" />
          <Row icon={<Icon name="users" />} title="Добавить бота в чат группы" onClick={() => openTelegram(`https://t.me/${me.bot}?startgroup=g${g.number}`)} className="link" />
          {me.moderator && <Row icon={<Icon name="trash" />} title="Корзина" sub="Удалённые ДЗ группы — можно вернуть" onClick={() => nav.push({ name: 'trash' })} chevron />}
        </Section>
      )}

      <Section title="О боте" note="Бот хранит ваш Telegram id и имя, группу, записанные ДЗ и отметки «сделано». Расписание — из открытого РУЗ САФУ. Пароли и почта вуза не нужны. Удалить себя — команда /forget в боте.">
        <Row icon={<Icon name="bell" />} title="Открыть чат с ботом" onClick={() => openTelegram(`https://t.me/${me.bot}`)} className="link" />
        <Row icon={<Icon name="alert" />} title="Написать разработчику" sub="Ошибка или идея — @skf29" onClick={() => openTelegram('https://t.me/skf29')} className="link" />
      </Section>
    </div>
  )
}
