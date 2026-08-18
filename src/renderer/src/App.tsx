import { useCallback, useEffect, useState } from 'react'
import type { AuthSession, AppOnlineStatus } from '@shared/ipc'
import { LoginScreen } from './screens/LoginScreen'
import { HomeScreen } from './screens/HomeScreen'
import { UpdateToast } from './components/UpdateToast'

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [online, setOnline] = useState<AppOnlineStatus>('online')
  const [booting, setBooting] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    let unsubSession = (): void => undefined
    let unsubError = (): void => undefined

    async function boot(): Promise<void> {
      try {
        const [s, o] = await Promise.all([
          window.delidesk.getSession(),
          window.delidesk.getOnline()
        ])
        setSession(s)
        setOnline(o)
        unsubSession = window.delidesk.onSessionChanged((next) => {
          setSession(next)
          setLoggingIn(false)
          if (next) setLoginError(null)
        })
        unsubError = window.delidesk.onLoginError((message) => {
          setLoggingIn(false)
          // Race: callback duplicado pode emitir erro depois da sessão OK
          void window.delidesk.getSession().then((s) => {
            if (s) {
              setSession(s)
              setLoginError(null)
            } else {
              setLoginError(message)
            }
          })
        })
        const unsubReauth = window.delidesk.onPanelReauthRequired(() => {
          setSession(null)
          setLoggingIn(false)
          setLoginError('Sessão do painel expirou. Entre de novo com DelivAI.')
        })
        // keep unsubReauth for cleanup
        const prevUnsubSession = unsubSession
        unsubSession = () => {
          prevUnsubSession()
          unsubReauth()
        }
      } finally {
        setBooting(false)
      }
    }

    void boot()

    const onOnline = (): void => setOnline('online')
    const onOffline = (): void => setOnline('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      unsubSession()
      unsubError()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    setLoginError(null)
    try {
      const result = await window.delidesk.startLogin()
      if (!result.ok) {
        setLoginError(result.error ?? 'Falha ao iniciar login')
        setLoggingIn(false)
      }
    } catch {
      setLoginError('Falha ao iniciar login')
      setLoggingIn(false)
    }
  }, [])

  const handleCancelLogin = useCallback(async () => {
    await window.delidesk.cancelLogin()
    setLoggingIn(false)
  }, [])

  const handleLogout = useCallback(async () => {
    await window.delidesk.logout()
    setSession(null)
  }, [])

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-delivai">
        <p className="text-delivai-text-gray/80 text-sm font-medium">Carregando DeliDesk…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <LoginScreen
          online={online}
          loggingIn={loggingIn}
          error={loginError}
          onLogin={() => void handleLogin()}
          onCancelLogin={() => void handleCancelLogin()}
        />
        <UpdateToast />
      </>
    )
  }

  return (
    <>
      <HomeScreen
        session={session}
        online={online}
        onLogout={() => void handleLogout()}
      />
      <UpdateToast />
    </>
  )
}
