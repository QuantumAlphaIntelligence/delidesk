export const PROTOCOL = 'delidesk'

export type AuthSession = {
  accessToken: string
  refreshToken?: string
  companyName?: string
  companyId?: string
  agentId?: string
  expiresAt?: number
}

export type AppOnlineStatus = 'online' | 'offline'

export type {
  PrinterInfo,
  PrintJob,
  PrintJobStatus,
  PrintStateSnapshot,
  PrintResult
} from './print'

export type { PanelMode, PanelBounds, CatalogItem, PdvaiLocalOrder, PdvaiState } from './pdvai'

export const IPC = {
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_START_LOGIN: 'auth:start-login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CANCEL_LOGIN: 'auth:cancel-login',
  AUTH_SESSION_CHANGED: 'auth:session-changed',
  AUTH_LOGIN_ERROR: 'auth:login-error',
  APP_GET_ONLINE: 'app:get-online',
  APP_OPEN_EXTERNAL: 'app:open-external',
  WINDOW_MINIMIZE_TO_TRAY: 'window:minimize-to-tray',
  PRINT_GET_STATE: 'print:get-state',
  PRINT_REFRESH_PRINTERS: 'print:refresh-printers',
  PRINT_SET_DEFAULT: 'print:set-default',
  PRINT_TEST_COUPON: 'print:test-coupon',
  PRINT_REPRINT_LAST: 'print:reprint-last',
  PRINT_REPRINT_JOB: 'print:reprint-job',
  PRINT_CANCEL_JOB: 'print:cancel-job',
  PRINT_ACK_JOB: 'print:ack-job',
  PRINT_START_MOCK_SSE: 'print:start-mock-sse',
  PRINT_STOP_MOCK_SSE: 'print:stop-mock-sse',
  PRINT_START_BACKEND_POLL: 'print:start-backend-poll',
  PRINT_STOP_BACKEND_POLL: 'print:stop-backend-poll',
  PRINT_STATE_CHANGED: 'print:state-changed',
  PANEL_SHOW: 'panel:show',
  PANEL_HIDE: 'panel:hide',
  PANEL_SET_BOUNDS: 'panel:set-bounds',
  PANEL_RELOAD: 'panel:reload',
  PANEL_OPEN_EXTERNAL: 'panel:open-external',
  PDVAI_GET_STATE: 'pdvai:get-state',
  PDVAI_CREATE_ORDER: 'pdvai:create-order',
  PDVAI_SYNC: 'pdvai:sync',
  PDVAI_SET_FORCE_OFFLINE: 'pdvai:set-force-offline',
  PDVAI_STATE_CHANGED: 'pdvai:state-changed',
  UPDATE_GET_STATUS: 'update:get-status',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status'
} as const

export type UpdateUiStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
