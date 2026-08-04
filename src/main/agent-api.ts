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

export async function reportPrinters(
  printers: Array<{ name: string; is_default: boolean }>
): Promise<void> {
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
}

export async function fetchNextJob(): Promise<AgentJob | null> {
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

  const job = data.job
  if (job == null || typeof job !== 'object') return null

  const j = job as JsonMap
  const id = typeof j.id === 'string' ? j.id : null
  const content =
    typeof j.content_base64 === 'string' ? j.content_base64 : null
  if (!id || !content) return null

  return {
    id,
    title: typeof j.title === 'string' ? j.title : `Job ${id.slice(0, 8)}`,
    content_base64: content,
    order_id: (j.order_id as number | string | null | undefined) ?? null
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

export async function refreshTokens(): Promise<void> {
  await refreshSession()
}
