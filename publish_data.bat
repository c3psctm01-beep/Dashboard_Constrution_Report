@echo off
title Publish Dashboard to Web (GitHub -^> Vercel)
chcp 65001 > nul
echo ======================================================================
echo    PEA Construction & Disbursement Dashboard
echo    กำลังเผยแพร่ข้อมูลขึ้นเว็บสาธารณะ (GitHub -^> Vercel)...
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/3] ตรวจสอบไฟล์ข้อมูล...
if not exist "data\latest_data.json" (
    echo [คำเตือน] ยังไม่มีไฟล์ data\latest_data.json ในระบบ
    echo กรุณาเปิดแดชบอร์ดและอัปโหลดไฟล์ Excel ก่อนเผยแพร่
    echo.
    pause
    exit /b 1
)

echo [2/3] กำลังบันทึกข้อมูลและประวัติลง Git...
git add data
git commit -m "data: update construction dashboard data [automated publish]" > nul 2>&1

echo [3/3] กำลัง Push ข้อมูลขึ้น GitHub (Vercel จะอัปเดตอัตโนมัติ)...
git pull --rebase --autostash origin main
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo    [สำเร็จ] เผยแพร่ข้อมูลขึ้นเว็บเรียบร้อยแล้ว!
    echo    เว็บสาธารณะ (Vercel) จะแสดงข้อมูลชุดใหม่นี้ภายใน 1-2 นาที
    echo    ทุกคนที่เข้าเว็บจากภายนอกจะเห็นข้อมูลและประวัติชุดล่าสุดทันที
    echo ======================================================================
) else (
    echo.
    echo ======================================================================
    echo    [ข้อผิดพลาด] ไม่สามารถ Push ขึ้น GitHub ได้
    echo    โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือสิทธิ์การเข้าถึง GitHub
    echo ======================================================================
)

echo.
pause
