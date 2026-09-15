---
name: local-ai-workbench
description: >
  Launch and operate the Local AI Workbench - a zero-dependency, browser-based
  monitoring dashboard for local GPU utilisation, token generation speed
  (llama.cpp / LM Studio), power draw, CPU, memory and daily token totals.
  Use when the user asks to start, open, or configure the AI workbench,
  GPU monitor, or local inference dashboard. Handles Node.js detection and
  installation automatically.
metadata:
  short-description: Local AI Workbench monitor
---

# Local AI Workbench

A self-contained Node.js local monitoring dashboard. It displays:

- GPU name, utilisation, memory, temperature, power draw, fan speed, P-state
  (via `nvidia-smi`; falls back to demo data if unavailable)
- Token generation and prompt speed (llama.cpp `:8080` or LM Studio `:1234`)
- Per-task and daily cumulative token counts from LM Studio server logs
- Host CPU, disk, and memory (Windows: `typeperf`; other OS: Node `os` module)
- Four visual skins: Native Console, Cyberpunk, Apple, Scroll

The server binds to `127.0.0.1` only and never sends data off-machine.

## Prerequisites

- Node.js >= 18 (auto-installed by the start scripts if missing)
- Optional: NVIDIA driver (`nvidia-smi`), llama.cpp server, or LM Studio server
  for real inference metrics; without these the dashboard shows demo/placeholder
  values and marks the data source accordingly.

## Quick Start

### Windows

```bat
scripts\start.bat
```

Or manually:

```bat
cd <skill-root>
node server.js
```

### macOS / Linux

```bash
bash scripts/start.sh
```

Then open <http://127.0.0.1:4173> in a browser.

## Configuration (environment variables)

| Variable      | Default                    | Description                          |
|---------------|----------------------------|--------------------------------------|
| `PORT`        | `4173`                     | HTTP port for the dashboard          |
| `LLAMA_URL`   | `http://127.0.0.1:8080`   | llama.cpp server URL                 |
| `LMSTUDIO_URL`| `http://127.0.0.1:1234`   | LM Studio server URL                 |

## Data Source Priority

1. `nvidia-smi` for GPU metrics
2. LM Studio `server-logs/YYYY-MM/*.log` for token stats (preferred)
3. LM Studio `conversations/*.conversation.json` (fallback)
4. llama.cpp `/metrics` or `/slots` token deltas
5. Demo data (clearly labelled) when no real source is reachable

## Notes

- The dashboard does **not** require internet access at runtime.
- `ensure-node.sh` / `ensure-node.bat` detect and install Node.js via
  `winget`, `choco`, `scoop`, `brew`, `apt`, `dnf`, or `pacman`.
- To change the skin, navigate to `/cyberpunk.html`, `/apple.html`, or
  `/scroll.html`, or use the skin selector in the top bar of any page.
