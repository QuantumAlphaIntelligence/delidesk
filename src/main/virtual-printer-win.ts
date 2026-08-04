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
if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $portName -PrinterHostAddress $hostAddr -PortNumber $port
}
if (-not (Get-Printer -Name $printerName -ErrorAction SilentlyContinue)) {
  $drivers = @('Generic / Text Only','Microsoft IPP Class Driver','MS Publisher Color Printer')
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

/** Tenta criar a fila sem UAC; se falhar, o UI oferece elevação. */
export async function ensureVirtualPrinter(): Promise<{
  ok: boolean
  needsElevation?: boolean
  error?: string
}> {
  if (!isWin()) return { ok: false, error: 'Somente Windows' }
  if (await isVirtualPrinterInstalled()) {
    status.installed = true
    status.lastError = undefined
    return { ok: true }
  }
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
    if (status.installed) {
      status.lastError = undefined
      return { ok: true }
    }
    return {
      ok: false,
      needsElevation: true,
      error: 'Sem permissão para criar a impressora DeliDesk'
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
    socket.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })
    socket.on('end', () => {
      const bytes = Buffer.concat(chunks)
      if (bytes.length === 0) return
      status.lastForwardAt = Date.now()
      try {
        onJob?.(bytes)
      } catch (err) {
        console.warn('[virtual-printer] job handler failed', err)
      }
    })
    socket.on('error', (err) => {
      console.warn('[virtual-printer] socket error', err)
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
