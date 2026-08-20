import { BrowserView, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getMainWindow, resolveWindowTitle } from './window'
import {
  getPanelModeUrl,
  getPanelOrigin,
  getPanelPathUrl,
  panelModeFromUrl
} from '../shared/config'
import { getDelivaiSession } from './delivai-session'
import type { PanelBounds, PanelMode } from '../shared/pdvai'
import { IPC } from '../shared/ipc'
import { clearSession, getSession, isMockSession, patchSessionBranding } from './auth-store'
import { sanitizeCompanyName, sanitizeLogoUrl } from '../shared/branding'
import { resolveLogoForShell } from './logo-cache'
import {
  AgentAuthError,
  fetchPanelHydrate,
  fetchPanelSessionByCode,
  type PanelSnapshot
} from './agent-api'
import {
  clearPanelSnapshot,
  loadPanelSnapshot,
  savePanelSnapshot
} from './panel-snapshot-store'

let view: BrowserView | null = null
let visible = false
let currentMode: PanelMode = 'orders'
/** True após loadURL (SSO ou aba) — evita sobrescrever sessão recém-hidratada. */
let contentLoaded = false
/** Seed SSO em andamento — showPanel só anexa a view, não dispara outro loadURL. */
let seeding = false
let embedHooked = false
let reauthInFlight = false
/** Recuperando /login no BrowserView — não desloga o agente. */
let recovering = false
/** Evita reload infinito se o cookie do painel não grudar. */
let lastRecoverAt = 0
/** Popover do shell (card versão) — BrowserView some temporariamente. */
let panelOverlaySuppressed = false
let lastPanelBounds: { x: number; y: number; width: number; height: number } | null = null

/** Prefixo em console.log → main sincroniza a rail (React Router usa pushState sem did-navigate-in-page). */
const PANEL_NAV_CONSOLE_PREFIX = '[delidesk-panel-nav]'

const EMBED_BOOTSTRAP = `
(() => {
  try {
    sessionStorage.setItem('delivai_auth_grace_until', String(Date.now() + 120000));
    sessionStorage.removeItem('delivai_session_expired_redirect');
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
    if (!window.__delideskNavHooked) {
      window.__delideskNavHooked = true;
      const notify = () => {
        try {
          console.log('[delidesk-panel-nav]', location.href);
        } catch (e) {}
      };
      const wrap = (fn) => function () {
        const ret = fn.apply(this, arguments);
        notify();
        return ret;
      };
      history.pushState = wrap(history.pushState.bind(history));
      history.replaceState = wrap(history.replaceState.bind(history));
      window.addEventListener('popstate', notify);
      notify();
    }
  } catch (e) {}
  true;
})()
`

function panelEmbedPreloadPath(): string | undefined {
  const p = join(__dirname, '../preload/panel-embed.js')
  return existsSync(p) ? p : undefined
}

function agentSessionAlive(): boolean {
  const agent = getSession()
  return Boolean(agent?.accessToken && !isMockSession(agent))
}

function ensureView(): BrowserView {
  if (view) return view
  const preload = panelEmbedPreloadPath()
  view = new BrowserView({
    webPreferences: {
      ...(preload ? { preload } : {}),
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
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.setTitle(resolveWindowTitle())
      emitPanelNavFromUrl(view?.webContents.getURL() || '')
    })
    const blockLoginNav = (event: { preventDefault: () => void }, url: string): void => {
      if (seeding) return
      if (!isPanelLoginUrl(url)) return
      if (!agentSessionAlive()) return
      event.preventDefault()
      void recoverPanelSession('bloqueou /login')
    }
    view.webContents.on('will-navigate', (event, url) => {
      blockLoginNav(event, url)
    })
    view.webContents.on('will-redirect', (event, url) => {
      blockLoginNav(event, url)
    })
    // SPA navigate (React Router) — sync rail quando o painel muda de rota sozinho.
    view.webContents.on('did-navigate-in-page', (_e, url) => {
      emitPanelNavFromUrl(url)
    })
    view.webContents.on('did-navigate', (_e, url) => {
      emitPanelNavFromUrl(url)
    })
    // pushState/replaceState do painel — Electron às vezes não emite did-navigate-in-page.
    view.webContents.on('console-message', (event: { message?: string }, ...rest: unknown[]) => {
      const legacyMsg = typeof rest[1] === 'string' ? rest[1] : ''
      const msg = String(event?.message || legacyMsg || '')
      if (!msg.includes(PANEL_NAV_CONSOLE_PREFIX)) return
      const idx = msg.indexOf(PANEL_NAV_CONSOLE_PREFIX)
      const url = msg.slice(idx + PANEL_NAV_CONSOLE_PREFIX.length).trim()
      if (url) emitPanelNavFromUrl(url)
    })
    // BrowserView também dispara page-title-updated na janela pai (virava “DeliDesk”/Pedidos).
    view.webContents.on('page-title-updated', (e) => {
      e.preventDefault()
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.setTitle(resolveWindowTitle())
    })
  }
  return view
}

function emitPanelNavFromUrl(url: string): void {
  if (isPanelLoginUrl(url)) {
    if (!seeding && !recovering) {
      void recoverPanelSession('painel em /login')
    }
    return
  }
  const mode = panelModeFromUrl(url) as PanelMode | null
  if (!mode) return
  if (mode === currentMode) return
  currentMode = mode
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.PANEL_NAV_CHANGED, mode)
  }
}

function isPanelLoginUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return path === '/login' || path.startsWith('/login/')
  } catch {
    return false
  }
}

/** Só quando o token do PC (agente) morreu de verdade — não por /login no BrowserView. */
export function forcePanelReauth(reason: string): void {
  if (reauthInFlight) return
  reauthInFlight = true
  contentLoaded = false
  recovering = false
  seeding = false
  console.warn('[panel] reauth required:', reason)
  hidePanel()
  clearSession()
  clearPanelSnapshot()
  void clearPanelSessionCookie().catch(() => undefined)
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.PANEL_REAUTH_REQUIRED, reason)
    win.webContents.send(IPC.AUTH_SESSION_CHANGED, null)
  }
  setTimeout(() => {
    reauthInFlight = false
  }, 2500)
}

async function restorePanelAuthInPlace(): Promise<boolean> {
  const v = view
  if (!v) return false
  let snap = loadPanelSnapshot()
  try {
    snap = await fetchPanelHydrate()
  } catch (err) {
    if (err instanceof AgentAuthError) throw err
    if (!snap) snap = snapshotFromAgentSession()
  }
  if (!snap) return false
  try {
    snap = await ensurePanelSessionCookie(snap)
  } catch (err) {
    if (err instanceof AgentAuthError) throw err
  }
  savePanelSnapshot(snap)
  await injectPanelSnapshot(v, snap)
  return true
}

/** Painel caiu em /login: regrava cookie + localStorage. Não manda o lojista autenticar o PC de novo. */
async function recoverPanelSession(reason: string): Promise<void> {
  if (recovering || seeding || reauthInFlight) return
  if (!agentSessionAlive()) {
    forcePanelReauth(reason)
    return
  }
  recovering = true
  console.warn('[panel] recover (keep agent session):', reason)
  try {
    const ok = await restorePanelAuthInPlace()
    if (!ok) {
      console.warn('[panel] recover: sem snapshot — agente permanece logado')
      return
    }
    const v = view
    if (!v) return
    const now = Date.now()
    if (now - lastRecoverAt < 15_000) {
      console.warn('[panel] recover: cooldown — não recarrega de novo')
      return
    }
    lastRecoverAt = now
    const target = urlFor(currentMode)
    if (isPanelLoginUrl(v.webContents.getURL())) {
      await navigatePanelInPage(v, target)
    } else {
      v.webContents.reload()
      await waitForLoad(v)
    }
  } catch (err) {
    if (err instanceof AgentAuthError) {
      forcePanelReauth(err.message || reason)
      return
    }
    console.warn('[panel] recover failed', err)
  } finally {
    setTimeout(() => {
      recovering = false
    }, 4000)
  }
}

async function clearPanelSessionCookie(): Promise<void> {
  const origin = getPanelOrigin()
  const ses = getDelivaiSession()
  const cookies = await ses.cookies.get({ url: origin })
  for (const c of cookies) {
    if (c.name === 'delivai_session' || c.name.startsWith('delivai_')) {
      await ses.cookies.remove(origin, c.name)
    }
  }
}

/** Grava cookie HttpOnly no partition do BrowserView (mesmo origin do site). */
async function writePanelSessionCookie(snap: PanelSnapshot): Promise<void> {
  const token = snap.panelSessionToken?.trim()
  if (!token) return
  const name = snap.panelSessionCookie?.trim() || 'delivai_session'
  const origin = getPanelOrigin()
  const secure = origin.startsWith('https:')
  await getDelivaiSession().cookies.set({
    url: `${origin}/`,
    name,
    value: token,
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 86_400
  })
  console.info('[panel] session cookie set', { name, origin })
}

/**
 * Garante token de sessão SEC-2 (API) + cookie no partition.
 * Cache local sozinho não basta quando SESSION_AUTH está ligado.
 */
async function ensurePanelSessionCookie(snap: PanelSnapshot): Promise<PanelSnapshot> {
  if (snap.panelSessionToken?.trim()) {
    await writePanelSessionCookie(snap)
    return snap
  }
  if (isMockSession(getSession())) {
    return snap
  }
  try {
    const fresh = await fetchPanelHydrate()
    const merged: PanelSnapshot = {
      ...snap,
      ...fresh,
      user: fresh.user || snap.user,
      licenseModules: fresh.licenseModules ?? snap.licenseModules,
      companyName: fresh.companyName ?? snap.companyName,
      companyLogoUrl: fresh.companyLogoUrl ?? snap.companyLogoUrl
    }
    if (merged.panelSessionToken?.trim()) {
      await writePanelSessionCookie(merged)
      return merged
    }
    // API respondeu sem token (SESSION_AUTH off) — localStorage basta / dual header.
    return merged
  } catch (err) {
    console.warn('[panel] panel-hydrate for cookie failed', err)
    if (err instanceof AgentAuthError) throw err
    // Agente ainda válido: segue com localStorage; o cookie tenta de novo no recover.
    return snap
  }
}

/** CNPJ interno DelivAI — espelho de front `DELIVAI_INTERNAL_CNPJ`. */
const DELIVAI_INTERNAL_CNPJ = '99999999000199'

type PanelBranding = {
  name?: string
  logoUrl?: string
  cnpj?: string
  shellRole?: 'store' | 'dev'
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
          const isCollab = u.isCollaborator === true;
          const shellRole = (isCollab && cnpj === '${DELIVAI_INTERNAL_CNPJ}') ? 'dev' : 'store';
          return { name, cnpj, logoUrl, shellRole };
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

/** Lê nome/logo/CNPJ/papel do BrowserView e atualiza a sessão Electron (sem UUID). */
export async function syncBrandingFromPanel(): Promise<void> {
  if (!view) return
  const brand = await readPanelBranding(view)
  const name = sanitizeCompanyName(brand.name)
  const remoteLogo = sanitizeLogoUrl(brand.logoUrl)
  const logo = remoteLogo ? await resolveLogoForShell(remoteLogo) : undefined
  const cnpj = brand.cnpj?.replace(/\D/g, '')
  const shellRole = brand.shellRole === 'dev' || brand.shellRole === 'store' ? brand.shellRole : undefined
  if (!name && !logo && !remoteLogo && !(cnpj && cnpj.length === 14) && !shellRole) return
  const next = patchSessionBranding({
    companyName: name,
    // data URL ok; se o download falhou, null limpa URL remota quebrada.
    companyLogoUrl: remoteLogo ? logo ?? null : undefined,
    companyCnpj: cnpj,
    shellRole
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
  const LOAD_MS = 10_000
  try {
    await Promise.race([
      v.webContents.loadURL(url),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`loadURL timeout ${LOAD_MS}ms`)), LOAD_MS)
      })
    ])
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

/** Troca de aba: SPA no mesmo origin. Full load só se a view ainda não tem o site. */
async function navigatePanelInPage(v: BrowserView, target: string): Promise<void> {
  if (alreadyOn(v, target)) return
  const cur = v.webContents.getURL()
  if (!cur || cur === 'about:blank' || !cur.startsWith('http')) {
    await safeLoadURL(v, target)
    return
  }
  try {
    const dest = new URL(target)
    const curOrigin = new URL(cur).origin
    if (dest.origin !== curOrigin) {
      await safeLoadURL(v, target)
      return
    }
    if (isPanelLoginUrl(cur)) {
      await v.webContents.executeJavaScript(
        `window.location.replace(${JSON.stringify(target)}); true;`,
        true
      )
      await waitForLoad(v)
      return
    }
    const href = `${dest.pathname}${dest.search}`
    const landed = (await v.webContents.executeJavaScript(
      `(() => {
        try {
          sessionStorage.setItem('delivai_auth_grace_until', String(Date.now() + 120000));
          sessionStorage.removeItem('delivai_session_expired_redirect');
          localStorage.setItem('delivai_delidesk_embed', '1');
          const href = ${JSON.stringify(href)};
          if ((location.pathname + location.search) !== href) {
            window.history.pushState({}, '', href);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
          return location.pathname + location.search;
        } catch (e) {
          return '';
        }
      })()`,
      true
    )) as string
    if (pathKey(`https://x${landed || '/'}`) !== pathKey(target)) {
      await safeLoadURL(v, target)
    }
  } catch {
    await safeLoadURL(v, target)
  }
}

function panelDestPath(snap: PanelSnapshot): string {
  const u = snap.user
  const cnpj = String(u.cnpj || '').replace(/\D/g, '')
  const isCollab = u.isCollaborator === true || u.is_collaborator === true
  const internal = '99999999000199'
  if (isCollab && cnpj === internal) return '/dev'
  return '/dashboard/orders'
}

async function injectPanelSnapshot(v: BrowserView, snap: PanelSnapshot): Promise<void> {
  const payload = JSON.stringify({
    user: snap.user,
    license_modules: snap.licenseModules ?? {},
    company_name: snap.companyName ?? '',
    company_logo_url: snap.companyLogoUrl ?? '',
    embed_key: 'delivai_delidesk_embed'
  })
  await v.webContents.executeJavaScript(
    `(() => {
      const d = ${payload};
      try {
        localStorage.setItem('delivai_user', JSON.stringify(d.user));
        const cnpj = String(d.user.cnpj || '').replace(/\\D/g, '');
        if (cnpj) localStorage.setItem('cnpj', cnpj);
        localStorage.setItem('license_modules', JSON.stringify(d.license_modules || {}));
        localStorage.setItem(d.embed_key, '1');
        try {
          sessionStorage.setItem('delivai_auth_grace_until', String(Date.now() + 120000));
          sessionStorage.removeItem('delivai_session_expired_redirect');
        } catch (e) {}
        const brand = {
          name: (d.company_name || d.user.name || '').toString().trim() || undefined,
          logoUrl: (d.company_logo_url || '').toString().trim() || undefined,
          cnpj: cnpj || undefined
        };
        if (brand.name || brand.logoUrl || brand.cnpj) {
          localStorage.setItem('delidesk_branding', JSON.stringify(brand));
        }
        document.documentElement.classList.add('delidesk-embed');
      } catch (e) {}
      true;
    })()`,
    true
  )
}

function waitForLoad(v: BrowserView, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      v.webContents.removeListener('did-finish-load', onLoad)
      v.webContents.removeListener('did-fail-load', onFail)
      resolve()
    }
    const onLoad = (): void => finish()
    const onFail = (): void => finish()
    const timer = setTimeout(finish, timeoutMs)
    v.webContents.once('did-finish-load', onLoad)
    v.webContents.once('did-fail-load', onFail)
  })
}

async function panelHasUser(v: BrowserView): Promise<boolean> {
  try {
    const url = v.webContents.getURL()
    if (!url || url === 'about:blank' || !url.startsWith('http')) return false
    return Boolean(
      await v.webContents.executeJavaScript(
        `(() => { try { const u = localStorage.getItem('delivai_user'); return !!(u && u.length > 8); } catch (e) { return false; } })()`,
        true
      )
    )
  } catch {
    return false
  }
}

/** Fallback: monta snapshot mínimo a partir da sessão do agente (shell já logado). */
function snapshotFromAgentSession(): PanelSnapshot | null {
  const s = getSession()
  if (!s?.accessToken || isMockSession(s)) return null
  const cnpj = (s.companyCnpj || '').replace(/\D/g, '')
  const name = (s.companyName || 'Loja').trim() || 'Loja'
  const isDev = s.shellRole === 'dev'
  return {
    user: {
      id: s.companyId || cnpj || s.agentId || 'delidesk',
      name,
      cnpj: cnpj || (isDev ? '99999999000199' : ''),
      email: '',
      token: `local_token_${cnpj || s.agentId || 'desk'}`,
      isCollaborator: isDev
    },
    licenseModules: {
      mod_atendimento: true,
      mod_motoboy: true,
      mod_gerente: true,
      mod_agendamento: true,
      mod_financeiro: true
    },
    companyName: name,
    companyLogoUrl: s.companyLogoUrl ?? null
  }
}

/**
 * Injeta no origin do painel (nunca about:blank) e só então navega ao destino.
 * localStorage é por origin — inject em about:blank não chega no localhost:3000.
 */
async function applyPanelSnapshot(snap: PanelSnapshot): Promise<void> {
  const v = ensureView()
  let withCookie: PanelSnapshot
  try {
    withCookie = await ensurePanelSessionCookie(snap)
  } catch (err) {
    if (err instanceof AgentAuthError) {
      console.warn('[panel] agente sem token — login do PC', err)
      forcePanelReauth('sem cookie do painel')
      return
    }
    console.warn('[panel] cookie do painel falhou — segue com localStorage', err)
    withCookie = snap
  }
  const destPath = panelDestPath(withCookie)
  if (!contentLoaded) {
    currentMode = destPath.startsWith('/dev') ? 'dev-home' : 'orders'
  }
  const dest = contentLoaded ? urlFor(currentMode) : getPanelPathUrl(destPath)
  const boot = `${getPanelOrigin()}/delidesk-sso?embed=delidesk&boot=1`
  seeding = true
  try {
    savePanelSnapshot(withCookie)
    await safeLoadURL(v, boot)
    await injectPanelSnapshot(v, withCookie)
    // Navega no mesmo origin já com delivai_user gravado (AuthContext lê no boot).
    await v.webContents.executeJavaScript(
      `window.location.replace(${JSON.stringify(dest)}); true;`,
      true
    )
    await waitForLoad(v)
    if (!(await panelHasUser(v))) {
      console.warn('[panel] user missing after navigate — re-inject + reload')
      await injectPanelSnapshot(v, withCookie)
      v.webContents.reload()
      await waitForLoad(v)
    }
    console.info('[panel] snapshot applied', {
      dest: destPath,
      hasUser: await panelHasUser(v),
      hasCookie: Boolean(withCookie.panelSessionToken)
    })
  } finally {
    contentLoaded = true
    seeding = false
  }
  void hydrateBrandingAfterSeed().catch((err) => {
    console.warn('[panel] branding hydrate failed', err)
  })
}

/**
 * Após oauth/poll: troca o code no main (fetch) e injeta localStorage —
 * não depende do SPA /delidesk-sso no BrowserView (que travava o login).
 */
export async function seedPanelSession(panelSsoCode: string): Promise<void> {
  const code = panelSsoCode.trim()
  if (!code) return
  console.info('[panel] seeding SSO via main fetch')
  try {
    const snap = await fetchPanelSessionByCode(code)
    await applyPanelSnapshot(snap)
  } catch (err) {
    console.warn('[panel] SSO code exchange failed, trying hydrate/cache', err)
    await ensurePanelHydrated()
  }
}

/**
 * Garante localStorage.delivai_user no BrowserView:
 * cache local → API panel-hydrate → snapshot mínimo da sessão do agente.
 */
export async function ensurePanelHydrated(): Promise<boolean> {
  const v = ensureView()
  if (await panelHasUser(v)) return true

  const cached = loadPanelSnapshot()
  if (cached) {
    console.info('[panel] hydrate from local cache (offline-ready)')
    await applyPanelSnapshot(cached)
    return await panelHasUser(v)
  }

  try {
    console.info('[panel] hydrate from API')
    const snap = await fetchPanelHydrate()
    await applyPanelSnapshot(snap)
    return await panelHasUser(v)
  } catch (err) {
    console.warn('[panel] hydrate API failed', err)
  }

  const fallback = snapshotFromAgentSession()
  if (fallback) {
    console.info('[panel] hydrate from agent session fallback')
    await applyPanelSnapshot(fallback)
    return await panelHasUser(v)
  }
  return false
}

let showPanelHydrateInFlight: Promise<void> | null = null

export function showPanel(mode: PanelMode, bounds: PanelBounds): void {
  const win = getMainWindow()
  if (!win) return

  const v = ensureView()
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
  lastPanelBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(100, Math.round(bounds.width)),
    height: Math.max(100, Math.round(bounds.height))
  }
  panelOverlaySuppressed = false
  v.setAutoResize({ width: true, height: true })
  visible = true

  if (seeding || recovering) return
  if (contentLoaded) {
    const target = urlFor(currentMode)
    if (!alreadyOn(v, target)) {
      void navigatePanelInPage(v, target)
    }
    return
  }
  if (!showPanelHydrateInFlight) {
    showPanelHydrateInFlight = (async () => {
      try {
        const ok = await ensurePanelHydrated()
        if (!ok) {
          console.warn('[panel] showPanel: sem sessão do painel')
          if (agentSessionAlive()) {
            return
          }
          forcePanelReauth('hydrate falhou')
          return
        }
        const target = urlFor(currentMode)
        if (!alreadyOn(v, target)) {
          await navigatePanelInPage(v, target)
        } else {
          void v.webContents.executeJavaScript(EMBED_BOOTSTRAP).catch(() => undefined)
        }
        contentLoaded = true
      } finally {
        showPanelHydrateInFlight = null
      }
    })()
  } else {
    void showPanelHydrateInFlight.then(() => {
      if (!view || !visible || seeding) return
      const target = urlFor(currentMode)
      if (!alreadyOn(view, target)) {
        void navigatePanelInPage(view, target)
      }
    })
  }
}

export function setPanelBounds(bounds: PanelBounds): void {
  if (!view || !visible) return
  lastPanelBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(100, Math.round(bounds.width)),
    height: Math.max(100, Math.round(bounds.height))
  }
  if (panelOverlaySuppressed) return
  view.setBounds(lastPanelBounds)
}

/**
 * Esconde temporariamente o BrowserView (bounds 0) para popovers do shell
 * (ex.: card de versão) aparecerem à direita da rail sem ficarem cobertos.
 */
export function setPanelOverlaySuppressed(suppressed: boolean): void {
  panelOverlaySuppressed = suppressed
  if (!view || !visible) return
  if (suppressed) {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  if (lastPanelBounds) {
    view.setBounds(lastPanelBounds)
  }
}

export function hidePanel(): void {
  const win = getMainWindow()
  if (win && view) {
    win.removeBrowserView(view)
  }
  visible = false
  panelOverlaySuppressed = false
}

export function reloadPanel(): void {
  if (!view) return
  void (async () => {
    const ok = await ensurePanelHydrated()
    if (!ok) {
      console.warn('[panel] reload: sem sessão do painel')
      if (agentSessionAlive()) return
      forcePanelReauth('reload sem sessão')
      return
    }
    const cached = loadPanelSnapshot() || snapshotFromAgentSession()
    if (cached) {
      await applyPanelSnapshot(cached)
      return
    }
    await safeLoadURL(view!, urlFor(currentMode))
    contentLoaded = true
  })()
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
  recovering = false
  lastRecoverAt = 0
  embedHooked = false
}
