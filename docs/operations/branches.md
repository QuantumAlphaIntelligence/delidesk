# Auditoria de branches — DeliDesk

> **Objetivo:** mesmo padrão Git do DelivAI (backend/front): inventário limpo, **nunca** trabalhar direto em troncos, merge só sob pedido + CI.
> **Canônica cruzada:** `backend-delivai/docs/operations/branches.md` e `backend-delivai/docs/continuation-prompts.md` §1.
> **Execução:** só deletar branch, merge ou alterar tronco quando o **Leo pedir**.

**Snapshot:** jul/2026 — inventário alvo DeliDesk: **`main` + `develop` + 1 branch de melhoria**.

---

## Inventário alvo

Enquanto uma frente estiver ativa, o remoto deve ficar assim:

| Repo | Branches remotas permitidas |
|------|-----------------------------|
| **delidesk** | `main`, `develop`, **e só mais uma** (`feature/…` ou `fix/…` da frente atual) |

**Nunca** acumular várias `feature/*` / `fix/*` mergeadas “por precaução”.

### Quando a PR da frente já foi mergeada e nasce outra branch

1. Criar a branch **nova** (a “atual”) a partir do tronco certo.
2. Abrir PR / merge quando Leo pedir.
3. **Apagar as antigas da mesma frente** (remoto + local) — só com “deixa só a atual” / limpeza explícita.
4. Resultado: **apenas** troncos + a branch de melhoria **mais recente**.

### Preferência: reutilizar a mesma branch

Enquanto a PR da frente **ainda não** foi mergeada (ou Leo não pediu nova): **não** criar `fix/outro-nome` — commitar na mesma branch e atualizar a PR.

---

## Troncos permanentes (nunca apagar)

| Branch | Papel |
|--------|--------|
| `main` | Produção — instalador **prod** (`env.production`) — **nunca** commit/push direto, force-push ou `git push --delete` |
| `develop` | Sandbox / teste — instalador **sandbox** (`env.sandbox`) — **nunca** commit/push direto nem apagar |

Qualquer outra branch é **temporária** (feature/fix/chore).

---

## Ciclo de vida da branch de trabalho

1. **Criar o mínimo:** **uma** branch por frente; reutilizar até fechar. Só criar branch nova se a anterior **já foi mergeada**.
2. **Trabalhar:** só na feature/fix; **nunca** commit/push direto em `main`/`develop`.
3. **PR + CI:** abrir PR → esperar checks verdes → merge (squash) **quando Leo pedir**.
4. **Após merge:** por padrão **sem** `--delete-branch`. Apagar antigas só com sim / “deixa só a atual”.
5. Checkout local em `develop`/`main` após merge do `gh` **não** autoriza commit no tronco — só o checkout.

### O que **nunca** apagar

| Tipo | Motivo |
|------|--------|
| Troncos | `main`, `develop` |
| Branch de melhoria **atual** | a única `feature/*` ou `fix/*` da frente em curso |
| PR **aberta** | ainda há PR nessa branch |
| `backup/*` | histórico sensível — só com pedido explícito |

**Proibido:** apagar `main`/`develop`; apagar a branch atual; apagar branch com PR aberta; force-push em tronco; limpar remoto sem listar.

---

## Fluxo Leo (canais sandbox / prod) — **não inverter**

| Objetivo | O que fazer | O que **não** fazer |
|----------|-------------|---------------------|
| **Testar** (PC com impressora / sandbox) | PR → merge em **`develop`** → Actions gera `DeliDesk-Setup-sandbox-*.exe` (ou `npm run dev` / `dist:win:sandbox` na **feature**) | Commit/push direto em `develop` |
| **Produção** | PR → merge em **`main`** → Actions gera `DeliDesk-Setup-prod-*.exe` — **somente** ao fim da fase e com pedido **explícito** | Antecipar prod no meio dos testes; commit direto em `main` |

### Como interpretar pedidos

| Frase típica | O que fazer |
|--------------|-------------|
| “commit/push da feature”, “abre PR” | Só na branch de melhoria; PR para `develop` (teste) ou `main` (prod) conforme pedido |
| “merge”, “automerge”, “sobe pro sandbox/test” | Merge da PR em **`develop`** após CI verde — **não** trabalhar no tronco |
| “sobe prod”, “release prod”, “merge em main” | Merge em **`main`** só com pedido explícito no fim da fase |

**Proibido:** tratar “deploy”/teste como licença para commit em `develop`/`main`; abrir PR e mergear por iniciativa própria.

### Alinhamento Git durante testes

| Momento | O que garantir antes de commit/push (quando Leo pedir) |
|---------|--------------------------------------------------------|
| **Cada commit/push na feature** | Branch **apta a merge na `develop`** — fetch + merge/rebase local, conflitos resolvidos, typecheck/build verde |
| **Fim da fase** | **Somente quando Leo pedir:** alinhar para merge em `main` (prod). Não antecipar |

---

## Merge pelo agente (padrão — sob pedido do Leo)

1. Abrir/atualizar PR para o tronco certo (`develop` para sandbox; `main` para prod).
2. **Esperar checks CI** até verdes (`gh pr checks` quando disponível).
3. Check falhou → corrigir ou reportar; **não** mergear.
4. Check pendente → aguardar; timeout → avisar Leo.
5. Squash merge **sem** `--delete-branch` por padrão.
6. Reportar URL + estado. Limpeza de antigas só com pedido de inventário.

**Proibido:** mergear por iniciativa própria; mergear com CI vermelho/pendente sem autorização explícita; push/commit direto em `develop`/`main`.

---

## Estado atual (jul/2026)

| Repo | Branch de melhoria | Tronco sandbox | Tronco prod |
|------|--------------------|----------------|-------------|
| `delidesk` | `fix/delidesk-print-queue` | `develop` → instalador sandbox | `main` → instalador prod |

> Detalhe de canais e artefatos: [`README.md`](../../README.md) § Canais.
|
