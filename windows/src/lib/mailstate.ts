// Какие письма новые (как advance() в MailWatch.swift). Отдельно от проверки — чтобы покрыть тестами.
//
// Помним номер последнего письма, о котором уже знаем. Номера писем на сервере только растут.
// Первый раз (или ящик пересоздан — сменился UIDVALIDITY) — только запоминаем, без потока уведомлений о старом.
// Номер никогда не уменьшаем: раньше пустой ящик (или ни одного непрочитанного в IMAP) сбрасывал его в 0,
// следующее письмо считалось «первой проверкой» — и уведомление о нём молча пропадало.

export type MailBoxState = { lastUID: number; validity: number; inited: boolean }
export type MailSeen = { uid: number; seen: boolean }

export function advanceMail<T extends MailSeen>(st: MailBoxState, messages: T[], maxUID: number, validity: number): { fresh: T[]; next: MailBoxState } {
  const top = Math.max(maxUID, 0, ...messages.map(m => m.uid))
  if (!st.inited || st.validity !== validity) {
    return { fresh: [], next: { lastUID: top, validity, inited: true } }
  }
  const fresh = messages.filter(m => !m.seen && m.uid > st.lastUID).sort((a, b) => a.uid - b.uid).slice(-5)
  return { fresh, next: { lastUID: Math.max(st.lastUID, top), validity, inited: true } }
}
