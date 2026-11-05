#!/usr/bin/env bash
set -u

url="http://127.0.0.1:${PORT:-4173}"

if curl -fsS -m 2 "$url/" >/dev/null 2>&1; then
    xdg-open "$url/" >/dev/null 2>&1
    exit 0
fi

systemctl --user start ai-workbench-new.service
for _ in $(seq 1 40); do
    if curl -fsS -m 2 "$url/" >/dev/null 2>&1; then
        xdg-open "$url/" >/dev/null 2>&1
        exit 0
    fi
    sleep 0.5
done

notify-send "AI 工作台" "启动失败，请检查 ai-workbench-new.service" 2>/dev/null || true
exit 1
