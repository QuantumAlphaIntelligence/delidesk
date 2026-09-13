import { useEffect, useState } from 'react'
import type { AuthSession, AppOnlineStatus } from '@shared/ipc'
import type { PanelMode } from '@shared/pdvai'
import { displayCompanyName, maskCnpj } from '@shared/branding'
import { PrintScreen } from './PrintScreen'
import { PanelHost } from '../components/PanelHost'
import { AppRail, type AppNavId } from '../components/AppRail'
import { readRailLang, railText, writeRailLang, type RailLang } from '../i18n/rail'

type Props = {
  session: AuthSession
  online: AppOnlineStatus
  onLogout: () => void
}

const PANEL_MODES = new Set<AppNavId>([
  'orders',
  'chat',
  'delivery',
  'motoboys',
  'schedule',
  'manager',
  'employees',
  'company',
  'license',
  'clients',
  'dev-home',
  'dev-licenses',
  'dev-contracts',
  'dev-evolution',
  'dev-bot',
  'dev-delidesk',
  'dev-companies',
  'dev-prompts',
  'dev-clients',
  'dev-database',
  'dev-logs',
  'dev-observability',
  'dev-permissoes'
])

const TITLE_KEY: Partial<Record<AppNavId, string>> = {
  orders: 'pdv',
  chat: 'conversations',
  print: 'print',
  delivery: 'delivery',
  motoboys: 'motoboys',
  schedule: 'schedule',
  manager: 'manager',
  employees: 'employees',
  company: 'company',
  license: 'license',
  clients: 'clients'
}

function isPanelMode(id: AppNavId): boolean {
  return PANEL_MODES.has(id)
}

function titleFor(nav: AppNavId, lang: RailLang): string {
  const key = TITLE_KEY[nav]
  if (key) return railText(lang, key)
  switch (nav) {
    case 'dev-home':
      return 'Painel de controle'
    case 'dev-licenses':
      return 'Licenças'
    case 'dev-contracts':
      return 'Contratos'
    case 'dev-evolution':
      return 'Evolution'
    case 'dev-bot':
      return 'Bot WhatsApp'
    case 'dev-delidesk':
      return 'DeliDesk'
    case 'dev-companies':
      return 'Empresas'
    case 'dev-prompts':
      return 'Prompts'
    case 'dev-clients':
      return 'Clientes'
    case 'dev-database':
      return 'Banco de dados'
    case 'dev-logs':
      return 'Logs'
    case 'dev-observability':
      return 'Observabilidade'
    case 'dev-permissoes':
      return 'Permissões'
    default:
      return 'DeliDesk'
  }
}

function defaultNavForRole(role: AuthSession['shellRole']): AppNavId {
  return role === 'dev' ? 'dev-home' : 'delivery'
}

function navMatchesRole(nav: AppNavId, role: AuthSession['shellRole']): boolean {
  const isDevNav = nav.startsWith('dev-')
  if (role === 'dev') return isDevNav || nav === 'print'
  return !isDevNav
}

export function HomeScreen({
  session,
  online,
  onLogout
}: Props): React.JSX.Element {
  const shellRole = session.shellRole === 'dev' ? 'dev' : 'store'
  const [nav, setNav] = useState<AppNavId>(() => defaultNavForRole(shellRole))
  const [lang, setLang] = useState<RailLang>(readRailLang)
  const embedPanel = isPanelMode(nav)
  const companyLabel = displayCompanyName(session)
  const companyDocLabel = maskCnpj(session.companyCnpj)

  const changeLang = (next: RailLang): void => {
    writeRailLang(next)
    setLang(next)
  }

  useEffect(() => {
    if (!navMatchesRole(nav, shellRole)) {
      setNav(defaultNavForRole(shellRole))
    }
  }, [shellRole, nav])

  useEffect(() => {
    if (!embedPanel) {
      void window.delidesk.hidePanel()
    }
  }, [embedPanel])

  // Painel navega sozinho (ex.: Abrir Entregas) → rail acompanha.
  // Fast Order / checkout iFood ficam em internal-order sem item na rail.
  useEffect(() => {
    return window.delidesk.onPanelNavChanged((mode) => {
      if (mode === 'internal-order') {
        setNav('delivery')
        return
      }
      if (!navMatchesRole(mode as AppNavId, shellRole)) return
      setNav(mode as AppNavId)
    })
  }, [shellRole])

  return (
    <div className="relative flex h-screen overflow-hidden bg-gradient-delivai">
      <AppRail
        active={nav}
        shellRole={shellRole}
        companyLabel={companyLabel}
        companyDocLabel={companyDocLabel}
        companyLogoUrl={session.companyLogoUrl}
        online={online}
        lang={lang}
        onLangChange={changeLang}
        onNavigate={setNav}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-3">
          <h1 className="min-w-0 truncate text-xs font-semibold text-white">{titleFor(nav, lang)}</h1>
          <div className="flex items-center gap-0.5">
            {embedPanel ? (
              <>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[10px] text-white/40 transition hover:bg-white/5 hover:text-white/75"
                  onClick={() => void window.delidesk.reloadPanel()}
                  title={railText(lang, 'reload')}
                >
                  {railText(lang, 'reload')}
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[10px] text-white/40 transition hover:bg-white/5 hover:text-white/75"
                  onClick={() => void window.delidesk.openPanelExternal(nav as PanelMode)}
                  title={railText(lang, 'open_browser')}
                >
                  {railText(lang, 'open_browser')}
                </button>
              </>
            ) : null}
          </div>
        </header>

        <main
          className={`flex-1 min-h-0 ${
            embedPanel ? 'p-2 overflow-hidden' : 'p-5 overflow-auto'
          }`}
        >
          {nav === 'print' && (
            <PrintScreen companyName={companyLabel} online={online} />
          )}
          {embedPanel ? (
            <PanelHost mode={nav as PanelMode} online={online === 'online'} lang={lang} />
          ) : null}
        </main>
      </div>
    </div>
  )
}
