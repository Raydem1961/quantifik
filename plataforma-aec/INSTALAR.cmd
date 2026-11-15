@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ObraTop 4 - Instalar e publicar
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado neste computador.
  echo  Vou abrir o site oficial: baixe a versao LTS, instale e execute este arquivo de novo.
  start "" "https://nodejs.org/pt"
  pause
  exit /b 1
)
node scripts\instalar.mjs %*
echo.
pause
