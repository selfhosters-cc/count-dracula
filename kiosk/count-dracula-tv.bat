@echo off
rem Count Dracula TV launcher for Windows: kiosk Chrome on the TV page (a bare /tv, which remembers its pairing).
rem Optional: plain Chrome full-screen (F11) on the TV page works too; this adds sound-without-a-click
rem after a reload (the autoplay flag). Keep-awake comes from the power settings in kiosk/README.md.
rem The server fills in the address this was downloaded from.
set URL=__ORIGIN__/tv
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
start "" "%CHROME%" --user-data-dir="%LOCALAPPDATA%\CountDraculaTV" --no-first-run --noerrdialogs --autoplay-policy=no-user-gesture-required --kiosk %URL%
