#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# encerra instâncias anteriores
pkill -f 'electron-vite dev' 2>/dev/null || true
sleep 1

set -a
# shellcheck disable=SC1091
source ./.env.local
set +a

rm -f "${HOME}/.config/delidesk/session.bin"

export DISPLAY="${DISPLAY:-:0}"
export ELECTRON_DISABLE_GPU=1
export ELECTRON_OZONE_PLATFORM_HINT=x11
# flags extras pro Chromium embutido (WSL)
export ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-gpu-compositing --disable-software-rasterizer --no-sandbox --ozone-platform=x11"

echo "AUTH_MOCK=${DELIDESK_AUTH_MOCK:-unset}"
echo "AUTH_URL=${DELIDESK_AUTH_URL:-unset}"
echo "DISPLAY=$DISPLAY"
exec npm run dev
