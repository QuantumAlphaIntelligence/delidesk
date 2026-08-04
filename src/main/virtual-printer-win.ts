import { createServer, type Server, type Socket } from 'net'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

export const VIRTUAL_PRINTER_NAME = 'DeliDesk'
export const VIRTUAL_LISTEN_PORT = 19100
export const VIRTUAL_PORT_NAME = 'DeliDesk_TCP_19100'

export type VirtualPrinterStatus = {
  installed: boolean
  listening: boolean
  lastError?: string
  lastForwardAt?: number
}

let server: Server | null = null
let status: VirtualPrinterStatus = { installed: false, listening: false }
let onJob: ((bytes: Buffer) => void) | null = null

export function getVirtualPrinterStatus(): VirtualPrinterStatus {
  return { ...status }
}

export function setVirtualJobHandler(handler: ((bytes: Buffer) => void) | null): void {
  onJob = handler
}

export function isVirtualPrinterName(name: string): boolean {
  return name.trim().toLowerCase() === VIRTUAL_PRINTER_NAME.toLowerCase()
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
  try {
    const { stdout } = await runPs(
      `if (Get-Printer -Name '${VIRTUAL_PRINTER_NAME}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`
    )
    return stdout.trim().toLowerCase().includes('yes')
  } catch {
    return false
  }
}

/** Driver atual da fila; vazio se não existir. */
export async function getVirtualPrinterDriverName(): Promise<string | null> {
  if (!isWin()) return null
  try {
    const { stdout } = await runPs(
      `$p = Get-Printer -Name '${VIRTUAL_PRINTER_NAME}' -ErrorAction SilentlyContinue; if ($p) { $p.DriverName } else { '' }`
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
  return `
$ErrorActionPreference = 'Stop'
$portName = '${VIRTUAL_PORT_NAME}'
$printerName = '${VIRTUAL_PRINTER_NAME}'
$hostAddr = '127.0.0.1'
$port = ${VIRTUAL_LISTEN_PORT}
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
  if (-not $ok) { throw 'Nenhum driver compatível para DeliDesk' }
}
`
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
  try {
    const file = resourceScript('install-virtual-printer')
    if (file) {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
        { windowsHide: true, timeout: 90_000 }
      )
    } else {
      await runPs(installScriptInline())
    }
    status.installed = await isVirtualPrinterInstalled()
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
        ? 'Sem permissão para corrigir a impressora DeliDesk'
        : 'Sem permissão para criar a impressora DeliDesk'
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
  const argList = file
    ? `'-NoProfile','-ExecutionPolicy','Bypass','-File','${file.replace(/'/g, "''")}'`
    : `'-NoProfile','-ExecutionPolicy','Bypass','-Command','${installScriptInline().replace(/'/g, "''")}'`
  try {
    await runPs(`Start-Process powershell -Verb RunAs -Wait -ArgumentList ${argList}`)
    status.installed = await isVirtualPrinterInstalled()
    if (status.installed) {
      status.lastError = undefined
      return { ok: true }
    }
    return { ok: false, error: 'Impressora DeliDesk não apareceu após a instalação' }
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
  server.listen(VIRTUAL_LISTEN_PORT, '127.0.0.1', () => {
    status.listening = true
    console.info('[virtual-printer] listening on', VIRTUAL_LISTEN_PORT)
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
