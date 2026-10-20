// Оптимизации 19.8: в хранилище — только последние недели пар (прошлое — в архиве), бюджет живого фона со стеклом, запомненная видеокарта
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySchedule } from '../src/lib/schedule'
import { startOfDay } from '../src/lib/date'
import type { RuzEvent } from '../src/lib/ruz'

const DAY = 86_400_000
const ev = (start: number, subject = 'Математика'): RuzEvent =>
  ({ start, end: start + 95 * 60_000, subject, kind: 'Лекции', room: '101', address: '', teacher: '' } as unknown as RuzEvent)

test('в хранилище остаются последние 8 недель и будущее, старое — только если оно уже в архиве', async () => {
  ;(globalThis as any).window ??= globalThis
  const { forStore } = await import('../src/lib/scheduleStore')
  const today = startOfDay(Date.now())
  const old1 = ev(today - 400 * DAY + 9 * 3600_000)
  const old2 = ev(today - 200 * DAY + 9 * 3600_000)
  const recent = ev(today - 10 * DAY + 9 * 3600_000)
  const future = ev(today + 3 * DAY + 9 * 3600_000)
  const d = { ...emptySchedule(), source: 1, ruzGroupNumber: '151621', ruzEvents: [old1, old2, recent, future] }

  // архив неизвестен (режим преподавателя, ошибка записи) — ничего не убираем
  assert.equal(forStore(d, null), d)
  // в архиве только один из старых дней — второй остаётся в хранилище
  const partial = forStore(d, new Set([startOfDay(old1.start)]))
  assert.deepEqual(partial.ruzEvents, [old2, recent, future])
  // оба старых дня в архиве — в хранилище только последние недели и будущее
  const full = forStore(d, new Set([startOfDay(old1.start), startOfDay(old2.start), startOfDay(recent.start)]))
  assert.deepEqual(full.ruzEvents, [recent, future])
  // старого нет — тот же объект (нечего записывать заново)
  const fresh = { ...d, ruzEvents: [recent, future] }
  assert.equal(forStore(fresh, new Set([startOfDay(recent.start)])), fresh)
})

test('стекло на карточках: на встроенной графике фон 30 кадров и стоит при прокрутке, на мощной — как был', async () => {
  const { backdropBudget } = await import('../src/fx/perf')
  assert.deepEqual(backdropBudget('high', true), backdropBudget('high'))
  assert.equal(backdropBudget('mid').fps, 60)
  assert.equal(backdropBudget('mid', true).fps, 30)
  assert.equal(backdropBudget('mid', true).pauseOnScroll, true)
  assert.equal(backdropBudget('low', true).fps, 30)
})

test('видеокарта запоминается: WebGL пробуем, только если её сменили или WebGL раньше не работал', async () => {
  const { gpuFor } = await import('../src/fx/perf')
  const saved = { gpu: 'ANGLE (Intel(R) UHD Graphics 620)', webgl: true, device: '32902:16032' }
  assert.equal(gpuFor(saved, undefined), saved) // запуск: главный процесс ещё не ответил
  assert.equal(gpuFor(saved, ''), saved) // главный процесс не узнал карту
  assert.equal(gpuFor(saved, '32902:16032'), saved)
  assert.equal(gpuFor(saved, '4318:9479'), null) // поставили другую видеокарту
  assert.equal(gpuFor({ ...saved, webgl: false }, '32902:16032'), null)
  assert.equal(gpuFor(null, undefined), null)
})
