# DeliDesk

App da loja **DelivAI** (Windows): impressão ESC/POS, painel embutido e PDVAI offline.

Stack: Electron + React + TypeScript + Tailwind. Visual alinhado ao front DelivAI (Poppins, neon `#47F2C7`, gradient teal).

> Referência de telas: `backend-delivai/docs/plans/delidesk-apresentacao.html`

## Requisitos

- **Windows** para tray/impressão reais (desenvolvimento de UI também funciona no Linux/WSL com limitações de tray/GUI)
- Node.js 20+ / npm

## Setup

```bash
cd DelivAI/delidesk
npm install
npm run dev
```

Sobe Electron unpackaged com hot reload. Variáveis opcionais: ver `env.example`.

## Auth

1. Tela **Entrar com DelivAI** abre o **navegador** em `/autorizar`.
2. Em **dev** (sem `DELIDESK_AUTH_MOCK=0`), após ~1s o app grava uma **sessão mock**.
3. Com **`DELIDESK_AUTH_MOCK=0`**: OAuth real (`oauth/start` → Autorizar → `oauth/token`). Falha de token **não** gera sessão fake — o erro aparece na UI.
4. Callback `delidesk://auth/callback?code=…&state=…` troca o code por device tokens **e** `panel_sso_code`.
5. O app hidrata o painel carregando `/delidesk-sso?code=…` na partition `persist:delivai`. Pedidos/Conversas abrem já logados.
6. `DELIDESK_AUTH_URL` e `DELIDESK_PANEL_URL` / `CHAT_URL` devem ser a **mesma origem**.

| Env | Efeito |
|-----|--------|
| `DELIDESK_API_URL` | Backend Kotlin (oauth, printers, jobs) |
| `DELIDESK_AUTH_URL` | URL Autorizar no navegador |
| `DELIDESK_AUTH_MOCK=0` | Desliga auto-login mock; força OAuth real |
| `DELIDESK_AUTH_MOCK=1` | Força mock mesmo empacotado |
| `DELIDESK_PANEL_URL` | URL do painel embutido (mesma origem que AUTH) |
| `DELIDESK_CHAT_URL` | URL Conversas / WhatsApp embutido |

## Checklist E2E (impressão real)

Pré-requisitos: BE com V22+V23 + printagent; front com `/autorizar` e `/delidesk-sso`; app no Windows.

1. `DELIDESK_AUTH_MOCK=0`, `DELIDESK_API_URL`, `DELIDESK_AUTH_URL` + `PANEL_URL` na **mesma origem** do front
2. Entrar → Autorizar no **navegador** → tokens + seed SSO do painel + `POST /printers`
3. Aba Pedidos abre já logada
4. Engrenagem no painel → listar PCs/impressoras → Salvar (`print_backend=agent`)
5. Criar/imprimir pedido → job em `print_jobs` → app faz poll `GET /jobs/next`, imprime ESC/POS e `POST .../result`
6. Conferir: job `done` e `content_base64` null

Com mock off, a fila do app usa **poll do backend** (não a fila mock SSE).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (hot reload) |
| `npm run build` | Compila → `out/` |
| `npm run typecheck` | TypeScript |
| `npm run bake:sandbox` / `bake:prod` | Gera `resources/channel.json` a partir de `env.*` |
| `npm run dist:win` | Pasta unpackaged Windows (smoke) |
| `npm run dist:win:sandbox` | NSIS `DeliDesk-Setup-sandbox-*.exe` (smoke local) |
| `npm run dist:win:prod` | NSIS `DeliDesk-Setup-prod-*.exe` (smoke local) |
| `npm run dist:linux` | Pasta Linux unpackaged (só UI/dev) |

## Canais (sandbox / prod)

| Branch | Canal | Artefato |
|--------|-------|----------|
| `develop` | sandbox (`env.sandbox`) | `DeliDesk-Setup-sandbox-${version}.exe` |
| `main` | prod (`env.production`) | `DeliDesk-Setup-prod-${version}.exe` |

**Publicação oficial = GitHub Actions** (`windows-latest` + NSIS). Tag `v*` no commit da branch → o workflow escolhe o canal e anexa o `.exe` na Release.

No PC do lojista **não há** `.env`: as URLs vão em `channel.json` dentro do instalador. Dev local continua com `.env.local`.

```bash
# Smoke local (Windows; no Linux precisa Wine)
npm run dist:win:sandbox
# → release/DeliDesk-Setup-sandbox-0.1.0.exe
```

**Fora de escopo V1:** Authenticode / SmartScreen, `electron-updater`.

## Estrutura

```
src/main/       # Electron (janela, tray, auth, agent-api, print, panel, pdvai)
src/preload/    # contextBridge → window.delidesk
src/renderer/   # React UI
src/shared/     # tipos IPC / config
electron-builder.yml
```

Hardening: `contextIsolation: true`, `nodeIntegration: false`.

## Status V1 (app)

- [x] Scaffold + tokens DelivAI
- [x] Login mock + OAuth real (`AUTH_MOCK=0`) + `delidesk://` + safeStorage
- [x] Tray
- [x] Impressão ESC/POS + poll `/jobs/next` + ack + report printers
- [x] Painel / Conversas embutidos
- [x] PDVAI offline + sync stub
- [x] Build local Windows (`dist:win`)
- [x] Release GitHub Actions (sandbox + prod) + download no front

### Painel embutido

Abas **Painel** / **Conversas** usam `BrowserView`. Offline → mensagem e PDVAI.

### PDVAI

Aba **PDVAI** → item do cache → pedido local + cupom. **Simular offline** / **Sincronizar** (stub).

## Fechar / sair

Fechar a janela **esconde para a bandeja**. Encerrar: tray → **Sair**.
