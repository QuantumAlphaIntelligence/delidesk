import { safeStorage, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { PanelSnapshot } from './agent-api'

const FILE = 'panel-snapshot.bin'

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE)
}

function encrypt(plain: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain)
  }
  return Buffer.from(plain, 'utf8')
}

function decrypt(buf: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf)
  }
  return buf.toString('utf8')
}

/** Cache local do snapshot do painel — reopen sem novo OAuth.
 * Token Redis (24h) fica cifrado no userData para regravar o cookie no BrowserView. */
export function savePanelSnapshot(snap: PanelSnapshot): void {
  writeFileSync(filePath(), encrypt(JSON.stringify(snap)))
}

export function loadPanelSnapshot(): PanelSnapshot | null {
  const path = filePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(decrypt(readFileSync(path))) as PanelSnapshot
    if (!raw?.user || typeof raw.user !== 'object') return null
    return raw
  } catch {
    return null
  }
}

export function clearPanelSnapshot(): void {
  const path = filePath()
  if (existsSync(path)) unlinkSync(path)
}
