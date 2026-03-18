#!/bin/bash
cd /storage/emulated/0/Tools-farm

echo "⚙ OwO Tools - Auto Restart Wrapper"
echo "Tekan Ctrl+C untuk berhenti sepenuhnya"
echo "─────────────────────────────────────"

while true; do
    echo "[$(date '+%H:%M:%S')] Bot starting..."
    python uwu.py
    echo "[$(date '+%H:%M:%S')] Bot stopped. Restarting in 3 seconds..."
    sleep 3
done
