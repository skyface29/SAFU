// Запросы к серверу бота: каждый подписан initData от Telegram
import { initData } from './tg'
import type { Me, Homework, HomeworkInput, GroupInfo, LecturerInfo, Slot, DueOption, Settings, HistoryItem } from '../../shared/types'

export class ApiError extends Error {}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { authorization: `tma ${initData()}` }
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
  let r: Response
  try { r = await fetch(`/api${path}`, { method, headers, body: payload }) } catch { throw new ApiError('Нет связи с сервером') }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError((data as { error?: string }).error ?? `Ошибка ${r.status}`)
  return data as T
}

const q = encodeURIComponent

export const api = {
  me: () => req<Me>('GET', '/me'),
  register: (b: { role: 'student'; groupId: string } | { role: 'teacher'; lecturerId: string }) => req<{ ok: true }>('POST', '/register', b),
  settings: (s: Partial<Settings>) => req<Settings>('PATCH', '/settings', s),
  groups: (query: string) => req<GroupInfo[]>('GET', `/groups?q=${q(query)}`),
  schools: () => req<{ id: number; name: string }[]>('GET', '/schools'),
  schoolGroups: (id: number) => req<GroupInfo[]>('GET', `/schools/${id}/groups`),
  lecturers: (query: string) => req<LecturerInfo[]>('GET', `/lecturers?q=${q(query)}`),
  schedule: (offset = 0, days = 7) => req<Slot[]>('GET', `/schedule?offset=${offset}&days=${days}`),
  subjects: (groups: string[] = []) => req<{ subject: string; kind: string; recent: boolean }[]>('GET', `/subjects?groups=${q(groups.join(','))}`),
  due: (subject: string, groups: string[] = [], anchor?: number, kind?: string) =>
    req<{ anchor: number; kind: string; options: DueOption[] }>('GET', `/due?subject=${q(subject)}&groups=${q(groups.join(','))}${anchor ? `&anchor=${anchor}` : ''}${kind ? `&kind=${q(kind)}` : ''}`),
  teacherPairs: () => req<Slot[]>('GET', '/teacher/pairs'),
  homework: (scope: 'up' | 'archive' | 'trash' = 'up') => req<Homework[]>('GET', `/homework?scope=${scope}`),
  item: (id: number) => req<{ hw: Homework; history: HistoryItem[] }>('GET', `/homework/${id}`),
  create: (b: HomeworkInput) => req<Homework>('POST', '/homework', b),
  update: (id: number, b: Partial<HomeworkInput>) => req<Homework>('PATCH', `/homework/${id}`, b),
  remove: (id: number) => req<Homework>('DELETE', `/homework/${id}`),
  restore: (id: number) => req<Homework>('POST', `/homework/${id}/restore`),
  done: (id: number, done: boolean) => req<{ done: boolean }>('POST', `/homework/${id}/done`, { done }),
  addPhoto: (id: number, file: Blob) => { const f = new FormData(); f.append('photo', file, 'photo.jpg'); return req<Homework>('POST', `/homework/${id}/photos`, f) },
  removePhoto: (id: number, index: number) => req<Homework>('DELETE', `/homework/${id}/photos/${index}`)
}

const photoCache = new Map<string, Promise<string>>()

/** Фото — через сервер (картинке нельзя передать подпись в заголовке, поэтому качаем и показываем blob) */
export function photoURL(ref: string): Promise<string> {
  let p = photoCache.get(ref)
  if (!p) {
    p = fetch(`/api/photo/${ref}`, { headers: { authorization: `tma ${initData()}` } })
      .then(r => { if (!r.ok) throw new ApiError('Нет фото'); return r.blob() })
      .then(b => URL.createObjectURL(b))
    p.catch(() => photoCache.delete(ref))
    photoCache.set(ref, p)
  }
  return p
}

/** Сжать фото перед отправкой: длинная сторона до 2000 px, JPEG */
export async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.85))
  } catch { return file }
}
