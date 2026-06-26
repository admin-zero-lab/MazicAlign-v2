@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo MazicAlign Development Server (Dev Mode)
echo ========================================
echo.

REM Move to script directory
cd /d "%~dp0"

REM Check requirements
echo Checking requirements...

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo [OK] Node.js %NODE_VER%
echo [OK] npm %NPM_VER%
echo.

REM Check Backend Dependencies
if not exist "backend\node_modules\" (
    echo [WARNING] Backend dependencies not installed
    echo Installing backend dependencies...
    cd backend
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Backend installation failed
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo.
)

REM Check Frontend Dependencies
if not exist "frontend\node_modules\" (
    echo [WARNING] Frontend dependencies not installed
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend installation failed
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo.
)

echo [OK] All dependencies installed
echo.

REM Set Directories
set "BACKEND_DIR=%~dp0backend"
set "FRONTEND_DIR=%~dp0frontend"

REM Start Backend
echo [1/2] Starting Backend Server (port 5173)...
start "MazicAlign Backend" cmd /k "cd /d %BACKEND_DIR% && npm run dev"

REM Wait for Backend
echo       Waiting for backend to start...
timeout /t 5 /nobreak >nul

REM Start Frontend (Vite dev server on 5174 with proxy to backend 5173)
echo [2/2] Starting Frontend Dev Server...
start "MazicAlign Frontend" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

REM Wait for Frontend
timeout /t 8 /nobreak >nul

REM Open Browser
echo.
echo Opening browser...
start http://localhost:5173/v2

echo.
echo ========================================
echo Dev servers running!
echo ========================================
echo.
echo http://localhost:5173/v2
echo.
echo To stop: close the terminal windows, or run stop-dev.bat
echo.
pause
