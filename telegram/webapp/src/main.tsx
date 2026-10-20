import { createRoot } from 'react-dom/client'
import { App } from './App'
import { init } from './tg'
import './styles.css'

init()
createRoot(document.getElementById('root')!).render(<App />)
