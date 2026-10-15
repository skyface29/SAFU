// Конспект лекции через Claude API (официальный SDK). Ключ пользователь вводит в настройках лекций,
// он хранится зашифрованным и используется только здесь, в главном процессе.
import Anthropic from '@anthropic-ai/sdk'

export type SummaryRequest = { apiKey: string; subject: string; minutes: number; style: string; transcript: string }

const SYSTEM = `Ты делаешь конспект университетской лекции для студента САФУ по автоматической расшифровке речи.
В расшифровке бывают ошибки распознавания — по смыслу исправляй искажённые термины, фамилии и формулы.
Фрагменты с пометкой [ВАЖНО] студент отметил во время лекции: их обязательно отрази в конспекте.
Ничего не выдумывай: только то, что было в лекции. Пиши по-русски, ясно и по делу.
Поля: title — тема лекции; summary — 3–5 предложений о чём лекция; keyPoints — главные мысли;
sections — разделы лекции с пунктами; terms — определения; formulas — формулы в текстовом виде;
questions — что вероятно спросят на зачёте/экзамене; tasks — задания, сроки, что подготовить (если звучали).
Пустые списки — нормально, если такого в лекции не было.`

const str = { type: 'string' }
const strs = { type: 'array', items: str }
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'keyPoints', 'sections', 'terms', 'formulas', 'questions', 'tasks'],
  properties: {
    title: str, summary: str, keyPoints: strs,
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'points'], properties: { heading: str, points: strs } } },
    terms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['term', 'definition'], properties: { term: str, definition: str } } },
    formulas: strs, questions: strs, tasks: strs
  }
}

export async function summarizeLecture(r: SummaryRequest) {
  const client = new Anthropic({ apiKey: r.apiKey })
  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      // при отказе модели запрос сам перезапустится на подходящей модели
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Предмет: ${r.subject || 'не указан'}\nДлительность: ${r.minutes} мин\n${r.style}\n\n<расшифровка>\n${r.transcript}\n</расшифровка>`
      }]
    } as any)
    const msg: any = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') return { ok: false, error: 'Claude отказался делать конспект по этой записи' }
    if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'Конспект не поместился — попробуй стиль «Шпаргалка»' }
    const text = (msg.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
    return { ok: true, summary: JSON.parse(text) }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Неверный ключ Claude API' }
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: 'Слишком много запросов — попробуй через минуту' }
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Нет связи с Claude API (из России может понадобиться VPN)' }
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Claude API ответил ${e.status}: ${e.message.slice(0, 200)}` }
    return { ok: false, error: 'Не удалось разобрать ответ ИИ' }
  }
}
