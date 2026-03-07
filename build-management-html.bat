@echo off
setlocal

cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist node_modules goto :install_deps
if not exist node_modules\.bin\vite.cmd goto :install_deps
if not exist node_modules\motion goto :install_deps
goto :build

:install_deps
echo Dependencies are missing or incomplete, installing...
if not exist node_modules (
  mkdir node_modules >nul 2>nul
)

if exist package-lock.json (
  echo node_modules not ready, running npm ci...
  call npm.cmd ci
) else (
  echo node_modules not ready, running npm install...
  call npm.cmd install
)
if errorlevel 1 goto :error

:build
echo [2/3] Building Web UI...
call npm.cmd run build
if errorlevel 1 goto :error

echo [3/3] Creating management.html...
if not exist dist goto :error_no_dist
copy /y dist\index.html dist\management.html >nul
if errorlevel 1 goto :error

echo.
echo Done: dist\management.html
pause
exit /b 0

:error_no_dist
echo dist folder was not generated.
pause
exit /b 1

:error
echo Build failed.
pause
exit /b 1
