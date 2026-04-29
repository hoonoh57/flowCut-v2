@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title FlowCut - FULL STOP
color 0C

echo.
echo  ==========================================
echo    FlowCut FULL SHUTDOWN
echo  ==========================================
echo.

echo  [1/6] FlowCut windows...
taskkill /f /fi "WINDOWTITLE eq FlowCut-*" >nul 2>&1
echo        Done.

echo  [2/6] Node.js processes...
wmic process where "name='node.exe' and commandline like '%%server.cjs%%'" call terminate >nul 2>&1
wmic process where "name='node.exe' and commandline like '%%vite%%'" call terminate >nul 2>&1
wmic process where "name='node.exe' and commandline like '%%flowCut%%'" call terminate >nul 2>&1
echo        Done.

echo  [3/6] Ollama...
taskkill /f /im ollama.exe >nul 2>&1
taskkill /f /im ollama_llama_server.exe >nul 2>&1
echo        Done.

echo  [4/6] ComfyUI...
wmic process where "name='python.exe' and commandline like '%%ComfyUI%%'" call terminate >nul 2>&1
wmic process where "name='python.exe' and commandline like '%%main.py%%'" call terminate >nul 2>&1
echo        Done.

echo  [5/6] Kill by ports...
for %%p in (3456 5173 8188 11434) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
        echo        Killing PID %%a on port %%p
        taskkill /f /pid %%a >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul
echo        Done.

echo  [6/6] Verify...
set "allclear=1"
for %%p in (3456 5173 8188 11434) do (
    netstat -ano 2>nul | findstr ":%%p.*LISTENING" >nul 2>&1
    if !errorlevel! equ 0 (
        echo        [FAIL] Port %%p still in use!
        set "allclear=0"
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
            taskkill /f /pid %%a >nul 2>&1
        )
    ) else (
        echo        Port %%p: free
    )
)

del /q "E:\2026\flowCut\temp\filter_*.txt" >nul 2>&1

echo.
if "!allclear!"=="1" (
    echo  ALL STOPPED SUCCESSFULLY
) else (
    color 4F
    echo  WARNING: Some processes survived! Restart Windows if needed.
)
echo.
timeout /t 5