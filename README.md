# Local AI Workbench

Zero-dependency, browser-based local monitoring dashboard for GPU, token
generation speed (llama.cpp / LM Studio), power, CPU, memory, and daily
token totals.

## Requirements

- **Node.js >= 18** – auto-installed by `scripts/start.bat` (Windows) or
  `scripts/start.sh` (macOS/Linux) if not already present.
- Optional: NVIDIA GPU + driver, llama.cpp server, or LM Studio server for
  real inference data.

## Start

### Windows

```bat
scripts\start.bat
```

### macOS / Linux

```bash
bash scripts/start.sh
```

Open <http://127.0.0.1:4173> after startup.

## Skins

| Skin            | URL                   |
|-----------------|-----------------------|
| Native Console  | `/` (index.html)      |
| Neon Matrix     | `/cyberpunk.html`     |
| Minimal Native  | `/apple.html`         |
| Cloud Scroll    | `/scroll.html`        |

## Environment Variables

| Variable       | Default                  |
|----------------|--------------------------|
| `PORT`         | `4173`                   |
| `LLAMA_URL`    | `http://127.0.0.1:8080` |
| `LMSTUDIO_URL` | `http://127.0.0.1:1234` |

## Data Sources (priority order)

1. `nvidia-smi` – GPU name, utilisation, memory, temp, power, fan, P-state
2. LM Studio `server-logs/` – per-request prompt/eval tokens, daily totals
3. LM Studio `conversations/` – fallback per-conversation stats
4. llama.cpp `/metrics` or `/slots` – prompt & generation tok/s
5. Demo data – clearly labelled when no real source is reachable

The server binds to `127.0.0.1` only. No data leaves the local machine.

## Files

```
server.js              Node.js HTTP server (no npm dependencies)
index.html             Native Console skin
cyberpunk.html         Neon Matrix skin
apple.html             Minimal Native skin
scroll.html            Cloud Scroll skin
styles.css             Native Console styles
cyberpunk.css          Cyberpunk styles
apple.css              Apple styles
scroll.css             Scroll styles
app.js                 Shared dashboard logic
daily-stats.js         Daily cumulative token counter
average-metrics.js     Per-task average tok/s
skin-switch.js         Skin selector
scripts/start.bat      Windows launcher (auto-installs Node.js)
scripts/start.sh       macOS/Linux launcher (auto-installs Node.js)
scripts/ensure-node.bat Node.js check/install (Windows)
scripts/ensure-node.sh  Node.js check/install (macOS/Linux)
```
