# providers/ — Provedores LLM

Cada provedor é um módulo ES com a interface comum:

```js
export const id = "openai";            // igual à chave em env/providers.json
export const label = "OpenAI";
export function streamChat(payload, cfg) { ... }  // → fetch Response (JSON-lines)
```

**Contrato** (compatível com o front, que já consome stream JSON-lines do Ollama):
- `payload`: `{ model, stream: true, messages: [{role, content}] }`
- Retorno: `fetch` Response cujo corpo é **JSON-lines** no formato Ollama:
  `{"message": {"role": "assistant", "content": "trecho"}, "done": false}` … `{"done": true}`

Assim o `index.html` (que já lê `chunk.message.content`) funciona com qualquer
provedor sem mudança no parser do front — cada provedor só converte seu formato
nativo (SSE do OpenAI, etc.) para JSON-lines.

## Status

| Provedor | Arquivo | Auth | Status |
| --- | --- | --- | --- |
| ollama | (via proxy launcher) | nenhuma (local) | ✅ funcionando |
| ollama-cloud | `ollama-cloud.js` | `OLLAMA_API_KEY` | ✅ implementado (reusa ollama.js — cloud via ollama.com) |
| nvidia | `nvidia.js` | `NVIDIA_API_KEY` | ✅ implementado (reusa openai.js — NIM, 83 modelos em `/models`; chat testado: deepseek-v4.1-flash ✅ e nemotron-3-ultra ✅; outros podem exigir habilitação em build.nvidia.com) |
| 9router | `9router.js` | `ROUTER_API_KEY` | ✅ implementado (reusa openai.js — gateway no AR em :20128; catálogo ao vivo via `/models`. Obs.: a conexão NVIDIA do router está datada — modelos EOL/404; dar refresh em Providers no dashboard) |
| openai | `openai.js` | `OPENAI_API_KEY` | ✅ implementado |
| anthropic | `anthropic.js` | `ANTHROPIC_API_KEY` | ✅ implementado |
| gemini | `gemini.js` | `GEMINI_API_KEY` | ✅ implementado |
| openrouter | `openrouter.js` | `OPENROUTER_API_KEY` | ✅ implementado (reusa openai.js) |
| groq | `groq.js` | `GROQ_API_KEY` | ✅ implementado (reusa openai.js) |

## Como adicionar

1. Criar `providers/<id>.js` exportando `id`, `label`, `streamChat(payload, cfg)`.
2. Registrar em `env/providers.json` (label, baseUrl, envKey, modelos).
3. O servidor detecta automaticamente: `/llm/<id>/chat` e `/llm/<id>/models`.
4. Chaves ficam em `env/.env` (gitignored) — nunca no código.