# Local AI Workbench

Zero-dependency, browser-based local monitoring dashboard for GPU, token
generation speed (llama.cpp / LM Studio / Strata), power, CPU, memory, and
daily token totals.

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
| Emerald Garden  | `/oz.html`            |

## Environment Variables

| Variable       | Default                  | Notes                                    |
|----------------|--------------------------|------------------------------------------|
| `PORT`         | `4173`                   | HTTP port of the dashboard               |
| `LLAMA_URL`    | `http://127.0.0.1:8080` | llama.cpp server (Strata is spotted here) |
| `LMSTUDIO_URL` | `http://127.0.0.1:1234` | LM Studio server                         |
| `STRATA_URL`   | `http://127.0.0.1:8080` | Strata, only when it runs on its own port |

## Data Sources (priority order)

1. `nvidia-smi` – GPU name, utilisation, memory, temp, power, fan, P-state
2. LM Studio `server-logs/` – per-request prompt/eval tokens, daily totals
3. LM Studio `conversations/` – fallback per-conversation stats
4. Strata `/v1/status` + `/metrics` – model, live tok/s, VRAM/power, totals
5. llama.cpp `/metrics` or `/slots` – prompt & generation tok/s
6. Demo data – clearly labelled when no real source is reachable

The server binds to `127.0.0.1` only. No data leaves the local machine.

## Daily totals

LM Studio writes a per-day server log, so its daily totals are read directly.
llama.cpp and Strata do not, so the dashboard watches their cumulative token
counters (`/metrics` for llama.cpp when `--metrics` is on, `/slots` deltas
otherwise, Strata's `/metrics.totals`) and adds the difference to a local
per-day file (`.daily-tokens.json`). The file resets on the local calendar day.
The `/slots` fallback can miss a request that starts and ends between two
polls; `--metrics` makes the llama.cpp numbers exact.

## Files

```
server.js              Node.js HTTP server (no npm dependencies)
index.html             Native Console skin
cyberpunk.html         Neon Matrix skin
apple.html             Minimal Native skin
scroll.html            Cloud Scroll skin
oz.html                Emerald Garden skin
styles.css             Native Console styles
cyberpunk.css          Cyberpunk styles
apple.css              Apple styles
scroll.css             Scroll styles
oz.css                 Emerald Garden styles
app.js                 Shared dashboard logic
oz.js                  Emerald Garden dashboard logic
daily-stats.js         Daily cumulative token counter
average-metrics.js     Per-task average tok/s
skin-switch.js         Skin selector
i18n.js                Chinese / English labels
scripts/start.bat      Windows launcher (auto-installs Node.js)
scripts/start.sh       macOS/Linux launcher (auto-installs Node.js)
scripts/ensure-node.bat Node.js check/install (Windows)
scripts/ensure-node.sh  Node.js check/install (macOS/Linux)
```
