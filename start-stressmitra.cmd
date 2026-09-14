@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo       StressMitra - Starting Server
echo ========================================

if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Creating virtual environment...
    py -3.11 -m venv .venv
    if errorlevel 1 (
        echo ERROR: Python 3.11 was not found.
        echo Install Python 3.11 and make sure the Python launcher is available.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Existing virtual environment found.
)

set "PY=.venv\Scripts\python.exe"

echo [2/3] Checking required packages...
"%PY%" -c "import fastapi,uvicorn,numpy,joblib,sklearn,multipart" >nul 2>&1
if errorlevel 1 (
    echo Packages are missing. Installing from requirements.txt...
    "%PY%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo ERROR: Package installation failed.
        echo Check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo [3/3] Starting StressMitra...
echo.
echo Open: http://127.0.0.1:8000
start "" http://127.0.0.1:8000
 echo.
"%PY%" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

pause
