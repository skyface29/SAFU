// Имя видеокарты из WebGL — в своём потоке: на первом запуске интерфейс не ждёт, пока проснётся видеокарта (perf.ts)
let r = { gpu: '', webgl: false }
try {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl') as WebGLRenderingContext | null
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    r = { gpu: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '', webgl: true }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
} catch { /* без WebGL */ }
;(self as unknown as Worker).postMessage(r)
