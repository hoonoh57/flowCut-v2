@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title FlowCut - FULL STOP
color 0C

echo.
echo  ==========================================
echo    FlowCut FULL SHUTDOWN
echo    Killing ALL related processes
echo  ==========================================
echo.

echo  [1/6] FlowCut windows...
taskkill /f /fi "WINDOWTITLE eq FlowCut-*" >nul 2>&1
echo        Done.

echo  [2/6] Node.js processes (server, vite)...
REM Kill by port first
for %%p in (3456 5173) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
        echo        Killing PID %%a on port %%p
        taskkill /f /pid %%a >nul 2>&1
    )
)
REM Kill any node running server.cjs or vite
wmic process where "name='node.exe' and commandline like '%%server.cjs%%'" call terminate >nul 2>&1
wmic process where "name='node.exe' and commandline like '%%vite%%'" call terminate >nul 2>&1
wmic process where "name='node.exe' and commandline like '%%flowCut%%'" call terminate >nul 2>&1
echo        Done.

echo  [3/6] Ollama...
taskkill /f /im ollama.exe >nul 2>&1
taskkill /f /im ollama_llama_server.exe >nul 2>&1
REM Also kill by port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":11434.*LISTENING" 2^>nul') do (
    echo        Killing PID %%a on port 11434
    taskkill /f /pid %%a >nul 2>&1
)
echo        Done.

echo  [4/6] ComfyUI (Python)...
REM Kill by port 8188
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8188.*LISTENING" 2^>nul') do (
    echo        Killing PID %%a on port 8188
    taskkill /f /pid %%a >nul 2>&1
)
REM Kill python processes running ComfyUI
wmic process where "name='python.exe' and commandline like '%%ComfyUI%%'" call terminate >nul 2>&1
wmic process where "name='python.exe' and commandline like '%%main.py%%8188%%'" call terminate >nul 2>&1
echo        Done.

echo  [5/6] Orphan processes on all FlowCut ports...
for %%p in (3456 5173 8188 11434) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
        echo        Force killing PID %%a on port %%p
        taskkill /f /pid %%a >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul
echo        Done.

echo  [6/6] Verify all ports free...
set "allclear=1"
for %%p in (3456 5173 8188 11434) do (
    netstat -ano 2>nul | findstr ":%%p.*LISTENING" >nul 2>&1
    if !errorlevel! equ 0 (
        echo        [FAIL] Port %%p still in use!
        set "allclear=0"
        REM Last resort: find and force kill
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
            echo        FORCE killing PID %%a
            taskkill /f /pid %%a >nul 2>&1
        )
    ) else (
        echo        Port %%p: free
    )
)

REM Clean temp files
del /q "E:\2026\flowCut\temp\filter_*.txt" >nul 2>&1

echo.
if "!allclear!"=="1" (
    echo  ==========================================
    echo    ALL STOPPED SUCCESSFULLY
    echo  ------------------------------------------
    echo    Port 3456  [FlowCut Server] : free
    echo    Port 5173  [Vite Dev]       : free
    echo    Port 8188  [ComfyUI]        : free
    echo    Port 11434 [Ollama]         : free
    echo  ==========================================
) else (
    color 4F
    echo  ==========================================
    echo    WARNING: Some processes could not stop!
    echo    If errors persist, restart Windows.
    echo  ==========================================
)
echo.
timeout /t 5
