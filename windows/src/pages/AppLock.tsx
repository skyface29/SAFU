// Вход по PIN-коду (на iPhone — Face ID) и шторка, когда окно не в фокусе
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Delete, Snowflake } from 'lucide-react'
import { kv, usePref } from '../lib/kv'
import { safu } from '../lib/bridge'

export async function hashPin(pin: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('safu:' + pin))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const useLock = create<{ locked: boolean }>(() => ({ locked: false }))
let hiddenAt = 0

export const appLock = {
  enabled: () => kv.get('lock.enabled', false) && !!kv.get('lock.pin', ''),
  lockOnStart() {
    if (appLock.enabled()) useLock.setState({ locked: true })
    safu.app.on('app:visible', (v: boolean) => {
      if (!v) hiddenAt = Date.now()
      else if (appLock.enabled() && hiddenAt && Date.now() - hiddenAt > kv.get('lock.after', 1) * 60_000) useLock.setState({ locked: true })
    })
    safu.app.on('app:locked', () => { if (appLock.enabled()) useLock.setState({ locked: true }) })
  },
  lock() { if (appLock.enabled()) useLock.setState({ locked: true }) }
}

export function LockGate() {
  const locked = useLock(s => s.locked)
  const [shieldOn] = usePref('privacy.shield', false)
  const [blurred, setBlurred] = useState(false)
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(0)
  useEffect(() => safu.app.on('app:focus', (f: boolean) => setBlurred(!f)), [])

  const press = async (d: string) => {
    const next = (pin + d).slice(0, 8)
    setPin(next)
    if (next.length >= 4 && (await hashPin(next)) === kv.get('lock.pin', '')) {
      setTimeout(() => { useLock.setState({ locked: false }); setPin('') }, 120)
    } else if (next.length >= 8) { setShake(s => s + 1); setPin('') }
  }
  useEffect(() => {
    if (!locked) return
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
      if (e.key === 'Enter' && pin.length >= 4) { setShake(s => s + 1); setPin('') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [locked, pin])

  return (
    <AnimatePresence>
      {locked ? (
        <motion.div key="lock" style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'grid', placeItems: 'center', background: 'rgba(5,8,14,.75)', backdropFilter: 'blur(40px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
          <div className="col" style={{ alignItems: 'center', gap: 18, color: '#fff' }}>
            <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.6 }} className="icon-tile" style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--grad)' }}><Lock size={32} /></motion.div>
            <div className="h-card">Введи PIN-код САФУ</div>
            <motion.div className="row" key={shake} animate={shake ? { x: [0, -14, 14, -10, 10, 0] } : {}} transition={{ duration: 0.4 }} style={{ gap: 14, height: 18 }}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <motion.div key={i} animate={{ scale: i < pin.length ? 1.15 : 1 }} style={{ width: 14, height: 14, borderRadius: 7, border: '2px solid #fff', background: i < pin.length ? '#fff' : 'transparent' }} />
              ))}
            </motion.div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 72px)', gap: 14, marginTop: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d ? (
                <motion.button key={i} whileTap={{ scale: 0.88 }} onClick={() => d === '⌫' ? setPin(p => p.slice(0, -1)) : press(d)}
                  style={{ width: 72, height: 72, borderRadius: 36, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 26, fontWeight: 600, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  {d === '⌫' ? <Delete size={24} /> : d}
                </motion.button>
              ) : <div key={i} />)}
            </div>
            <div className="tiny" style={{ opacity: 0.6 }}>Можно набирать с клавиатуры</div>
          </div>
        </motion.div>
      ) : shieldOn && blurred ? (
        <motion.div key="shield" style={{ position: 'fixed', inset: 0, zIndex: 940, display: 'grid', placeItems: 'center', background: 'var(--glass-strong)', backdropFilter: 'blur(50px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="col" style={{ alignItems: 'center', gap: 10 }}><Snowflake size={52} color="var(--brand)" /><div className="h-card">САФУ</div></div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
