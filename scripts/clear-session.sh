#!/usr/bin/env bash
set -euo pipefail
# Para Electron/vite e limpa sessão local do DeliDesk
pkill -f 'electron-vite dev' 2>/dev/null || true
pkill -f 'electron/dist/electron \.' 2>/dev/null || true
sleep 2
SESSION="$HOME/.config/delidesk/session.bin"
if [[ -f "$SESSION" ]]; then
  rm -f "$SESSION"
  echo "removed $SESSION"
else
  echo "no session.bin"
fi
# também limpa se existir sob XDG
for d in "$HOME/.config/delidesk" "$HOME/.var/app" ; do
  :
done
ls -la "$HOME/.config/delidesk" 2>/dev/null || echo "no userData dir yet"
