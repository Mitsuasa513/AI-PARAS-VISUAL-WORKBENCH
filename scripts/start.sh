#!/usr/bin/env bash
# Starts the AI Workbench server, auto-installing Node.js if needed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/ensure-node.sh"

cd "$SKILL_ROOT"
echo "Starting AI Workbench at http://127.0.0.1:${PORT:-4173}"
exec node server.js
