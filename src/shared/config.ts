import { createHash, randomBytes } from 'crypto'
import { PROTOCOL } from './ipc'

export const REDIRECT_URI = `${PROTOCOL}://auth/callback`

/**
 * Mock de auth: `1` força, `0` desliga; omitido = mock só em unpackaged (dev).
 * Passar `isPackaged` do Electron quando disponível.
 */
export function isAuthMockEnabled(isPackaged?: boolean): boolean {
  if (process.env.DELIDESK_AUTH_MOCK === '0') return false
  if (process.env.DELIDESK_AUTH_MOCK === '1') return true
  if (typeof isPackaged === 'boolean') return !isPackaged
  return process.env.NODE_ENV !== 'production'
}

export function getBackendBaseUrl(): string {
  return (
    process.env.DELIDESK_API_URL ||
    process.env.DELIDESK_BACKEND_URL ||
    'https://api.delivai.com.br'
  ).replace(/\/$/, '')
}

/** URL da tela Autorizar no front DelivAI. Override com DELIDESK_AUTH_URL. */
export function getAuthAuthorizeUrl(state: string, machineLabel?: string): string {
  const base =
    process.env.DELIDESK_AUTH_URL || 'https://app.delivai.com.br/autorizar'

  const url = new URL(base)
  url.searchParams.set('client_id', 'delidesk')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'print panel pdvai')
  if (machineLabel) url.searchParams.set('machine_label', machineLabel)
  return url.toString()
}

export function getPanelUrl(): string {
  return (
    process.env.DELIDESK_PANEL_URL ||
    'https://app.delivai.com.br/dashboard/orders'
  )
}

/** Origem do front (mesmo host de PANEL/AUTH) para rotas como /delidesk-sso. */
export function getPanelOrigin(): string {
  try {
    return new URL(getPanelUrl()).origin
  } catch {
    return 'https://app.delivai.com.br'
  }
}

/** Conversas / WhatsApp no painel (ou Web Chat). Override com DELIDESK_CHAT_URL. */
export function getChatUrl(): string {
  return (
    process.env.DELIDESK_CHAT_URL ||
    process.env.DELIDESK_PANEL_URL ||
    'https://app.delivai.com.br/dashboard/orders'
  )
}

export function generatePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')
  return { verifier, challenge, state }
}
