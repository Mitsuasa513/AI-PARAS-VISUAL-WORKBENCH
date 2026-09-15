@echo off
setlocal
REM Detects and installs Node.js (>= 18) using the best available package manager.

where node >nul 2>&1
if %errorlevel%==0 (
  for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NV=%%v"
  set "NV=%NV:v=%"
  set /a MAJ=0
  for /f "tokens=1 delims=." %%a in ("%NV%") do set /a MAJ=%%a
  if %MAJ% GEQ 18 (
    echo ok: Node.js %NV% already installed
    exit /b 0
  )
)

echo Node.js ^>^= 18 not found. Attempting installation...

where winget >nul 2>&1
if %errorlevel%==0 (
  echo Using winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  goto :verify
)

where choco >nul 2>&1
if %errorlevel%==0 (
  echo Using choco...
  choco install nodejs-lts -y
  goto :verify
)

where scoop >nul 2>&1
if %errorlevel%==0 (
  echo Using scoop...
  scoop install nodejs-lts
  goto :verify
)

echo ERROR: No supported package manager found (winget/choco/scoop).
echo Please install Node.js ^>^= 18 manually from https://nodejs.org
exit /b 1

:verify
where node >nul 2>&1
if %errorlevel%==0 (
  for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NV=%%v"
  set "NV=%NV:v=%"
  set /a MAJ=0
  for /f "tokens=1 delims=." %%a in ("%NV%") do set /a MAJ=%%a
  if %MAJ% GEQ 18 (
    echo ok: Node.js %NV% installed successfully
    exit /b 0
  )
)
echo Installation completed but node was not found on PATH.
echo Please open a new terminal and try again.
exit /b 1
