# AGENTS.md — Chat IA

> Instruções para agentes de IA trabalhando neste repositório. Leia antes de qualquer tarefa.

## Visão geral

**Chat IA** (v1.1.0) — interface de chat standalone multi-provedor (Ollama, DeepSeek, OpenAI, Anthropic, Gemini, Groq, OpenRouter) com ferramentas autônomas, RAG 100% offline, REPL sandboxed, TTS/STT e cliente MCP (stdio/SSE). É o frontend irmão do **NEXO Core** (`../nexo-core`), que entra como servidor MCP via `env/mcp-servers.json`.

## Stack

- Node.js **≥ 22.13.0** · ESM puro (`"type": "module"` — use `import/export`, nunca `require`)
- HTTP puro via `node:http` (sem framework) · Dependência npm única: `edge-tts`
- Servidor em **http://127.0.0.1:7788** (porta via env `PORT`, default 7788)

## Comandos

| Ação | Comando |
|---|---|
| Instalar deps | `npm install` |
| Dev (auto-reload) | `node --watch server.js` |
| Produção | `node server.js` |
| Atalho Windows | `iniciar-chat-ia.bat` (sobe 7788; NEXO conecta como MCP automático) |
| Smoke NEXO MCP | `node scripts/nexo-smoke.mjs` |
| Checagem de sintaxe | `node --check server.js` |

## Estrutura

```
server.js    Entrada — servidor HTTP + proxy seguro de chamadas de API
index.html   UI única (SPA)
src/         Módulos especializados (áudio, tools, RAG, embeddings)
tools/       Ferramentas nativas do agente (registry.js)
providers/   Adapters por provedor
env/         Config (mcp-servers.json, load-env.js)
data/        Persistência (knowledge base, caches)
scripts/     Utilitários (nexo-smoke.mjs)
```

## Testes

- **Não há suítes de teste automatizadas** — não invente arquivos de teste sem pedido explícito.
- Antes de concluir qualquer tarefa, rode no mínimo: `node --check server.js` e os módulos tocados.
- Se tocar em MCP/tools/NEXO, rode também `node scripts/nexo-smoke.mjs`.

## Segurança

- **Nunca colocar chaves/tokens no código** — usar `env/` (carregado por `env/load-env.js`); manter `.env` fora do Git.
- Validar toda entrada externa (mensagens de chat, conteúdo RAG, respostas MCP).
- Servidor escuta **apenas em 127.0.0.1** — nunca mudar para 0.0.0.0.
- Não adicionar dependências sem justificar (repo tem política de deps mínimas).
- Comandos destrutivos via MCP exigem `confirm: true` — não contornar esse gate.

## Commits

- Título: `[escopo] descrição curta` (ex.: `[tts] corrige cache de áudio`)
- Não incluir artefatos gerados (`data/`, caches, `node_modules`)