#!/bin/sh
# ============================================================
#  フリフリ・シューティング！ 起動（Mac / Linux）
#  ターミナルで  sh start.sh  または  ./start.sh
# ============================================================
cd "$(dirname "$0")" || exit 1

URL="http://localhost:8000"
echo "ブラウザを開きます... (開かなければ $URL を入力)"

# 1秒後にブラウザを開く（サーバ起動と並行）
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

# 静的サーバを起動（python3 優先）
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server 8000
else
  python -m http.server 8000
fi
