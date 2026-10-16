// Брандмауэр Windows и синхронизация с iPhone.
//
// Телефон сам заходит на компьютер, а входящие подключения Windows по умолчанию режет: окно «Разрешить
// доступ?» легко закрыть не глядя (и тогда Windows молча добавляет запрет), а в «общественной» сети
// (так Windows часто помечает и домашний Wi‑Fi) оно и вовсе разрешает не всё. Отсюда «в одной сети, а не
// синхронизируется». Здесь — проверка без прав администратора и починка в одно нажатие: один запрос UAC,
// после него правило на порты синхронизации и на саму Арктику для любых сетей, запреты для Арктики снимаются.

import { execFile } from 'node:child_process'
import { SYNC_PORTS } from './sync'

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
