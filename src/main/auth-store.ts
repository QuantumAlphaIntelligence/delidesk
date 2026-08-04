import { safeStorage, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { AuthSession } from '../shared/ipc'
import { getBackendBaseUrl, REDIRECT_URI } from '../shared/config'
import {
  sanitizeCompanyName,
  sanitizeLogoUrl
} from '../shared/branding'

const FILE = 'session.bin'

function sessionPath(): string {
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

/** Remove UUID legado e URLs remotas de logo (só data URL é estável no shell). */
function sanitizeSession(session: AuthSession): AuthSession {
  const companyName = sanitizeCompanyName(session.companyName)
  let companyLogoUrl = sanitizeLogoUrl(session.companyLogoUrl)
  // URL https no renderer do Electron costuma quebrar (ícone partido) —
  // limpa até o main baixar de novo como data URL.
  if (companyLogoUrl && !companyLogoUrl.startsWith('data:image/')) {
    companyLogoUrl = undefined
  }
  const companyCnpj = session.companyCnpj?.replace(/\D/g, '') || undefined
  const next: AuthSession = {
    ...session,
    companyName,
    companyLogoUrl,
    companyCnpj: companyCnpj && companyCnpj.length === 14 ? companyCnpj : undefined
  }
  const dirty =
    next.companyName !== session.companyName ||
    next.companyLogoUrl !== session.companyLogoUrl ||
    next.companyCnpj !== session.companyCnpj
  if (dirty) {
    try {
      setSession(next)
    } catch {
      /* ignore */
    }
  }
  return next
}

export function getSession(): AuthSession | null {
  const path = sessionPath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path)
    const json = decrypt(raw)
    return sanitizeSession(JSON.parse(json) as AuthSession)
  } catch {
    return null
  }
}

export function setSession(session: AuthSession): void {
  const path = sessionPath()
  const payload = encrypt(JSON.stringify(session))
  writeFileSync(path, payload)
}

export function clearSession(): void {
  const path = sessionPath()
  if (existsSync(path)) unlinkSync(path)
}

export function saveMockSession(companyName: string): AuthSession {
  const session: AuthSession = {
    accessToken: `mock_access_${Date.now()}`,
    refreshToken: `mock_refresh_${Date.now()}`,
    companyName: sanitizeCompanyName(companyName) || companyName,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  }
  setSession(session)
  return session
}

type TokenResponse = {
  ok?: boolean
  status?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  company_id?: string
  company_name?: string
  company_logo_url?: string | null
  agent_id?: string
  panel_sso_code?: string
  message?: string
}

export type AuthPollResult =
  | { status: 'pending' }
  | { status: 'consumed' }
  | { status: 'authorized'; session: AuthSession; panelSsoCode?: string }

export type TokenExchangeResult = {
  session: AuthSession
  panelSsoCode?: string
}

function sessionFromTokenResponse(data: TokenResponse): AuthSession {
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 2_592_000
  // Nunca usar company_id (UUID) como rótulo — só company_name real.
  const name = sanitizeCompanyName(data.company_name)
  const logo = sanitizeLogoUrl(data.company_logo_url)
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    companyName: name,
    companyLogoUrl: logo,
    expiresAt: Date.now() + expiresIn * 1000,
    agentId: data.agent_id,
    companyId: data.company_id
  }
}

/** Atualiza nome/logo/CNPJ da loja sem trocar tokens (ex.: painel ou /printers). */
export function patchSessionBranding(partial: {
  companyName?: string
  companyLogoUrl?: string | null
  companyCnpj?: string
  companyId?: string
}): AuthSession | null {
  const current = getSession()
  if (!current) return null
  const name = sanitizeCompanyName(partial.companyName)
  const logo =
    partial.companyLogoUrl === null
      ? undefined
      : sanitizeLogoUrl(partial.companyLogoUrl)
  const cnpjDigits = partial.companyCnpj?.replace(/\D/g, '')
  const next: AuthSession = {
    ...current,
    companyName: name || current.companyName,
    companyLogoUrl: logo !== undefined ? logo : current.companyLogoUrl,
    companyCnpj:
      cnpjDigits && cnpjDigits.length === 14 ? cnpjDigits : current.companyCnpj,
    companyId: partial.companyId?.trim() || current.companyId
  }
  if (
    next.companyName === current.companyName &&
    next.companyLogoUrl === current.companyLogoUrl &&
    next.companyCnpj === current.companyCnpj &&
    next.companyId === current.companyId
  ) {
    return current
  }
  setSession(next)
  return next
}

/**
 * Poll após o lojista autorizar no browser — evita delidesk:// e o popup “Abrir Electron?”.
 * Pendente → `{ status: 'pending' }`; autorizado → grava sessão e devolve tokens.
 */
export async function pollAuthForTokens(
  state: string,
  codeVerifier: string
): Promise<AuthPollResult> {
  const url = `${getBackendBaseUrl()}/webhook/agent/oauth/poll`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      state,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'delidesk'
    })
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok) {
    throw new Error(data.message || `Falha no poll (${res.status})`)
  }
  if (data.status === 'pending') return { status: 'pending' }
  if (data.status === 'consumed') return { status: 'consumed' }
  if (data.access_token) {
    const session = sessionFromTokenResponse(data)
    setSession(session)
    return {
      status: 'authorized',
      session,
      panelSsoCode: data.panel_sso_code?.trim() || undefined
    }
  }
  throw new Error(data.message || 'Resposta de poll inválida')
}

/** Troca authorization code + PKCE por device tokens no backend (legado delidesk://). */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenExchangeResult> {
  const url = `${getBackendBaseUrl()}/webhook/agent/oauth/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'delidesk'
    })
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || `Falha no token (${res.status})`)
  }
  const session = sessionFromTokenResponse(data)
  setSession(session)
  const panelSsoCode = data.panel_sso_code?.trim() || undefined
  return { session, panelSsoCode }
}

/** Rotaciona device tokens via POST /oauth/refresh. */
export async function refreshSession(): Promise<AuthSession> {
  const current = getSession()
  if (!current?.refreshToken) {
    throw new Error('Sem refresh token')
  }
  const url = `${getBackendBaseUrl()}/webhook/agent/oauth/refresh`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: current.refreshToken })
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || `Falha no refresh (${res.status})`)
  }
  const fresh = sessionFromTokenResponse(data)
  const session: AuthSession = {
    ...fresh,
    companyName: fresh.companyName || current.companyName,
    companyLogoUrl: fresh.companyLogoUrl || current.companyLogoUrl,
    companyCnpj: fresh.companyCnpj || current.companyCnpj,
    companyId: fresh.companyId || current.companyId,
    agentId: data.agent_id ?? current.agentId
  }
  setSession(session)
  return session
}

export function isMockSession(session: AuthSession | null | undefined): boolean {
  if (!session?.accessToken) return true
  return session.accessToken.startsWith('mock_access_')
}

/** Fallback legado (mock) — só usar com AUTH_MOCK ativo. */
export function saveSessionFromCallback(code: string): AuthSession {
  const session: AuthSession = {
    accessToken: `mock_access_${code.slice(0, 12)}`,
    refreshToken: `mock_refresh_${code.slice(0, 8)}`,
    companyName: 'Loja Centro',
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  }
  setSession(session)
  return session
}
