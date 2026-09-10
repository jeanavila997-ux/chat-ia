# 💬 Chat IA (standalone) — Plataforma Modular de IA

Uma interface de chat multi-provedor com ferramentas autônomas, RAG, REPL interativo e áudio, extraída do ecossistema **Mestre do PC V10** como projeto independente.

- **Chat unificado** para Ollama, DeepSeek, OpenAI, Anthropic, Google Gemini, Groq e OpenRouter
- **Agente com ferramentas nativas**: busca na web, extração de páginas, leitura/escrita de arquivos, calculadora e diagnóstico de hardware (`pc_info`)
- **RAG e embeddings** que funcionam 100% offline, com fallback determinístico local
- **REPL / Notebook** para JavaScript e PowerShell em sandbox
- **Áudio**: TTS neural brasileiro (Edge-TTS com cache) e STT (Whisper)
- **MCP**: cliente completo para servidores locais via Stdio e SSE

> **Integração NEXO Core (novo):** o núcleo headless (`../nexo-core`) entra como servidor MCP stdio via `env/mcp-servers.json` — 9 ferramentas de manutenção do Windows (catálogo `127.xlsx`, skills, memória, agente ReAct). Valide com `node scripts/nexo-smoke.mjs`. Comandos destrutivos chegam bloqueados (`isError`) até o cliente enviar `confirm: true`.

---

## 🚀 Funcionalidades

### 🛠️ Ferramentas Autônomas & MCP
- Ferramentas nativas: `web_search` (DuckDuckGo/Tavily), `web_fetch` (extração de texto), `pc_info` (hardware/RAM/CPU em tempo real), `files_read`, `files_write` e `calculator`
- Cliente MCP com servidores locais via **Stdio** e **SSE** (`env/mcp-servers.json`)

### 🧠 RAG & Embeddings
- Ingestão semântica de documentos técnicos, manuais e logs
- Embeddings universais: **Ollama** (`nomic-embed-text`), **Google Gemini** (`text-embedding-004`), **OpenAI** (`text-embedding-3-small`) e **Fallback Determinístico Local (128d)** — offline primeiro
- Vector Store leves com similaridade de cosseno em `data/knowledge/`
- Alternador no chat (`🧠 RAG: Ativo`) para enriquecer prompts automaticamente

### 📓 Notebook / REPL Interativo
- Células executáveis de **JavaScript** (sandbox Node.js com captura de console) e **PowerShell** (via Launcher ou local)
- Renderização rica, tempos de execução e persistência em `data/notebooks/`

### 🎙️ Áudio (TTS & STT)
- Síntese **Edge-TTS com cache em disco** (`.cache/audio/`)
- Vozes neurais brasileiras: `pt-BR-FranciscaNeural`, `pt-BR-AntonioNeural`, `pt-BR-ThalitaNeural`
- Transcrição Whisper (Groq / OpenAI) de baixa latência

### ⚡ Provedores de IA
| Provedor | Modelos |
|---|---|
| **Ollama** | Local |
| **DeepSeek** | `deepseek-chat` V3, `deepseek-reasoner` R1 (com visualização de raciocínio) |
| **OpenAI** | GPT-4o, o4-mini |
| **Anthropic Claude** | Sonnet 3.5, Opus |
| **Google Gemini** | Gemini 2.5 Flash / Pro |
| **Groq** | Llama 3.3, Qwen |
| **OpenRouter** | Agregador multi-modelo |

### 🔒 Segurança
- CORS restrito a origens locais (`127.0.0.1`, `localhost`)
- Proteção contra Path Traversal com normalização de caminhos
- Streaming em tempo real via `ReadableStream` (menos latência e RAM)

---

## ⚙️ Como Usar

### 1. Início rápido
```cmd
iniciar-chat-ia.bat
```
Sobe o launcher do Mestre do PC (porta `7777`), o servidor Chat IA (porta `7788`) e abre o navegador em `http://127.0.0.1:7788`.

### 2. Manualmente
```bash
# Terminal 1 — Launcher
cd C:/Users/JEANPC/Mestre-do-PC-V10/v10 && node launcher.js

# Terminal 2 — Chat IA
cd C:/Users/JEANPC/Chat-IA && node server.js
```
Acesse **`http://127.0.0.1:7788`**.

### Configuração
1. Copie `env/.env.example` → `.env` e preencha as chaves dos provedores.
2. `env/providers.json` lista o catálogo de provedores; `env/skills.json` guarda os atalhos de barra (`/`).
3. `env/mcp-servers.json` registra os servidores MCP locais.

---

## 📁 Estrutura

```
Chat-IA/
├── env/
│   ├── .env.example         # Template de variáveis e chaves
│   ├── providers.json       # Catálogo de provedores LLM
│   ├── skills.json          # Atalhos e automações de barra ("/")
│   └── mcp-servers.json     # Configuração de servidores MCP
├── src/
│   ├── tools/               # Registry e ferramentas do agente
│   ├── mcp/                 # Model Context Protocol (client + adapter)
│   ├── rag/                 # RAG, embeddings e vector store
│   ├── audio/               # TTS e STT
│   └── notebook/            # Sandbox e REPL de execução
├── providers/               # Adaptadores individuais de provedores
├── index.html               # Interface (chat, notebook e RAG)
├── server.js                # Servidor HTTP central unificado
└── iniciar-chat-ia.bat      # Script de inicialização rápida
```

---

## 📦 Dependências

- **Node.js >= 22.13** — a única dependência obrigatória do runtime
- `edge-tts` (única dependência npm, para TTS neural)

Provedores de IA funcionam por chave de API (`.env`) ou via Ollama local.

---

## 📄 Licença

Projeto independente extraído do ecossistema Mestre do PC V10. Uso livre para fins de estudo e automação local.