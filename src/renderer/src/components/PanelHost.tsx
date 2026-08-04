import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PanelMode } from '@shared/pdvai'

type Props = {
  mode: PanelMode
  online: boolean
  title?: string
}

/**
 * Reserva a área do painel no layout e sincroniza bounds com BrowserView no main.
 * O BrowserView fica por cima desta região (não é iframe).
 */
export function PanelHost({ mode, online, title }: Props): React.JSX.Element {
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
    // Sidebar empurra o flex no hover — observar o pai também.
    const parent = el.parentElement
    if (parent) ro.observe(parent)
    window.addEventListener('resize', sync)
    // Durante transition de width da rail, ResizeObserver às vezes atrasa um frame.
    const onTransition = (): void => sync()
    window.addEventListener('transitionend', onTransition)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('transitionend', onTransition)
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
    <div className="h-full min-h-0 flex flex-col gap-1.5">
      <div className="flex items-center justify-end gap-2 text-xs shrink-0 px-0.5">
        <span className="mr-auto text-delivai-text-gray/50 text-[11px]">
          {title ?? 'Painel'}
        </span>
        <button
          type="button"
          className="btn-secondary text-[11px] py-1 px-2.5"
          onClick={() => void window.delidesk.reloadPanel()}
        >
          Recarregar
        </button>
        <button
          type="button"
          className="btn-secondary text-[11px] py-1 px-2.5"
          onClick={() => void window.delidesk.openPanelExternal(mode)}
          title="Abre no navegador com a sidebar completa do DelivAI"
        >
          Abrir no navegador
        </button>
      </div>
      <div
        ref={ref}
        className="flex-1 min-h-[380px] rounded-xl border border-white/10 bg-black/25 overflow-hidden shadow-inner"
      />
    </div>
  )
}
