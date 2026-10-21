---
description: Roda o smoke MCP (chat-ia ↔ nexo-core) e interpreta o resultado
argument-hint: "[fix] (opcional — diagnostica e propõe correção se falhar)"
---

# Smoke MCP — chat-ia ↔ nexo-core

Valida a integração MCP stdio entre este frontend e o núcleo `../nexo-core`.

## Passo 1 — Pré-condições rápidas
1. `node --version` → exigir ≥ **22.13.0**.
2. Confirmar que `../nexo-core/` existe e tem `nexo.mjs`.

## Passo 2 — Executar o smoke
```
node scripts/nexo-smoke.mjs
```
- **Exit 0** → resuma em 2-3 linhas o que foi validado (handshake MCP, tools listadas) e encerre com ✅.
- **Falha** → Passo 3; se `$ARGUMENTS` contém `fix`, avance ao Passo 4.

## Passo 3 — Diagnóstico (se falhar)
Verifique em ordem, reportando o que encontra (não invente):
1. `node --check server.js` — sintaxe OK?
2. `env/mcp-servers.json` — o caminho do servidor NEXO aponta para o projeto real?
3. Existe processo na **7788** (`netstat -ano | findstr :7788`)? — o smoke usa stdio, não a porta; conflito pode indicar ambiente sujo.
4. Últimas linhas de `logs/` ou da saída de erro do smoke.

## Passo 4 — Proposta de correção (com `fix`)
- Diagnóstico + causa provável + patch mínimo proposto (diff) — **peça confirmação antes de aplicar** qualquer edição em `src/` ou `server.js`.
- Regra dos AGENTS.md: alteração de contrato MCP (nomes/schemas de tools) exige escalonar ao humano.

## Relatório final
| Item | Resultado |
|---|---|
| Smoke MCP | ✅ exit 0 / ❌ código |
| Handshake + tools | quantas tools visíveis |
| Ambiente | node X.Y.Z, ../nexo-core presente |

Regras: só reporte o que os comandos retornarem; erros são dados, não motivo para reescrever o histórico.