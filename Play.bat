@echo off
rem EMBERBOUND EXPEDITION - double-click to play.
rem Opens the built single-file game (dist\index.html) in the default browser.
rem If it has not been built yet, it builds it first (needs Node.js).
setlocal
cd /d "%~dp0"

if exist "dist\index.html" goto play

echo dist\index.html not found. Building the game...
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found. Please install Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail

:play
start "" "%~dp0dist\index.html"
exit /b 0

:fail
echo Build failed. See the messages above.
pause
exit /b 1
