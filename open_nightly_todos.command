#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://my-to-dos.localhost:4173"

if ! curl -sf "$APP_URL/api/state" >/dev/null 2>&1; then
  cd "$SCRIPT_DIR"
  nohup python3 server.py >/tmp/nightly-todos-local.out 2>/tmp/nightly-todos-local.err &
  sleep 1
fi

open "$APP_URL"
