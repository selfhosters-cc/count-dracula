# /help/tv polish and the launchers

Type: build (AFK)
Status: done
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

- [x] `/help/tv` covers every point above and is reachable signed out
- [x] The downloaded launchers open `<public origin>/tv` and contain no token or key
- [ ] A launcher on Linux opens `/tv`, which goes straight to the remembered board after pairing (checked on a real machine, or noted for the user)
  - **Noted for the user:** check it on the TV laptop. Note the launcher uses its own Chrome profile, so pair once inside the launcher's window (pairing in your everyday Chrome doesn't carry over).

## Notes from the build

- `/help/tv` now has: what works best; put it on the TV (open `/tv`, pair, full-screen with F11 or Ctrl+Cmd+F); keep it awake on Windows, macOS and Linux; sound through the TV (HDMI output, the volume ceiling, "a reload needs a click or a key press for sound", HDMI replugs); the `/tv?border` overscan check; smart TVs and other devices (best effort, test it on your Rehearsal); and an **Advanced** fold with the Windows `.bat` and Linux `.sh` launchers. "Stuck? Help: email us" at the bottom. `install-cachyos.sh` isn't linked.
- The launchers already open `__ORIGIN__/tv`, filled with the address they're downloaded from (behind Caddy: `https://<PUBLIC_HOST>/tv`), and carry no secret (tested). Their comments and the Linux error message no longer assume CachyOS.
- `kiosk/README.md` (our porch's long form) and the v1 [Kiosk launcher](../../count-dracula/issues/37-kiosk-launcher.md) ticket now say public host instead of tailnet or LAN.
- No support questions have come in yet (sign-up isn't open), so there are no FAQ lines to fold in; per the runbook, a question asked twice becomes a line here.
