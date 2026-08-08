import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AuthSession, type UpdateUiStatus } from '../shared/ipc'
import type { PrintStateSnapshot, PrintResult } from '../shared/print'
import type { PanelBounds, PanelMode, PdvaiState } from '../shared/pdvai'

const api = {
  getSession: () => ipcRenderer.invoke(IPC.AUTH_GET_SESSION) as Promise<AuthSession | null>,
  startLogin: () =>
    ipcRenderer.invoke(IPC.AUTH_START_LOGIN) as Promise<{
      ok: boolean
      mock: boolean
      error?: string
    }>,
  logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT) as Promise<{ ok: boolean }>,
  cancelLogin: () =>
    ipcRenderer.invoke(IPC.AUTH_CANCEL_LOGIN) as Promise<{ ok: boolean }>,
  getOnline: () =>
    ipcRenderer.invoke(IPC.APP_GET_ONLINE) as Promise<'online' | 'offline'>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url) as Promise<void>,
  minimizeToTray: () =>
    ipcRenderer.invoke(IPC.WINDOW_MINIMIZE_TO_TRAY) as Promise<void>,
  onSessionChanged: (cb: (session: AuthSession | null) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, session: AuthSession | null) =>
      cb(session)
    ipcRenderer.on(IPC.AUTH_SESSION_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.AUTH_SESSION_CHANGED, listener)
  },
  onLoginError: (cb: (message: string) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, message: string) => cb(message)
    ipcRenderer.on(IPC.AUTH_LOGIN_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC.AUTH_LOGIN_ERROR, listener)
  },

  getPrintState: () =>
    ipcRenderer.invoke(IPC.PRINT_GET_STATE) as Promise<PrintStateSnapshot>,
  refreshPrinters: () =>
    ipcRenderer.invoke(IPC.PRINT_REFRESH_PRINTERS) as Promise<PrintStateSnapshot>,
  setDefaultPrinter: (name: string) =>
    ipcRenderer.invoke(IPC.PRINT_SET_DEFAULT, name) as Promise<PrintStateSnapshot>,
  printTestCoupon: () =>
    ipcRenderer.invoke(IPC.PRINT_TEST_COUPON) as Promise<PrintResult>,
  reprintLast: () =>
    ipcRenderer.invoke(IPC.PRINT_REPRINT_LAST) as Promise<PrintResult>,
  reprintJob: (jobId: string) =>
    ipcRenderer.invoke(IPC.PRINT_REPRINT_JOB, jobId) as Promise<PrintResult>,
  cancelJob: (jobId: string) =>
    ipcRenderer.invoke(IPC.PRINT_CANCEL_JOB, jobId) as Promise<PrintStateSnapshot>,
  ackJob: (jobId: string) =>
    ipcRenderer.invoke(IPC.PRINT_ACK_JOB, jobId) as Promise<PrintStateSnapshot>,
  startMockSse: () =>
    ipcRenderer.invoke(IPC.PRINT_START_MOCK_SSE) as Promise<PrintStateSnapshot>,
  stopMockSse: () =>
    ipcRenderer.invoke(IPC.PRINT_STOP_MOCK_SSE) as Promise<PrintStateSnapshot>,
  startBackendPoll: () =>
    ipcRenderer.invoke(IPC.PRINT_START_BACKEND_POLL) as Promise<PrintStateSnapshot>,
  stopBackendPoll: () =>
    ipcRenderer.invoke(IPC.PRINT_STOP_BACKEND_POLL) as Promise<PrintStateSnapshot>,
  installVirtualPrinter: () =>
    ipcRenderer.invoke(IPC.PRINT_INSTALL_VIRTUAL) as Promise<PrintStateSnapshot>,
  onPrintStateChanged: (cb: (state: PrintStateSnapshot) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: PrintStateSnapshot) =>
      cb(state)
    ipcRenderer.on(IPC.PRINT_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.PRINT_STATE_CHANGED, listener)
  },

  showPanel: (mode: PanelMode, bounds: PanelBounds) =>
    ipcRenderer.invoke(IPC.PANEL_SHOW, { mode, bounds }) as Promise<{ ok: boolean }>,
  hidePanel: () => ipcRenderer.invoke(IPC.PANEL_HIDE) as Promise<{ ok: boolean }>,
  setPanelBounds: (bounds: PanelBounds) =>
    ipcRenderer.invoke(IPC.PANEL_SET_BOUNDS, bounds) as Promise<{ ok: boolean }>,
  reloadPanel: () => ipcRenderer.invoke(IPC.PANEL_RELOAD) as Promise<{ ok: boolean }>,
  openPanelExternal: (mode: PanelMode) =>
    ipcRenderer.invoke(IPC.PANEL_OPEN_EXTERNAL, mode) as Promise<{ ok: boolean }>,

  getPdvaiState: () =>
    ipcRenderer.invoke(IPC.PDVAI_GET_STATE) as Promise<PdvaiState>,
  createPdvaiOrder: (itemId: string, qty?: number) =>
    ipcRenderer.invoke(IPC.PDVAI_CREATE_ORDER, { itemId, qty }) as Promise<PdvaiState>,
  syncPdvai: () => ipcRenderer.invoke(IPC.PDVAI_SYNC) as Promise<PdvaiState>,
  setPdvaiForceOffline: (value: boolean) =>
    ipcRenderer.invoke(IPC.PDVAI_SET_FORCE_OFFLINE, value) as Promise<PdvaiState>,
  onPdvaiStateChanged: (cb: (state: PdvaiState) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: PdvaiState) => cb(state)
    ipcRenderer.on(IPC.PDVAI_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.PDVAI_STATE_CHANGED, listener)
  },

  getUpdateStatus: () =>
    ipcRenderer.invoke(IPC.UPDATE_GET_STATUS) as Promise<UpdateUiStatus>,
  installUpdate: () =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL) as Promise<{ ok: boolean; error?: string }>,
  onUpdateStatus: (cb: (status: UpdateUiStatus) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: UpdateUiStatus) => cb(status)
    ipcRenderer.on(IPC.UPDATE_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, listener)
  }
}

contextBridge.exposeInMainWorld('delidesk', api)
