import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { isWidget } from './lib/bridge'

async function boot() {
  const root = createRoot(document.getElementById('root')!)
  if (isWidget) {
    document.body.classList.add('widget-body')
    const { Widget } = await import('./Widget')
    root.render(<Widget />)
  } else {
    const { default: App } = await import('./App')
    root.render(<React.StrictMode><App /></React.StrictMode>)
  }
}
boot()
