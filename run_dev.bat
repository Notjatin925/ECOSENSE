@echo off
echo ==========================================================
echo Starting VoltSense Real-Time Energy Reminder System
echo ==========================================================

REM Ensure Node.js is on PATH if installed in local folder
if exist "C:\Users\jatin\nodejs" set PATH=C:\Users\jatin\nodejs;%PATH%

echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "VoltSense Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Launching Vite React Frontend on http://localhost:5173 ...
start "VoltSense Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ==========================================================
echo Both services are booting!
echo Frontend Dashboard: http://localhost:5173
echo Backend API & WS:   http://localhost:8000/docs
echo ==========================================================
pause
