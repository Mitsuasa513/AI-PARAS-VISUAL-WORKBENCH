#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export PORT="${PORT:-4173}"
export HOST="${HOST:-0.0.0.0}"
export STRATA_URL="${STRATA_URL:-http://127.0.0.1:8081}"
export LLAMA_URL="${LLAMA_URL:-http://127.0.0.1:8080}"
export LMSTUDIO_URL="${LMSTUDIO_URL:-http://127.0.0.1:1234}"

key_file="${STRATA_API_KEY_FILE:-/home/user/Strata-0.2.4/lan-api-key.txt}"
if [ -z "${STRATA_API_KEY:-}" ] && [ -r "$key_file" ]; then
    STRATA_API_KEY="$(tr -d '\r\n' < "$key_file")"
    export STRATA_API_KEY
fi

exec node server.js
