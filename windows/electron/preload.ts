// Мост между интерфейсом и главным процессом: window.safu
import { contextBridge, ipcRenderer, webUtils } from 'electron'

const on = (channel: string, cb: (...a: any[]) => void) => {
  const h = (_e: unknown, ...a: any[]) => cb(...a)
  ipcRenderer.on(channel, h)
  return () => { ipcRenderer.removeListener(channel, h) }
}

const api = {
  kv: {
    all: (): Record<string, unknown> => ipcRenderer.sendSync('kv:all'),
    set: (key: string, value: unknown) => ipcRenderer.send('kv:set', key, value),
    replace: (all: Record<string, unknown>) => ipcRenderer.send('kv:replace', all)
  },
  secret: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secret:get', key),
    all: (): Promise<Record<string, string>> => ipcRenderer.invoke('secret:all'),
    set: (key: string, value: string | null) => ipcRenderer.invoke('secret:set', key, value),
    replace: (all: Record<string, string>) => ipcRenderer.invoke('secret:replace', all)
  },
  // Большие кеши ходят текстом: JSON разбирает и собирает сам интерфейс (bridge.ts), а не главный процесс —
  // мегабайтный архив пар не останавливает окно и не копируется лишний раз между процессами
  cacheText: {
    get: (name: string): Promise<string | null> => ipcRenderer.invoke('cache:get', name),
    set: (name: string, text: string | null) => ipcRenderer.invoke('cache:set', name, text)
  },
  net: {
    fetch: (r: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number; partition?: string }) =>
      ipcRenderer.invoke('net:fetch', r)
  },
  notify: {
    show: (n: unknown) => ipcRenderer.invoke('notify:show', n),
    schedule: (prefix: string, list: unknown[]) => ipcRenderer.invoke('notify:schedule', prefix, list),
    list: () => ipcRenderer.invoke('notify:list')
  },
  fs: {
    root: (): Promise<string> => ipcRenderer.invoke('fs:root'),
    list: (rel: string) => ipcRenderer.invoke('fs:list', rel),
    walk: (rel: string) => ipcRenderer.invoke('fs:walk', rel),
    mkdir: (rel: string) => ipcRenderer.invoke('fs:mkdir', rel),
    ensureDirs: (rels: string[]) => ipcRenderer.invoke('fs:ensureDirs', rels),
    import: (rel: string, folders?: boolean) => ipcRenderer.invoke('fs:import', rel, folders),
    importPaths: (rel: string, paths: string[]) => ipcRenderer.invoke('fs:importPaths', rel, paths),
    open: (rel: string) => ipcRenderer.invoke('fs:open', rel),
    openPath: (abs: string) => ipcRenderer.invoke('fs:openPath', abs),
    reveal: (rel: string) => ipcRenderer.invoke('fs:reveal', rel),
    revealPath: (abs: string) => ipcRenderer.invoke('fs:revealPath', abs),
    openRoot: (rel?: string) => ipcRenderer.invoke('fs:openRoot', rel),
    trash: (rel: string) => ipcRenderer.invoke('fs:trash', rel),
    rename: (rel: string, name: string) => ipcRenderer.invoke('fs:rename', rel, name),
    move: (rel: string, toDir: string) => ipcRenderer.invoke('fs:move', rel, toDir),
    readText: (rel: string) => ipcRenderer.invoke('fs:readText', rel),
    writeText: (rel: string, text: string) => ipcRenderer.invoke('fs:writeText', rel, text),
    writeBase64: (rel: string, b64: string) => ipcRenderer.invoke('fs:writeBase64', rel, b64),
    readBase64: (rel: string) => ipcRenderer.invoke('fs:readBase64', rel),
    exists: (rel: string) => ipcRenderer.invoke('fs:exists', rel),
    thumb: (rel: string, size?: number) => ipcRenderer.invoke('fs:thumb', rel, size),
    chooseRoot: () => ipcRenderer.invoke('fs:chooseRoot'),
    dragOut: (rel: string) => ipcRenderer.invoke('fs:dragOut', rel),
    pathFor: (file: File) => { try { return webUtils.getPathForFile(file) } catch { return '' } }
  },
  dialog: {
    save: (o: { name: string; text?: string; base64?: string; filters?: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke('dialog:save', o),
    open: (o: { filters?: { name: string; extensions: string[] }[]; base64?: boolean }) => ipcRenderer.invoke('dialog:open', o)
  },
  shell: { open: (url: string) => ipcRenderer.invoke('shell:open', url) },
  clipboard: {
    write: (t: string) => ipcRenderer.invoke('clipboard:write', t),
    read: (): Promise<string> => ipcRenderer.invoke('clipboard:read')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    autostart: (on: boolean) => ipcRenderer.invoke('app:autostart', on),
    quit: () => ipcRenderer.invoke('app:quit'),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    show: (route?: string) => ipcRenderer.invoke('app:show', route),
    badge: (n: number) => ipcRenderer.invoke('app:badge', n),
    titlebar: (color: string, symbol: string) => ipcRenderer.invoke('app:titlebar', { color, symbol }),
    mica: (on: boolean) => ipcRenderer.invoke('app:mica', on),
    flash: () => ipcRenderer.invoke('app:flash'),
    /** Интерфейс собрался (для сторожа, который иначе покажет экран восстановления) */
    ready: () => ipcRenderer.send('app:ready'),
    log: (text: string) => ipcRenderer.send('app:log', text),
    recover: (action: 'reload' | 'reset' | 'safe-gpu' | 'logs') => ipcRenderer.invoke('app:recover', action),
    gpuSafe: (safe: boolean) => ipcRenderer.invoke('app:gpuSafe', safe),
    on
  },
  tray: { update: (s: { tooltip: string; line: string }) => ipcRenderer.invoke('tray:update', s) },
  widget: {
    toggle: (on?: boolean) => ipcRenderer.invoke('widget:toggle', on),
    state: () => ipcRenderer.invoke('widget:state'),
    push: (payload: unknown) => ipcRenderer.send('widget:push', payload),
    ready: () => ipcRenderer.send('widget:ready'),
    open: (route?: string) => ipcRenderer.send('widget:open', route),
    resize: (h: number) => ipcRenderer.send('widget:resize', h)
  },
  backup: { readIOS: (file?: string) => ipcRenderer.invoke('backup:readIOS', file) },
  transfer: {
    start: (): Promise<{ url: string; hosts: string[]; port: number; name: string } | null> => ipcRenderer.invoke('transfer:start'),
    stop: () => ipcRenderer.invoke('transfer:stop'),
    on: (cb: (e: any) => void) => on('transfer:event', cb)
  },
  sync: {
    pair: (): Promise<{ url: string; hosts: string[]; port: number } | null> => ipcRenderer.invoke('sync:pair'),
    link: (): Promise<{ url: string; hosts: string[]; port: number } | null> => ipcRenderer.invoke('sync:link'),
    unpair: () => ipcRenderer.invoke('sync:unpair'),
    /** Брандмауэр Windows: проверить и разрешить синхронизацию (одно окно UAC) */
    firewall: (): Promise<{ state: 'ok' | 'blocked' | 'missing' | 'unknown' | 'na'; network?: string }> => ipcRenderer.invoke('sync:firewall'),
    firewallFix: (): Promise<'ok' | 'cancelled' | 'failed' | 'na'> => ipcRenderer.invoke('sync:firewallFix'),
    /** Телефон просит связаться без QR-кода: показать код и спросить */
    onAsk: (cb: (rid: string, info: { device: string; code: string }) => void) => on('sync:ask', cb),
    onAskDone: (cb: (rid: string) => void) => on('sync:askDone', cb),
    answer: (rid: string, ok: boolean) => ipcRenderer.send('sync:askReply', rid, ok),
    /** Связка появилась или поменялась */
    onChanged: (cb: () => void) => on('sync:changed', cb),
    /** Адреса компьютера и когда телефон последний раз искал его в сети */
    stats: (): Promise<{ hosts: string[]; port: number; seenAt: number; seenFrom: string; name: string }> => ipcRenderer.invoke('sync:stats'),
    /** Файл с телефона пришёл сам (по связке) */
    onFile: (cb: (f: { rel: string; name: string; size: number }) => void) => on('sync:file', cb),
    /** Отвечать телефону: главный процесс присылает его данные, интерфейс сводит их со своими */
    serve: (handler: (body: any) => unknown) => on('sync:request', async (rid: string, body: unknown) => {
      try {
        ipcRenderer.send('sync:reply', rid, { ok: true, result: await handler(body) })
      } catch (e) {
        ipcRenderer.send('sync:reply', rid, { ok: false, error: String((e as Error)?.message || e) })
      }
    })
  },
  ai: { summarize: (r: { subject: string; minutes: number; style: string; transcript: string }) => ipcRenderer.invoke('ai:summarize', r) },
  mail: { check: (acc: unknown) => ipcRenderer.invoke('mail:check', acc) },
  sites: {
    clear: () => ipcRenderer.invoke('sites:clear'),
    preload: (): Promise<string> => ipcRenderer.invoke('sites:preload'),
    /** Скачанное с этой страницы класть в папку (относительно «Файлов»); null — в «Загрузки» */
    downloadHint: (webContentsId: number, rel: string | null) => ipcRenderer.send('sites:downloadHint', webContentsId, rel)
  }
}

contextBridge.exposeInMainWorld('safu', api)
export type SafuAPI = typeof api
