import { getBackendBaseUrl } from '../shared/config'
import { IPC } from '../shared/ipc'
import {
  clearSession,
  getSession,
  patchSessionBranding,
  refreshSession
} from './auth-store'
import { resolveLogoForShell } from './logo-cache'
import { getMainWindow } from './window'

export type AgentJob = {
  id: string
  title: string
  content_base64: string
  order_id?: number | string | null
  /** Impressora Windows alvo (do agent que possui o printer_id no BE). */
  printer_name?: string | null
  printer_id?: string | null
}

export class AgentAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentAuthError'
  }
}

type JsonMap = Record<string, unknown>

function agentUrl(path: string): string {
  return `${getBackendBaseUrl()}/webhook/agent${path}`
}

function notifySessionCleared(): void {
  getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, null)
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<Response> {
  const session = getSession()
  if (!session?.accessToken) {
    throw new AgentAuthError('Sem sessão')
  }

  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${session.accessToken}`)

  const res = await fetch(agentUrl(path), { ...init, headers })

  if (res.status === 401 && !retried) {
    try {
      await refreshSession()
      return authedFetch(path, init, true)
    } catch {
      clearSession()
      notifySessionCleared()
      throw new AgentAuthError('Sessão expirada')
    }
  }

  return res
}

async function readJson(res: Response): Promise<JsonMap> {
  return (await res.json().catch(() => ({}))) as JsonMap
}

function parseFeaturesMap(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export type ReportPrintersResult = {
  delideskPrinterEnabled?: boolean
  delideskVirtualCaptureEnabled?: boolean
  features?: Record<string, boolean>
}

export async function reportPrinters(
  printers: Array<{ name: string; is_default: boolean }>
): Promise<ReportPrintersResult> {
  const res = await authedFetch('/printers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printers })
  })
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : `report printers (${res.status})`
    )
  }
  const name = typeof data.company_name === 'string' ? data.company_name : undefined
  const logoRaw =
    typeof data.company_logo_url === 'string'
      ? data.company_logo_url
      : data.company_logo_url === null
        ? null
        : undefined
  const companyId = typeof data.company_id === 'string' ? data.company_id : undefined
  const logo =
    logoRaw === null
      ? null
      : logoRaw
        ? ((await resolveLogoForShell(logoRaw)) ?? null)
        : undefined
  // company_id sozinho não atualiza UI — evita reintroduzir UUID como “nome”.
  if (name || logo !== undefined) {
    const next = patchSessionBranding({
      companyName: name,
      companyLogoUrl: logo,
      companyId
    })
    if (next) {
      getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, next)
    }
  } else if (companyId) {
    const next = patchSessionBranding({ companyId })
    if (next) {
      getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, next)
    }
  }
  const features = parseFeaturesMap(data.features)
  return {
    delideskPrinterEnabled:
      typeof data.delidesk_printer_enabled === 'boolean'
        ? data.delidesk_printer_enabled
        : features?.printer,
    delideskVirtualCaptureEnabled:
      typeof data.delidesk_virtual_capture_enabled === 'boolean'
        ? data.delidesk_virtual_capture_enabled
        : features?.virtual_capture,
    features
  }
}

export type NextJobResult = {
  job: AgentJob | null
  delideskPrinterEnabled?: boolean
  delideskVirtualCaptureEnabled?: boolean
  features?: Record<string, boolean>
  platformDisabled?: boolean
}

export async function fetchNextJob(): Promise<NextJobResult> {
  const res = await authedFetch('/jobs/next', { method: 'GET' })
  const data = await readJson(res)
  if (res.status === 401) {
    throw new AgentAuthError(
      typeof data.message === 'string' ? data.message : 'Não autorizado'
    )
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : `jobs/next (${res.status})`
    )
  }

  const platformDisabled = data.platform_disabled === true
  const features = parseFeaturesMap(data.features)
  const delideskPrinterEnabled =
    typeof data.delidesk_printer_enabled === 'boolean'
      ? data.delidesk_printer_enabled
      : features?.printer !== undefined
        ? features.printer
        : platformDisabled
          ? false
          : undefined
  const delideskVirtualCaptureEnabled =
    typeof data.delidesk_virtual_capture_enabled === 'boolean'
      ? data.delidesk_virtual_capture_enabled
      : features?.virtual_capture

  const jobRaw = data.job
  if (jobRaw == null || typeof jobRaw !== 'object') {
    return {
      job: null,
      delideskPrinterEnabled,
      delideskVirtualCaptureEnabled,
      features,
      platformDisabled
    }
  }

  const j = jobRaw as JsonMap
  const id = typeof j.id === 'string' ? j.id : null
  const content =
    typeof j.content_base64 === 'string' ? j.content_base64 : null
  if (!id || !content) {
    return {
      job: null,
      delideskPrinterEnabled,
      delideskVirtualCaptureEnabled,
      features,
      platformDisabled
    }
  }

  return {
    delideskPrinterEnabled,
    delideskVirtualCaptureEnabled,
    features,
    platformDisabled,
    job: {
      id,
      title: typeof j.title === 'string' ? j.title : `Job ${id.slice(0, 8)}`,
      content_base64: content,
      order_id: (j.order_id as number | string | null | undefined) ?? null,
      printer_id: typeof j.printer_id === 'string' ? j.printer_id : null,
      printer_name: typeof j.printer_name === 'string' ? j.printer_name : null
    }
  }
}

export async function postJobResult(
  jobId: string,
  ok: boolean,
  error?: string
): Promise<void> {
  const body: JsonMap = { ok }
  if (!ok && error) body.error = error

  const res = await authedFetch(`/jobs/${encodeURIComponent(jobId)}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : `job result (${res.status})`
    )
  }
}

export type VirtualCaptureResult = {
  ok: boolean
  orderCreated: boolean
  orderId?: number | string
  duplicate?: boolean
  /** Impressão teste do iFood → pedido de demonstração. */
  testPrint?: boolean
  error?: string
}

/** Envia bytes do spooler (base64) para o BE parsear com IA e criar pedido em análise. */
export async function postVirtualCapture(payload: {
  contentBase64: string
  byteLength: number
  contentSha256: string
  machineLabel?: string
}): Promise<VirtualCaptureResult> {
  const res = await authedFetch('/virtual-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content_base64: payload.contentBase64,
      byte_length: payload.byteLength,
      content_sha256: payload.contentSha256,
      machine_label: payload.machineLabel
    })
  })
  const data = await readJson(res)
  if (res.status === 401) {
    throw new AgentAuthError(
      typeof data.message === 'string' ? data.message : 'Não autorizado'
    )
  }
  if (!res.ok) {
    return {
      ok: false,
      orderCreated: false,
      error:
        typeof data.message === 'string'
          ? data.message
          : `virtual-capture (${res.status})`
    }
  }
  if (data.platform_disabled === true || data.delidesk_printer_enabled === false) {
    return {
      ok: true,
      orderCreated: false,
      error: 'delidesk_printer_disabled'
    }
  }
  return {
    ok: data.ok !== false,
    orderCreated: data.order_created === true,
    orderId: (data.order_id as number | string | undefined) ?? undefined,
    duplicate: data.duplicate === true,
    testPrint: data.test_print === true,
    error: typeof data.message === 'string' ? data.message : undefined
  }
}

export async function refreshTokens(): Promise<void> {
  await refreshSession()
}
