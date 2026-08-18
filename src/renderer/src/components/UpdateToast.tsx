import { useEffect, useState } from 'react'
import type { UpdateUiStatus } from '@shared/ipc'

/**
 * Toast canto inferior esquerdo — “Atualizar agora” (estilo Cursor).
 * Verde/amarelo/vermelho alinhados ao card da sidebar.
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
  const mandatory = status.urgency === 'mandatory'
  const border = mandatory
    ? 'border-red-400/40'
    : 'border-amber-400/35'
  const titleColor = mandatory ? 'text-red-200' : 'text-amber-100'

  return (
    <div
      className={`fixed bottom-4 left-4 z-[9999] w-[min(22rem,calc(100vw-2rem))] rounded-xl border ${border} bg-[#0a1620]/95 shadow-2xl shadow-black/50 backdrop-blur-md p-4 text-white`}
      role="status"
    >
      <p className={`text-sm font-semibold ${titleColor}`}>
        {mandatory
          ? ready
            ? 'Atualização obrigatória pronta'
            : 'Atualização obrigatória'
          : ready
            ? 'Atualização pronta'
            : 'Nova versão disponível'}
      </p>
      <p className="mt-1 text-xs text-white/75 leading-relaxed">
        DeliDesk {version}
        {ready
          ? ' foi baixada. Instale agora para aplicar (o app reinicia).'
          : ' está sendo baixada em segundo plano…'}
        {!mandatory && ready
          ? ' Pode deixar para o fim do turno se preferir.'
          : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ready && (
          <button
            type="button"
            disabled={installing}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              mandatory
                ? 'bg-red-400 text-red-950 hover:brightness-110'
                : 'bg-delivai-neon-green text-delivai-blue-dark hover:brightness-110'
            }`}
            onClick={() => {
              setInstalling(true)
              void window.delidesk.installUpdate().then((res) => {
                if (!res.ok) setInstalling(false)
              })
            }}
          >
            {installing ? 'Instalando…' : 'Atualizar agora'}
          </button>
        )}
        {!mandatory ? (
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            onClick={() => setDismissed(true)}
          >
            Depois
          </button>
        ) : null}
      </div>
    </div>
  )
}
