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
  cache: {
    get: (name: string) => ipcRenderer.invoke('cache:get', name),
    set: (name: string, value: unknown) => ipcRenderer.invoke('cache:set', name, value)
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
  mail: { check: (acc: unknown) => ipcRenderer.invoke('mail:check', acc) },
  sites: {
    clear: () => ipcRenderer.invoke('sites:clear'),
    preload: (): Promise<string> => ipcRenderer.invoke('sites:preload')
  }
}

contextBridge.exposeInMainWorld('safu', api)
export type SafuAPI = typeof api
