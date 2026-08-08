import { createServer, type Server, type Socket } from 'net'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

/** prod = loja; sandbox = homologação (develop / bake sandbox). Default sandbox (igual auto-update). */
export type DelideskChannel = 'prod' | 'sandbox'

export function resolveDelideskChannel(): DelideskChannel {
  const raw = (process.env.DELIDESK_CHANNEL || process.env.CHANNEL || 'sandbox')
    .trim()
    .toLowerCase()
  return raw === 'prod' ? 'prod' : 'sandbox'
}

/**
 * Nome/porta da impressora virtual por canal — permite prod e sandbox no mesmo PC
 * sem conflito (iFood lista as duas; cada app escuta a sua).
 * - prod: DeliDesk @ 19100
 * - sandbox: DeliDesk Test @ 19101
 */
export function getVirtualPrinterName(): string {
  return resolveDelideskChannel() === 'prod' ? 'DeliDesk' : 'DeliDesk Test'
}

export function getVirtualListenPort(): number {
  return resolveDelideskChannel() === 'prod' ? 19100 : 19101
}

export function getVirtualPortName(): string {
  return `DeliDesk_TCP_${getVirtualListenPort()}`
}

export type VirtualPrinterStatus = {
  installed: boolean
  listening: boolean
  /** Nome da fila Windows deste canal. */
  name: string
  channel: DelideskChannel
  listenPort: number
  lastError?: string
  lastForwardAt?: number
}

let server: Server | null = null
let status: VirtualPrinterStatus = {
  installed: false,
  listening: false,
  name: getVirtualPrinterName(),
  channel: resolveDelideskChannel(),
  listenPort: getVirtualListenPort()
}
let onJob: ((bytes: Buffer) => void) | null = null

function syncStatusIdentity(): void {
  status.name = getVirtualPrinterName()
  status.channel = resolveDelideskChannel()
  status.listenPort = getVirtualListenPort()
}

export function getVirtualPrinterStatus(): VirtualPrinterStatus {
  syncStatusIdentity()
  return { ...status }
}

export function setVirtualJobHandler(handler: ((bytes: Buffer) => void) | null): void {
  onJob = handler
}

/** Filas virtuais (qualquer canal) — não usar como destino físico. */
export function isVirtualPrinterName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === 'delidesk' || n === 'delidesk test'
}

function isWin(): boolean {
  return process.platform === 'win32'
}

async function runPs(script: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 90_000, maxBuffer: 2 * 1024 * 1024 }
  )
}

export async function isVirtualPrinterInstalled(): Promise<boolean> {
  if (!isWin()) return false
  const printerName = getVirtualPrinterName().replace(/'/g, "''")
  try {
    const { stdout } = await runPs(
      `if (Get-Printer -Name '${printerName}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`
    )
    return stdout.trim().toLowerCase().includes('yes')
  } catch {
    return false
  }
}

/** Driver atual da fila; vazio se não existir. */
export async function getVirtualPrinterDriverName(): Promise<string | null> {
  if (!isWin()) return null
  const printerName = getVirtualPrinterName().replace(/'/g, "''")
  try {
    const { stdout } = await runPs(
      `$p = Get-Printer -Name '${printerName}' -ErrorAction SilentlyContinue; if ($p) { $p.DriverName } else { '' }`
    )
    const name = stdout.trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

const PREFERRED_VIRTUAL_DRIVER = 'Generic / Text Only'

/** true se a fila existe com driver adequado para captura RAW (não IPP). */
export async function isVirtualPrinterReady(): Promise<boolean> {
  const driver = await getVirtualPrinterDriverName()
  if (!driver) return false
  return driver.toLowerCase() === PREFERRED_VIRTUAL_DRIVER.toLowerCase()
}

function resourceScript(name: 'install-virtual-printer' | 'uninstall-virtual-printer'): string | null {
  const file = `${name}.ps1`
  const candidates = [
    join(process.resourcesPath, file),
    join(app.getAppPath(), 'resources', file),
    join(__dirname, '../../resources', file)
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function installScriptInline(): string {
  const portName = getVirtualPortName().replace(/'/g, "''")
  const printerName = getVirtualPrinterName().replace(/'/g, "''")
  const port = getVirtualListenPort()
  return `
$ErrorActionPreference = 'Stop'
$portName = '${portName}'
$printerName = '${printerName}'
$hostAddr = '127.0.0.1'
$port = ${port}
$preferredDriver = 'Generic / Text Only'
try {
  if (-not (Get-PrinterDriver -Name $preferredDriver -ErrorAction SilentlyContinue)) {
    Add-PrinterDriver -Name $preferredDriver
  }
} catch { try { Add-PrinterDriver -Name $preferredDriver } catch {} }
if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $portName -PrinterHostAddress $hostAddr -PortNumber $port
}
$existing = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
if ($existing -and $existing.DriverName -ne $preferredDriver) {
  Remove-Printer -Name $printerName
  $existing = $null
}
if (-not $existing) {
  $drivers = @($preferredDriver,'MS Publisher Color Printer','Microsoft IPP Class Driver')
  $ok = $false
  foreach ($d in $drivers) {
    try {
      Add-Printer -Name $printerName -DriverName $d -PortName $portName
      $ok = $true
      break
    } catch {}
  }
  if (-not $ok) { throw 'Nenhum driver compatível para $printerName' }
}
`
}

function installScriptFileArgs(file: string): string[] {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    file,
    '-PrinterName',
    getVirtualPrinterName(),
    '-PortName',
    getVirtualPortName(),
    '-Port',
    String(getVirtualListenPort())
  ]
}

/** Tenta criar/corrigir a fila sem UAC; se falhar, o UI oferece elevação. */
export async function ensureVirtualPrinter(): Promise<{
  ok: boolean
  needsElevation?: boolean
  error?: string
}> {
  if (!isWin()) return { ok: false, error: 'Somente Windows' }
  if (await isVirtualPrinterReady()) {
    status.installed = true
    status.lastError = undefined
    return { ok: true }
  }
  // Existe com driver IPP/errado → recria com Generic / Text Only.
  const wrongDriver = await isVirtualPrinterInstalled()
  const label = getVirtualPrinterName()
  try {
    const file = resourceScript('install-virtual-printer')
    if (file) {
      await execFileAsync('powershell.exe', installScriptFileArgs(file), {
        windowsHide: true,
        timeout: 90_000
      })
    } else {
      await runPs(installScriptInline())
    }
    status.installed = await isVirtualPrinterInstalled()
    syncStatusIdentity()
    if (await isVirtualPrinterReady()) {
      status.lastError = undefined
      return { ok: true }
    }
    if (status.installed) {
      const driver = await getVirtualPrinterDriverName()
      status.lastError = `Driver '${driver ?? '?'}' não captura iFood — precisa Generic / Text Only`
      return {
        ok: false,
        needsElevation: true,
        error: status.lastError
      }
    }
    return {
      ok: false,
      needsElevation: true,
      error: wrongDriver
        ? `Sem permissão para corrigir a impressora ${label}`
        : `Sem permissão para criar a impressora ${label}`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    status.lastError = msg
    return { ok: false, needsElevation: true, error: msg }
  }
}

/** Abre UAC e roda o script de instalação elevado. */
export async function installVirtualPrinterElevated(): Promise<{ ok: boolean; error?: string }> {
  if (!isWin()) return { ok: false, error: 'Somente Windows' }
  const file = resourceScript('install-virtual-printer')
  const label = getVirtualPrinterName()
  const argList = file
    ? [
        `'-NoProfile'`,
        `'-ExecutionPolicy'`,
        `'Bypass'`,
        `'-File'`,
        `'${file.replace(/'/g, "''")}'`,
        `'-PrinterName'`,
        `'${label.replace(/'/g, "''")}'`,
        `'-PortName'`,
        `'${getVirtualPortName().replace(/'/g, "''")}'`,
        `'-Port'`,
        `'${getVirtualListenPort()}'`
      ].join(',')
    : `'-NoProfile','-ExecutionPolicy','Bypass','-Command','${installScriptInline().replace(/'/g, "''")}'`
  try {
    await runPs(`Start-Process powershell -Verb RunAs -Wait -ArgumentList ${argList}`)
    status.installed = await isVirtualPrinterInstalled()
    syncStatusIdentity()
    if (status.installed) {
      status.lastError = undefined
      return { ok: true }
    }
    return { ok: false, error: `Impressora ${label} não apareceu após a instalação` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    status.lastError = msg
    return { ok: false, error: msg }
  }
}

export function startVirtualPrinterListener(): void {
  if (!isWin() || server) return
  server = createServer((socket: Socket) => {
    const chunks: Buffer[] = []
    let settled = false
    const finish = (reason: string) => {
      if (settled) return
      settled = true
      const bytes = Buffer.concat(chunks)
      console.info('[virtual-printer] job', { reason, bytes: bytes.length })
      if (bytes.length === 0) return
      status.lastForwardAt = Date.now()
      try {
        onJob?.(bytes)
      } catch (err) {
        console.warn('[virtual-printer] job handler failed', err)
      }
    }
    // Spooler às vezes não manda FIN limpo; idle após dados também fecha o job.
    let idleTimer: NodeJS.Timeout | null = null
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        try {
          socket.end()
        } catch {
          /* ignore */
        }
        finish('idle')
      }, 800)
    }
    socket.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
      armIdle()
    })
    socket.on('end', () => finish('end'))
    socket.on('close', () => finish('close'))
    socket.on('error', (err) => {
      console.warn('[virtual-printer] socket error', err)
      finish('error')
    })
  })
  server.on('error', (err) => {
    status.listening = false
    status.lastError = err instanceof Error ? err.message : String(err)
    console.warn('[virtual-printer] listen failed', err)
  })
  const listenPort = getVirtualListenPort()
  syncStatusIdentity()
  server.listen(listenPort, '127.0.0.1', () => {
    status.listening = true
    console.info('[virtual-printer] listening', {
      name: getVirtualPrinterName(),
      channel: resolveDelideskChannel(),
      port: listenPort
    })
  })
}

export function stopVirtualPrinterListener(): void {
  if (!server) return
  try {
    server.close()
  } catch {
    /* ignore */
  }
  server = null
  status.listening = false
}

export async function refreshVirtualInstalledFlag(): Promise<void> {
  status.installed = await isVirtualPrinterInstalled()
}
