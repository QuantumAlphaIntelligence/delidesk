import { BrowserView, shell } from 'electron'
import { getMainWindow } from './window'
import { getChatUrl, getPanelOrigin, getPanelUrl } from '../shared/config'
import { getDelivaiSession } from './delivai-session'
import type { PanelBounds, PanelMode } from '../shared/pdvai'

let view: BrowserView | null = null
let visible = false
let currentMode: PanelMode = 'orders'
/** True após loadURL (SSO ou aba) — evita sobrescrever sessão recém-hidratada. */
let contentLoaded = false
/** Seed SSO em andamento — showPanel só anexa a view, não dispara outro loadURL. */
let seeding = false

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
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  return view
}

function urlFor(mode: PanelMode): string {
  return mode === 'chat' ? getChatUrl() : getPanelUrl()
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

function alreadyOn(v: BrowserView, target: string): boolean {
  try {
    const cur = v.webContents.getURL()
    if (!cur || cur === 'about:blank') return false
    const a = normalizeUrl(cur)
    const b = normalizeUrl(target)
    if (a === b) return true
    // SSO já redirecionou para /dashboard/orders*
    if (target.includes('/dashboard/orders') && a.includes('/dashboard/orders')) {
      return true
    }
    return false
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
  void shell.openExternal(urlFor(mode))
}

export function destroyPanel(): void {
  hidePanel()
  view = null
  contentLoaded = false
  seeding = false
}
