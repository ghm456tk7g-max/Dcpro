@echo off
REM Optional: Lokaler Build unter Windows (benoetigt einmalig Python 3.12).
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt pyinstaller
pyinstaller --noconfirm --onefile --windowed --name AutodartsCoach --collect-data customtkinter main.py
echo Fertig: dist\AutodartsCoach.exe
pause
