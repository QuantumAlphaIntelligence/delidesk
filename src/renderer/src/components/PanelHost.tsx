import { useLayoutEffect, useRef } from 'react'
import type { PanelMode } from '@shared/pdvai'

type Props = {
  mode: PanelMode
  online: boolean
}

function readBounds(el: HTMLElement): {
  x: number
  y: number
  width: number
  height: number
} {
  const rect = el.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }
}

/**
 * Reserva a área do painel no layout e sincroniza bounds com BrowserView no main.
 * O BrowserView fica por cima desta região (não é iframe).
 * Título da tela fica só no header do HomeScreen (sem repetir "Pedidos").
 *
 * Importante: resize só chama setPanelBounds — nunca showPanel com mode antigo,
 * senão uma navegação interna (Abrir Entregas) é revertida pelo rail atrasado.
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

    void window.delidesk.showPanel(mode, readBounds(el))

    const syncBounds = (): void => {
      void window.delidesk.setPanelBounds(readBounds(el))
    }

    const ro = new ResizeObserver(syncBounds)
    ro.observe(el)
    const parent = el.parentElement
    if (parent) ro.observe(parent)
    window.addEventListener('resize', syncBounds)
    const onTransition = (): void => syncBounds()
    window.addEventListener('transitionend', onTransition)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('transitionend', onTransition)
      // Não hidePanel aqui: StrictMode e troca Pedidos↔Conversas desmontavam
      // o BrowserView (tela vazia) e o painel ia a /login.
    }
  }, [mode, online])

  if (!online) {
    return (
      <div className="h-full min-h-[420px] glass-card rounded-xl p-6 flex flex-col justify-center gap-3">
        <div className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm px-3 py-2">
          Sem internet — painel e WhatsApp indisponíveis
        </div>
        <p className="text-sm text-delivai-text-gray/75">
          Use <strong className="text-white">Balcão</strong> na barra lateral para venda local.
          Quando a rede voltar, o painel carrega de novo.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="h-full min-h-[380px] rounded-xl border border-white/10 bg-black/25 overflow-hidden shadow-inner"
    />
  )
}
