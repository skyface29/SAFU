import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { isWidget, safu } from './lib/bridge'

// Если интерфейс упал — не чёрное окно, а понятный экран с кнопками. Ошибка уходит в журнал
// (папка «САФУ\logs» в AppData), по нему видно, что сломалось
function logError(e: unknown) {
  const text = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack || ''}` : String(e)
  try { (safu.app as any).log?.(text) } catch { /* в браузере журнала нет */ }
}

function showFatal(e: unknown) {
  logError(e)
  const root = document.getElementById('root')
  if (!root) return
  const msg = e instanceof Error ? e.message : String(e)
  root.innerHTML = `
    <div style="height:100vh;display:grid;place-items:center;background:#0a0d14;color:#e8ecf4;font-family:'Segoe UI',sans-serif">
      <div style="max-width:440px;padding:28px">
        <div style="font-size:44px">❄️</div>
        <h2 style="margin:8px 0">Что-то сломалось в интерфейсе</h2>
        <p style="opacity:.7;line-height:1.5">Данные (расписание, ДЗ, заметки, пароли) целы. Попробуй по порядку:</p>
        <button data-a="reload" style="all:unset;display:block;margin:8px 0;padding:12px 16px;border-radius:12px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#2973fa,#22d3ee)">Попробовать ещё раз</button>
        <button data-a="reset" style="all:unset;display:block;margin:8px 0;padding:12px 16px;border-radius:12px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.08)">Сбросить открытые сайты и кеш — и открыть</button>
        <button data-a="logs" style="all:unset;display:block;margin:8px 0;padding:12px 16px;border-radius:12px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.08)">Открыть папку с журналом ошибок</button>
        <p style="opacity:.45;font-size:12px;margin-top:14px;word-break:break-word"></p>
      </div>
    </div>`
  const p = root.querySelector('p:last-child')
  if (p) p.textContent = msg
  root.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', () => {
    const a = (b as HTMLElement).dataset.a as 'reload' | 'reset' | 'logs'
    const rec = (safu.app as any).recover
    if (rec) rec(a)
    else location.reload()
  }))
}

class Guard extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { setTimeout(() => showFatal(e), 0) }
  render() { return this.state.failed ? null : this.props.children }
}

window.addEventListener('error', e => logError(e.error || e.message))
window.addEventListener('unhandledrejection', e => logError(e.reason))

async function boot() {
  const root = createRoot(document.getElementById('root')!)
  if (isWidget) {
    document.body.classList.add('widget-body')
    const { Widget } = await import('./Widget')
    root.render(<Widget />)
  } else {
    const { default: App } = await import('./App')
    root.render(<React.StrictMode><Guard><App /></Guard></React.StrictMode>)
  }
}
// ошибка уже при загрузке модулей (до первой отрисовки) — тоже экран с кнопками, а не пустота
boot().catch(showFatal)
