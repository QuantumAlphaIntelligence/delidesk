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
  'clients'
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
    default:
      return 'DeliDesk'
  }
}

export function HomeScreen({
  session,
  online,
  onLogout
}: Props): React.JSX.Element {
  const [nav, setNav] = useState<AppNavId>('orders')
  const embedPanel = isPanelMode(nav)
  const companyLabel = displayCompanyName(session)
  const companyDocLabel = maskCnpj(session.companyCnpj)

  useEffect(() => {
    if (!embedPanel) {
      void window.delidesk.hidePanel()
    }
  }, [embedPanel])

  return (
    <div className="relative flex h-screen overflow-hidden bg-gradient-delivai">
      <AppRail
        active={nav}
        companyLabel={companyLabel}
        companyDocLabel={companyDocLabel}
        companyLogoUrl={session.companyLogoUrl}
        online={online}
        onNavigate={setNav}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/25 px-4 py-2.5">
          <h1 className="min-w-0 truncate text-sm font-semibold text-white">{titleFor(nav)}</h1>
          <span className={online === 'online' ? 'pill-online' : 'pill-offline'}>
            ● {online === 'online' ? 'Online' : 'Offline'}
          </span>
        </header>

        <main
          className={`flex-1 min-h-0 ${
            embedPanel ? 'p-2 overflow-hidden' : 'p-5 overflow-auto'
          }`}
        >
          {nav === 'print' && (
            <PrintScreen companyName={companyLabel} online={online} />
          )}
          {nav === 'pdvai' && (
            <PdvaiScreen companyName={companyLabel} online={online} />
          )}
          {embedPanel && (
            <PanelHost mode={nav} online={online === 'online'} title={titleFor(nav)} />
          )}
        </main>
      </div>
    </div>
  )
}
