import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PrintJob, PrintStateSnapshot, PrintResult, ServerQueueSnapshot } from '@shared/print'

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

function queueStatusText(status: string): string {
  if (status === 'sent') return 'A caminho'
  if (status === 'pending') return 'Na fila'
  return status
}

function clockIso(iso: string): string {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ''
  return clock(ts)
}

function clock(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** A folha da térmica cabe ~42 colunas. Linha maior quebra, como na impressora. */
function fitReceipt(text: string): string {
  const cols = 42
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      if (line.length <= cols) return [line]
      const parts: string[] = []
      for (let i = 0; i < line.length; i += cols) parts.push(line.slice(i, i + cols))
      return parts
    })
    .join('\n')
}

function isVirtualJob(job: PrintJob): boolean {
  return job.source === 'virtual'
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

/** Cupom inteiro na área, sem aumentar além do tamanho de leitura e sem rolagem. */
function ReceiptFit({ text }: { text: string }): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [fontPx, setFontPx] = useState(12)

  useLayoutEffect(() => {
    const box = boxRef.current
    const pre = preRef.current
    if (!box || !pre) return

    const fit = (): void => {
      const availH = box.clientHeight
      const availW = box.clientWidth
      if (availH < 48 || availW < 48) return
      let lo = 6
      let hi = 13
      let best = 6
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2
        pre.style.fontSize = `${mid}px`
        const tooBig = pre.scrollHeight > availH - 2 || pre.scrollWidth > availW - 2
        if (tooBig) hi = mid
        else {
          best = mid
          lo = mid
        }
      }
      pre.style.fontSize = `${best}px`
      setFontPx(best)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [text])

  return (
    <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      <pre
        ref={preRef}
        className="m-0 box-border w-max max-w-full overflow-hidden bg-[#fffdf8] px-3 py-2 font-mono leading-[1.25] text-slate-950 shadow-xl whitespace-pre"
        style={{ fontSize: `${fontPx}px` }}
      >
        {text}
      </pre>
    </div>
  )
}

export function PrintScreen({ companyName, online }: Props): React.JSX.Element {
  const [state, setState] = useState<PrintStateSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [printersOpen, setPrintersOpen] = useState(false)
  const [serverQueue, setServerQueue] = useState<ServerQueueSnapshot | null>(null)
  const [clearAsk, setClearAsk] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let unsub = (): void => undefined
    void window.delidesk.getPrintState().then(setState)
    unsub = window.delidesk.onPrintStateChanged(setState)
    return () => unsub()
  }, [])

  useEffect(() => {
    let stop = false
    const load = (): void => {
      void window.delidesk.getServerQueue().then((next) => {
        if (!stop) setServerQueue(next)
      }).catch(() => {
        if (!stop) {
          setServerQueue({ ok: false, pending: 0, jobs: [], error: 'Não deu para ler a fila.' })
        }
      })
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  async function clearServerQueue(): Promise<void> {
    setClearing(true)
    setToast(null)
    try {
      const result = await window.delidesk.clearServerQueue()
      if (result.ok) {
        setToast(
          result.cancelled > 0
            ? `${result.cancelled} cupom(ns) saíram da fila.`
            : 'A fila já estava vazia.'
        )
        setServerQueue({ ok: true, pending: 0, jobs: [] })
      } else {
        setToast(result.error ?? 'Não foi possível zerar a fila.')
      }
    } catch {
      setToast('Não foi possível zerar a fila.')
    } finally {
      setClearing(false)
      setClearAsk(false)
    }
  }

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

  const systemJobs = state.jobs.filter((j) => !isVirtualJob(j))
  const virtualJobs = state.jobs.filter((j) => isVirtualJob(j))

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-2 gap-3">
      <section className="flex min-h-0 min-w-0 flex-col">
        {selected ? (
          <>
            <p className="mb-1 shrink-0 truncate text-center text-[11px] text-white/70">
              {selected.orderLabel} · {statusLabel(selected.status)} · {clock(selected.updatedAt)}
              {' · '}
              {selected.printerName || 'impressora não registrada'}
            </p>
            {selected.error ? (
              <p className="mb-1 shrink-0 truncate text-[11px] text-amber-200/90">{selected.error}</p>
            ) : null}
            <ReceiptFit text={fitReceipt(selected.previewText || '(sem preview)')} />
          </>
        ) : (
          <p className="text-sm text-white/60">Selecione um cupom na outra metade.</p>
        )}
      </section>

      <div className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-white/55">
            {companyName ?? 'Loja'} · fila {queueStatus}
          </p>
          <span className={online === 'online' ? 'pill-online' : 'pill-offline'}>
            ● {online === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>

        {toast ? (
          <p className="shrink-0 truncate text-[11px] text-delivai-neon-green">{toast}</p>
        ) : null}

        {state.platformPrinterEnabled === false && (
          <p className="shrink-0 text-[11px] leading-snug text-amber-100/90" role="status">
            Fila do agente desligada pela DelivAI (Dev). Cupons DelivAI não chegam até religarem a feature printer.
          </p>
        )}

        {state.platformVirtualCaptureEnabled === false && (
          <p className="shrink-0 text-[11px] leading-snug text-amber-100/90" role="status">
            Captura iFood desligada pela DelivAI (Dev). A virtual não cria pedido até religarem virtual_capture.
          </p>
        )}

        {state.virtualPrinter?.supported && (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-white/60">
              Virtual {state.virtualPrinter.name || 'DeliDesk'}
              {state.virtualPrinter.installed
                ? state.virtualPrinter.listening
                  ? ` · porta ${state.virtualPrinter.listenPort}`
                  : ' · listener offline'
                : ' · não instalada'}
              {state.virtualPrinter.lastError ? ` · ${state.virtualPrinter.lastError}` : ''}
              {state.virtualPrinter.lastCaptureMessage
                ? ` · ${state.virtualPrinter.lastCaptureMessage}`
                : ''}
            </p>
            {!state.virtualPrinter.installed && (
              <button
                type="button"
                className="btn-primary shrink-0 px-2 py-1 text-[11px]"
                disabled={busy}
                onClick={() => void withBusy(() => window.delidesk.installVirtualPrinter())}
              >
                Instalar
              </button>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-semibold text-white/90">
            {state.defaultPrinter || 'Nenhuma impressora'}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold text-delivai-neon-green"
              onClick={() => setPrintersOpen((open) => !open)}
            >
              Trocar
            </button>
            <button
              type="button"
              className="text-[11px] font-semibold text-white/55"
              disabled={busy}
              onClick={() => void withBusy(() => window.delidesk.refreshPrinters())}
            >
              Atualizar
            </button>
          </div>
        </div>

        {printersOpen ? (
          <div className="max-h-28 shrink-0 space-y-1 overflow-auto">
            {state.printers.length === 0 && (
              <p className="text-[11px] text-white/50">Nenhuma impressora encontrada.</p>
            )}
            {state.printers.map((p) => {
              const active = state.defaultPrinter === p.name
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => void withBusy(() => window.delidesk.setDefaultPrinter(p.name))}
                  className={`w-full truncate rounded-md border px-2 py-1 text-left text-[11px] ${
                    active
                      ? 'border-delivai-neon-green/50 bg-delivai-neon-green/15'
                      : 'border-white/15 bg-white/10 hover:bg-white/15'
                  }`}
                >
                  {p.name}
                  {active ? ' · padrão' : ''}
                  {p.portName ? ` · ${p.portName}` : ''}
                </button>
              )
            })}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap gap-1.5">
          {state.authMock && (
            <button
              type="button"
              className="btn-primary px-2.5 py-1 text-[11px]"
              disabled={busy || !state.defaultPrinter}
              onClick={() => void withBusy(() => window.delidesk.printTestCoupon())}
            >
              Testar cupom
            </button>
          )}
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-[11px]"
            disabled={busy || !selected || !canReprint(selected)}
            onClick={() => {
              if (!selected) return
              void withBusy(() => window.delidesk.reprintJob(selected.id))
            }}
          >
            Reimprimir
          </button>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-[11px]"
            disabled={busy || !selected || !canCancel(selected)}
            onClick={() => {
              if (!selected) return
              void withBusy(() => window.delidesk.cancelJob(selected.id))
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-[11px]"
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

        <section className="flex min-h-0 shrink-0 flex-col gap-1 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold text-white">
              Fila de impressão
              {serverQueue && serverQueue.pending > 0 ? ` · ${serverQueue.pending}` : ''}
            </h2>
            <button
              type="button"
              className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-100 disabled:opacity-40"
              disabled={clearing || !serverQueue || (serverQueue.ok && serverQueue.pending <= 0)}
              onClick={() => setClearAsk(true)}
            >
              Zerar fila
            </button>
          </div>
          <p className="truncate text-[10px] text-white/40">
            Cupons que o DelivAI ainda não imprimiu. O mesmo da configuração no Delivery.
          </p>
          {clearAsk ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1">
              <p className="text-[10px] text-amber-100">Tirar esses cupons da fila?</p>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-[10px] text-white/70"
                  disabled={clearing}
                  onClick={() => setClearAsk(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-amber-100"
                  disabled={clearing}
                  onClick={() => void clearServerQueue()}
                >
                  {clearing ? 'Zerando…' : 'Zerar'}
                </button>
              </div>
            </div>
          ) : null}
          {serverQueue?.error ? (
            <p className="text-[11px] text-amber-200/80">{serverQueue.error}</p>
          ) : null}
          <div className="max-h-24 min-h-0 divide-y divide-white/10 overflow-auto">
            {!serverQueue ? (
              <p className="py-1 text-[11px] text-white/45">Lendo a fila…</p>
            ) : serverQueue.jobs.length === 0 ? (
              <p className="py-1 text-[11px] text-white/45">Nenhum cupom esperando.</p>
            ) : (
              serverQueue.jobs.map((job) => (
                <div key={job.id} className="py-1">
                  <p className="truncate text-xs text-white">{job.title}</p>
                  <p className="truncate text-[10px] text-white/50">
                    {queueStatusText(job.status)}
                    {job.createdAt ? ` · ${clockIso(job.createdAt)}` : ''}
                    {job.printerName ? ` · ${job.printerName}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-1.5">
          {(
            [
              {
                title: 'Enviados pelo sistema',
                hint: 'Pedido do DelivAI na impressora física.',
                jobs: systemJobs
              },
              {
                title: 'Chegaram na virtual',
                hint: 'Entrou na virtual (iFood ou teste do Windows).',
                jobs: virtualJobs
              }
            ] as const
          ).map((group) => (
            <section key={group.title} className="flex min-h-0 flex-col overflow-hidden">
              <h2 className="text-[11px] font-semibold text-white">{group.title}</h2>
              <p className="truncate text-[10px] text-white/40">{group.hint}</p>
              <div className="mt-0.5 min-h-0 flex-1 divide-y divide-white/10 overflow-auto">
                {group.jobs.length === 0 ? (
                  <p className="py-1 text-[11px] text-white/45">Nenhum.</p>
                ) : (
                  group.jobs.slice(0, 30).map((j) => {
                    const active = selected?.id === j.id
                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => setSelectedId(j.id)}
                        className={`w-full py-1 text-left ${
                          active ? 'rounded bg-delivai-neon-green/10 px-1' : 'rounded px-1 hover:bg-white/5'
                        }`}
                      >
                        <span className="block truncate text-xs font-medium">{j.orderLabel}</span>
                        <span className="block truncate text-[10px] text-white/50">
                          {statusLabel(j.status)} · {clock(j.updatedAt)}
                          {j.printerName ? ` · ${j.printerName}` : ''}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
