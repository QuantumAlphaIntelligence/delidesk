import { BrowserView, shell } from 'electron'
import { getMainWindow } from './window'
import { getPanelModeUrl, getPanelOrigin, getPanelUrl } from '../shared/config'
import { getDelivaiSession } from './delivai-session'
import type { PanelBounds, PanelMode } from '../shared/pdvai'
import { IPC } from '../shared/ipc'
import { patchSessionBranding } from './auth-store'
import { sanitizeCompanyName, sanitizeLogoUrl } from '../shared/branding'
import { resolveLogoForShell } from './logo-cache'

let view: BrowserView | null = null
let visible = false
let currentMode: PanelMode = 'orders'
/** True após loadURL (SSO ou aba) — evita sobrescrever sessão recém-hidratada. */
let contentLoaded = false
/** Seed SSO em andamento — showPanel só anexa a view, não dispara outro loadURL. */
let seeding = false
let embedHooked = false

const EMBED_BOOTSTRAP = `
(() => {
  try {
    localStorage.setItem('delivai_delidesk_embed', '1');
    document.documentElement.classList.add('delidesk-embed');
    if (!document.getElementById('delidesk-embed-css')) {
      const s = document.createElement('style');
      s.id = 'delidesk-embed-css';
      s.textContent = [
        'html.delidesk-embed .sidebar-shell{display:none!important;}',
        'html{color-scheme:dark;}',
        '*{scrollbar-width:thin;scrollbar-color:rgba(71,242,199,.55) rgba(13,60,79,.25);}',
        '*::-webkit-scrollbar{width:8px!important;height:8px!important;}',
        '*::-webkit-scrollbar-button{display:none!important;width:0!important;height:0!important;}',
        '*::-webkit-scrollbar-track{background:rgba(13,60,79,.28)!important;border-radius:9999px;}',
        '*::-webkit-scrollbar-thumb{background:linear-gradient(160deg,rgba(71,242,199,.55),rgba(71,242,199,.85))!important;border-radius:9999px;border:2px solid rgba(13,60,79,.35);}',
        '*::-webkit-scrollbar-corner{background:transparent!important;}'
      ].join('');
      document.head.appendChild(s);
    }
  } catch (e) {}
  true;
})()
`

function ensureView(): BrowserView {
  if (view) return view
  view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: getDelivaiSession()
    }
  })
  view.setBackgroundColor('#0D3C4F')
  view.webContents.setWindowOpenHandler(({ url }) => {
    // OAuth Google: permitir janela filha na mesma partition (localStorage do painel).
    try {
      const host = new URL(url).hostname
      if (
        host === 'accounts.google.com' ||
        host.endsWith('.google.com') ||
        host === 'accounts.youtube.com'
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              session: getDelivaiSession()
            }
          }
        }
      }
    } catch {
      /* fall through */
    }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (!embedHooked) {
    embedHooked = true
    view.webContents.on('did-finish-load', () => {
      void view?.webContents.executeJavaScript(EMBED_BOOTSTRAP).catch(() => undefined)
      // Após o painel hidratar customer, nome/logo vão para localStorage.
      void syncBrandingFromPanel().catch(() => undefined)
    })
  }
  return view
}

type PanelBranding = {
  name?: string
  logoUrl?: string
  cnpj?: string
}

async function readPanelBranding(v: BrowserView): Promise<PanelBranding> {
  try {
    const raw = (await v.webContents.executeJavaScript(`
      (() => {
        try {
          const brand = JSON.parse(localStorage.getItem('delidesk_branding') || '{}');
          const u = JSON.parse(localStorage.getItem('delivai_user') || '{}');
          const name = (brand.name || u.name || u.nome_da_loja || '').toString().trim();
          const cnpj = (brand.cnpj || u.cnpj || localStorage.getItem('cnpj') || '')
            .toString().replace(/\\D/g, '');
          const logoUrl = (brand.logoUrl || '').toString().trim();
          return { name, cnpj, logoUrl };
        } catch (e) {
          return {};
        }
      })()
    `)) as PanelBranding
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** Lê nome/logo/CNPJ do BrowserView e atualiza a sessão Electron (sem UUID). */
export async function syncBrandingFromPanel(): Promise<void> {
  if (!view) return
  const brand = await readPanelBranding(view)
  const name = sanitizeCompanyName(brand.name)
  const remoteLogo = sanitizeLogoUrl(brand.logoUrl)
  const logo = remoteLogo ? await resolveLogoForShell(remoteLogo) : undefined
  const cnpj = brand.cnpj?.replace(/\D/g, '')
  if (!name && !logo && !remoteLogo && !(cnpj && cnpj.length === 14)) return
  const next = patchSessionBranding({
    companyName: name,
    // data URL ok; se o download falhou, null limpa URL remota quebrada.
    companyLogoUrl: remoteLogo ? logo ?? null : undefined,
    companyCnpj: cnpj
  })
  if (next) {
    getMainWindow()?.webContents.send(IPC.AUTH_SESSION_CHANGED, next)
  }
}

/** Após SSO: tenta logo/nome imediatamente e de novo quando o customer carregar. */
export async function hydrateBrandingAfterSeed(): Promise<void> {
  await syncBrandingFromPanel()
  const delays = [1500, 3500, 7000]
  for (const ms of delays) {
    await new Promise((r) => setTimeout(r, ms))
    await syncBrandingFromPanel()
  }
}

function urlFor(mode: PanelMode): string {
  return getPanelModeUrl(mode)
}

function isAbortError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('ERR_ABORTED') || msg.includes('(-3)')
}

/** loadURL com catch: redirect/SSO aborta a promise com ERR_ABORTED (benigno). */
async function safeLoadURL(v: BrowserView, url: string): Promise<void> {
  try {
    await v.webContents.loadURL(url)
  } catch (err) {
    if (isAbortError(err)) {
      console.info('[panel] load aborted (ok)', url.slice(0, 80))
      return
    }
    console.warn('[panel] loadURL failed', url.slice(0, 80), err)
  }
}

function normalizeUrl(u: string): string {
  return u.split('#')[0].replace(/\/$/, '')
}

function pathKey(u: string): string {
  try {
    return new URL(u).pathname.replace(/\/$/, '')
  } catch {
    return normalizeUrl(u)
  }
}

function alreadyOn(v: BrowserView, target: string): boolean {
  try {
    const cur = v.webContents.getURL()
    if (!cur || cur === 'about:blank') return false
    return pathKey(cur) === pathKey(target)
  } catch {
    return false
  }
}

/**
 * Após oauth/token: carrega /delidesk-sso na partition do painel
 * para gravar localStorage.delivai_user (mesmo sem a aba visível).
 */
export async function seedPanelSession(panelSsoCode: string): Promise<void> {
  const code = panelSsoCode.trim()
  if (!code) return

  const v = ensureView()
  const ssoUrl = `${getPanelOrigin()}/delidesk-sso?code=${encodeURIComponent(code)}`
  currentMode = 'orders'
  seeding = true

  console.info('[panel] seeding SSO session')
  try {
    await safeLoadURL(v, ssoUrl)

    // Espera redirect para /dashboard (window.location.replace no front)
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        v.webContents.removeListener('did-navigate', onNav)
        v.webContents.removeListener('did-navigate-in-page', onNav)
        resolve()
      }
      const onNav = (_e: Electron.Event, url: string): void => {
        if (url.includes('/dashboard')) finish()
      }
      const timer = setTimeout(finish, 8_000)
      v.webContents.on('did-navigate', onNav)
      v.webContents.on('did-navigate-in-page', onNav)
      if (alreadyOn(v, getPanelUrl())) finish()
    })
  } finally {
    contentLoaded = true
    seeding = false
  }

  void hydrateBrandingAfterSeed().catch((err) => {
    console.warn('[panel] branding hydrate failed', err)
  })
}

export function showPanel(mode: PanelMode, bounds: PanelBounds): void {
  const win = getMainWindow()
  if (!win) return

  const v = ensureView()
  const target = urlFor(mode)
  const needLoad =
    !seeding &&
    (!contentLoaded || currentMode !== mode) &&
    !alreadyOn(v, target)
  currentMode = mode

  if (!win.getBrowserViews().includes(v)) {
    win.addBrowserView(v)
  }

  v.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(100, Math.round(bounds.width)),
    height: Math.max(100, Math.round(bounds.height))
  })
  v.setAutoResize({ width: true, height: true })

  if (needLoad) {
    void safeLoadURL(v, target).then(() => {
      contentLoaded = true
    })
  } else {
    void v.webContents.executeJavaScript(EMBED_BOOTSTRAP).catch(() => undefined)
  }
  visible = true
}

export function setPanelBounds(bounds: PanelBounds): void {
  if (!view || !visible) return
  view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(100, Math.round(bounds.width)),
    height: Math.max(100, Math.round(bounds.height))
  })
}

export function hidePanel(): void {
  const win = getMainWindow()
  if (win && view) {
    win.removeBrowserView(view)
  }
  visible = false
}

export function reloadPanel(): void {
  if (!view) return
  void safeLoadURL(view, urlFor(currentMode)).then(() => {
    contentLoaded = true
  })
}

export function openPanelInBrowser(mode: PanelMode): void {
  // Sem embed no browser externo — sidebar completa do DelivAI
  try {
    const u = new URL(urlFor(mode))
    u.searchParams.delete('embed')
    void shell.openExternal(u.toString())
  } catch {
    void shell.openExternal(getPanelOrigin())
  }
}

export function destroyPanel(): void {
  hidePanel()
  view = null
  contentLoaded = false
  seeding = false
  embedHooked = false
}
