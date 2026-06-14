@echo off
rem ============================================================
rem  フリフリ・シューティング！ 起動（Windows）
rem  このファイルをダブルクリックするだけ。
rem ============================================================
cd /d "%~dp0"
echo ブラウザを開きます... (開かなければ http://localhost:8000 を入力)
start "" http://localhost:8000

rem Python3 があれば python、無ければ py を試す
where python >nul 2>nul && (
  python -m http.server 8000
) || (
  py -m http.server 8000
)

echo.
echo 終了するにはこのウィンドウを閉じてください。
pause
