# DeliDesk — releases, canais e auto-update (não quebrar a loja)

> **Canônica deste repo.** Cruzada: `backend-delivai/docs/operations/delidesk-releases.md` · [`branches.md`](branches.md).
> Objetivo: **nunca** misturar versão sandbox com prod do cliente; **nunca** reiniciar o app no meio do turno sem ação do operador.

---

## 1. Dois canais — regra absoluta

| Canal | Branch Git | Artefato | GitHub Release | Backend que o app fala | Quem usa |
|-------|------------|----------|----------------|------------------------|----------|
| **sandbox** | `develop` | `DeliDesk-Setup-sandbox-*.exe` | **prerelease** | API **test** (`:staging`) | Leo / homologação |
| **prod** | `main` | `DeliDesk-Setup-prod-*.exe` | release **estável** (não prerelease) | API **produção** | Cliente da loja |

- O canal fica **assado no instalador** (`resources/channel.json` → `DELIDESK_CHANNEL`).
- Feed de update: `{BACKEND}/webhook/public/delidesk-update/{sandbox|prod}`.
- Instalador **sandbox não vira prod** sozinho (e vice-versa). Cliente em prod **só** recebe releases estáveis.
- Impressora virtual Windows (captura iFood): **prod** = fila `DeliDesk` porta `19100`; **sandbox** = fila `DeliDesk Test` porta `19101` — no mesmo PC as duas podem coexistir sem conflito.

**Proibido**

- Mandar link sandbox para loja em produção.
- Publicar release **prod** apontando API de test (ou o inverso).
- Tratar merge do **front** `main` como “DeliDesk atualizado” — são produtos separados.

---

## 2. Como saber qual versão o PC está usando

Identidade = **versão + canal + API**.

| Sinal | Onde |
|-------|------|
| Versão do app | `package.json` / `app.getVersion()` no build (aparece no toast de update: “DeliDesk X.Y.Z”) |
| Canal | `channel.json` embutido (`sandbox` \| `prod`) |
| API | URL bake do instalador / `.env` do canal (`getBackendBaseUrl()`) |
| Release publicada | GitHub Releases do repo `delidesk` — tag + `latest.yml` do canal |
| Download “latest” no painel | Backend `GET /webhook/public/delidesk-download?channel=…` escolhe a release certa (prod = não-prerelease; sandbox = prerelease) |

**Suporte / dúvida “qual versão o cliente está?”**

1. Perguntar versão exibida no app (About / toast de update / logs).
2. Confirmar se o instalador veio do link **prod** ou sandbox do painel.
3. Conferir na release GitHub se essa tag é estável (prod) ou prerelease (sandbox).
4. Se o app fala com a API test → **não é prod**, mesmo que o número de versão seja alto.

---

## 3. Merge ≠ release publicada

| Passo | O que acontece |
|-------|----------------|
| Merge PR → `develop` | Código no tronco sandbox. **Não** publica `.exe` sozinho. |
| Merge PR → `main` | Código no tronco prod. **Não** publica `.exe` sozinho. |
| **Release Windows** (Actions) | Gera `.exe` + `latest.yml` + GitHub Release. Disparo: tag `v*` **ou** `workflow_dispatch` (canal `sandbox` \| `prod` + ref). |

Canal na Actions: commit em `main` → prod; só em `develop` → sandbox. Em `workflow_dispatch`, o input `channel` manda.

Sem Actions de release bem-sucedida, o cliente **continua** na versão antiga do feed — mesmo com `main` atualizado no Git.

---

## 4. Ordem ideal de go-live (ecossistema)

Nunca inverter. Compatibilidade de API primeiro.

1. **Backend → `main`** (e EasyPanel prod) — endpoints que o DeliDesk / painel usam, com **retrocompat** enquanto o parque de PCs ainda não atualizou.
2. **Front → `main`** — painel, download do instalador, Dev kill-switches, UX.
3. **DeliDesk → `main`** + **bump de versão** em `package.json` + **Release Windows canal `prod`**.
4. Smoke em 1 PC de loja: login, listar impressoras, 1 cupom, (se couber) captura; ver toast de update se havia versão anterior.
5. Só então comunicar “baixe / reinicie ao fechar o expediente” se a mudança for crítica.

Na **fase de testes**: back + desk em `develop` (sandbox) + front **localhost** — sem merge front/`main` desk até o Leo pedir fim da fase.

---

## 5. Auto-update no PC do cliente — não quebrar o turno

Implementação: `src/main/auto-update.ts` + toast `UpdateToast`.

| Comportamento | Valor atual | Efeito na loja |
|---------------|-------------|----------------|
| Checagem | ~12s após abrir + a cada **6h** | Baixa em background; não imprime/para fila sozinho |
| `autoDownload` | `true` | Download silencioso |
| `autoInstallOnAppQuit` | `true` | Aplica ao **fechar** o app (fim de turno / reboot) |
| `quitAndInstall` | Só se o usuário clicar **Instalar agora** | Reinicia o app **na hora** |

### Regras operacionais (obrigatórias)

1. **Publicar release prod fora do pico** quando possível (antes da abertura ou após fechamento típico das lojas).
2. **Nunca** forçar restart remoto / matar processo no PC do cliente.
3. Download em background é **seguro**; o que é perigoso é **reiniciar** no meio de impressão / captura iFood / turno.
4. Texto do toast: “Instalar agora” = reinicia. “Depois” = continua trabalhando; update aplica ao sair (`autoInstallOnAppQuit`).
5. Mudança que **quebra** API antiga: (a) BE aceita clientes velhos e novos; (b) só depois release desk; (c) se inevitável breaking, avisar lojas para fechar o DeliDesk e reabrir (ou Instalar agora) **fora** do pico.
6. Kill-switches Dev (`printer` / `virtual_capture` / `printnode_fallback`) **não** substituem versão do app — controlam uso da fila/captura **no backend** sem precisar de novo `.exe`.

### O que o agente / engenharia **não** faz

- Não clicar/automatizar “Instalar agora” no PC do cliente.
- Não publicar prod “no meio do almoço” sem necessidade.
- Não misturar feed sandbox no bake prod.

---

## 6. Checklist de release prod (copiar)

```
[ ] BE prod já tem a API necessária (retrocompat se houver parque antigo)
[ ] Front main (se a UX/download mudou) já deployado ou alinhado
[ ] PR delidesk → main mergeada (CI verde)
[ ] package.json version bumpada (sem reusar tag)
[ ] Actions Release Windows: channel=prod, ref=main (ou tag vX.Y.Z em commit de main)
[ ] GitHub Release: NÃO prerelease; assets: Setup-prod exe + blockmap + latest.yml
[ ] Painel/download channel=prod aponta para essa versão
[ ] 1 PC smoke; demais PCs: toast “Depois” ok até fecharem o app
[ ] Se breaking: avisar lojas — atualizar ao fechar o expediente
```

Sandbox: idem com `develop` + channel `sandbox` + prerelease.

---

## 7. Falhas comuns

| Sintoma | Causa típica | Ação |
|---------|--------------|------|
| Cliente “não atualiza” | Release não publicada / tag errada / ainda prerelease no canal prod | Rodar Actions prod; conferir `latest.yml` |
| Baixou sandbox sem querer | Link `channel=sandbox` ou instalador de teste | Reinstalar **prod**; não misturar atalhos |
| App novo + API velha | Desk main antes do BE main | Reverter ordem: BE primeiro |
| Reiniciou no pico | Operador clicou “Instalar agora” | Orientar usar “Depois” até fim do turno |
| Merge main sem `.exe` novo | Esqueceram Actions | Disparar release |

---

## 8. Referência de código

| Peça | Path |
|------|------|
| Updater | `src/main/auto-update.ts` |
| Canal bake | `src/main/load-env.ts` + `resources/channel.json` |
| Toast | `src/renderer/src/components/UpdateToast.tsx` |
| Workflow | `.github/workflows/release-windows.yml` |
| Feed / download BE | `DelideskReleaseHandler` / `DelideskReleaseService` (backend) |
