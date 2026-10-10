#!/usr/bin/env bash
# Installs the Count Dracula TV launcher on a CachyOS (or any Linux) laptop:
#   curl -fsSL __ORIGIN__/kiosk/install-cachyos.sh | bash
#   … | bash -s -- --autostart     also start it at login
# Adds "Count Dracula TV" to the app menu. Undo: rm ~/.local/bin/count-dracula-tv ~/.local/share/applications/count-dracula-tv.desktop ~/.config/autostart/count-dracula-tv.desktop
set -euo pipefail

BASE=${BASE:-__ORIGIN__} # the server fills in the address this was downloaded from
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
curl -fsSL "$BASE/kiosk/count-dracula-tv.sh" -o "$HOME/.local/bin/count-dracula-tv"
chmod +x "$HOME/.local/bin/count-dracula-tv"

entry="[Desktop Entry]
Type=Application
Name=Count Dracula TV
Comment=The porch TV, full screen (Alt+F4 to leave)
Exec=$HOME/.local/bin/count-dracula-tv
Icon=applications-games
Terminal=false
Categories=Utility;"
echo "$entry" > "$HOME/.local/share/applications/count-dracula-tv.desktop"
echo "Installed: find \"Count Dracula TV\" in the app menu (or run count-dracula-tv)."

if [[ ${1:-} == --autostart ]]; then
  mkdir -p "$HOME/.config/autostart"
  echo "$entry" > "$HOME/.config/autostart/count-dracula-tv.desktop"
  echo "It will also start by itself at login."
fi
