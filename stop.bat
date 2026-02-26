@echo off
echo ========================================
echo Stopping MazicAlign
echo ========================================
echo.

echo Stopping server (port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo Server stopped.
pause
