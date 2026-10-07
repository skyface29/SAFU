// Короткая инструкция после первой регистрации (один раз)
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { kv, usePref } from '../lib/kv'

const STEPS = [
  { emoji: '🏠', title: 'Главная', text: 'Текущая пара с таймером, ДЗ, погода и сайты вуза одной кнопкой.' },
  { emoji: '🌐', title: 'Сайты как мини-приложения', text: 'Sakai, почта и личный кабинет открываются карточкой. Esc или тяни вниз — свернуть, вернёшься на ту же страницу.' },
  { emoji: '🔎', title: 'Ctrl + K', text: 'Быстрый поиск по всему: предметы, ДЗ, сайты, инструменты. Ctrl+N — записать ДЗ.' },
  { emoji: '🕒', title: 'Трей и мини-окно', text: 'Закрыл окно — САФУ остаётся у часов и напоминает о парах. Мини-окно пары висит поверх всех окон.' },
  { emoji: '🎨', title: 'Оформление', text: 'Профиль → Оформление: 25 цветов, живые фоны, стили карточек, шрифты.' }
]

export function Tour() {
  const [onboarded] = usePref('onboarded', false)
  const [seen, setSeen] = usePref('tour.seen', false)
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  useEffect(() => { if (onboarded && !seen) { const t = setTimeout(() => setShow(true), 1800); return () => clearTimeout(t) } }, [onboarded, seen])
  const close = () => { setShow(false); setSeen(true) }
  const s = STEPS[i]
  return (
    <AnimatePresence>
      {show && (
        <div className="overlay">
          <motion.div className="overlay-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div className="sheet" style={{ width: 460, padding: 28, textAlign: 'center' }} initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
                <motion.div style={{ fontSize: '4rem' }} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>{s.emoji}</motion.div>
                <div className="h-card mt12" style={{ fontSize: '1.4rem' }}>{s.title}</div>
                <div className="muted mt8" style={{ lineHeight: 1.5 }}>{s.text}</div>
              </motion.div>
            </AnimatePresence>
            <div className="row" style={{ justifyContent: 'center', gap: 6, margin: '22px 0' }}>
              {STEPS.map((_, j) => <motion.div key={j} animate={{ width: j === i ? 22 : 7 }} style={{ height: 7, borderRadius: 4, background: j === i ? 'var(--brand)' : 'var(--fill2)' }} />)}
            </div>
            <div className="row">
              <button className="btn ghost grow" onClick={close}>Пропустить</button>
              <button className="btn primary grow" onClick={() => i < STEPS.length - 1 ? setI(i + 1) : close()}>{i < STEPS.length - 1 ? 'Дальше' : 'Понятно'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
void kv
