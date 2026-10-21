@echo off
title Chat IA - abridor
REM Abre o Chat IA (http://127.0.0.1:7788) sem duplicar servidor:
REM - se a porta 7788 ja esta LISTENING -> so abre o navegador
REM - se nao -> chama o launcher oficial iniciar-chat-ia.bat (sobe server + navegador)
netstat -ano | findstr ":7788" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  call "%~dp0iniciar-chat-ia.bat"
) else (
  start "" "http://127.0.0.1:7788"
)