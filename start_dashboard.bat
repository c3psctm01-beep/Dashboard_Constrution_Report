@echo off
title PEA Construction and Disbursement Dashboard
chcp 65001 > nul
echo ======================================================================
echo    กำลังเปิดระบบ PEA Construction and Disbursement Dashboard...
echo ======================================================================
cd /d "%~dp0"
py server.py
pause
