import type { AuthSession, AppOnlineStatus, UpdateUiStatus } from '../../shared/ipc'
import type { PrintStateSnapshot, PrintResult } from '../../shared/print'
import type { PanelBounds, PanelMode, PdvaiState } from '../../shared/pdvai'

export type DelideskApi = {
  getSession: () => Promise<AuthSession | null>
  startLogin: () => Promise<{ ok: boolean; mock: boolean; error?: string }>
  logout: () => Promise<{ ok: boolean }>
  cancelLogin: () => Promise<{ ok: boolean }>
  getOnline: () => Promise<AppOnlineStatus>
  openExternal: (url: string) => Promise<void>
  minimizeToTray: () => Promise<void>
  onSessionChanged: (cb: (session: AuthSession | null) => void) => () => void
  onLoginError: (cb: (message: string) => void) => () => void
  getPrintState: () => Promise<PrintStateSnapshot>
  refreshPrinters: () => Promise<PrintStateSnapshot>
  setDefaultPrinter: (name: string) => Promise<PrintStateSnapshot>
  printTestCoupon: () => Promise<PrintResult>
  reprintLast: () => Promise<PrintResult>
  reprintJob: (jobId: string) => Promise<PrintResult>
  cancelJob: (jobId: string) => Promise<PrintStateSnapshot>
  ackJob: (jobId: string) => Promise<PrintStateSnapshot>
  startMockSse: () => Promise<PrintStateSnapshot>
  stopMockSse: () => Promise<PrintStateSnapshot>
  startBackendPoll: () => Promise<PrintStateSnapshot>
  stopBackendPoll: () => Promise<PrintStateSnapshot>
  installVirtualPrinter: () => Promise<PrintStateSnapshot>
  onPrintStateChanged: (cb: (state: PrintStateSnapshot) => void) => () => void
  showPanel: (mode: PanelMode, bounds: PanelBounds) => Promise<{ ok: boolean }>
  hidePanel: () => Promise<{ ok: boolean }>
  setPanelBounds: (bounds: PanelBounds) => Promise<{ ok: boolean }>
  reloadPanel: () => Promise<{ ok: boolean }>
  openPanelExternal: (mode: PanelMode) => Promise<{ ok: boolean }>
  getPdvaiState: () => Promise<PdvaiState>
  createPdvaiOrder: (itemId: string, qty?: number) => Promise<PdvaiState>
  syncPdvai: () => Promise<PdvaiState>
  setPdvaiForceOffline: (value: boolean) => Promise<PdvaiState>
  onPdvaiStateChanged: (cb: (state: PdvaiState) => void) => () => void
  getUpdateStatus: () => Promise<UpdateUiStatus>
  installUpdate: () => Promise<{ ok: boolean; error?: string }>
  postponeUpdate: () => Promise<{ ok: boolean }>
  onUpdateStatus: (cb: (status: UpdateUiStatus) => void) => () => void
}

declare global {
  interface Window {
    delidesk: DelideskApi
  }
}

export {}
