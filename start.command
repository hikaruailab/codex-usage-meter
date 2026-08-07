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

if [ ! -f "$SCRIPT_DIR/usage-bridge.mjs" ]; then
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

PORT="${USAGE_METER_PORT:-4317}"
URL="http://127.0.0.1:${PORT}/"

node usage-bridge.mjs &
SERVER_PID=$!

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
