#!/bin/bash

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.jsが見つかりません。Node.jsをインストールしてください。"
  open "https://nodejs.org/" >/dev/null 2>&1 || true
  read -r -p "Enterキーで終了します。"
  exit 1
fi

PORT="${USAGE_METER_PORT:-4317}"
URL="http://127.0.0.1:${PORT}/"

node usage-bridge.mjs &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

for _ in $(seq 1 30); do
  if curl --silent --fail "$URL" >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
    break
  fi

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "ブリッジを起動できませんでした。"
    wait "$SERVER_PID"
    exit $?
  fi

  sleep 1
done

wait "$SERVER_PID"
