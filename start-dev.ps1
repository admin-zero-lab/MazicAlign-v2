# MazicAlign Development Server Launcher (PowerShell)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MazicAlign Development Server Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 현재 스크립트 디렉토리로 이동
Set-Location $PSScriptRoot

# 필수 확인
Write-Host "Checking requirements..." -ForegroundColor Yellow

# Node.js 설치 확인
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# 백엔드 node_modules 확인
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "[WARNING] Backend dependencies not installed" -ForegroundColor Yellow
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Backend installation failed" -ForegroundColor Red
        Set-Location ..
        Read-Host "Press Enter to exit"
        exit 1
    }
    Set-Location ..
    Write-Host ""
}

# 프론트엔드 node_modules 확인
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "[WARNING] Frontend dependencies not installed" -ForegroundColor Yellow
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Frontend installation failed" -ForegroundColor Red
        Set-Location ..
        Read-Host "Press Enter to exit"
        exit 1
    }
    Set-Location ..
    Write-Host ""
}

# 백엔드 서버 실행
Write-Host "[1/3] Starting Backend Server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass", "-NoExit", "-Command", "cd '$backendPath'; npm run dev" -WindowStyle Normal

# 잠시 대기 (백엔드 시작 대기)
Start-Sleep -Seconds 5

# 프론트엔드 서버 실행
Write-Host "[2/3] Starting Frontend Server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass", "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal

# 잠시 대기 (프론트엔드 시작 대기)
Write-Host "[3/3] Waiting for servers to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 브라우저로 URL 열기
Write-Host "Opening Browser..." -ForegroundColor Yellow
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Servers are running!" -ForegroundColor Green
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To stop servers, close the PowerShell windows" -ForegroundColor Yellow
Write-Host "or run: .\stop-dev.ps1" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"
