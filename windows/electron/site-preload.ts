// Скрипт внутри сайтов университета (webview): находит поля логина и пароля,
// подставляет сохранённые и сообщает приложению, что ввёл пользователь.
import { ipcRenderer } from 'electron'

type Fields = { u: HTMLInputElement | null; p: HTMLInputElement; form: HTMLFormElement | null }

const visible = (el: Element | null) => !!(el && ((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || el.getClientRects().length))

function fields(): Fields | null {
  const ps = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(visible)
  if (!ps.length) return null
  const p = ps[0]
  const scope: ParentNode = p.form || document
  const all = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).filter(i => {
    const t = (i.getAttribute('type') || 'text').toLowerCase()
    return (t === 'text' || t === 'email' || t === 'tel') && visible(i)
  })
  let u: HTMLInputElement | null = null
  for (const i of all) if (i.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) u = i
  if (!u && all.length) u = all[0]
  return { u, p, form: p.form }
}

function setVal(el: HTMLInputElement | null, v: string) {
  if (!el) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
}

ipcRenderer.on('safu:fill', (_e, user: string, pass: string, submit: boolean) => {
  const f = fields()
  if (!f) return
  if (f.u && user) setVal(f.u, user)
  setVal(f.p, pass)
  if (submit) {
    setTimeout(() => {
      const scope: ParentNode = f.form || document
      const b = scope.querySelector<HTMLElement>('#submitButton, button[type="submit"], input[type="submit"], button:not([type]), [role="button"], .login-button, .btn-login')
      if (b) b.click()
      else if (f.form) f.form.submit()
      else f.p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    }, 400)
  }
})

// тёмная тема для сайтов, у которых её нет (по просьбе из меню карточки)
ipcRenderer.on('safu:dark', (_e, on: boolean) => {
  const id = '__safu_dark'
  document.getElementById(id)?.remove()
  if (!on) return
  const s = document.createElement('style')
  s.id = id
  s.textContent = 'html{filter:invert(.92) hue-rotate(180deg)!important;background:#fff}img,video,picture,canvas,iframe,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}'
  document.documentElement.appendChild(s)
})

function capture() {
  const f = fields()
  if (!f || !f.p.value) return
  ipcRenderer.sendToHost('safu:creds', { host: location.host, user: f.u ? f.u.value : '', pass: f.p.value })
}

let hadForm = false
function check() {
  const has = !!fields()
  if (has && !hadForm) ipcRenderer.sendToHost('safu:form', { host: location.host })
  if (!has && hadForm) ipcRenderer.sendToHost('safu:gone', { host: location.host })
  hadForm = has
}

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('submit', capture, true)
  document.addEventListener('change', e => { if ((e.target as HTMLInputElement)?.type === 'password') capture() }, true)
  document.addEventListener('input', e => { if ((e.target as HTMLInputElement)?.type === 'password') capture() }, true)
  document.addEventListener('click', () => { if (fields()) capture() }, true)
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && fields()) capture() }, true)
  check()
  let timer: number | null = null
  new MutationObserver(() => {
    if (timer) return
    timer = window.setTimeout(() => { timer = null; check() }, 400)
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
  window.addEventListener('load', check)
  setTimeout(check, 1500)
  setTimeout(check, 4000)
})
