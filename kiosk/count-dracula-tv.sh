#!/usr/bin/env bash
# Count Dracula TV launcher for Linux: kiosk Chrome on the TV page (a bare /tv, which remembers its
# pairing), held awake.
# Optional: plain Chrome full-screen (F11) on the TV page works too; this adds sound-without-a-click
# after a reload (the autoplay flag) and keeps the laptop from idling or sleeping while it runs.
set -euo pipefail

URL=${1:-__ORIGIN__/tv}   # the server fills in the address this was downloaded from
PROFILE="$HOME/.local/share/count-dracula-tv"                 # its own profile: your normal Chrome is untouched

browser=$(command -v google-chrome-stable || command -v google-chrome || command -v chromium || true)
if [[ -z $browser ]]; then
  echo "No Chrome or Chromium found: install Google Chrome, or your distribution's chromium package." >&2
  exit 1
fi

# Hold off idle (screen blanking), sleep and the lid switch for as long as Chrome runs.
exec systemd-inhibit --what=idle:sleep:handle-lid-switch --who="Count Dracula" --why="Halloween TV" \
  "$browser" --user-data-dir="$PROFILE" --no-first-run --noerrdialogs \
  --autoplay-policy=no-user-gesture-required --kiosk "$URL"
