@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Plataforma AEC - Usuarios e papeis
node scripts\usuarios.mjs %*
echo.
pause
