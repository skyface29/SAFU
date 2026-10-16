// Модули, которые создают хранилища прямо при загрузке, должны загружаться без ошибок:
// ошибка порядка объявлений в одном из них роняла всё окно (оставался пустой фон)
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('слой сайтов загружается и поднимает сохранённые вкладки', async () => {
  ;(globalThis as any).window ??= globalThis
  localStorage.setItem('safu.kv', JSON.stringify({ 'sites.saved.v1': { at: Date.now(), tabs: [{ kind: 'site', title: 'Sakai', url: 'https://sakai.narfu.ru', icon: 'graduationcap.fill' }] } }))
  const { useSites } = await import('../src/sites/sites')
  const tabs = useSites.getState().tabs
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].title, 'Sakai')
  assert.equal(tabs[0].dormant, true)
})
