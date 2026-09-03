@echo off
title Chat IA - Mestre do PC
REM Sobe o launcher do Mestre do PC V10 (se ainda nao estiver rodando) e o Chat IA standalone

curl -s -o nul http://127.0.0.1:7777/ping
if errorlevel 1 (
  echo Iniciando Launcher do Mestre do PC...
  start "Launcher Mestre do PC" cmd /c "cd /d C:\Users\JEANPC\Mestre-do-PC-V10\v10 && node launcher.js"
  timeout /t 4 /nobreak >nul
)

echo Iniciando Chat IA...
start "Chat IA" cmd /c "cd /d C:\Users\JEANPC\Chat-IA && node server.js"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:7788