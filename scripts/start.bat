@echo off
setlocal
cd /d "%~dp0\.."

call "%~dp0ensure-node.bat"
if %errorlevel% neq 0 exit /b %errorlevel%

echo Starting AI Workbench at http://127.0.0.1:%PORT%
node server.js
