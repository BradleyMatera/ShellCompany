#!/usr/bin/env bash
set -euo pipefail
# Dev orchestrator: prefer Bun when available, but fallback to npm/node scripts.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${API_PORT:-${PORT:-3001}}"
CLIENT_CMD="${CLIENT_CMD:-cd client && npm start}"

echo "Dev orchestrator starting from $ROOT (server port: $PORT)"

if ! command -v nc >/dev/null 2>&1; then
  echo "Warning: 'nc' not found. Falling back to netstat-based wait."
  has_nc=0
else
  has_nc=1
fi

function port_open() {
  if [ "$has_nc" -eq 1 ]; then
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
    return $?
  else
    # simple fallback using lsof
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 && return 0 || return 1
  fi
}

if ! port_open "$PORT"; then
  echo "Starting server (port $PORT)..."
  if command -v bun >/dev/null 2>&1; then
    (cd "$ROOT/server" && (bun run de || npm run de)) &
  else
    (cd "$ROOT/server" && npm run de) &
  fi

  # wait for server readiness
  for i in $(seq 1 30); do
    if port_open "$PORT"; then
      echo "Server ready after $i seconds"
      break
    fi
    echo "Waiting for server... ($i)"
    sleep 1
  done
else
  echo "Server already running on port $PORT"
fi

echo "Starting client: $CLIENT_CMD"
cd "$ROOT"
eval "$CLIENT_CMD"
