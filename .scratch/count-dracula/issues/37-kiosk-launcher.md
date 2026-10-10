# Kiosk launcher for the TV laptop

Type: task (HITL)
Status: ready-for-agent
Blocked by: 16, 25

## What to build

The TV laptop launches into the TV page reliably and stays awake all night. See [spec §14](../spec.md#14-laptop-kiosk-setup). Full findings are on branch `research/laptop-kiosk-setup` (commit `78ac026`).

- A launch script for the laptop's OS that quits any running Chrome first, then runs Chrome with a dedicated `--user-data-dir`, `--no-first-run --noerrdialogs --autoplay-policy=no-user-gesture-required --kiosk <tv-url>`. Use the HTTPS URL if the laptop has Tailscale, otherwise the LAN URL.
- **Keep awake at the OS level:** `systemd-inhibit` / `caffeinate` / `powercfg` as fits the OS, plus no screensaver, lock screen, screen blanking or suspend, and OS updates postponed.
- The TV page requests a **Wake Lock** when it's on HTTPS (a bonus, not relied on).
- **Display and audio:** 1920×1080 @ 60 Hz, the TV on "Just Scan" / "Screen Fit", and the TV selected as the OS audio output. Write down the steps for rechecking after an HDMI reconnect.

Needs the real laptop and TV.

## Acceptance criteria

- [ ] The script launches into `/tv` with the flags visible at `chrome://version`
- [ ] A TV reload restores sound without a click (the autoplay flag works), and "Start the night" covers it when it doesn't
- [ ] The laptop survives a 60-minute idle with no dimming, sleep or lock
- [ ] A test border is fully visible on the TV
- [ ] Sound comes out of the TV after an HDMI unplug and replug, following the written steps
