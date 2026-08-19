import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateUiStatus } from '@shared/ipc'

type AppVersionInfo = { version: string; channel: string; packaged?: boolean }

type Props = {
  expanded: boolean
  appInfo: AppVersionInfo | null
}

function bumpPreviewPatch(version: string): string {
  const parts = String(version || '0.0.0')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  while (parts.length < 3) parts.push(0)
  parts[2] += 1
  return parts.join('.')
}

function toneFromStatus(
  status: UpdateUiStatus,
  packaged: boolean
): {
  tone: 'ok' | 'optional' | 'mandatory' | 'neutral'
  label: string
  detail: string
  canInstall: boolean
  canCheck: boolean
} {
  if (!packaged) {
    if (status.state === 'checking') {
      return {
        tone: 'neutral',
        label: 'Verificando…',
        detail: 'Prévia do instalador — no .exe isto consulta o feed de verdade.',
        canInstall: false,
        canCheck: false
      }
    }
    if (status.state === 'downloaded' || status.state === 'available') {
      return {
        tone: status.urgency === 'mandatory' ? 'mandatory' : 'optional',
        label:
          status.urgency === 'mandatory'
            ? 'Atualização obrigatória pronta'
            : 'Atualização pronta',
        detail: `Prévia: v${status.version || '…'} como no .exe. Atualizar agora só reinicia de verdade no instalador.`,
        canInstall: true,
        canCheck: true
      }
    }
    return {
      tone: 'optional',
      label: 'Prévia das atualizações',
      detail:
        'No .exe sandbox/prod: Verificar consulta o feed e Atualizar agora instala. Aqui é o mesmo visual — não baixa nem reinicia.',
      canInstall: true,
      canCheck: true
    }
  }
  switch (status.state) {
    case 'up_to_date':
      return {
        tone: 'ok',
        label: 'App atualizado',
        detail: 'Você já está na versão mais recente deste canal.',
        canInstall: false,
        canCheck: true
      }
    case 'checking':
      return {
        tone: 'neutral',
        label: 'Verificando…',
        detail: 'Consultando o feed de atualização.',
        canInstall: false,
        canCheck: false
      }
    case 'available':
      return {
        tone: status.urgency === 'mandatory' ? 'mandatory' : 'optional',
        label:
          status.urgency === 'mandatory'
            ? 'Atualização obrigatória'
            : 'Atualização disponível',
        detail:
          status.urgency === 'mandatory'
            ? `v${status.version} — instale para continuar com segurança.`
            : `v${status.version} — não interrompe o turno se deixar para depois.`,
        canInstall: false,
        canCheck: true
      }
    case 'downloaded':
      return {
        tone: status.urgency === 'mandatory' ? 'mandatory' : 'optional',
        label:
          status.urgency === 'mandatory'
            ? 'Atualização obrigatória pronta'
            : 'Atualização pronta',
        detail: `v${status.version} baixada. Instalar reinicia o DeliDesk agora.`,
        canInstall: true,
        canCheck: false
      }
    case 'error':
      return {
        tone: 'neutral',
        label: 'Não foi possível verificar',
        detail: 'Tente de novo em instantes. Se persistir, reinstale pelo painel.',
        canInstall: false,
        canCheck: true
      }
    default:
      return {
        tone: 'neutral',
        label: 'Versão do app',
        detail: 'Passe o mouse ou clique para verificar atualizações.',
        canInstall: false,
        canCheck: true
      }
  }
}

const toneClass: Record<string, string> = {
  ok: 'border-delivai-neon-green/40 bg-delivai-neon-green/10 text-delivai-neon-green',
  optional: 'border-amber-400/45 bg-amber-500/15 text-amber-100',
  mandatory: 'border-red-400/50 bg-red-500/15 text-red-100',
  neutral: 'border-white/15 bg-white/5 text-white/80'
}

const CARD_W = 300

/**
 * Card de versão à direita da rail (fora da sidebar).
 * Enquanto aberto, o BrowserView do painel é suprimido — senão cobria o HTML.
 */
export function VersionUpdateCard({ expanded, appInfo }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateUiStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [cardPos, setCardPos] = useState({ top: 8, left: 80 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const packaged = appInfo?.packaged !== false
  const channel = appInfo?.channel || '—'
  const version = appInfo?.version || '…'

  useEffect(() => {
    void window.delidesk.getUpdateStatus().then(setStatus).catch(() => undefined)
    return window.delidesk.onUpdateStatus(setStatus)
  }, [])

  useEffect(() => {
    if (!open) {
      void window.delidesk.setPanelOverlaySuppressed?.(false)
      return
    }
    void window.delidesk.setPanelOverlaySuppressed?.(true)
    return () => {
      void window.delidesk.setPanelOverlaySuppressed?.(false)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const place = (): void => {
      const btn = btnRef.current!
      const rect = btn.getBoundingClientRect()
      const railEl = btn.closest('aside')
      const rail = railEl?.getBoundingClientRect() ?? rect
      const gap = 10
      const measuredH = cardRef.current?.offsetHeight || 210

      // Sempre à direita da rail (fora da sidebar), sobre a área do painel.
      let left = rail.right + gap
      if (left + CARD_W > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - CARD_W - 8)
      }

      let top = rect.bottom - measuredH
      top = Math.min(Math.max(8, top), window.innerHeight - measuredH - 8)
      setCardPos({ top, left })
    }
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
    }
  }, [open, expanded, status.state, version, channel])

  useEffect(() => {
    if (!expanded) setOpen(false)
  }, [expanded])

  useEffect(() => {
    const close = (): void => setOpen(false)
    const onVis = (): void => {
      if (document.hidden) close()
    }
    window.addEventListener('blur', close)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', close)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || cardRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const ui = toneFromStatus(status, packaged)

  const runCheck = (): void => {
    if (!packaged) {
      setBusy(true)
      setStatus({ state: 'checking' })
      window.setTimeout(() => {
        setStatus({
          state: 'downloaded',
          version: bumpPreviewPatch(version),
          urgency: 'optional'
        })
        setBusy(false)
      }, 700)
      return
    }
    setBusy(true)
    void window.delidesk
      .checkForUpdates()
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }

  const runInstall = (): void => {
    if (!packaged) {
      setInstalling(true)
      window.setTimeout(() => {
        setInstalling(false)
        setStatus({ state: 'idle' })
      }, 600)
      return
    }
    setInstalling(true)
    void window.delidesk.installUpdate().then((res) => {
      if (!res.ok) setInstalling(false)
    })
  }

  const popover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={cardRef}
            style={{ top: cardPos.top, left: cardPos.left, width: CARD_W }}
            className="fixed z-[99999] rounded-xl border border-white/15 bg-[#0a1620] p-3 shadow-2xl shadow-black/60"
            data-delidesk-version-card=""
            role="dialog"
            aria-label="Atualização do DeliDesk"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={(e) => {
              const next = e.relatedTarget
              if (next instanceof Element && next.closest('aside')) return
              setOpen(false)
            }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">
              DeliDesk · {channel}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">v{version}</p>

            <div className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${toneClass[ui.tone]}`}>
              <p className="font-semibold">{ui.label}</p>
              <p className="mt-1 break-words leading-relaxed opacity-90">{ui.detail}</p>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ui.canInstall ? (
                <button
                  type="button"
                  disabled={installing}
                  onClick={runInstall}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50
                  ${
                    ui.tone === 'mandatory'
                      ? 'bg-red-400 text-red-950 hover:brightness-110'
                      : 'bg-delivai-neon-green text-delivai-blue-dark hover:brightness-110'
                  }`}
                >
                  {installing ? 'Instalando…' : 'Atualizar agora'}
                </button>
              ) : null}
              {ui.canCheck ? (
                <button
                  type="button"
                  disabled={busy || status.state === 'checking'}
                  onClick={runCheck}
                  className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  {busy || status.state === 'checking' ? 'Verificando…' : 'Verificar'}
                </button>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        title={`DeliDesk v${version} (${channel})`}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onClick={() => {
          setOpen(true)
          if (ui.canCheck && !busy) runCheck()
        }}
        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 transition
          ${expanded ? 'justify-start' : 'justify-center'}
          ${
            ui.tone === 'ok'
              ? 'text-delivai-neon-green/90 hover:bg-delivai-neon-green/10'
              : ui.tone === 'optional'
                ? 'text-amber-200 hover:bg-amber-500/10'
                : ui.tone === 'mandatory'
                  ? 'text-red-200 hover:bg-red-500/10'
                  : 'text-delivai-text-gray/70 hover:bg-white/10 hover:text-white'
          }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </span>
        {expanded ? (
          <span className="min-w-0 truncate text-left text-sm font-semibold">
            v{version}
            {busy || status.state === 'checking' ? '…' : ''}
          </span>
        ) : null}
      </button>
      {popover}
    </div>
  )
}
