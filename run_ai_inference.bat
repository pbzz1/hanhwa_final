@echo off
cd /d "%~dp0ai-inference"
if not exist venv (
  echo Creating venv and installing dependencies...
  python -m venv venv
  call venv\Scripts\activate.bat
  pip install -r requirements.txt
) else (
  call venv\Scripts\activate.bat
)
echo Starting ai-inference server at http://localhost:8000
echo API docs: http://localhost:8000/docs
uvicorn main:app --host 0.0.0.0 --port 8000
pause
