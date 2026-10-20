// Преподаватель: свои задания (сколько студентов уже сделали) и пары, к которым задать ДЗ
import { useState } from 'react'
import type { Me, Homework } from '../../../shared/types'
import type { Nav } from '../App'
import { haptic } from '../tg'
import { Section, Icon, Empty, Skeletons } from '../ui'
import { HwRow } from './Home'
import { Schedule } from './Schedule'

export function Teacher({ me, nav, list }: { me: Me; nav: Nav; list: Homework[] | null; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<'hw' | 'pairs'>('pairs')
  return (
    <div className="page">
      <div className="top">
        <div>
          <div className="top-title">{me.lecturer?.name ?? 'Преподаватель'}</div>
          <div className="top-sub">{me.verified ? 'Задания с отметкой «от преподавателя»' : 'Профиль на проверке — задания видны студентам уже сейчас'}</div>
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => nav.push({ name: 'settings' })} aria-label="Настройки"><Icon name="gear" /></button>
      </div>
      <div className="seg">
        <button className={tab === 'pairs' ? 'on' : ''} onClick={() => { haptic.select(); setTab('pairs') }}>Пары</button>
        <button className={tab === 'hw' ? 'on' : ''} onClick={() => { haptic.select(); setTab('hw') }}>Мои задания{list?.length ? ` · ${list.length}` : ''}</button>
      </div>
      {tab === 'pairs' && <Schedule me={me} nav={nav} />}
      {tab === 'hw' && (list == null ? <Skeletons /> : !list.length
        ? <Empty emoji="📝" title="Заданий пока нет" text="Нажмите на пару во вкладке «Пары» — и задание появится у всех студентов её групп." />
        : <Section title="Задано" count={list.length}>{list.map(h => <HwRow key={h.id} h={h} nav={nav} teacher />)}</Section>)}
      <button className="fab" onClick={() => { haptic.tap(); nav.push({ name: 'edit' }) }}><Icon name="plus" />Задать ДЗ</button>
    </div>
  )
}
