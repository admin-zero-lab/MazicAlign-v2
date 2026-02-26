# MazicAlign Dependency Installer (PowerShell)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MazicAlign Dependency Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 현재 스크립트 디렉토리로 이동
Set-Location $PSScriptRoot

# Node.js 확인
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# 백엔드 의존성 설치
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installing Backend Dependencies..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
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

# 프론트엔드 의존성 설치
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installing Frontend Dependencies..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
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

Write-Host "========================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run:" -ForegroundColor Yellow
Write-Host "  PowerShell: .\start-dev.ps1" -ForegroundColor Cyan
Write-Host "  or CMD:     start-dev.bat" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
