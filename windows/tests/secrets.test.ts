// Пароли в резервной копии шифруются паролем копии; сохранённый пароль подставляется только своему сайту
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sealSecrets, openSecrets } from '../src/lib/backup'
import { creds, useCreds } from '../src/lib/creds'

test('пароли в копии: открываются только паролем копии, открытого текста в файле нет', async () => {
  const secrets = { 'cred:sakai.narfu.ru': JSON.stringify({ host: 'sakai.narfu.ru', user: 'student', pass: 'Секрет-123' }) }
  const sealed = await sealSecrets(secrets, 'пароль-копии')
  const file = JSON.stringify(sealed)
  assert.ok(!file.includes('Секрет-123') && !file.includes('student') && !file.includes('sakai'))
  assert.deepEqual(await openSecrets(sealed, 'пароль-копии'), secrets)
  await assert.rejects(openSecrets(sealed, 'не тот пароль'))
  await assert.rejects(openSecrets({ ...sealed, iter: 1 }, 'пароль-копии'))
  // одна и та же копия дважды шифруется по-разному (своя соль и nonce)
  const again = await sealSecrets(secrets, 'пароль-копии')
  assert.notEqual(again.data, sealed.data)
})

test('сохранённый пароль подставляется только своему сайту, общий вход — только на сайтах САФУ', () => {
  const c = (host: string) => ({ host, user: 'u', pass: 'p', saved: 0 })
  useCreds.setState({ list: [c('sakai.narfu.ru'), c('a.github.io')] })
  assert.equal(creds.get('sakai.narfu.ru')?.host, 'sakai.narfu.ru')
  assert.equal(creds.get('SAKAI.narfu.ru')?.host, 'sakai.narfu.ru')
  assert.equal(creds.get('narfu.ru')?.host, 'sakai.narfu.ru')
  assert.equal(creds.get('evilnarfu.ru'), null)
  assert.equal(creds.get('narfu.ru.evil.com'), null)
  assert.equal(creds.get('a.github.io')?.host, 'a.github.io')
  assert.equal(creds.get('b.github.io'), null)
  assert.equal(creds.get('github.io'), null)
  assert.equal(creds.get('x.a.github.io'), null)
})
