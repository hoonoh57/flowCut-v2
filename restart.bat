@echo off
chcp 65001 >nul
title FlowCut - Restarting...
color 0E

echo.
echo  ==========================================
echo    FlowCut Quick Restart
echo  ==========================================
echo.

cd /d E:\2026\flowCut

echo  [1/3] Stopping servers...
taskkill /f /fi "WINDOWTITLE eq FlowCut-Server*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq FlowCut-Vite*" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3456.*LISTENING" 2^>nul') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING" 2^>nul') do taskkill /f /pid %%a >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [2/3] Waiting for ports...
:waitport
netstat -ano 2>nul | findstr ":3456.*LISTENING" >nul 2>&1
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitport
)
echo        Ports free.

echo  [3/3] Restarting...
start "FlowCut-Server" /min cmd /k "title FlowCut-Server [3456] && cd /d E:\2026\flowCut && color 0B && node server/server.cjs"
timeout /t 3 /nobreak >nul
start "FlowCut-Vite" /min cmd /k "title FlowCut-Vite [5173] && cd /d E:\2026\flowCut && color 0D && npx vite"
timeout /t 2 /nobreak >nul

echo.
echo  ==========================================
echo    FlowCut restarted!
echo  ------------------------------------------
echo    Backend:   http://localhost:3456
echo    Frontend:  http://localhost:5173
echo  ==========================================
echo.
timeout /t 3
