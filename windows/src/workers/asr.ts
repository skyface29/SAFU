// Расшифровка речи на компьютере (Whisper через transformers.js). Модель скачивается один раз (~150 МБ) и кешируется.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
let asr: any = null

self.onmessage = async (e: MessageEvent) => {
  const { audio, model } = e.data as { audio: Float32Array; model: string }
  try {
    if (!asr) {
      asr = await pipeline('automatic-speech-recognition', model || 'onnx-community/whisper-base', {
        progress_callback: (p: any) => { if (p.status === 'progress') (self as any).postMessage({ type: 'download', file: p.file, progress: p.progress }) }
      } as any)
    }
    ;(self as any).postMessage({ type: 'stage', text: 'Распознаю речь…' })
    const out = await asr(audio, { language: 'russian', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true })
    ;(self as any).postMessage({ type: 'done', out })
  } catch (err) {
    ;(self as any).postMessage({ type: 'error', error: String((err as Error)?.message || err) })
  }
}
