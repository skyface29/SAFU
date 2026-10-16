// Фото к ДЗ с iPhone прикрепляются к тому же ДЗ на компьютере
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachHomeworkPhoto } from '../src/lib/sync'
import { homeworkStore } from '../src/lib/homework'

test('фото с телефона прикрепляется к своему ДЗ один раз', () => {
  const id = '0F8FAD5B-D9CB-469F-A165-70867728950E'
  homeworkStore.set([{ id, subject: 'Физика', text: 'задача', photos: [] } as any])
  const rel = `ДЗ с iPhone/${id.toLowerCase()}/1.jpg`
  assert.equal(attachHomeworkPhoto(rel), true)
  assert.equal(attachHomeworkPhoto(rel), false)
  assert.deepEqual(homeworkStore.get()[0].photos, [rel])
  assert.equal(attachHomeworkPhoto('Предметы/Физика/файл.pdf'), false)
  assert.equal(attachHomeworkPhoto('ДЗ с iPhone/11111111-1111-1111-1111-111111111111/2.jpg'), false)
})
