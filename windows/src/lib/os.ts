// На какой системе запущена Арктика: от неё зависят тексты про автозапуск, трей, брандмауэр и пароли,
// а на Linux ещё и миниатюры фото (системных, как у Проводника, там нет)

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
export const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua)
export const OS = isLinux ? 'Linux' : 'Windows'

/** Чем зашифрованы пароли — для подписей в настройках */
export const VAULT = isLinux ? 'связкой ключей системы' : 'средствами Windows'

/**
 * Уменьшенная копия фото: файл раскодируется сразу в маленьком размере и не в потоке интерфейса
 * (createImageBitmap), поворот берётся из EXIF. Плитка с фото 12 Мп не держит в памяти десятки мегабайт
 */
export async function imageThumb(url: string, size: number): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob, { resizeWidth: size, resizeQuality: 'medium' })
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    c.getContext('2d')!.drawImage(bmp, 0, 0)
    bmp.close()
    return URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
  } catch {
    return null
  }
}
