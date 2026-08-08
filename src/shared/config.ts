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

/** Origem do front (mesmo host de PANEL/AUTH) para rotas como /delidesk-sso. */
export function getPanelOrigin(): string {
  const raw =
    process.env.DELIDESK_PANEL_URL ||
    process.env.DELIDESK_AUTH_URL ||
    'https://app.delivai.com.br/dashboard/orders'
  try {
    return new URL(raw).origin
  } catch {
    return 'https://app.delivai.com.br'
  }
}

/** Garante query embed=delidesk para o front esconder a sidebar web. */
export function withEmbedQuery(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('embed', 'delidesk')
    return u.toString()
  } catch {
    return url.includes('?') ? `${url}&embed=delidesk` : `${url}?embed=delidesk`
  }
}

export function getPanelPathUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return withEmbedQuery(`${getPanelOrigin()}${clean}`)
}

export function getPanelUrl(): string {
  if (process.env.DELIDESK_PANEL_URL) {
    return withEmbedQuery(process.env.DELIDESK_PANEL_URL)
  }
  return getPanelPathUrl('/dashboard/orders')
}

/** Conversas / WhatsApp no painel. Override com DELIDESK_CHAT_URL. */
export function getChatUrl(): string {
  if (process.env.DELIDESK_CHAT_URL) {
    return withEmbedQuery(process.env.DELIDESK_CHAT_URL)
  }
  return getPanelPathUrl('/dashboard/conversations')
}

export function getPanelModeUrl(mode: string): string {
  switch (mode) {
    case 'chat':
      return getChatUrl()
    case 'delivery':
      return getPanelPathUrl('/dashboard/delivery')
    case 'motoboys':
      return getPanelPathUrl('/dashboard/motoboys')
    case 'schedule':
      return getPanelPathUrl('/dashboard/schedule')
    case 'company':
      return getPanelPathUrl('/dashboard/company')
    case 'license':
      return getPanelPathUrl('/dashboard/license')
    case 'clients':
      return getPanelPathUrl('/dashboard/clientes')
    case 'dev-home':
      return getPanelPathUrl('/dev')
    case 'dev-licenses':
      return getPanelPathUrl('/dev/licenses')
    case 'dev-contracts':
      return getPanelPathUrl('/dev/contracts')
    case 'dev-evolution':
      return getPanelPathUrl('/dev/evolution')
    case 'dev-bot':
      return getPanelPathUrl('/dev/bot')
    case 'dev-delidesk':
      return getPanelPathUrl('/dev/delidesk')
    case 'dev-companies':
      return getPanelPathUrl('/dev/cardapio')
    case 'dev-prompts':
      return getPanelPathUrl('/dev/prompts')
    case 'dev-clients':
      return getPanelPathUrl('/dev/clientes')
    case 'dev-database':
      return getPanelPathUrl('/dev/database')
    case 'dev-logs':
      return getPanelPathUrl('/dev/logs')
    case 'dev-observability':
      return getPanelPathUrl('/dev/observability')
    case 'dev-permissoes':
      return getPanelPathUrl('/dev/permissoes')
    case 'orders':
    default:
      return getPanelUrl()
  }
}

export function generatePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')
  return { verifier, challenge, state }
}
