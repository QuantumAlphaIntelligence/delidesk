import { useEffect, useState, type ReactNode } from 'react'
import type { ShellRole } from '@shared/ipc'
import { DeliDeskMark } from './DeliDeskMark'
import { VersionUpdateCard } from './VersionUpdateCard'

export type AppNavId =
  | 'orders'
  | 'chat'
  | 'print'
  | 'pdvai'
  | 'delivery'
  | 'motoboys'
  | 'schedule'
  | 'company'
  | 'license'
  | 'clients'
  | 'dev-home'
  | 'dev-licenses'
  | 'dev-contracts'
  | 'dev-evolution'
  | 'dev-bot'
  | 'dev-delidesk'
  | 'dev-companies'
  | 'dev-prompts'
  | 'dev-clients'
  | 'dev-database'
  | 'dev-logs'
  | 'dev-observability'
  | 'dev-permissoes'

type NavItem = {
  id: AppNavId
  label: string
  hint?: string
  icon: ReactNode
}

type Props = {
  active: AppNavId
  /** loja = Pedidos…; dev = painel interno DelivAI */
  shellRole?: ShellRole
  companyLabel?: string
  /** CNPJ já mascarado (mesmo padrão do chip da sidebar no front). */
  companyDocLabel?: string
  companyLogoUrl?: string
  online: 'online' | 'offline'
  onNavigate: (id: AppNavId) => void
  onLogout: () => void
}

type AppVersionInfo = { version: string; channel: string; packaged?: boolean }

function IconBox({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
      {children}
    </span>
  )
}

const iconClass = 'h-6 w-6'

const MAIN: NavItem[] = [
  {
    id: 'orders',
    label: 'Pedidos',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'chat',
    label: 'Conversas',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M5 18v-1.5A3.5 3.5 0 0 1 8.5 13H18a3 3 0 0 0 3-3V8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v9l2-1.5Z"
            strokeLinejoin="round"
          />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'pdvai',
    label: 'Balcão',
    hint: 'PDVAI',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h4M7 12h6M7 15h3" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  }
]

/** Configuração — impressão/agente fora do menu operacional. */
const CONFIG: NavItem[] = [
  {
    id: 'print',
    label: 'Impressão',
    hint: 'Fila e agente',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="7" y="14" width="10" height="6" rx="1" />
        </svg>
      </IconBox>
    )
  }
]

const LOJA: NavItem[] = [
  {
    id: 'delivery',
    label: 'Entregas',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 14h11V7H3v7Zm11 0h3l3 3v-3h1V9h-7v5Z" strokeLinejoin="round" />
          <circle cx="7" cy="17.5" r="1.5" />
          <circle cx="17" cy="17.5" r="1.5" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'motoboys',
    label: 'Motoboys',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6.5" cy="16.5" r="2" />
          <circle cx="17.5" cy="16.5" r="2" />
          <path d="M8.5 16.5h5l2-5H9l-.5 5Z" strokeLinejoin="round" />
          <path d="M12 7h3l2 4.5" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'schedule',
    label: 'Agenda',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'clients',
    label: 'Clientes',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 19a4 4 0 0 1 4.5-3.9" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  }
]

const CONFIG_FOOTER: NavItem[] = [
  ...CONFIG,
  {
    id: 'company',
    label: 'Empresa',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 20V6l8-3 8 3v14" strokeLinejoin="round" />
          <path d="M9 20v-6h6v6M9 10h.01M15 10h.01M12 10h.01" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'license',
    label: 'Licença',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="12" r="3.5" />
          <path d="M12.5 12h7v2.5M16.5 12v2.5M19.5 12v2.5" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  }
]

/** Rail da equipe DelivAI (espelha /dev — sem Pedidos/Loja). */
const DEV_MAIN: NavItem[] = [
  {
    id: 'dev-home',
    label: 'Início',
    hint: 'Painel de controle',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-licenses',
    label: 'Licenças',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 12h5M8 15h6" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-evolution',
    label: 'Evolution',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
          <path d="M7 7h.01M7 17h.01" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-bot',
    label: 'Bot',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="8" width="14" height="10" rx="2" />
          <path d="M12 4v4M9 13h.01M15 13h.01M9 16h6" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-delidesk',
    label: 'DeliDesk',
    hint: 'Features',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-companies',
    label: 'Empresas',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 20V6l8-3 8 3v14" strokeLinejoin="round" />
          <path d="M9 20v-6h6v6" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-database',
    label: 'Banco',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      </IconBox>
    )
  },
  {
    id: 'dev-logs',
    label: 'Logs',
    icon: (
      <IconBox>
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 6h14M5 12h10M5 18h12" strokeLinecap="round" />
        </svg>
      </IconBox>
    )
  }
]

const DEV_FOOTER: NavItem[] = [...CONFIG]

function NavButton({
  item,
  active,
  expanded,
  onClick
}: {
  item: NavItem
  active: boolean
  expanded: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={item.hint ? `${item.label} (${item.hint})` : item.label}
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 transition
        ${expanded ? 'justify-start' : 'justify-center'}
        ${
          active
            ? 'bg-delivai-neon-green text-delivai-blue-dark shadow-[0_0_20px_-4px_rgba(71,242,199,0.55)]'
            : 'text-delivai-text-gray/75 hover:bg-white/10 hover:text-white'
        }`}
    >
      {item.icon}
      <span
        className={`truncate text-sm font-semibold whitespace-nowrap transition-opacity duration-150
          ${expanded ? 'max-w-[10rem] opacity-100' : 'max-w-0 overflow-hidden opacity-0'}`}
      >
        {item.label}
      </span>
    </button>
  )
}

/**
 * Sidebar em fluxo flex (não absolute).
 * BrowserView do Electron fica sempre acima do HTML — expandir por cima do painel
 * cortava os nomes. Aqui a largura empurra o layout e o PanelHost redimensiona a view.
 */
export function AppRail({
  active,
  shellRole = 'store',
  companyLabel,
  companyDocLabel,
  companyLogoUrl,
  online,
  onNavigate,
  onLogout
}: Props): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppVersionInfo | null>(null)

  useEffect(() => {
    void window.delidesk.getAppVersion().then(setAppInfo).catch(() => undefined)
  }, [])
  const [expanded, setExpanded] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [logoReady, setLogoReady] = useState(false)
  useEffect(() => {
    setLogoFailed(false)
    setLogoReady(false)
  }, [companyLogoUrl])
  const isDevShell = shellRole === 'dev'
  const showCompanyLogo = Boolean(!isDevShell && companyLogoUrl && !logoFailed && logoReady)
  const storeTitle = isDevShell
    ? 'Equipe DelivAI'
    : (companyLabel || '').trim() || 'Loja'
  const storeSub = isDevShell
    ? 'Painel interno'
    : (companyDocLabel || '').trim() || 'DeliDesk'

  const initialMark = (
    <div
      className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-delivai-neon-green/15 ring-1 ring-delivai-neon-green/30"
      title={storeTitle}
    >
      <span className="text-lg font-bold text-delivai-neon-green">
        {storeTitle.slice(0, 1).toUpperCase()}
      </span>
    </div>
  )

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={(e) => {
        const next = e.relatedTarget
        if (next instanceof Element && next.closest('[data-delidesk-version-card]')) return
        setExpanded(false)
      }}
      className={`relative z-30 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/10
        bg-slate-950/90 backdrop-blur-md transition-[width] duration-200 ease-out
        ${expanded ? 'w-56 shadow-[18px_0_48px_-16px_rgba(0,0,0,0.65)]' : 'w-[4.75rem]'}`}
    >
      <div
        className={`flex flex-none items-center gap-3 border-b border-white/[0.07] px-2 pb-3 pt-3.5
          ${expanded ? 'flex-row px-3' : 'flex-col'}`}
      >
        <div className="relative shrink-0">
          {showCompanyLogo ? (
            <div
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/15"
              title={storeTitle}
            >
              <img
                src={companyLogoUrl}
                alt={storeTitle}
                className="h-full w-full object-contain p-0.5"
                draggable={false}
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : (
            initialMark
          )}
          {/* Pré-carrega sem mostrar ícone quebrado */}
          {companyLogoUrl && !logoFailed && !logoReady ? (
            <img
              src={companyLogoUrl}
              alt=""
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              draggable={false}
              onLoad={() => setLogoReady(true)}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <div
            className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-slate-950 ring-1 ring-white/25"
            title="DeliDesk"
          >
            <DeliDeskMark className="h-6 w-6" />
          </div>
        </div>
        {expanded ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-delivai-neon-green">
              {storeTitle}
            </p>
            <p className="truncate text-[10px] text-delivai-neon-green/70">{storeSub}</p>
          </div>
        ) : null}
      </div>

      <nav className="rail-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-1.5 py-1.5">
        {isDevShell ? (
          <>
            {DEV_MAIN.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={active === item.id}
                expanded={expanded}
                onClick={() => onNavigate(item.id)}
              />
            ))}
            {expanded ? (
              <div className="px-2 pb-1 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-delivai-text-gray/40">
                  Máquina
                </p>
                <div className="mt-1.5 h-px bg-white/10" />
              </div>
            ) : (
              <div className="mx-2 my-1 h-px bg-white/10" />
            )}
            {DEV_FOOTER.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={active === item.id}
                expanded={expanded}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </>
        ) : (
          <>
            {MAIN.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={active === item.id}
                expanded={expanded}
                onClick={() => onNavigate(item.id)}
              />
            ))}

            {expanded ? (
              <div className="px-2 pb-1 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-delivai-text-gray/40">
                  Loja
                </p>
                <div className="mt-1.5 h-px bg-white/10" />
              </div>
            ) : null}

            {LOJA.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={active === item.id}
                expanded={expanded}
                onClick={() => onNavigate(item.id)}
              />
            ))}

            {expanded ? (
              <div className="px-2 pb-1 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-delivai-text-gray/40">
                  Configuração
                </p>
                <div className="mt-1.5 h-px bg-white/10" />
              </div>
            ) : (
              <div className="mx-2 my-1 h-px bg-white/10" />
            )}

            {CONFIG_FOOTER.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={active === item.id}
                expanded={expanded}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/10 px-1.5 pb-3 pt-2">
        <div
          className={`mx-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold
            ${expanded ? 'justify-start' : 'justify-center'}
            ${online === 'online' ? 'text-delivai-neon-green bg-delivai-neon-green/10' : 'text-red-300 bg-red-500/15'}`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {expanded ? (
            <span className="whitespace-nowrap">
              {online === 'online' ? 'Online' : 'Offline'}
            </span>
          ) : null}
        </div>
        <VersionUpdateCard expanded={expanded} appInfo={appInfo} />
        <button
          type="button"
          title="Sair"
          onClick={onLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-delivai-text-gray/70
            transition hover:bg-white/10 hover:text-white
            ${expanded ? 'justify-start' : 'justify-center'}`}
        >
          <IconBox>
            <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
              <path d="M15 12H4m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconBox>
          {expanded ? <span className="text-sm font-semibold">Sair</span> : null}
        </button>
      </div>
    </aside>
  )
}
