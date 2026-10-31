# PowerShell Launcher for VoltSense Real-Time Energy Reminder System
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Starting VoltSense Real-Time Energy Reminder System" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (Test-Path "C:\Users\jatin\nodejs") {
    $env:PATH = "C:\Users\jatin\nodejs;" + $env:PATH
}

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"

Write-Host "[1/2] Launching FastAPI Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host "[2/2] Launching Vite React Frontend on http://localhost:5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PATH = 'C:\Users\jatin\nodejs;' + `$env:PATH; cd '$frontendDir'; npm run dev"

Write-Host "`nServices launched in background windows!" -ForegroundColor Yellow
Write-Host "Frontend Dashboard: http://localhost:5173" -ForegroundColor White
Write-Host "Backend API Docs:   http://localhost:8000/docs" -ForegroundColor White
Write-Host "WebSocket Endpoint: ws://localhost:8000/ws" -ForegroundColor White
