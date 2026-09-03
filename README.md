# Chat IA (standalone) — Plataforma Modular de IA

Interface de chat, diagnósticos técnicos, ferramentas autônomas, RAG e REPL interativo extraída do ecossistema Mestre do PC V10 como projeto independente.

## 🚀 Novas Funcionalidades Implementadas

1. **🛠️ Ferramentas Autônomas & MCP (Model Context Protocol):**
   - Suporte a ferramentas nativas do agente: `web_search` (DuckDuckGo/Tavily), `web_fetch` (extração de texto), `pc_info` (hardware/RAM/CPU em tempo real), `files_read`, `files_write` e `calculator`.
   - Cliente MCP com suporte a servidores locais via Stdio e SSE (`env/mcp-servers.json`).

2. **🧠 RAG (Retrieval-Augmented Generation) & Embeddings:**
   - Ingestão semântica de documentos técnicos, manuais e logs.
   - Embeddings universais: suporte automático para **Ollama** (`nomic-embed-text`), **Google Gemini** (`text-embedding-004`), **OpenAI** (`text-embedding-3-small`) e **Fallback Determinístico Local (128d)** que funciona 100% offline.
   - Vector Store leve integrado com cálculo de similaridade de cosseno em `data/knowledge/`.
   - Alternador direto no chat (`🧠 RAG: Ativo`) para enriquecer prompts automaticamente.

3. **📓 Modo Notebook / REPL Interativo:**
   - Células executáveis de **JavaScript (sandbox Node.js com captura de console)** e **PowerShell (via Launcher ou local)**.
   - Renderização rica de saídas, tempos de execução e persistência de notebooks em `data/notebooks/`.

4. **🎙️ Áudio Avançado (TTS & STT):**
   - Síntese **Edge-TTS com Cache em Disco** (`.cache/audio/`) para carregamento instantâneo.
   - Catálogo de vozes neurais brasileiras (`pt-BR-FranciscaNeural`, `pt-BR-AntonioNeural`, `pt-BR-ThalitaNeural`).
   - Preparação para transcrição Whisper (Groq / OpenAI) de baixa latência.

5. **⚡ Provedores de IA Expandidos:**
   - **Ollama** (Local)
   - **DeepSeek** (`deepseek-chat` V3 e `deepseek-reasoner` R1 com visualização de raciocínio)
   - **OpenAI** (GPT-4o, o4-mini)
   - **Anthropic Claude** (Sonnet 3.5, Opus)
   - **Google Gemini** (Gemini 2.5 Flash / Pro)
   - **Groq** (Llama 3.3, Qwen)
   - **OpenRouter** (Agregador multi-modelo)

6. **🔒 Segurança Aprimorada:**
   - Fechamento de CORS irrestrito: requisições restritas estritamente a origens locais (`127.0.0.1`, `localhost`).
   - Proteção rigorosa contra Path Traversal em arquivos estáticos com normalização de caminhos.
   - Streaming em tempo real direto via `ReadableStream` (redução de latência e consumo de RAM).

---

## 📁 Estrutura de Pastas

```
Chat-IA/
├── env/
│   ├── .env.example         # Template de variáveis e chaves
│   ├── providers.json       # Catálogo de provedores LLM
│   ├── skills.json          # Atalhos e automações de barra ("/")
│   └── mcp-servers.json     # Configuração de servidores MCP
│
├── src/
│   ├── tools/               # Registry e ferramentas do agente
│   │   ├── registry.js
│   │   ├── web-search.js
│   │   ├── web-fetch.js
│   │   └── system-tools.js
│   ├── mcp/                 # Model Context Protocol
│   │   ├── mcp-client.js
│   │   └── mcp-tool-adapter.js
│   ├── rag/                 # RAG, Embeddings e Vector Store
│   │   ├── chunker.js
│   │   ├── embeddings.js
│   │   ├── vector-store.js
│   │   └── rag-engine.js
│   ├── audio/               # Síntese e transcrição de voz
│   │   ├── tts-service.js
│   │   └── stt-service.js
│   └── notebook/            # Sandbox e REPL de execução
│       ├── kernel-runner.js
│       └── session-manager.js
│
├── providers/               # Adaptadores individuais de provedores LLM
│   ├── deepseek.js
│   ├── openai.js
│   ├── anthropic.js
│   ├── gemini.js
│   ├── groq.js
│   └── openrouter.js
│
├── index.html               # Interface com Chat, Notebook e RAG
├── server.js                # Servidor HTTP central unificado
└── iniciar-chat-ia.bat      # Script de inicialização rápida
```

---

## ⚙️ Como Usar

### 1. Início Rápido via Script
Basta executar:
```cmd
iniciar-chat-ia.bat
```
O script subirá o launcher do Mestre do PC (porta 7777), o servidor Chat IA (porta 7788) e abrirá o navegador em `http://127.0.0.1:7788`.

### 2. Manualmente
```bash
# Terminal 1 (Launcher)
cd C:/Users/JEANPC/Mestre-do-PC-V10/v10 && node launcher.js

# Terminal 2 (Chat IA)
cd C:/Users/JEANPC/Chat-IA && node server.js
```
Acesse: **`http://127.0.0.1:7788`**