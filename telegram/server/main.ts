// Запуск: бот + API мини-приложения + раздача мини-приложения + фоновые задачи. Всё в одном процессе.
process.env.TZ ||= 'Europe/Moscow'

import { Bot, webhookCallback } from 'grammy'
import { autoRetry } from '@grammyjs/auto-retry'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { readFile, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { DB } from './db'
import { Ruz, netFetcher } from './ruz/client'
import { demoFetcher } from './ruz/demo'
import { Store } from './homework'
import { Hub } from './hub'
import { setupBot, setCommands, type Ctx } from './bot'
import { createApi } from './api'
import { fakeTelegram, FAKE_BOT } from './fake'

const env = process.env
const DEMO = env.DEMO === '1'
const token = env.BOT_TOKEN ?? (DEMO ? '0:demo' : '')
if (!token) {
  console.error('Нужен BOT_TOKEN — токен бота от @BotFather (см. telegram/README.md). Для пробы без Telegram: npm run demo')
  process.exit(1)
}
const port = Number(env.PORT ?? 8080)
const dataDir = env.DATA_DIR ?? join(process.cwd(), 'data')
const webappUrl = (env.WEBAPP_URL ?? (DEMO ? `http://localhost:${port}` : '')).replace(/\/$/, '')
const admins = (env.ADMIN_IDS ?? '').split(/[\s,]+/).map(Number).filter(Boolean)

const db = new DB(join(dataDir, 'arktika-bot.sqlite'))
const ruz = new Ruz(db, DEMO ? demoFetcher : netFetcher, DEMO ? 0 : Number(env.RUZ_GAP_MS ?? 350))
const store = new Store(db, ruz, admins)

const bot = new Bot<Ctx>(token, DEMO ? { botInfo: FAKE_BOT } : {})
if (DEMO) fakeTelegram(bot.api, true)
else bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 120 }))
await bot.init()

// мини-приложение — только по настоящему https-адресу с доменом («https://» без домена из пустого DOMAIN не годится)
const httpsUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.includes('.') } catch { return false } }
const hub = new Hub(store, bot.api, { bot: bot.botInfo.username, webappUrl: DEMO || httpsUrl(webappUrl) ? webappUrl : '', appName: env.APP_NAME ?? '' })
setupBot(bot, hub)

// ---------- HTTP: API, мини-приложение, вебхук ----------

const app = new Hono()
app.get('/health', c => c.json({ ok: true, ...store.stats() }))
app.route('/api', createApi(hub, {
  token, dataDir, devUser: env.DEV_USER === '1',
  storageChat: env.STORAGE_CHAT_ID ? Number(env.STORAGE_CHAT_ID) : null
}))

const useWebhook = env.WEBHOOK === '1' && hub.cfg.webappUrl.startsWith('https://')
const hookSecret = env.WEBHOOK_SECRET || randomBytes(16).toString('hex')
if (useWebhook) app.post('/tg', webhookCallback(bot, 'hono', { secretToken: hookSecret }))

const webDir = join(dirname(fileURLToPath(import.meta.url)), 'webapp')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp'
}
app.get('*', async c => {
  const rel = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '')
  let file = join(webDir, rel)
  if (!rel || !existsSync(file) || !extname(file)) file = join(webDir, 'index.html')
  try {
    const body = await readFile(file)
    const immutable = file.includes(`${join(webDir, 'assets')}`)
    return c.body(new Uint8Array(body), 200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    })
  } catch {
    return c.text('Мини-приложение не собрано: npm run build', 404)
  }
})

serve({ fetch: app.fetch, port })
console.log(`Арктика · ДЗ: @${hub.cfg.bot}, http://localhost:${port}${hub.cfg.webappUrl ? `, мини-приложение ${hub.cfg.webappUrl}` : ' (без мини-приложения: нет WEBAPP_URL с https)'}${DEMO ? ' — ДЕМО' : ''}`)

if (!DEMO) {
  await setCommands(bot).catch(e => hub.log('команды', e))
  if (hub.cfg.webappUrl) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'ДЗ', web_app: { url: hub.webapp('/') } } }).catch(e => hub.log('кнопка меню', e))
  }
  if (useWebhook) {
    await bot.api.setWebhook(`${hub.cfg.webappUrl}/tg`, { secret_token: hookSecret, allowed_updates: ['message', 'callback_query', 'my_chat_member'], drop_pending_updates: false })
  } else {
    await bot.api.deleteWebhook().catch(() => {})
    void bot.start({ allowed_updates: ['message', 'callback_query', 'my_chat_member'], onStart: () => console.log('Бот слушает Telegram (long polling)') })
  }
}

// ---------- фоновые задачи ----------

const every = (ms: number, name: string, fn: () => Promise<unknown> | unknown) => {
  let busy = false
  const run = async () => {
    if (busy) return
    busy = true
    try { await fn() } catch (e) { hub.log(name, e) } finally { busy = false }
  }
  setInterval(run, ms).unref()
  setTimeout(run, 5_000).unref()
}

// вечерние сводки «что сдавать завтра»
every(5 * 60_000, 'вечер', () => hub.eveningTick())

// справочник групп всего вуза — раз в неделю (и при первом запуске)
every(6 * 3600_000, 'справочник', async () => {
  const at = db.kvGet<number>('directory.at', 0)
  if (Date.now() - at > 7 * 86_400_000) console.log(`Справочник РУЗ: ${await ruz.refreshDirectory()} групп`)
})

// расписания групп, где кто-то есть: сроки «к паре» едут за переносами
every(20 * 60_000, 'расписания', async () => {
  const groups = store.activeGroups()
  const stale = groups.map(g => ({ g, at: ruz.cached(`g:${g}`)?.fetched ?? 0 })).filter(x => Date.now() - x.at > 4 * 3600_000).sort((a, b) => a.at - b.at)
  for (const { g } of stale.slice(0, 60)) await hub.refreshGroup(g, 4 * 3600_000)
})

// ночью — обход страниц групп, чтобы знать всех преподавателей вуза
if (env.CRAWL !== '0') {
  every(30 * 60_000, 'преподаватели', async () => {
    // пока справочник почти пуст (первые дни) — и днём, иначе преподавателям некого найти
    const h = new Date().getHours()
    if ((h >= 2 && h < 6) || ruz.lecturerCount() < 300) await ruz.crawlLecturers(DEMO ? 10 : 150)
  })
}

// резервная копия базы раз в сутки (последние 14 дней) — память группы не потеряется
every(3600_000, 'копия', async () => {
  const day = new Date().toISOString().slice(0, 10)
  const dir = join(dataDir, 'backups')
  const file = join(dir, `arktika-bot-${day}.sqlite`)
  if (existsSync(file)) return
  await mkdir(dir, { recursive: true })
  db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const old = (await readdir(dir)).filter(f => f.endsWith('.sqlite')).sort().slice(0, -14)
  for (const f of old) await rm(join(dir, f)).catch(() => {})
})

const stop = async () => { await bot.stop().catch(() => {}); db.close(); process.exit(0) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
