# Chat IA (standalone)

Interface de chat com IA extraída do Mestre do PC V10 como projeto independente.

## O que é
- `index.html` — interface completa do Chat IA (CSS/JS inline, autossuficiente)
- `server.js` — mini-servidor Node que:
  - serve a interface em `http://127.0.0.1:7788`
  - faz **proxy server-side** das chamadas de API (`/ping`, `/ollama/*`, `/validate-command`, `/run`, `/run-status`) para o launcher do Mestre do PC (`http://127.0.0.1:7777`)

O proxy existe porque o launcher só autoriza o client `v10-web` quando a origem é a dele — assim o chat separado continua funcionando **sem enfraquecer a segurança** do V10.

## Como usar
```bash
# 1. Launcher do Mestre do PC precisa estar rodando (porta 7777)
cd C:/Users/JEANPC/Mestre-do-PC-V10/v10 && node launcher.js

# 2. Inicie o Chat IA
cd C:/Users/JEANPC/Chat-IA && node server.js

# 3. Abra http://127.0.0.1:7788
```

Ou pelo starter: `iniciar-chat-ia.bat` (sobe os dois e abre o navegador).

## Config
- `PORT` (padrão `7788`) — porta do Chat IA
- `LAUNCHER_URL` (padrão `http://127.0.0.1:7777`) — endereço do launcher

## Origem
Extraído de `Mestre-do-PC-V10/v10/chat-ia.html` (V11.2) em 2026-09-02. O arquivo original foi removido do repositório V10.