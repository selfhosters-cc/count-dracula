# The TV laptop (our porch)

The laptop only displays `/tv` (display-only: a crash there loses nothing). It needs to stay awake, show
the whole picture on the TV, and play sound through the TV. v1 spec §14; for v2 every household's version of
this is the public `/help/tv` page, which this file is the long form of.

**TV address:** the public host, `https://<PUBLIC_HOST>/tv` (in the repo: https://count-dracula.example.com/tv).
A bare `/tv` shows a pairing code the first time: pair it from `/setup` → **Pair a TV**, and it remembers our TV
link from then on. HTTPS also lets the page hold a screen Wake Lock. There's no LAN or tailnet address any
more: if the home internet drops, the TV freezes and the phones keep their taps until it's back.

## The simple way: settings only

The launcher scripts are optional. These settings plus Chrome full-screen are enough.

**CachyOS (KDE Plasma)**
- System Settings → Power Management (on AC power): Suspend session → **Do nothing**; Turn off screen →
  **Never**; Dim screen → **off**; When laptop lid closed → **Do nothing**.
- System Settings → Screen Locking: Lock screen automatically → **Never**.
- Hold off updates on the night (no `pacman -Syu` that afternoon).

**Windows**
- Settings → System → Power: Screen, sleep & hibernate (plugged in) → **Never** for both.
- Control Panel → Power Options → Choose what closing the lid does (plugged in) → **Do nothing**.
- Settings → Windows Update → **Pause updates** for a week before Oct 31.
- Lock screen: no screensaver; sign-in after sleep → never.

Then open the TV address in Chrome, press **F11**, and click once (or press any key) for sound. Without the
launcher, a page reload needs that click again: the board shows a 🔇 reminder until then.

## The launcher (optional)

Adds Chrome's autoplay flag, so a reload comes back with sound and no click, plus kiosk mode and a
dedicated profile (your everyday Chrome is untouched). The server hands it out, so nothing needs copying,
and fills in its own address: use the public host in place of `https://count-dracula.example.com` below.
The launchers open a bare `/tv` and never carry a secret; `/help/tv` offers the Windows and Linux ones to
every household. `install-cachyos.sh` is ours only.

**CachyOS**: one command in a terminal on the laptop:

```bash
curl -fsSL https://count-dracula.example.com/kiosk/install-cachyos.sh | bash
# or, to also start it by itself at login:
curl -fsSL https://count-dracula.example.com/kiosk/install-cachyos.sh | bash -s -- --autostart
```

Then pick **Count Dracula TV** from the app menu. While it runs, `systemd-inhibit` holds off idle,
sleep and the lid switch.

**Windows**: download https://count-dracula.example.com/kiosk/count-dracula-tv.bat to the
desktop and double-click it. (To start it at login, put a shortcut to it in `shell:startup`.)

Leave kiosk mode with **Alt+F4**. Check the flags are on at `chrome://version` (in a normal tab of that
profile).

## Display and sound

- Resolution **1920×1080 @ 60 Hz**. On the TV, picture size **Just Scan** / **Screen Fit** (names vary).
- Overscan check: open **/tv?border**. All four red edges and the white corner frame must be visible;
  if they're cut off, fix the TV's picture size, not the page.
- Sound: pick the TV (HDMI) as the output device.
  - CachyOS: the speaker icon in the panel → choose the HDMI / TV device.
  - Windows: the speaker icon → the arrow beside the volume → choose the TV.
- **After an HDMI unplug and replug:** check the resolution is back at 1920×1080, re-select the TV as the
  sound output, then reload the TV page (with the launcher, sound returns by itself; without it, click or
  press a key).
- Set the laptop's system volume at the rehearsal: it's the hard ceiling (the ☰ menu's slider works below it).
