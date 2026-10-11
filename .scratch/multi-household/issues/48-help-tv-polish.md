# /help/tv polish and the launchers

Type: build (AFK)
Status: ready-for-agent
Blocked by: 27

## What to build

`/help/tv` gets everything a stranger needs for their porch TV, and the launchers become optional extras. See [spec §6 /help/tv and the launchers](../spec.md#6-sign-up-first-run-and-the-rehearsal).

- **`/help/tv`**, adapted from `kiosk/README.md`:
  - power and sleep settings for **Windows, macOS and Linux**
  - full-screen
  - HDMI sound and choosing the TV as the output
  - the `/tv?border` overscan check
  - "a reload needs a click or key press for sound"
  - a **smart-TV and other-devices** section: open the browser, go to `/tv`, pair, test on your Rehearsal; if sound or the screen misbehaves, use a laptop
  - "Help: email us"
- **Advanced:** the Windows `.bat` and a generic Linux `.sh` (systemd-inhibit plus Chrome's autoplay flag), served from `/kiosk/`. They open a **bare `/tv`** on the public host and never carry a secret. No macOS launcher. `install-cachyos.sh` stays for us and isn't linked.
- Lines from support questions that came up twice since opening ([spec §18 Support](../spec.md#18-launch-and-the-night-runbook)).
- Update the v1 [Kiosk launcher](../../count-dracula/issues/37-kiosk-launcher.md) ticket's text where it still says tailnet or LAN URL.

## Acceptance criteria

- [ ] `/help/tv` covers every point above and is reachable signed out
- [ ] The downloaded launchers open `<public origin>/tv` and contain no token or key
- [ ] A launcher on Linux opens `/tv`, which goes straight to the remembered board after pairing (checked on a real machine, or noted for the user)
