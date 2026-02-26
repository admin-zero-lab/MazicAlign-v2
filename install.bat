@echo off
setlocal enabledelayedexpansion

echo ========================================
echo MazicAlign Dependency Installer
echo ========================================
echo.

REM 스크립트가 있는 디렉토리로 이동
cd /d "%~dp0"

REM Node.js 확인
echo Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node --version
npm --version
echo.

REM 백엔드 의존성 설치
echo ========================================
echo Installing Backend Dependencies...
echo ========================================
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

REM 프론트엔드 의존성 설치
echo ========================================
echo Installing Frontend Dependencies...
echo ========================================
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

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo You can now run: build.bat (to build), then start.bat (to launch)
echo.
pause
