import { useEffect, useMemo, useState } from 'react'
import type { PrintJob, PrintStateSnapshot, PrintResult } from '@shared/print'

type Props = {
  companyName?: string
  online: 'online' | 'offline'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Na fila'
    case 'printing':
      return 'Imprimindo'
    case 'done':
      return 'Impresso'
    case 'failed':
      return 'Falhou'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 10) return 'agora'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)} min`
}

function queueStatusLabel(state: PrintStateSnapshot): string {
  if (state.backendPollRunning) return 'polling'
  if (state.mockSseRunning) return 'mock'
  return 'parado'
}

function canCancel(job: PrintJob): boolean {
  return job.status === 'queued' || job.status === 'printing'
}

function canReprint(job: PrintJob): boolean {
  return job.status === 'done' || job.status === 'failed' || job.status === 'cancelled'
}

export function PrintScreen({ companyName, online }: Props): React.JSX.Element {
  const [state, setState] = useState<PrintStateSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let unsub = (): void => undefined
    void window.delidesk.getPrintState().then(setState)
    unsub = window.delidesk.onPrintStateChanged(setState)
    return () => unsub()
  }, [])

  const selected = useMemo(() => {
    if (!state) return null
    if (selectedId) {
      const found = state.jobs.find((j) => j.id === selectedId)
      if (found) return found
    }
    return state.jobs[0] ?? null
  }, [state, selectedId])

  useEffect(() => {
    if (!state?.jobs.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && !state.jobs.some((j) => j.id === selectedId)) {
      setSelectedId(state.jobs[0]?.id ?? null)
    }
  }, [state, selectedId])

  async function withBusy(fn: () => Promise<PrintResult | PrintStateSnapshot>): Promise<void> {
    setBusy(true)
    setToast(null)
    try {
      const result = await fn()
      if ('ok' in result) {
        if (result.ok) {
          setToast(
            result.simulated
              ? 'Cupom simulado (salvo em userData/print-debug)'
              : `Impresso em ${result.printerName ?? 'impressora'}`
          )
        } else {
          setToast(result.error ?? 'Falha na impressão')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return (
      <p className="text-sm text-delivai-text-gray/70">Carregando impressoras…</p>
    )
  }

  const queueStatus = queueStatusLabel(state)
  const queueRunning = state.backendPollRunning || state.mockSseRunning

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Impressão</h1>
          <p className="text-sm text-delivai-text-gray/70 mt-1">
            {companyName ?? 'Loja'} · PC da cozinha · fila {queueStatus}
          </p>
        </div>
        <span className={online === 'online' ? 'pill-online' : 'pill-offline'}>
          ● {online === 'online' ? 'Online' : 'Offline'}
        </span>
      </div>

      {toast && (
        <div className="glass-card rounded-xl px-4 py-3 text-sm text-delivai-neon-green border-delivai-neon-green/30">
          {toast}
        </div>
      )}

      {state.platformPrinterEnabled === false && (
        <div
          className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
          role="status"
        >
          Fila do agente desligada pela DelivAI (Dev). Você ainda vê as impressoras, mas cupons
          DelivAI não chegam até religarem a feature printer.
        </div>
      )}

      {state.platformVirtualCaptureEnabled === false && (
        <div
          className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
          role="status"
        >
          Captura iFood desligada pela DelivAI (Dev). A impressora virtual não envia cupom para criar
          pedido até religarem virtual_capture.
        </div>
      )}

      {state.virtualPrinter?.supported && (
        <section className="glass-card rounded-xl px-4 py-3 space-y-2 border-white/15">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                Impressora virtual {state.virtualPrinter.name || 'DeliDesk'}
              </h2>
              <p className="text-xs text-delivai-text-gray/70 mt-1">
                {state.virtualPrinter.installed
                  ? state.virtualPrinter.listening
                    ? `Instalada no Windows · porta ${state.virtualPrinter.listenPort} · aguardando jobs (ex.: iFood)`
                    : 'Instalada · listener offline'
                  : 'Não instalada no Spooler — escolha no iFood após instalar'}
              </p>
              {state.virtualPrinter.lastError && (
                <p className="text-xs text-amber-300/90 mt-1 truncate" title={state.virtualPrinter.lastError}>
                  {state.virtualPrinter.lastError}
                </p>
              )}
              {state.virtualPrinter.lastCaptureMessage && (
                <p
                  className={`text-xs mt-1 ${
                    state.virtualPrinter.lastCaptureStatus === 'error'
                      ? 'text-amber-300/90'
                      : state.virtualPrinter.lastCaptureStatus === 'order_created' ||
                          state.virtualPrinter.lastCaptureStatus === 'test_demo'
                        ? 'text-delivai-neon-green'
                        : 'text-delivai-text-gray/70'
                  }`}
                >
                  {state.virtualPrinter.lastCaptureMessage}
                </p>
              )}
            </div>
            {!state.virtualPrinter.installed && (
              <button
                type="button"
                className="btn-primary shrink-0 text-xs px-3 py-2"
                disabled={busy}
                onClick={() =>
                  void withBusy(() => window.delidesk.installVirtualPrinter())
                }
              >
                Instalar {state.virtualPrinter.name || 'DeliDesk'}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-delivai-text-gray/90">
            Impressora física (destino)
          </h2>
          <button
            type="button"
            className="text-xs font-semibold text-delivai-neon-green"
            disabled={busy}
            onClick={() => void withBusy(() => window.delidesk.refreshPrinters())}
          >
            Atualizar
          </button>
        </div>
        <div className="space-y-2">
          {state.printers.length === 0 && (
            <p className="text-sm text-delivai-text-gray/60">Nenhuma impressora encontrada.</p>
          )}
          {state.printers.map((p) => {
            const active = state.defaultPrinter === p.name
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => void withBusy(() => window.delidesk.setDefaultPrinter(p.name))}
                className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-xl border transition
                  ${active
                    ? 'bg-delivai-neon-green/15 border-delivai-neon-green/50'
                    : 'bg-white/10 border-white/15 hover:bg-white/15'
                  }`}
              >
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-delivai-neon-green font-bold text-sm">
                  P
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-delivai-text-gray/65 truncate">
                    {active ? 'Impressora padrão' : 'Disponível'}
                    {p.portName ? ` · ${p.portName}` : ''}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {state.authMock && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !state.defaultPrinter}
            onClick={() => void withBusy(() => window.delidesk.printTestCoupon())}
          >
            Testar cupom
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !selected || !canReprint(selected)}
          onClick={() => {
            if (!selected) return
            void withBusy(() => window.delidesk.reprintJob(selected.id))
          }}
        >
          Reimprimir selecionado
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !selected || !canCancel(selected)}
          onClick={() => {
            if (!selected) return
            void withBusy(() => window.delidesk.cancelJob(selected.id))
          }}
        >
          Cancelar selecionado
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void withBusy(() => {
              if (queueRunning) {
                return state.authMock
                  ? window.delidesk.stopMockSse()
                  : window.delidesk.stopBackendPoll()
              }
              return state.authMock
                ? window.delidesk.startMockSse()
                : window.delidesk.startBackendPoll()
            })
          }
        >
          {queueRunning ? 'Pausar fila' : 'Conectar fila'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-card rounded-xl p-4">
          <h2 className="text-xs font-semibold text-delivai-text-gray/70 mb-3">
            Fila neste PC
            {state.backendPollRunning
              ? ' (poll ativo)'
              : state.mockSseRunning
                ? ' (SSE mock ativo)'
                : ''}
          </h2>
          <div className="space-y-0 divide-y divide-white/10 max-h-80 overflow-auto">
            {state.jobs.length === 0 && (
              <p className="text-sm text-delivai-text-gray/60 py-2">Fila vazia.</p>
            )}
            {state.jobs.slice(0, 30).map((j) => {
              const active = selected?.id === j.id
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedId(j.id)}
                  className={`w-full flex justify-between items-start gap-3 py-2.5 text-sm text-left transition
                    ${active ? 'bg-delivai-neon-green/10 -mx-2 px-2 rounded-lg' : 'hover:bg-white/5 -mx-2 px-2 rounded-lg'}`}
                >
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{j.orderLabel}</span>
                    <span className="text-xs text-delivai-text-gray/65">
                      {statusLabel(j.status)}
                      {j.error ? ` · ${j.error}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-delivai-text-gray/55 shrink-0">
                    {timeAgo(j.updatedAt)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="glass-card rounded-xl p-4">
          <h2 className="text-xs font-semibold text-delivai-text-gray/70 mb-3">
            {selected ? `Cupom · ${selected.orderLabel}` : 'Cupom'}
          </h2>
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold">{statusLabel(selected.status)}</p>
                  <p className="text-xs text-delivai-text-gray/65">
                    {timeAgo(selected.updatedAt)}
                    {selected.error ? ` · ${selected.error}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {canCancel(selected) && (
                    <button
                      type="button"
                      className="btn-secondary text-xs px-3 py-1.5"
                      disabled={busy}
                      onClick={() => void withBusy(() => window.delidesk.cancelJob(selected.id))}
                    >
                      Cancelar
                    </button>
                  )}
                  {canReprint(selected) && (
                    <button
                      type="button"
                      className="btn-secondary text-xs px-3 py-1.5"
                      disabled={busy || !state.defaultPrinter}
                      onClick={() => void withBusy(() => window.delidesk.reprintJob(selected.id))}
                    >
                      Reimprimir
                    </button>
                  )}
                </div>
              </div>
              <pre className="bg-[#fffdf8] text-slate-900 text-[11px] leading-relaxed font-mono rounded-lg p-3 whitespace-pre-wrap shadow-lg max-h-72 overflow-auto">
                {selected.previewText || '(sem preview)'}
              </pre>
            </>
          ) : (
            <p className="text-sm text-delivai-text-gray/60">
              Selecione um job na fila para ver o que foi impresso.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
