# MazicAlign Development Server Stopper (PowerShell)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Stopping MazicAlign Development Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 포트 5000 (백엔드) 프로세스 종료
Write-Host "Stopping Backend Server (port 5000)..." -ForegroundColor Yellow
try {
    $backend = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
    if ($backend) {
        $backendPID = $backend.OwningProcess
        Stop-Process -Id $backendPID -Force -ErrorAction SilentlyContinue
        Write-Host "Backend server stopped (PID: $backendPID)" -ForegroundColor Green
    } else {
        Write-Host "No process found on port 5000" -ForegroundColor Yellow
    }
} catch {
    Write-Host "No process found on port 5000" -ForegroundColor Yellow
}

# 포트 3000 (프론트엔드) 프로세스 종료
Write-Host "Stopping Frontend Server (port 3000)..." -ForegroundColor Yellow
try {
    $frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($frontend) {
        $frontendPID = $frontend.OwningProcess
        Stop-Process -Id $frontendPID -Force -ErrorAction SilentlyContinue
        Write-Host "Frontend server stopped (PID: $frontendPID)" -ForegroundColor Green
    } else {
        Write-Host "No process found on port 3000" -ForegroundColor Yellow
    }
} catch {
    Write-Host "No process found on port 3000" -ForegroundColor Yellow
}

# 남은 node 프로세스 확인
Write-Host ""
Write-Host "Checking for remaining node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Some node processes are still running:" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  PID: $($_.Id) - $($_.ProcessName)" -ForegroundColor Cyan
    }
    Write-Host "If needed, you can manually stop them using Task Manager." -ForegroundColor Yellow
} else {
    Write-Host "No node processes found." -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Servers stopped." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
