@echo off
rem mxifund-pet 一键启动（无需安装 Node，使用项目内置 Electron）
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
