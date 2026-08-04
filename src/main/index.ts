import './load-env'
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  protocol,
  net
} from 'electron'
import { join, resolve } from 'path'
import os from 'os'
import { IPC, PROTOCOL } from '../shared/ipc'
import {
  generatePkce,
  getAuthAuthorizeUrl,
  getBackendBaseUrl,
  isAuthMockEnabled,
  REDIRECT_URI
} from '../shared/config'
import { createMainWindow, getMainWindow } from './window'
import { createTray, destroyTray } from './tray'
import {
  clearSession,
  exchangeCodeForTokens,
  getSession,
  isMockSession,
  pollAuthForTokens,
  saveMockSession,
  saveSessionFromCallback
} from './auth-store'
import {
  ackJob,
  cancelJob,
  getSnapshot,
  initPrintService,
  installVirtualPrinter,
  onRealSessionReady,
  printTestCoupon,
  refreshPrinters,
  reprintJob,
  reprintLast,
  setDefaultPrinter,
  shutdownPrintService,
  startBackendPoll,
  startMockSse,
  stopBackendPoll,
  stopMockSse
} from './print-service'
import {
  destroyPanel,
  hidePanel,
  openPanelInBrowser,
  reloadPanel,
  seedPanelSession,
  setPanelBounds,
  showPanel
} from './panel-view'
import {
  clearDemoPdvai,
  createLocalOrder,
  getPdvaiState,
  initPdvai,
  setForceOffline,
  syncPending
} from './pdvai-service'
import {
  getUpdateStatus,
  installDownloadedUpdate,
  postponeDownloadedUpdate,
  startAutoUpdater,
  stopAutoUpdater
} from './auto-update'
import type { PanelBounds, PanelMode } from '../shared/pdvai'

type PendingAuth = {
  state: string
  verifier: string
}

/** Tempo máximo aguardando Autorizar no browser antes de liberar a UI. */
const AUTH_LOGIN_TIMEOUT_MS = 3 * 60 * 1000

let pendingAuth: PendingAuth | null = null
let authTimeout: NodeJS.Timeout | null = null
let authPollTimer: NodeJS.Timeout | null = null
let authPollGeneration = 0
/** Evita 2º callback (Windows second-instance + open-url) apagar sessão já gravada. */
let lastHandledAuthCode: string | null = null
let authCallbackInFlight = false

const AUTH_POLL_MS = 1500

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

function useAuthMock(): boolean {
  return isAuthMockEnabled(app.isPackaged)
}

function notifyAuthError(message: string): void {
  getMainWindow()?.webContents.send(IPC.AUTH_LOGIN_ERROR, message)
}

function clearAuthWait(): void {
  if (authTimeout) {
    clearTimeout(authTimeout)
    authTimeout = null
  }
  if (authPollTimer) {
    clearTimeout(authPollTimer)
    authPollTimer = null
  }
  authPollGeneration += 1
}

function armAuthWait(): void {
  clearAuthWait()
  const generation = authPollGeneration
  authTimeout = setTimeout(() => {
    authTimeout = null
    if (!pendingAuth || generation !== authPollGeneration) return
    pendingAuth = null
    clearAuthWait()
    console.warn('[auth] login timeout')
    notifyAuthError(
      'Tempo esgotado: autorização não concluída. Clique em Entrar e tente de novo.'
    )
  }, AUTH_LOGIN_TIMEOUT_MS)
  scheduleAuthPoll(generation, 800)
}

function scheduleAuthPoll(generation: number, delayMs: number): void {
  if (authPollTimer) {
    clearTimeout(authPollTimer)
    authPollTimer = null
  }
  authPollTimer = setTimeout(() => {
    authPollTimer = null
    void runAuthPollTick(generation)
  }, delayMs)
}

async function runAuthPollTick(generation: number): Promise<void> {
  if (generation !== authPollGeneration) return
  const pending = pendingAuth
  if (!pending) return

  try {
    const result = await pollAuthForTokens(pending.state, pending.verifier)
    if (generation !== authPollGeneration || pendingAuth?.state !== pending.state) return

    if (result.status === 'pending') {
      scheduleAuthPoll(generation, AUTH_POLL_MS)
      return
    }
    if (result.status === 'consumed') {
      // Já consumido por outro caminho (ex.: deep link legado)
      if (restoreSessionToUi(getMainWindow())) {
        pendingAuth = null
        clearAuthWait()
        return
      }
      scheduleAuthPoll(generation, AUTH_POLL_MS)
      return
    }

    pendingAuth = null
    clearAuthWait()
    const win = getMainWindow()
    win?.show()
    win?.focus()
    console.info('[auth] session ok via poll', {
      companyId: result.session.companyId,
      agentId: result.session.agentId
    })
    win?.webContents.send(IPC.AUTH_SESSION_CHANGED, result.session)
    if (result.panelSsoCode) {
      try {
        await seedPanelSession(result.panelSsoCode)
      } catch (seedErr) {
        console.warn('[auth] panel SSO seed failed', seedErr)
      }
    }
    await onRealSessionReady()
    clearDemoPdvai()
  } catch (err) {
    if (generation !== authPollGeneration || !pendingAuth) return
    const msg = err instanceof Error ? err.message : String(err)
    // 404 enquanto o start ainda propaga — segue tentando
    if (/não encontrada|not_found|404/i.test(msg)) {
      scheduleAuthPoll(generation, AUTH_POLL_MS)
      return
    }
    console.warn('[auth] poll tick failed', msg)
    scheduleAuthPoll(generation, Math.min(AUTH_POLL_MS * 2, 5000))
  }
}

function cancelAuthWait(message?: string): void {
  const hadPending = pendingAuth !== null || authTimeout !== null || authPollTimer !== null
  pendingAuth = null
  clearAuthWait()
  if (hadPending && message) notifyAuthError(message)
}

function registerIpc(): void {
  ipcMain.handle(IPC.AUTH_GET_SESSION, () => getSession())

  ipcMain.handle(IPC.AUTH_START_LOGIN, async () => {
    clearAuthWait()
    const { verifier, challenge, state } = generatePkce()
    pendingAuth = { state, verifier }
    const machineLabel = `${os.hostname()} · DeliDesk`

    if (!useAuthMock()) {
      try {
        const startUrl = `${getBackendBaseUrl()}/webhook/agent/oauth/start`
        const startRes = await fetch(startUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            client_id: 'delidesk',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            redirect_uri: REDIRECT_URI,
            machine_label: machineLabel
          })
        })
        if (!startRes.ok) {
          const errBody = await startRes.text().catch(() => '')
          throw new Error(`oauth/start ${startRes.status}: ${errBody.slice(0, 200)}`)
        }
      } catch (err) {
        pendingAuth = null
        const raw = err instanceof Error ? err.message : String(err)
        const base = getBackendBaseUrl()
        const msg =
          /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw)
            ? `Não foi possível falar com a API (${base}). Confira DELIDESK_API_URL e se o backend de teste está no ar.`
            : raw
        return { ok: false, mock: false, error: msg }
      }
    }

    const url = getAuthAuthorizeUrl(state, machineLabel)
    await shell.openExternal(url)

    if (useAuthMock()) {
      setTimeout(() => {
        const session = saveMockSession('Loja Centro')
        pendingAuth = null
        clearAuthWait()
        getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, session)
        startMockSse()
      }, 1200)
      return { ok: true, mock: true }
    }

    armAuthWait()
    return { ok: true, mock: false }
  })

  ipcMain.handle(IPC.AUTH_CANCEL_LOGIN, () => {
    cancelAuthWait('Login cancelado.')
    return { ok: true }
  })

  ipcMain.handle(IPC.AUTH_LOGOUT, () => {
    cancelAuthWait()
    hidePanel()
    stopBackendPoll()
    stopMockSse()
    clearSession()
    clearDemoPdvai()
    getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, null)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_GET_ONLINE, () =>
    net.isOnline() ? 'online' : 'offline'
  )

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, (_e, url: string) => {
    void shell.openExternal(url)
  })

  ipcMain.handle(IPC.WINDOW_MINIMIZE_TO_TRAY, () => {
    hidePanel()
    getMainWindow()?.hide()
  })

  ipcMain.handle(IPC.PRINT_GET_STATE, () => getSnapshot())
  ipcMain.handle(IPC.PRINT_REFRESH_PRINTERS, () => refreshPrinters())
  ipcMain.handle(IPC.PRINT_SET_DEFAULT, (_e, name: string) =>
    setDefaultPrinter(name)
  )
  ipcMain.handle(IPC.PRINT_TEST_COUPON, () => printTestCoupon())
  ipcMain.handle(IPC.PRINT_REPRINT_LAST, () => reprintLast())
  ipcMain.handle(IPC.PRINT_REPRINT_JOB, (_e, jobId: string) => reprintJob(jobId))
  ipcMain.handle(IPC.PRINT_CANCEL_JOB, (_e, jobId: string) => cancelJob(jobId))
  ipcMain.handle(IPC.PRINT_ACK_JOB, (_e, jobId: string) => ackJob(jobId))
  ipcMain.handle(IPC.PRINT_START_MOCK_SSE, () => startMockSse())
  ipcMain.handle(IPC.PRINT_STOP_MOCK_SSE, () => stopMockSse())
  ipcMain.handle(IPC.PRINT_START_BACKEND_POLL, () => startBackendPoll())
  ipcMain.handle(IPC.PRINT_STOP_BACKEND_POLL, () => stopBackendPoll())
  ipcMain.handle(IPC.PRINT_INSTALL_VIRTUAL, () => installVirtualPrinter())

  ipcMain.handle(
    IPC.PANEL_SHOW,
    (_e, payload: { mode: PanelMode; bounds: PanelBounds }) => {
      showPanel(payload.mode, payload.bounds)
      return { ok: true }
    }
  )
  ipcMain.handle(IPC.PANEL_HIDE, () => {
    hidePanel()
    return { ok: true }
  })
  ipcMain.handle(IPC.PANEL_SET_BOUNDS, (_e, bounds: PanelBounds) => {
    setPanelBounds(bounds)
    return { ok: true }
  })
  ipcMain.handle(IPC.PANEL_RELOAD, () => {
    reloadPanel()
    return { ok: true }
  })
  ipcMain.handle(IPC.PANEL_OPEN_EXTERNAL, (_e, mode: PanelMode) => {
    openPanelInBrowser(mode)
    return { ok: true }
  })

  ipcMain.handle(IPC.PDVAI_GET_STATE, () => getPdvaiState())
  ipcMain.handle(
    IPC.PDVAI_CREATE_ORDER,
    (_e, payload: { itemId: string; qty?: number }) =>
      createLocalOrder(payload.itemId, payload.qty ?? 1)
  )
  ipcMain.handle(IPC.PDVAI_SYNC, () => syncPending())
  ipcMain.handle(IPC.PDVAI_SET_FORCE_OFFLINE, (_e, value: boolean) =>
    setForceOffline(value)
  )

  ipcMain.handle(IPC.UPDATE_GET_STATUS, () => getUpdateStatus())
  ipcMain.handle(IPC.UPDATE_INSTALL, () => installDownloadedUpdate())
  ipcMain.handle(IPC.UPDATE_POSTPONE, () => postponeDownloadedUpdate())
}

function findDeeplink(argv: string[]): string | undefined {
  return argv.find((a) => {
    const s = a.replace(/^"+|"+$/g, '')
    return s.startsWith(`${PROTOCOL}://`)
  })?.replace(/^"+|"+$/g, '')
}

function registerProtocolClient(): void {
  // Re-registra a cada boot (dev no Windows costuma quebrar com path antigo)
  app.removeAsDefaultProtocolClient(PROTOCOL)
  if (process.defaultApp) {
    const appArg = process.argv[1] ? resolve(process.argv[1]) : resolve('.')
    const ok = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      appArg
    ])
    console.info('[auth] protocol client (dev)', { ok, execPath: process.execPath, appArg })
  } else {
    const ok = app.setAsDefaultProtocolClient(PROTOCOL)
    console.info('[auth] protocol client (packaged)', { ok })
  }
}

function restoreSessionToUi(win: BrowserWindow | null | undefined): boolean {
  const existing = getSession()
  if (!existing || isMockSession(existing)) return false
  win?.webContents.send(IPC.AUTH_SESSION_CHANGED, existing)
  return true
}

async function handleAuthCallback(url: string): Promise<void> {
  console.info('[auth] callback received', url.slice(0, 80))
  if (authCallbackInFlight) {
    console.warn('[auth] ignoring overlapping callback')
    return
  }
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'auth' || !parsed.pathname.startsWith('/callback')) {
      console.warn('[auth] ignored url (path)', parsed.hostname, parsed.pathname)
      return
    }

    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    if (!code) {
      notifyAuthError('Callback sem code — tente Entrar de novo')
      return
    }
    if (lastHandledAuthCode === code) {
      console.warn('[auth] ignoring duplicate callback code')
      const win = getMainWindow()
      win?.show()
      win?.focus()
      restoreSessionToUi(win)
      return
    }
    if (pendingAuth && state && state !== pendingAuth.state) {
      notifyAuthError('State OAuth não confere — clique Entrar de novo')
      return
    }

    const verifier = pendingAuth?.verifier
    pendingAuth = null
    clearAuthWait()

    const win = getMainWindow()
    win?.show()
    win?.focus()

    if (useAuthMock()) {
      lastHandledAuthCode = code
      const session = saveSessionFromCallback(code)
      win?.webContents.send(IPC.AUTH_SESSION_CHANGED, session)
      startMockSse()
      return
    }

    if (!verifier) {
      // 2º disparo do protocolo após login OK: não zerar a UI
      if (restoreSessionToUi(win)) {
        console.info('[auth] callback sem PKCE, sessão já presente — mantendo login')
        return
      }
      notifyAuthError(
        'Login incompleto: o app não tinha o PKCE (reinicie Entrar com DelivAI e autorize na mesma sessão)'
      )
      return
    }

    authCallbackInFlight = true
    lastHandledAuthCode = code
    try {
      const { session, panelSsoCode } = await exchangeCodeForTokens(code, verifier)
      console.info('[auth] session ok', { companyId: session.companyId, agentId: session.agentId })
      win?.webContents.send(IPC.AUTH_SESSION_CHANGED, session)
      if (panelSsoCode) {
        try {
          await seedPanelSession(panelSsoCode)
        } catch (seedErr) {
          console.warn('[auth] panel SSO seed failed', seedErr)
        }
      }
      await onRealSessionReady()
      clearDemoPdvai()
    } catch (err) {
      console.error('[auth] token exchange failed', err)
      if (restoreSessionToUi(win)) {
        notifyAuthError(
          'Não foi possível renovar o login agora, mas a sessão anterior foi mantida. Recarregue o painel se precisar.'
        )
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      notifyAuthError(msg)
    } finally {
      authCallbackInFlight = false
    }
  } catch (err) {
    console.error('[auth] malformed callback', err)
    clearAuthWait()
    pendingAuth = null
    authCallbackInFlight = false
    notifyAuthError('Callback de login inválido')
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    console.info('[auth] second-instance argv', argv)
    const url = findDeeplink(argv)
    if (url) void handleAuthCallback(url)
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('br.com.delivai.delidesk')
    }

    registerProtocolClient()

    registerIpc()
    createMainWindow()
    createTray()
    initPdvai()
    startAutoUpdater(getMainWindow)
    void initPrintService().then(() => {
      const session = getSession()
      if (useAuthMock()) {
        // Mock SSE só sob demanda / após login mock — não auto-iniciar se já há sessão real
        if (!session || isMockSession(session)) {
          startMockSse()
        }
      } else if (session && !isMockSession(session)) {
        void onRealSessionReady().then(() => {
          clearDemoPdvai()
          // Rehidrata nome/logo do painel (sessões antigas com UUID como “nome”).
          void import('./panel-view').then((m) => m.hydrateBrandingAfterSeed())
        })
      }
    })

    // Cold start no Windows/Linux: URL vem em process.argv
    const cold = findDeeplink(process.argv)
    if (cold) void handleAuthCallback(cold)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else getMainWindow()?.show()
    })
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    void handleAuthCallback(url)
  })

  app.on('before-quit', () => {
    stopAutoUpdater()
    shutdownPrintService()
    destroyPanel()
    destroyTray()
  })
}
