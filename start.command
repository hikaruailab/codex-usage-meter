#!/bin/bash

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TEMP_ROOT=""
SERVER_PID=""
REPO_URL="https://github.com/hikaruailab/codex-usage-meter/archive/refs/heads/main.zip"

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$TEMP_ROOT" ] && [ -d "$TEMP_ROOT" ]; then
    rm -rf -- "$TEMP_ROOT"
  fi
}

trap cleanup INT TERM EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "Node.jsが見つかりません。Node.jsをインストールしてください。"
  open "https://nodejs.org/" >/dev/null 2>&1 || true
  read -r -p "Enterキーで終了します。"
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/usage-bridge.mjs" ] || [ ! -f "$SCRIPT_DIR/open-app-window.mjs" ]; then
  if ! command -v curl >/dev/null 2>&1 || ! command -v ditto >/dev/null 2>&1; then
    echo "ダウンロードに必要なcurlまたはdittoが見つかりません。"
    read -r -p "Enterキーで終了します。"
    exit 1
  fi

  echo "公式リポジトリから必要ファイルをダウンロードしています。"
  TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-usage-meter.XXXXXX")"
  if ! curl --fail --silent --show-error --location --retry 3 \
    --proto '=https' --tlsv1.2 "$REPO_URL" \
    --output "$TEMP_ROOT/codex-usage-meter.zip"; then
    echo "ダウンロードに失敗しました。"
    read -r -p "Enterキーで終了します。"
    exit 1
  fi

  if ! ditto -x -k "$TEMP_ROOT/codex-usage-meter.zip" "$TEMP_ROOT"; then
    echo "ダウンロードしたファイルを展開できませんでした。"
    read -r -p "Enterキーで終了します。"
    exit 1
  fi

  SCRIPT_DIR="$TEMP_ROOT/codex-usage-meter-main"
  if [ ! -f "$SCRIPT_DIR/usage-bridge.mjs" ]; then
    echo "必要ファイルが見つかりません。"
    read -r -p "Enterキーで終了します。"
    exit 1
  fi
fi

cd "$SCRIPT_DIR" || exit 1

START_PORT="${USAGE_METER_PORT:-4317}"
if ! [[ "$START_PORT" =~ ^[0-9]+$ ]] || [ "$START_PORT" -lt 1 ] || [ "$START_PORT" -gt 65535 ]; then
  echo "USAGE_METER_PORTは1〜65535の番号で指定してください。4317番から探します。"
  START_PORT=4317
fi

find_available_port() {
  local candidate="$1"

  if command -v lsof >/dev/null 2>&1; then
    while [ "$candidate" -le 65535 ]; do
      if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
        printf '%s\n' "$candidate"
        return 0
      fi
      candidate=$((candidate + 1))
    done
  else
    while [ "$candidate" -le 65535 ]; do
      if node -e '
        const net = require("node:net");
        const port = Number(process.argv[1]);
        const probe = net.createServer();
        probe.once("error", () => process.exit(1));
        probe.listen(port, "127.0.0.1", () => probe.close(() => process.exit(0)));
      ' "$candidate" >/dev/null 2>&1; then
        printf '%s\n' "$candidate"
        return 0
      fi
      candidate=$((candidate + 1))
    done
  fi

  return 1
}

PORT="$(find_available_port "$START_PORT")" || {
  echo "使用可能なポートが見つかりませんでした。"
  read -r -p "Enterキーで終了します。"
  exit 1
}
export USAGE_METER_PORT="$PORT"
URL="http://127.0.0.1:${PORT}/"

if [ "$PORT" != "$START_PORT" ]; then
  echo "ポート${START_PORT}は使用中のため、${PORT}を使用します。"
fi

node usage-bridge.mjs &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl --silent --fail "$URL" >/dev/null 2>&1; then
    node open-app-window.mjs "$URL" >/dev/null 2>&1 || open "$URL" >/dev/null 2>&1 || true
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
