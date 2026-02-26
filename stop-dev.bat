@echo off
echo ========================================
echo Stopping MazicAlign Development Servers
echo ========================================
echo.

REM Node.js 프로세스 중 포트 5000, 3000 사용하는 것 종료
echo Stopping Backend Server (port 5000)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo Stopping Frontend Server (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

REM 남은 node 프로세스 확인
echo.
echo Checking for remaining node processes...
tasklist | find "node.exe" >nul
if errorlevel 1 (
    echo No node processes found.
) else (
    echo Some node processes are still running.
    echo If needed, you can manually stop them using Task Manager.
)

echo.
echo Servers stopped.
pause
