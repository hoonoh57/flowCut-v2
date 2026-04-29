@echo off
chcp 65001 >nul
title FlowCut - Stopping...
color 0C

echo.
echo  ==========================================
echo    FlowCut Full Shutdown
echo  ==========================================
echo.

echo  [1/4] Stopping FlowCut servers...
taskkill /f /fi "WINDOWTITLE eq FlowCut-Server*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq FlowCut-Vite*" >nul 2>&1

echo  [2/4] Stopping AI services...
taskkill /f /fi "WINDOWTITLE eq FlowCut-Ollama*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq FlowCut-ComfyUI*" >nul 2>&1

echo  [3/4] Freeing ports...
for %%p in (3456 5173 8188 11434) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
        echo        Killing PID %%a on port %%p
        taskkill /f /pid %%a >nul 2>&1
    )
)

echo  [4/4] Cleaning temp...
del /q "E:\2026\flowCut\temp\filter_*.txt" >nul 2>&1

echo.
echo  ==========================================
echo    FlowCut stopped.
echo  ==========================================
echo.
timeout /t 3
