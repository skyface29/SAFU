// Брандмауэр Windows и синхронизация с iPhone.
//
// Телефон сам заходит на компьютер, а входящие подключения Windows по умолчанию режет: окно «Разрешить
// доступ?» легко закрыть не глядя (и тогда Windows молча добавляет запрет), а в «общественной» сети
// (так Windows часто помечает и домашний Wi‑Fi) оно и вовсе разрешает не всё. Отсюда «в одной сети, а не
// синхронизируется». Здесь — проверка без прав администратора и починка в одно нажатие: один запрос UAC,
// после него правило на порты синхронизации и на саму Арктику для любых сетей, запреты для Арктики снимаются.

import { execFile } from 'node:child_process'
import { SYNC_PORTS } from './sync'
import * as fs from 'node:fs'
import { LINUX_PORTS, portsCovered, ufwAllows, ufwEnabled, ufwDefaultAccepts } from './linux'

export const RULE = 'Arktika SAFU sync'

export type FirewallState = {
  /** 'ok' — правило есть и запретов нет; 'blocked' — Арктике запрещены входящие; 'missing' — правила нет */
  state: 'ok' | 'blocked' | 'missing' | 'unknown' | 'na'
  /** Тип текущей сети: Public — «общественная» */
  network?: string
}

const ps = (s: string) => `'${s.replace(/'/g, "''")}'`
const encode = (script: string) => Buffer.from(script, 'utf16le').toString('base64')

function run(script: string, timeout = 20_000): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)],
      { windowsHide: true, timeout }, (err, stdout) => {
        const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0
        resolve({ code, out: String(stdout || '').trim() })
      })
  })
}

export function portRange(): string {
  return `${Math.min(...SYNC_PORTS)}-${Math.max(...SYNC_PORTS)}`
}

/** Проверить без прав администратора: есть ли наше правило и не запрещены ли Арктике входящие */
export async function firewallStatus(exe: string): Promise<FirewallState> {
  if (process.platform === 'linux') return linuxStatus()
  if (process.platform !== 'win32') return { state: 'na' }
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$exe = ${ps(exe)}
$net = "$((Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory)"
$want = if ($net -eq 'DomainAuthenticated') { 'Domain' } elseif ($net) { $net } else { 'Private' }
$mine = @(Get-NetFirewallApplicationFilter -Program $exe | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' })
$block = @($mine | Where-Object { $_.Action -eq 'Block' }).Count -gt 0
# разрешено нашим правилом или ответом «Разрешить» в окне Windows — для текущего типа сети
$app = @($mine | Where-Object { $_.Action -eq 'Allow' -and ("$($_.Profile)" -eq 'Any' -or "$($_.Profile)" -match $want) }).Count -gt 0
$ok = $app -or (@(Get-NetFirewallRule -DisplayName ${ps(RULE)} | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' }).Count -gt 0)
Write-Output ("{0}|{1}|{2}" -f $ok, $block, $net)`
  const { code, out } = await run(script)
  const line = out.split(/\r?\n/).pop() || ''
  const [ok, block, net] = line.split('|')
  if (code !== 0 || ok === undefined || block === undefined) return { state: 'unknown' }
  const state = block === 'True' ? 'blocked' : ok === 'True' ? 'ok' : 'missing'
  return { state, network: net || undefined }
}

/**
 * Разрешить синхронизацию: запрос UAC, потом — правила для любых сетей (порты синхронизации и сама Арктика),
 * запреты для Арктики (после закрытого окна «Разрешить доступ?») снимаются.
 * 'ok' — готово, 'cancelled' — в окне UAC нажали «Нет», 'failed' — не вышло
 */
export async function firewallFix(exe: string): Promise<'ok' | 'cancelled' | 'failed' | 'na'> {
  if (process.platform === 'linux') return linuxFix()
  if (process.platform !== 'win32') return 'na'
  const inner = `
$ErrorActionPreference = 'SilentlyContinue'
$exe = ${ps(exe)}
Get-NetFirewallApplicationFilter -Program $exe | Get-NetFirewallRule | Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule
Remove-NetFirewallRule -DisplayName ${ps(RULE)}
$ErrorActionPreference = 'Stop'
try {
  New-NetFirewallRule -DisplayName ${ps(RULE)} -Description 'Arktika: iPhone sync over Wi-Fi' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${portRange()} -Profile Any | Out-Null
  New-NetFirewallRule -DisplayName ${ps(RULE)} -Description 'Arktika: iPhone sync over Wi-Fi' -Direction Inbound -Action Allow -Program $exe -Profile Any | Out-Null
  exit 0
} catch { exit 3 }`
  // запуск с правами администратора: Windows покажет одно окно UAC
  const outer = `
try {
  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encode(inner)}'
  exit $p.ExitCode
} catch { exit 5 }`
  const { code } = await run(outer, 120_000)
  return code === 0 ? 'ok' : code === 5 ? 'cancelled' : 'failed'
}

// ---------- Linux: ufw (Ubuntu, Mint) и firewalld (Fedora, openSUSE) ----------
// По умолчанию на Ubuntu и Mint ufw выключен, а у Fedora Workstation открыты порты выше 1024 — тогда
// карточка не показывается вовсе. Если брандмауэр режет входящие, одно окно с паролем (pkexec) открывает
// порты Арктики: синхронизация и перенос с iPhone. Сама программа в правилах Linux не указывается — только порты.

function sh(cmd: string, args: string[], timeout = 15_000): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 127) : 0
      resolve({ code, out: String(stdout || '').trim() })
    })
  })
}

const read = (f: string) => fs.promises.readFile(f, 'utf8').catch(() => null)
const range = () => `${LINUX_PORTS.from}-${LINUX_PORTS.to}`

async function firewalldRunning(): Promise<boolean> {
  return (await sh('firewall-cmd', ['--state'])).out === 'running'
}

async function linuxStatus(): Promise<FirewallState> {
  if (await firewalldRunning()) {
    const zone = (await sh('firewall-cmd', ['--get-default-zone'])).out
    const ports = await sh('firewall-cmd', ['--list-ports'])
    if (ports.code !== 0) return { state: 'unknown', network: zone || undefined }
    if (zone === 'trusted') return { state: 'ok', network: zone }
    return { state: portsCovered(ports.out, LINUX_PORTS.from, LINUX_PORTS.to) ? 'ok' : 'missing', network: zone || undefined }
  }
  const conf = await read('/etc/ufw/ufw.conf')
  if (conf != null && ufwEnabled(conf)) {
    if (ufwDefaultAccepts((await read('/etc/default/ufw')) || '')) return { state: 'ok' }
    // правила ufw обычно читает только root — тогда честно «не знаем», кнопка всё равно есть
    const rules = await read('/etc/ufw/user.rules')
    if (rules == null) return { state: 'unknown' }
    return { state: ufwAllows(rules, LINUX_PORTS.from, LINUX_PORTS.to) ? 'ok' : 'missing' }
  }
  return { state: 'na' }
}

async function linuxFix(): Promise<'ok' | 'cancelled' | 'failed' | 'na'> {
  let script: string
  if (await firewalldRunning()) {
    script = `firewall-cmd --permanent --add-port=${range()}/tcp && firewall-cmd --add-port=${range()}/tcp`
  } else {
    const conf = await read('/etc/ufw/ufw.conf')
    if (conf == null || !ufwEnabled(conf)) return 'na'
    script = `ufw allow ${LINUX_PORTS.from}:${LINUX_PORTS.to}/tcp comment '${RULE}'`
  }
  // pkexec показывает системное окно с паролем: 126 — его закрыли, 127 — нет прав или окна
  const { code } = await sh('pkexec', ['/bin/sh', '-c', script], 180_000)
  return code === 0 ? 'ok' : code === 126 ? 'cancelled' : 'failed'
}
