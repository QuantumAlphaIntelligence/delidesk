import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PanelMode } from '@shared/pdvai'

type Props = {
  mode: PanelMode
  online: boolean
}

/**
 * Reserva a área do painel no layout e sincroniza bounds com BrowserView no main.
 * O BrowserView fica por cima desta região (não é iframe).
 */
export function PanelHost({ mode, online }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!online) {
      void window.delidesk.hidePanel()
      return
    }

    const el = ref.current
    if (!el) return

    const sync = (): void => {
      const rect = el.getBoundingClientRect()
      const bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
      void window.delidesk.showPanel(mode, bounds)
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      void window.delidesk.hidePanel()
    }
  }, [mode, online])

  useEffect(() => {
    return () => {
      void window.delidesk.hidePanel()
    }
  }, [])

  if (!online) {
    return (
      <div className="h-full min-h-[420px] glass-card rounded-xl p-6 flex flex-col justify-center gap-3">
        <div className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm px-3 py-2">
          ⚠ Sem internet — painel e WhatsApp indisponíveis
        </div>
        <p className="text-sm text-delivai-text-gray/75">
          Use a aba <strong className="text-white">PDVAI</strong> para venda e cupom no balcão.
          Quando a rede voltar, o painel embutido carrega de novo.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-[420px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="text-delivai-text-gray/70">
          {mode === 'chat'
            ? 'Conversas · painel DelivAI embutido'
            : 'Pedidos · painel DelivAI embutido'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2"
            onClick={() => void window.delidesk.reloadPanel()}
          >
            Recarregar
          </button>
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2"
            onClick={() => void window.delidesk.openPanelExternal(mode)}
          >
            Abrir no navegador
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex-1 min-h-[380px] rounded-xl border border-white/15 bg-black/20 overflow-hidden"
      />
    </div>
  )
}
