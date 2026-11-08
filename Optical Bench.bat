@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo First run - building the app...
  call npm run build
)

start "Optical Bench server" /min node "scripts\serve.mjs" --open
exit /b 0
