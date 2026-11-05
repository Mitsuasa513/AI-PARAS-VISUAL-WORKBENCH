#!/usr/bin/env bash
set -u

systemctl --user stop ai-workbench-new.service 2>/dev/null || true
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.]4173$'; then
    echo "警告：4173 端口仍被占用。"
    exit 1
fi
echo "AI 工作台已关闭。"
