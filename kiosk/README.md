# The TV laptop

The laptop only displays `/tv` (display-only: a crash there loses nothing). It needs to stay awake, show
the whole picture on the TV, and play sound through the TV. Spec §14.

**TV address:** https://count-dracula.example.com/tv (the laptop has Tailscale; that also
lets the page hold a screen Wake Lock). Fallback: http://192.168.5.31:3131/tv

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

Then open the TV address in Chrome, press **F11**, and click **Start the night** once. Without the
launcher, a page reload needs that click again (the button appears whenever sound isn't running).

## The launcher (optional)

Adds Chrome's autoplay flag, so a reload comes back with sound and no click, plus kiosk mode and a
dedicated profile (your everyday Chrome is untouched). The server hands it out, so nothing needs copying.

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
  sound output, then reload the TV page (with the launcher, sound returns by itself; without it, click
  Start the night).
- Set the laptop's system volume at the rehearsal: it's the hard ceiling (the ☰ menu's slider works below it).
