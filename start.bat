@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo MazicAlign
echo ========================================
echo.

cd /d "%~dp0"

REM Node.js 확인
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 빌드 결과물 확인
if not exist "backend\dist\index.js" (
    echo [ERROR] Backend not built. Run build.bat first.
    pause
    exit /b 1
)

if not exist "frontend\dist\index.html" (
    echo [ERROR] Frontend not built. Run build.bat first.
    pause
    exit /b 1
)

REM backend/node_modules 확인
if not exist "backend\node_modules\" (
    echo [WARNING] Backend dependencies not installed. Running npm install...
    cd backend
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo [OK] Starting MazicAlign server on port 5173...
echo.

REM 서버 시작 (백그라운드)
start "MazicAlign" cmd /k "cd /d %~dp0backend && node dist/index.js"

REM 서버 기동 대기
timeout /t 3 /nobreak >nul

REM 브라우저 오픈
start http://localhost:5173

echo ========================================
echo MazicAlign is running!
echo ========================================
echo.
echo URL: http://localhost:5173
echo.
echo To stop: close the "MazicAlign" terminal window,
echo          or run stop.bat
echo.
pause
