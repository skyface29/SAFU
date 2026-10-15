import { useProfile } from '../lib/profile'

export function Avatar({ size = 36 }: { size?: number }) {
  const p = useProfile()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center',
      background: p.avatar ? `center/cover url(${p.avatar})` : 'var(--grad)', color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      boxShadow: '0 4px 14px rgba(var(--brand-rgb), .35)'
    }}>
      {!p.avatar && p.initials}
    </div>
  )
}
