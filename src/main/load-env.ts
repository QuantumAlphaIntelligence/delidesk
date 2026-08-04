import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** Carrega pares KEY=VALUE de um arquivo .env no process.env. */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // .env.local sobrescreve; não sobrescreve se já veio do shell
    if (process.env[key] === undefined || filePath.endsWith('.env.local')) {
      process.env[key] = value
    }
  }
}

/**
 * Canal embutido no instalador (resources/channel.json).
 * Empacotado: process.resourcesPath. Dev/smoke: resources/ no cwd.
 * Não sobrescreve variáveis já definidas no shell.
 */
function loadChannelJson(): void {
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'channel.json'))
  }
  candidates.push(join(process.cwd(), 'resources', 'channel.json'))

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
      if (typeof data.channel === 'string' && process.env.DELIDESK_CHANNEL === undefined) {
        process.env.DELIDESK_CHANNEL = data.channel
      }
      for (const [key, raw] of Object.entries(data)) {
        if (key === 'channel' || typeof raw !== 'string') continue
        if (process.env[key] === undefined) {
          process.env[key] = raw
        }
      }
      return
    } catch {
      // ignora JSON inválido e tenta o próximo candidato
    }
  }
}

// Ordem: canal do build → (só em dev) .env → .env.local
loadChannelJson()

// Instalador empacotado: NUNCA ler .env do disco (evita localhost do PC do Leo/dev).
let packaged = false
try {
  packaged = app.isPackaged === true
} catch {
  packaged = false
}

if (!packaged) {
  const root = process.cwd()
  loadEnvFile(join(root, '.env'))
  loadEnvFile(join(root, '.env.local'))
}
