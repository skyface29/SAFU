// Скачивание с сайтов: курс Sakai → папка предмета, адрес файла, поиск файлов на странице
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestSubject, looksLikeFile, FIND_FILES_SCRIPT, pageFileName } from '../src/lib/downloads'

const SUBJECTS = ['Математический анализ', 'Физика', 'Иностранный язык', 'Введение в специальность', 'Физическая культура и спорт']

test('курс Sakai узнаётся по заголовку страницы', () => {
  assert.equal(bestSubject('Sakai : Математический анализ : Ресурсы', SUBJECTS), 'Математический анализ')
  assert.equal(bestSubject('Sakai : 2026 Матанализ ИБ : Уроки', SUBJECTS), null)
  assert.equal(bestSubject('Sakai : Математика (анализ) 151621 : Ресурсы', SUBJECTS), 'Математический анализ')
  assert.equal(bestSubject('Sakai : Физика : Ресурсы', SUBJECTS), 'Физика')
  assert.equal(bestSubject('Sakai : Главная', SUBJECTS), null)
  assert.equal(bestSubject('', SUBJECTS), null)
})

test('адрес файла отличается от адреса страницы', () => {
  assert.equal(looksLikeFile('https://sakai.narfu.ru/access/content/group/abc/Лекция 1.pdf'), true)
  assert.equal(looksLikeFile('https://sakai.narfu.ru/access/content/group/abc/book.DJVU?x=1'), true)
  assert.equal(looksLikeFile('https://sakai.narfu.ru/portal/site/abc/tool/xyz'), false)
  assert.equal(looksLikeFile('не адрес'), false)
})

test('скрипт поиска файлов — корректный JavaScript, имена понятные', () => {
  assert.doesNotThrow(() => new Function(`return ${FIND_FILES_SCRIPT}`))
  assert.equal(pageFileName({ u: 'https://x.ru/a/%D0%9B%D0%B5%D0%BA%D1%86%D0%B8%D1%8F.pdf', t: '' }), 'Лекция.pdf')
  assert.equal(pageFileName({ u: 'https://x.ru/a/1.pdf', t: 'Учебник' }), 'Учебник')
})
