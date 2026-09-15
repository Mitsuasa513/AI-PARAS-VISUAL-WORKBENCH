#!/usr/bin/env bash
# Detects and installs Node.js (>= 18) using the best available package manager.
set -euo pipefail

NODE_REQUIRED_MAJOR=18

have() { command -v "$1" >/dev/null 2>&1; }

node_major() {
  local v
  v="$(node -v 2>/dev/null || true)"
  v="${v#v}"
  printf '%s' "${v%%.*}"
}

if have node && [ "$(node_major)" -ge "$NODE_REQUIRED_MAJOR" ]; then
  echo "ok: Node.js $(node -v) already installed"
  exit 0
fi

echo "Node.js >= $NODE_REQUIRED_MAJOR not found. Attempting installation..."

if have winget; then
  echo "Using winget..."
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
elif have choco; then
  echo "Using choco..."
  choco install nodejs-lts -y
elif have brew; then
  echo "Using Homebrew..."
  brew install node
elif have apt-get; then
  echo "Using apt (Debian/Ubuntu)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
elif have dnf; then
  echo "Using dnf..."
  sudo dnf install -y nodejs
elif have pacman; then
  echo "Using pacman..."
  sudo pacman -S --noconfirm nodejs
else
  echo "No supported package manager found (winget/choco/brew/apt/dnf/pacman)."
  echo "Please install Node.js >= $NODE_REQUIRED_MAJOR manually from https://nodejs.org"
  exit 1
fi

# Refresh PATH for the current shell
if [ -f "/usr/local/bin/node" ]; then
  export PATH="/usr/local/bin:$PATH"
elif [ -d "/opt/homebrew/bin" ]; then
  export PATH="/opt/homebrew/bin:$PATH"
elif have choco; then
  export PATH="$CHOCOPROGRAMDATA:$PATH"
fi

if have node && [ "$(node_major)" -ge "$NODE_REQUIRED_MAJOR" ]; then
  echo "ok: Node.js $(node -v) installed successfully"
else
  echo "Installation completed but node was not found on PATH."
  echo "Please open a new terminal and try again."
  exit 1
fi
