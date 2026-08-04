import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateUiStatus } from '../shared/ipc'
import { getBackendBaseUrl } from '../shared/config'

export type { UpdateUiStatus }

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 12_000

let started = false
let checkTimer: NodeJS.Timeout | null = null
let lastStatus: UpdateUiStatus = { state: 'idle' }

function emit(win: BrowserWindow | null | undefined, status: UpdateUiStatus): void {
  lastStatus = status
  win?.webContents.send(IPC.UPDATE_STATUS, status)
}

function resolveFeedUrl(): string | null {
  const fromEnv = (process.env.DELIDESK_UPDATE_FEED_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const api = getBackendBaseUrl()
  // Infer canal pelo bake; default sandbox
  const channel =
    (process.env.DELIDESK_CHANNEL || process.env.CHANNEL || 'sandbox').toLowerCase() === 'prod'
      ? 'prod'
      : 'sandbox'
  if (!api) return null
  return `${api}/webhook/public/delidesk-update/${channel}`
}

export function getUpdateStatus(): UpdateUiStatus {
  return lastStatus
}

export function installDownloadedUpdate(): { ok: boolean; error?: string } {
  if (lastStatus.state !== 'downloaded') {
    return { ok: false, error: 'Nenhuma atualização pronta para instalar' }
  }
  try {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export function startAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (started) return
  if (!app.isPackaged) {
    console.info('[update] skipped (dev / unpackaged)')
    return
  }

  const feed = resolveFeedUrl()
  if (!feed) {
    console.warn('[update] sem DELIDESK_UPDATE_FEED_URL / API')
    return
  }

  started = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({ provider: 'generic', url: feed })

  autoUpdater.on('checking-for-update', () => {
    emit(getMainWindow(), { state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    console.info('[update] available', info.version)
    emit(getMainWindow(), { state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    emit(getMainWindow(), { state: 'idle' })
  })
  autoUpdater.on('error', (err) => {
    console.warn('[update] error', err.message)
    emit(getMainWindow(), { state: 'error', message: err.message })
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.info('[update] downloaded', info.version)
    emit(getMainWindow(), { state: 'downloaded', version: info.version })
  })

  const runCheck = (): void => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[update] check failed', message)
    })
  }

  setTimeout(runCheck, INITIAL_DELAY_MS)
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS)
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
