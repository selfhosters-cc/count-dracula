#!/usr/bin/env bash
# Count Dracula TV launcher for CachyOS / Linux: kiosk Chrome on the TV page, held awake.
# Optional: plain Chrome full-screen (F11) on the TV page works too; this adds sound-without-a-click
# after a reload (the autoplay flag) and keeps the laptop from idling or sleeping while it runs.
set -euo pipefail

URL=${1:-https://count-dracula.example.com/tv}   # LAN fallback: http://192.168.5.31:3131/tv
PROFILE="$HOME/.local/share/count-dracula-tv"                 # its own profile: your normal Chrome is untouched

browser=$(command -v google-chrome-stable || command -v google-chrome || command -v chromium || true)
if [[ -z $browser ]]; then
  echo "No Chrome or Chromium found (install google-chrome from the AUR, or chromium)." >&2
  exit 1
fi

# Hold off idle (screen blanking), sleep and the lid switch for as long as Chrome runs.
exec systemd-inhibit --what=idle:sleep:handle-lid-switch --who="Count Dracula" --why="Halloween TV" \
  "$browser" --user-data-dir="$PROFILE" --no-first-run --noerrdialogs \
  --autoplay-policy=no-user-gesture-required --kiosk "$URL"
