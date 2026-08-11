import { useEffect, useState } from 'react'
import type { AuthSession, AppOnlineStatus } from '@shared/ipc'
import type { PanelMode } from '@shared/pdvai'
import { displayCompanyName, maskCnpj } from '@shared/branding'
import { PrintScreen } from './PrintScreen'
import { PdvaiScreen } from './PdvaiScreen'
import { PanelHost } from '../components/PanelHost'
import { AppRail, type AppNavId } from '../components/AppRail'

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

function isPanelMode(id: AppNavId): id is PanelMode {
  return PANEL_MODES.has(id)
}

function titleFor(nav: AppNavId): string {
  switch (nav) {
    case 'orders':
      return 'Pedidos'
    case 'chat':
      return 'Conversas'
    case 'print':
      return 'Impressão'
    case 'pdvai':
      return 'Balcão'
    case 'delivery':
      return 'Entregas'
    case 'motoboys':
      return 'Motoboys'
    case 'schedule':
      return 'Agenda'
    case 'company':
      return 'Empresa'
    case 'license':
      return 'Licença'
    case 'clients':
      return 'Clientes'
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
  return role === 'dev' ? 'dev-home' : 'orders'
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
  const embedPanel = isPanelMode(nav)
  const companyLabel = displayCompanyName(session)
  const companyDocLabel = maskCnpj(session.companyCnpj)

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
  useEffect(() => {
    return window.delidesk.onPanelNavChanged((mode) => {
      if (!navMatchesRole(mode, shellRole)) return
      setNav(mode)
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
        onNavigate={setNav}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-2">
          <h1 className="min-w-0 truncate text-sm font-semibold text-white">{titleFor(nav)}</h1>
          <div className="flex items-center gap-1">
            {embedPanel ? (
              <>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white/80"
                  onClick={() => void window.delidesk.reloadPanel()}
                  title="Recarregar painel"
                >
                  Recarregar
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white/80"
                  onClick={() => void window.delidesk.openPanelExternal(nav)}
                  title="Abre no navegador com a sidebar completa do DelivAI"
                >
                  Abrir no navegador
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
          {nav === 'pdvai' && shellRole !== 'dev' && (
            <PdvaiScreen companyName={companyLabel} online={online} />
          )}
          {embedPanel && <PanelHost mode={nav} online={online === 'online'} />}
        </main>
      </div>
    </div>
  )
}
