import { useEffect, useState } from 'react'
import type { UpdateUiStatus } from '@shared/ipc'

/**
 * Toast canto inferior esquerdo — após download reinicia sozinho (contagem),
 * com “Reiniciar agora” ou “Depois” (aplica ao fechar o app).
 */
export function UpdateToast(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateUiStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let unsub = (): void => undefined
    void window.delidesk.getUpdateStatus().then(setStatus)
    unsub = window.delidesk.onUpdateStatus((next) => {
      setStatus(next)
      if (next.state === 'downloaded' || next.state === 'available') {
        setDismissed(false)
      }
    })
    return () => unsub()
  }, [])

  if (dismissed) return null
  if (status.state !== 'downloaded' && status.state !== 'available') return null

  const version = status.version
  const ready = status.state === 'downloaded'
  const autoSec =
    ready && typeof status.autoRestartInSec === 'number' ? status.autoRestartInSec : null

  return (
    <div
      className="fixed bottom-4 left-4 z-[9999] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-[#0a1620]/95 shadow-2xl shadow-black/50 backdrop-blur-md p-4 text-white"
      role="status"
    >
      <p className="text-sm font-semibold text-delivai-neon-green">
        {ready ? 'Atualização pronta' : 'Nova versão disponível'}
      </p>
      <p className="mt-1 text-xs text-white/75 leading-relaxed">
        DeliDesk {version}
        {!ready && ' está sendo baixada em segundo plano…'}
        {ready && autoSec != null && (
          <>
            {' '}
            foi baixada. Reiniciando em <span className="font-semibold text-white">{autoSec}s</span>{' '}
            para aplicar…
          </>
        )}
        {ready && autoSec == null && ' foi baixada. Será aplicada ao fechar o app (ou reinicie agora).'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ready && (
          <button
            type="button"
            disabled={installing}
            className="rounded-lg bg-delivai-neon-green px-3 py-1.5 text-xs font-semibold text-delivai-blue-dark hover:brightness-110 disabled:opacity-50"
            onClick={() => {
              setInstalling(true)
              void window.delidesk.installUpdate().then((res) => {
                if (!res.ok) setInstalling(false)
              })
            }}
          >
            {installing ? 'Reiniciando…' : 'Reiniciar agora'}
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          onClick={() => {
            if (ready) {
              void window.delidesk.postponeUpdate()
            }
            setDismissed(true)
          }}
        >
          Depois
        </button>
      </div>
    </div>
  )
}
