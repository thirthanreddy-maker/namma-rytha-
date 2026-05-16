@echo off
title Namma Rytha - AI Farming
echo Starting Namma Rytha AI Server...
cd /d "%~dp0"
start /min cmd /c "npm start"
echo Waiting for server to initialize...
timeout /t 3 /nobreak > nul
echo Opening Namma Rytha Web App...
start msedge --app=http://localhost:3000/login.html || start chrome --app=http://localhost:3000/login.html || start http://localhost:3000/login.html
echo Namma Rytha is running!
exit
