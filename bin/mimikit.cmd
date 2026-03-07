@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."

:loop
call pnpm exec tsx "%ROOT%\src\cli\index.ts" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="75" (
  echo [mimikit] restarting...
  call pnpm i
  if errorlevel 1 (
    echo [mimikit] pnpm i failed, exit 1
    exit /b 1
  )
  timeout /t 1 /nobreak >nul
  goto loop
)

echo [mimikit] exited with code %EXIT_CODE%
exit /b %EXIT_CODE%
