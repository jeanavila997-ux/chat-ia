@echo off
title Chat IA + NEXO
REM Sobe o Chat IA (frontend HTML) na porta 7788.
REM O nexo-core (backend MCP) e iniciado automaticamente pelo chat-ia via env/mcp-servers.json.

REM (Opcional) Launcher do Mestre do PC V10 na porta 7777 - descomente se tiver:
REM curl -s -o nul http://127.0.0.1:7777/ping
REM if errorlevel 1 (
REM   start "Launcher Mestre do PC" cmd /c "cd /d <caminho-do-mestre-do-pc> && node launcher.js"
REM   timeout /t 4 /nobreak >nul
REM )

echo Iniciando Chat IA (frontend HTML em http://127.0.0.1:7788)...
start "Chat IA" cmd /c "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:7788
