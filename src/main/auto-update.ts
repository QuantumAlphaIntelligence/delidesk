import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { IPC, type UpdateUiStatus, type UpdateUrgency } from '../shared/ipc'
import { getBackendBaseUrl } from '../shared/config'

export type { UpdateUiStatus }

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 12_000

let started = false
let checkTimer: NodeJS.Timeout | null = null
let lastStatus: UpdateUiStatus = { state: 'idle' }
let lastUrgency: UpdateUrgency = 'optional'

function emit(win: BrowserWindow | null | undefined, status: UpdateUiStatus): void {
  lastStatus = status
  win?.webContents.send(IPC.UPDATE_STATUS, status)
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

/**
 * Obrigatória se release notes/título tiverem [obrigatorio] / [mandatory],
 * ou se o major da versão nova for maior (ex.: 0.x → 1.x).
 */
export function resolveUpdateUrgency(info: UpdateInfo, currentVersion: string): UpdateUrgency {
  const notes = [info.releaseNotes, info.releaseName]
    .flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v || '')]))
    .join('\n')
  if (/\[obrigatorio\]|\[mandatory\]|\[required\]/i.test(notes)) {
    return 'mandatory'
  }
  const curMajor = Number(String(currentVersion).split('.')[0]) || 0
  const nextMajor = Number(String(info.version || '').split('.')[0]) || 0
  if (nextMajor > curMajor) return 'mandatory'
  return 'optional'
}

export function getUpdateStatus(): UpdateUiStatus {
  return lastStatus
}

export function installDownloadedUpdate(): { ok: boolean; error?: string } {
  if (lastStatus.state !== 'downloaded') {
    return { ok: false, error: 'Nenhuma atualização pronta para instalar' }
  }
  try {
    // isSilent=false, isForceRunAfter=true — reinicia com a nova versão
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
    lastUrgency = resolveUpdateUrgency(info, app.getVersion())
    console.info('[update] available', info.version, lastUrgency)
    emit(getMainWindow(), {
      state: 'available',
      version: info.version,
      urgency: lastUrgency
    })
  })
  autoUpdater.on('update-not-available', () => {
    emit(getMainWindow(), { state: 'up_to_date' })
  })
  autoUpdater.on('error', (err) => {
    console.warn('[update] error', err.message)
    emit(getMainWindow(), { state: 'error', message: err.message })
  })
  autoUpdater.on('update-downloaded', (info) => {
    lastUrgency = resolveUpdateUrgency(info, app.getVersion())
    console.info('[update] downloaded', info.version, lastUrgency)
    emit(getMainWindow(), {
      state: 'downloaded',
      version: info.version,
      urgency: lastUrgency
    })
  })

  const runCheck = (): void => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[update] check failed', message)
      emit(getMainWindow(), { state: 'error', message })
    })
  }

  setTimeout(runCheck, INITIAL_DELAY_MS)
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS)
}

/** Disparo manual (card Versão na sidebar). */
export function checkForUpdatesNow(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    // Em dev: mostra “atualizado” pra validar o card verde
    emit(getMainWindow(), { state: 'up_to_date' })
    return
  }
  if (!started) {
    startAutoUpdater(getMainWindow)
  }
  emit(getMainWindow(), { state: 'checking' })
  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    emit(getMainWindow(), { state: 'error', message })
  })
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
