@echo off
title YouTube AutoPilot Launcher
echo ====================================================
echo   KHOI DONG YT AUTOPILOT SCHEDULER SYSTEM...
echo ====================================================
echo.

:: Khoi dong Backend
echo [1/2] Dang khoi dong Backend Server (Cong 3001)...
start "YT AutoPilot - Backend" cmd /k "cd backend && npm start"

:: Khoi dong Frontend
echo [2/2] Dang khoi dong Frontend Dev Server...
start "YT AutoPilot - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ====================================================
echo   DA KHOI DONG! 
echo   - Backend dang chay tai: http://localhost:3001
echo   - Frontend dang chay. Vui long mo trinh duyet
echo     theo dia chi hien thi tren cua so Frontend.
echo ====================================================
echo.
pause
