// Сквозной тест: настоящий бот и API, ненастоящие Telegram и РУЗ
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Bot } from 'grammy'
import type { Update } from 'grammy/types'
import { DB } from '../server/db'
import { Ruz } from '../server/ruz/client'
import { demoFetcher } from '../server/ruz/demo'
import { Store } from '../server/homework'
import { Hub } from '../server/hub'
import { setupBot, type Ctx } from '../server/bot'
import { createApi } from '../server/api'
import { signInitData } from '../server/auth'
import { fakeTelegram, FAKE_BOT, type Call } from '../server/fake'
import { addDays, startOfDay, endOfDay } from '../shared/dates'
import type { Homework, DueOption } from '../shared/types'

const TOKEN = '123:TEST'

async function setup() {
  const db = new DB(':memory:')
  const ruz = new Ruz(db, demoFetcher, 0)
  const store = new Store(db, ruz, [999])
  const bot = new Bot<Ctx>(TOKEN, { botInfo: FAKE_BOT })
  const calls = fakeTelegram(bot.api)
  const hub = new Hub(store, bot.api, { bot: FAKE_BOT.username, webappUrl: 'https://dz.example.ru', appName: '' })
  hub.log = () => {}
  setupBot(bot, hub)
  let n = 1
  const date = () => Math.floor(Date.now() / 1000)
  const priv = (id: number) => ({ id, type: 'private' as const, first_name: 'U' + id })
  const user = (id: number, name: string) => ({ id, is_bot: false, first_name: name, last_name: 'Тестов' })
  const send = async (from: ReturnType<typeof user>, text: string, chat?: any, extra: any = {}) => {
    const cmd = text.startsWith('/') ? [{ type: 'bot_command' as const, offset: 0, length: text.split(/\s/)[0].length }] : undefined
    await bot.handleUpdate({ update_id: n++, message: { message_id: n, date: date(), chat: chat ?? priv(from.id), from, text, entities: cmd, ...extra } } as Update)
    await settle()
  }
  const press = async (from: ReturnType<typeof user>, data: string, chat?: any) => {
    await bot.handleUpdate({ update_id: n++, callback_query: { id: String(n), from, chat_instance: 'c', data,
      message: { message_id: 1, date: date(), chat: chat ?? priv(from.id), text: '' } } } as Update)
    await settle()
  }
  const settle = async () => { await new Promise(r => setTimeout(r, 15)); await hub.idle() }
  const sent = (chatId: number) => calls.filter(c => c.method === 'sendMessage' && c.payload.chat_id === chatId)
  const lastText = (chatId: number) => sent(chatId).at(-1)?.payload.text as string
  const buttons = (c: Call | undefined): string[] => (c?.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data ?? b.url ?? '')
  return { db, ruz, store, bot, hub, calls, send, press, user, sent, lastText, buttons, settle }
}

test('студенты: регистрация, ДЗ одному — у всей группы, отметки, правка, корзина', async () => {
  const t = await setup()
  const kira = t.user(10, 'Кира'), petya = t.user(11, 'Петя')

  await t.send(kira, '/start')
  assert.match(t.lastText(10), /Кто ты/)
  await t.press(kira, 'reg:s')
  await t.send(kira, '151621')
  assert.match(t.lastText(10), /Ты в группе <b>151621<\/b>/)
  assert.equal(t.store.user(10)!.group_id, '101')

  // второй — по ссылке-приглашению
  await t.send(petya, '/start g151621')
  assert.equal(t.store.user(11)!.group_id, '101')

  // Кира пишет задание как попало — бот сам понимает предмет
  await t.send(kira, 'матан: решить номер 5,6 стр 45')
  const dueMsg = t.sent(10).at(-1)!
  assert.match(dueMsg.payload.text, /Когда сдавать «Математический анализ»/)
  assert.ok(t.buttons(dueMsg).includes('ad:0'))
  await t.press(kira, 'ad:0')
  assert.match(t.lastText(10), /Проверь/)
  assert.match(t.lastText(10), /Решить № 5, 6 стр\. 45/)
  await t.press(kira, 'ok')
  assert.match(t.lastText(10), /Записал!/)

  const [hw] = t.store.upcoming('101')
  assert.equal(hw.subject, 'Математический анализ')
  assert.equal(hw.rule, 'pair')
  assert.ok(hw.due > Date.now())

  // Петя получил карточку в личку
  const card = t.sent(11).at(-1)!
  assert.match(card.payload.text, /Новое ДЗ/)
  assert.match(card.payload.text, /✍️ Кира Т\./)
  assert.ok(t.buttons(card).includes(`d:${hw.id}`))

  // Петя отметил «сделано» — только у себя
  await t.press(petya, `d:${hw.id}`)
  assert.equal(t.store.isDone(11, hw.id), true)
  assert.equal(t.store.isDone(10, hw.id), false)

  // Петя не автор и не староста — править нельзя
  await t.press(petya, `et:${hw.id}`)
  assert.equal(t.calls.at(-1)!.method, 'answerCallbackQuery')
  assert.match(t.calls.at(-1)!.payload.text, /автор или староста/)

  // Кира правит текст — разосланная карточка у Пети обновляется на месте
  await t.press(kira, `et:${hw.id}`)
  await t.send(kira, '№ 5–8')
  assert.equal(t.store.hw(hw.id)!.text, '№ 5–8')
  const edit = t.calls.filter(c => c.method === 'editMessageText' && c.payload.chat_id === 11).at(-1)!
  assert.match(edit.payload.text, /№ 5–8/)
  assert.match(edit.payload.text, /✅/, 'у Пети карточка остаётся отмеченной')

  // удаление — в корзину, с журналом; можно вернуть
  await t.press(kira, `rm:${hw.id}`)
  assert.equal(t.store.upcoming('101').length, 0)
  assert.equal(t.store.trash('101').length, 1)
  await t.press(kira, `ur:${hw.id}`)
  assert.equal(t.store.upcoming('101').length, 1)
  assert.deepEqual(t.store.history(hw.id).map(h => h.action), ['вернул(а)', 'удалил(а)', 'изменил(а)', 'записал(а)'])

  // список с отметками
  await t.send(petya, '/dz')
  assert.match(t.lastText(11), /Домашка 151621/)
  assert.match(t.lastText(11), /✅ <s>Математический анализ<\/s>/)
})

test('чат группы: привязка, ДЗ из чата, пост в чат, вечерняя сводка', async () => {
  const t = await setup()
  const admin = t.user(20, 'Аня'), vasya = t.user(21, 'Вася')
  const chat = { id: -100500, type: 'supergroup' as const, title: '151621 Беседа' }
  await t.bot.handleUpdate({ update_id: 1, my_chat_member: { chat, from: admin, date: 0,
    old_chat_member: { status: 'left', user: FAKE_BOT }, new_chat_member: { status: 'member', user: FAKE_BOT } } } as Update)
  await t.settle()
  assert.match(t.lastText(-100500), /привяжите группу/)

  await t.send(admin, '/group 151621', chat)
  assert.match(t.lastText(-100500), /Чат привязан к группе <b>151621<\/b>/)
  assert.equal(t.store.isModerator(20, '101'), true, 'кто привязал — староста')
  assert.equal(t.store.user(20)!.group_id, '101')

  // ДЗ прямо из чата
  await t.send(vasya, '/add физика: упр 3', chat)
  assert.match(t.lastText(-100500), /Записал/)
  const [h] = t.store.upcoming('101')
  assert.equal(h.subject, 'Физика')
  assert.equal(t.store.user(21)!.group_id, '101', 'написал в чате — значит, из этой группы')

  // ответом на фото доски
  await t.send(vasya, '/add матан', chat, { reply_to_message: { message_id: 5, date: 0, chat, from: admin, caption: 'стр 12, № 1-4', photo: [{ file_id: 'board', file_unique_id: 'b', width: 1, height: 1 }] } })
  const m = t.store.upcoming('101').find(x => x.subject === 'Математический анализ')!
  assert.equal(m.text, 'стр 12, № 1-4')
  assert.deepEqual(JSON.parse(m.photos), ['board'])

  // ДЗ, записанное в личке, уходит в чат группы
  await t.send(admin, 'Ин яз: выучить слова', undefined)
  await t.press(admin, 'ad:0')
  await t.press(admin, 'ok')
  assert.match(t.lastText(-100500), /Новое ДЗ[\s\S]*Иностранный язык/)

  // вечер накануне срока: сводка лично и в чат
  const target = t.store.upcoming('101')[0]
  const evening = new Date(addDays(startOfDay(target.due), -1)); evening.setHours(20, 30)
  t.hub.eveningTick(evening.getTime())
  await t.hub.idle()
  assert.match(t.lastText(20), /На завтра/)
  assert.match(t.lastText(-100500), /На завтра/)
  // второй раз за вечер не шлём
  const before = t.calls.length
  t.hub.eveningTick(evening.getTime() + 600_000)
  await t.hub.idle()
  assert.equal(t.calls.length, before)
})

test('РУЗ перенёс пару — срок едет следом, группе приходит сообщение', async () => {
  const t = await setup()
  const kira = t.user(30, 'Кира'), petya = t.user(31, 'Петя')
  await t.send(kira, '/start g151621')
  await t.send(petya, '/start g151621')
  await t.send(kira, 'Физика: упр 3')
  await t.press(kira, 'ad:0')
  await t.press(kira, 'ok')
  const [h] = t.store.upcoming('101')
  const cached = t.ruz.cached('g:101')!
  // пару, к которой сдавать, переносят на час позже
  const moved = cached.events.map(e => (Math.abs(e.start - h.due) < 60_000 ? { ...e, start: e.start + 3600_000, end: e.end + 3600_000 } : e))
  t.db.run('UPDATE schedules SET events = ?, fetched = ? WHERE owner = ?', JSON.stringify(moved), Date.now(), 'g:101')
  await t.hub.refreshGroup('101')
  await t.hub.idle()
  const n = t.store.hw(h.id)!
  assert.equal(n.due, h.due + 3600_000)
  assert.match(n.shift_note, /Пару перенесли/)
  assert.match(t.lastText(31), /Срок ДЗ сдвинулся/)
})

test('преподаватель: задание на поток — у обеих групп, видно, сколько сделали', async () => {
  const t = await setup()
  const s1 = t.user(40, 'Оля'), s2 = t.user(41, 'Миша'), teacher = t.user(42, 'Анна'), adminUser = t.user(999, 'Админ')
  await t.send(s1, '/start g151621')
  await t.send(s2, '/start g151622')
  await t.send(teacher, '/start')
  await t.press(teacher, 'reg:t')
  // справочник преподавателей наполняется со страниц групп
  await t.ruz.groupSchedule('101')
  await t.send(teacher, 'Яковленкова А.О.')
  assert.match(t.lastText(42), /Здравствуйте/)
  assert.match(t.lastText(999), /Новый преподаватель/, 'админу пришла заявка')
  await t.press(adminUser, 'tv:42:1')
  assert.equal(t.store.user(42)!.verified, 1)

  await t.send(teacher, '➕ Задать ДЗ')
  const pick = t.sent(42).at(-1)!
  assert.ok(t.buttons(pick).includes('ap:0'), 'пары с группами')
  await t.press(teacher, 'ap:0')
  await t.send(teacher, 'Решить вариант 3')
  await t.press(teacher, 'ad:0')
  await t.press(teacher, 'ok')
  const a = t.store.upcoming('101'), b = t.store.upcoming('102')
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.equal(a[0].batch, b[0].batch)
  assert.equal(a[0].author_teacher, 1)
  assert.match(t.lastText(40), /Задание от преподавателя/)
  assert.match(t.lastText(41), /👩‍🏫 от преподавателя/)
  await t.press(s1, `d:${a[0].id}`)
  const dto = t.store.dto(a[0], t.store.user(42)!)
  assert.equal(dto.doneCount, 1)
  assert.equal(dto.memberCount, 2)
  assert.deepEqual(dto.groups, ['151621', '151622'])
  // студент не может править задание преподавателя, даже староста
  t.store.addModerator('101', 40, null)
  assert.equal(t.store.canEdit(t.store.user(40)!, a[0]), false)
})

test('API мини-приложения: вход по подписи Telegram, запись ДЗ, сроки, отметка', async () => {
  const t = await setup()
  const api = createApi(t.hub, { token: TOKEN, dataDir: '/tmp', storageChat: null, devUser: false })
  const auth = (id: number) => 'tma ' + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Лена' }) }, TOKEN)
  const call = async (id: number, method: string, path: string, body?: unknown) => {
    const r = await api.request(path, { method, headers: { authorization: auth(id), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  assert.equal((await api.request('/me')).status, 401, 'без подписи — нельзя')
  assert.equal((await call(50, 'GET', '/me')).body.role, null)
  const groups = await call(50, 'GET', '/groups?q=151621')
  assert.equal(groups.body[0].id, '101')
  await call(50, 'POST', '/register', { role: 'student', groupId: '101' })
  assert.equal((await call(50, 'GET', '/me')).body.group.number, '151621')
  const due = (await call(50, 'GET', '/due?subject=' + encodeURIComponent('Программирование'))).body as { anchor: number; options: DueOption[] }
  const o = due.options[0]
  const created = await call(50, 'POST', '/homework', { subject: 'Программирование', text: 'Лаба 2', due: o.due, rule: o.rule, anchor: due.anchor, skip: o.skip, dueKind: o.kind, dueRoom: o.room })
  assert.equal(created.status, 200)
  const hw = created.body as Homework
  assert.equal(hw.canEdit, true)
  const list = (await call(50, 'GET', '/homework')).body as Homework[]
  assert.equal(list.length, 1)
  assert.equal((await call(50, 'POST', `/homework/${hw.id}/done`, { done: true })).body.done, true)
  assert.equal(((await call(50, 'GET', '/homework')).body as Homework[])[0].done, true)
  // чужая группа не видит
  await call(51, 'POST', '/register', { role: 'student', groupId: '201' })
  assert.equal((await call(51, 'GET', `/homework/${hw.id}`)).status, 404)
  assert.equal((await call(51, 'PATCH', `/homework/${hw.id}`, { text: 'взлом' })).status, 400)
  // пустое задание не записывается
  const bad = await call(50, 'POST', '/homework', { subject: 'Физика', text: '  ', due: endOfDay(Date.now() + 86_400_000), rule: 'date' })
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /Пустое задание/)
  const sched = (await call(50, 'GET', '/schedule?days=14')).body
  assert.ok(sched.length > 0)
  assert.ok(sched.some((s: any) => s.hw === 1), 'у пары видно, что к ней сдавать ДЗ')
})
