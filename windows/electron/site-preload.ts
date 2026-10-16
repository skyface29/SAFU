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
      // «Войти»: сначала настоящая кнопка отправки формы, потом кнопка со словом «Войти»/«Вход»,
      // и только потом отправка формы или Enter (а не первая попавшаяся кнопка — например, «показать пароль»)
      const scope: ParentNode = f.form || document
      const byText = Array.from(scope.querySelectorAll<HTMLElement>('button, input[type="button"], a[role="button"], [role="button"]'))
        .find(el => visible(el) && /войти|вход|log\s?in|sign\s?in|submit/i.test((el.textContent || (el as HTMLInputElement).value || '').trim()))
      const b = scope.querySelector<HTMLElement>('#submitButton, button[type="submit"], input[type="submit"], .login-button, .btn-login') || byText
      if (b && visible(b)) b.click()
      else if (f.form) { if (typeof f.form.requestSubmit === 'function') f.form.requestSubmit(); else f.form.submit() }
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
  // страницу не видно (свёрнута) — форму входа не ищем: на «живых» сайтах это пересчитывало раскладку
  // всей страницы несколько раз в секунду и в свёрнутых вкладках тоже
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
  new MutationObserver(() => {
    if (timer || document.hidden) return
    timer = window.setTimeout(() => { timer = null; check() }, 700)
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
  window.addEventListener('load', check)
  // затишье после прокрутки, кликов и ввода — приложение снимает страницу заранее, чтобы
  // сворачивать карточку мгновенно, с готовым снимком
  let idle: number | null = null
  const activity = () => {
    if (idle) clearTimeout(idle)
    idle = window.setTimeout(() => { idle = null; if (!document.hidden) ipcRenderer.sendToHost('safu:idle') }, 700)
  }
  for (const ev of ['scroll', 'wheel', 'keyup', 'click', 'input']) window.addEventListener(ev, activity, { passive: true, capture: true })
  window.addEventListener('load', activity)
  setTimeout(check, 1500)
  setTimeout(check, 4000)
})
