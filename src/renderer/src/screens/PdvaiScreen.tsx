import { useEffect, useState } from 'react'
import type { PdvaiState } from '@shared/pdvai'

type Props = {
  online: 'online' | 'offline'
  companyName?: string
}

export function PdvaiScreen({ online, companyName }: Props): React.JSX.Element {
  const [state, setState] = useState<PdvaiState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const effectivelyOffline = online === 'offline' || Boolean(state?.forceOffline)

  useEffect(() => {
    void window.delidesk.getPdvaiState().then(setState)
    return window.delidesk.onPdvaiStateChanged(setState)
  }, [])

  useEffect(() => {
    if (online === 'online' && state && !state.forceOffline && state.pendingSyncCount > 0) {
      void window.delidesk.syncPdvai()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  async function sell(itemId: string): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      await window.delidesk.createPdvaiOrder(itemId, 1)
      setMsg('Pedido local criado e cupom enviado à impressora padrão')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha na venda local')
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return <p className="text-sm text-delivai-text-gray/70">Carregando PDVAI…</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Venda no balcão</h1>
          <p className="text-sm text-delivai-text-gray/70 mt-1">
            {companyName ?? 'Loja'} · PDVAI fallback
          </p>
        </div>
        <span className={effectivelyOffline ? 'pill-offline' : 'pill-online'}>
          ● {effectivelyOffline ? 'Offline' : 'Online'}
        </span>
      </div>

      {effectivelyOffline && (
        <div className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-100 text-sm px-3 py-2.5 font-medium">
          ⚠ Sem internet — modo emergência ativo
        </div>
      )}

      {msg && (
        <div className="glass-card rounded-xl px-4 py-3 text-sm text-delivai-neon-green border-delivai-neon-green/30">
          {msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={() =>
            void window.delidesk.setPdvaiForceOffline(!state.forceOffline)
          }
        >
          {state.forceOffline ? 'Desligar simulação offline' : 'Simular offline'}
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy || effectivelyOffline || state.pendingSyncCount === 0}
          onClick={() => {
            setBusy(true)
            void window.delidesk.syncPdvai().finally(() => setBusy(false))
          }}
        >
          Sincronizar ({state.pendingSyncCount})
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Cardápio em cache</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {state.catalog.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => void sell(item.id)}
              className="glass-card rounded-xl p-4 text-center hover:bg-white/15 transition border-white/20 disabled:opacity-50"
            >
              <strong className="block text-sm">{item.name}</strong>
              <span className="text-xs text-delivai-neon-green">R$ {item.priceLabel}</span>
              <span className="block text-[10px] text-delivai-text-gray/55 mt-1">cache</span>
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-delivai-text-gray/70">
          <span>Pedidos locais</span>
          <span>
            {state.lastSyncAt
              ? `Último sync · ${new Date(state.lastSyncAt).toLocaleTimeString()}`
              : 'Ainda sem sync'}
          </span>
        </div>
        {state.orders.length === 0 && (
          <p className="text-sm text-delivai-text-gray/60 py-2">Nenhuma venda local ainda.</p>
        )}
        {state.orders.slice(0, 10).map((o) => (
          <div
            key={o.id}
            className="flex justify-between items-center py-2 border-t border-white/10 text-sm first:border-0"
          >
            <div>
              <p className="font-semibold">
                #{o.id} · {o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
              </p>
              <p className="text-xs text-delivai-text-gray/60">
                {o.status}
                {o.printed ? ' · impresso' : ' · sem cupom'}
              </p>
            </div>
            <span className="text-delivai-neon-green font-semibold">
              R$ {o.total.toFixed(2).replace('.', ',')}
            </span>
          </div>
        ))}
      </section>

      <div className="glass-card rounded-xl p-4 space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-delivai-neon-green font-bold">
            1
          </div>
          <div>
            <p className="font-semibold">Novo pedido local</p>
            <p className="text-xs text-delivai-text-gray/65">
              Cardápio em cache · cupom na impressora
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-delivai-neon-green font-bold">
            ↻
          </div>
          <div>
            <p className="font-semibold">Sincronizar ao voltar</p>
            <p className="text-xs text-delivai-text-gray/65">
              Stub local até o BE de sync existir
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 opacity-70">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-red-300 font-bold">
            ✕
          </div>
          <div>
            <p className="font-semibold">WhatsApp / QR</p>
            <p className="text-xs text-delivai-text-gray/65">Pausado offline</p>
          </div>
        </div>
      </div>
    </div>
  )
}
