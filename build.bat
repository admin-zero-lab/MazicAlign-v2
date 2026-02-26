@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo MazicAlign Build Script
echo ========================================
echo.

cd /d "%~dp0"

REM 프론트엔드 빌드
echo [1/2] Building Frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend built successfully (frontend/dist/)
echo.

REM 백엔드 빌드
echo [2/2] Building Backend...
cd backend
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Backend build failed
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Backend built successfully (backend/dist/)
echo.

echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Run start.bat to launch the application.
echo.
pause
