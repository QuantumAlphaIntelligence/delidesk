import type { AppOnlineStatus } from '@shared/ipc'
import { DeliDeskMark } from '../components/DeliDeskMark'

type Props = {
  online: AppOnlineStatus
  loggingIn: boolean
  error?: string | null
  onLogin: () => void
  onCancelLogin?: () => void
}

export function LoginScreen({
  online,
  loggingIn,
  error,
  onLogin,
  onCancelLogin
}: Props): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-delivai flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-black/20 border-b border-white/10 text-xs text-delivai-text-gray/90">
        <span className="font-medium">Entrar · DeliDesk</span>
        <span className={online === 'online' ? 'pill-online' : 'pill-offline'}>
          ● {online === 'online' ? 'Online' : 'Offline'}
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <DeliDeskMark className="w-16 h-16 mb-4 shadow-lg shadow-black/30" />
          <h1 className="text-4xl font-bold tracking-tight">
            Deli<span className="text-delivai-neon-green">Desk</span>
          </h1>
          <p className="mt-2 text-delivai-neon-green font-medium text-sm">
            o balcão digital da sua cozinha
          </p>
        </div>

        <div className="glass-card w-full max-w-sm p-8 text-center border-delivai-neon-green/35">
          <h2 className="text-xl font-bold mb-2">Bem-vindo</h2>
          <p className="text-sm text-delivai-text-gray/75 mb-6">
            Conecte este PC à sua loja DelivAI
          </p>
          <button
            type="button"
            className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait"
            onClick={onLogin}
            disabled={loggingIn}
          >
            {loggingIn ? 'Aguardando autorização…' : 'Entrar com DelivAI'}
          </button>
          {loggingIn && onCancelLogin ? (
            <button
              type="button"
              className="btn-secondary w-full mt-2"
              onClick={onCancelLogin}
            >
              Cancelar
            </button>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs text-red-300 break-words">{error}</p>
          ) : loggingIn ? (
            <p className="mt-3 text-xs text-delivai-text-gray/60">
              Complete Autorizar no navegador. Expira em 3 minutos se não concluir.
            </p>
          ) : (
            <p className="mt-3 text-xs text-delivai-text-gray/60">
              Abre o navegador · login só se precisar · depois Autorizar
            </p>
          )}
        </div>

        <p className="mt-8 text-xs text-delivai-text-gray/50">
          Windows · local-first · sem código curto
        </p>
      </main>
    </div>
  )
}
