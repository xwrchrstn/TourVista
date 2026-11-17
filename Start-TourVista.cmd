@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/en/download then try again.
  pause
  exit /b 1
)
node -e "const {createRequire}=require('node:module'); const path=require('node:path'); const client=createRequire(path.resolve('client/package.json')); const server=createRequire(path.resolve('server/package.json')); client.resolve('vite'); client.resolve('react'); server.resolve('express'); server.resolve('nodemailer');" >nul 2>nul
if errorlevel 1 (
  call npm.cmd run setup
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:5173 after the server is ready.
call npm.cmd run dev
pause
