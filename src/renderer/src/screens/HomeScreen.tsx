import { useEffect, useState } from 'react'
import type { AuthSession, AppOnlineStatus } from '@shared/ipc'
import { PrintScreen } from './PrintScreen'
import { PdvaiScreen } from './PdvaiScreen'
import { PanelHost } from '../components/PanelHost'

type Props = {
  session: AuthSession
  online: AppOnlineStatus
  onLogout: () => void
}

type NavId = 'panel' | 'print' | 'chat' | 'pdvai' | 'settings'

const NAV: Array<{ id: NavId; label: string; soon?: boolean }> = [
  { id: 'panel', label: 'Painel' },
  { id: 'print', label: 'Impressão' },
  { id: 'chat', label: 'Conversas' },
  { id: 'pdvai', label: 'PDVAI' },
  { id: 'settings', label: 'Config', soon: true }
]

function titleFor(nav: NavId): string {
  switch (nav) {
    case 'print':
      return 'modo impressão'
    case 'chat':
      return 'Conversas'
    case 'pdvai':
      return 'PDVAI · fallback'
    default:
      return 'Painel'
  }
}

export function HomeScreen({
  session,
  online,
  onLogout
}: Props): React.JSX.Element {
  const [nav, setNav] = useState<NavId>('print')
  const embedPanel = nav === 'panel' || nav === 'chat'

  useEffect(() => {
    if (!embedPanel) {
      void window.delidesk.hidePanel()
    }
  }, [embedPanel])

  return (
    <div className="min-h-screen bg-gradient-delivai flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-black/20 border-b border-white/10 text-xs shrink-0">
        <span className="font-medium text-delivai-text-gray/90">
          DeliDesk · {titleFor(nav)}
        </span>
        <div className="flex items-center gap-2">
          <span className={online === 'online' ? 'pill-online' : 'pill-offline'}>
            ● {online === 'online' ? 'Online' : 'Offline'}
          </span>
          <button type="button" className="btn-secondary text-xs py-1.5 px-3" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-20 shrink-0 bg-slate-950/70 border-r border-white/10 flex flex-col items-center py-4 gap-2">
          <div className="text-delivai-neon-green font-bold text-lg mb-2">D</div>
          {NAV.map((item) => {
            const active = nav === item.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.soon}
                title={item.soon ? 'Em breve' : item.label}
                onClick={() => setNav(item.id)}
                className={`w-12 h-12 rounded-xl text-[10px] font-semibold flex items-center justify-center transition
                  ${active
                    ? 'bg-delivai-neon-green text-delivai-blue-dark shadow-[0_0_22px_-2px_rgba(71,242,199,0.65)]'
                    : 'text-delivai-text-gray/70 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent'
                  }`}
              >
                {item.label.slice(0, 1)}
              </button>
            )
          })}
          <div className="flex-1" />
          <p className="text-[9px] text-delivai-text-gray/50 px-1 text-center leading-tight">
            {session.companyName ?? 'Loja'}
          </p>
        </aside>

        <main
          className={`flex-1 min-w-0 ${embedPanel ? 'p-3 overflow-hidden' : 'p-6 overflow-auto'}`}
        >
          {nav === 'print' && (
            <PrintScreen companyName={session.companyName} online={online} />
          )}
          {nav === 'pdvai' && (
            <PdvaiScreen companyName={session.companyName} online={online} />
          )}
          {nav === 'panel' && (
            <PanelHost mode="orders" online={online === 'online'} />
          )}
          {nav === 'chat' && (
            <PanelHost mode="chat" online={online === 'online'} />
          )}
        </main>
      </div>
    </div>
  )
}
