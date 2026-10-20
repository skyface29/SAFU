// Корзина старосты: удалённые ДЗ группы, которые можно вернуть
import { useEffect, useState } from 'react'
import type { Homework } from '../../../shared/types'
import type { Nav } from '../App'
import { api } from '../api'
import { haptic } from '../tg'
import { Section, Row, Empty, Skeletons, toast } from '../ui'
import { relDay, hm } from '../../../shared/dates'

export function Trash({ nav, onChange }: { nav: Nav; onChange: () => void }) {
  const [list, setList] = useState<Homework[] | null>(null)
  useEffect(() => { api.homework('trash').then(setList).catch(e => { toast(e.message); setList([]) }) }, [])
  const restore = async (h: Homework) => {
    try { await api.restore(h.id); haptic.success(); toast('Вернул'); setList((list ?? []).filter(x => x.id !== h.id)); onChange() } catch (e) { toast((e as Error).message) }
  }
  return (
    <div className="page">
      <div className="top"><div><div className="top-title">Корзина</div><div className="top-sub">Ничего не пропадает: удалённое можно вернуть</div></div></div>
      {list == null ? <Skeletons /> : !list.length ? <Empty emoji="🧺" title="Пусто" /> : (
        <Section>
          {list.map(h => (
            <Row key={h.id} title={h.subject} sub={`${h.text.slice(0, 80)} · удалено ${relDay(h.updated)} ${hm(h.updated)}`} onClick={() => nav.push({ name: 'hw', id: h.id })}
              end={<button className="chip blue" onClick={e => { e.stopPropagation(); void restore(h) }}>Вернуть</button>} />
          ))}
        </Section>
      )}
    </div>
  )
}
