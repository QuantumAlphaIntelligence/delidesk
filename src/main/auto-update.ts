import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateUiStatus } from '../shared/ipc'
import { getBackendBaseUrl } from '../shared/config'

export type { UpdateUiStatus }

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 12_000
/** Após baixar, reinicia sozinho (usuário pode adiar no toast). */
const AUTO_RESTART_SEC = 12

let started = false
let checkTimer: NodeJS.Timeout | null = null
let restartTimer: NodeJS.Timeout | null = null
let countdownTimer: NodeJS.Timeout | null = null
let lastStatus: UpdateUiStatus = { state: 'idle' }
let getMainWindowRef: (() => BrowserWindow | null) | null = null
let postponed = false

function emit(win: BrowserWindow | null | undefined, status: UpdateUiStatus): void {
  lastStatus = status
  win?.webContents.send(IPC.UPDATE_STATUS, status)
}

function clearRestartTimers(): void {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function resolveFeedUrl(): string | null {
  const fromEnv = (process.env.DELIDESK_UPDATE_FEED_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const api = getBackendBaseUrl()
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
  clearRestartTimers()
  try {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

/** Cancela o reinício automático; update ainda aplica ao fechar o app. */
export function postponeDownloadedUpdate(): { ok: boolean } {
  postponed = true
  clearRestartTimers()
  if (lastStatus.state === 'downloaded') {
    emit(getMainWindowRef?.() ?? null, {
      state: 'downloaded',
      version: lastStatus.version
    })
  }
  return { ok: true }
}

function scheduleAutoRestart(version: string): void {
  if (postponed) {
    emit(getMainWindowRef?.() ?? null, { state: 'downloaded', version })
    return
  }

  clearRestartTimers()
  let left = AUTO_RESTART_SEC
  emit(getMainWindowRef?.() ?? null, {
    state: 'downloaded',
    version,
    autoRestartInSec: left
  })

  countdownTimer = setInterval(() => {
    left -= 1
    if (left <= 0) return
    emit(getMainWindowRef?.() ?? null, {
      state: 'downloaded',
      version,
      autoRestartInSec: left
    })
  }, 1000)

  restartTimer = setTimeout(() => {
    clearRestartTimers()
    if (postponed) return
    console.info('[update] auto quitAndInstall', version)
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[update] auto install failed', message)
      emit(getMainWindowRef?.() ?? null, { state: 'error', message })
    }
  }, AUTO_RESTART_SEC * 1000)
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
  getMainWindowRef = getMainWindow
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({ provider: 'generic', url: feed })

  autoUpdater.on('checking-for-update', () => {
    emit(getMainWindow(), { state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    console.info('[update] available', info.version)
    postponed = false
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
    scheduleAutoRestart(info.version)
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
  clearRestartTimers()
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
