# Laptop kiosk setup

Type: research (AFK)
Status: resolved
Blocked by:

## Question

How do we make a laptop running Chrome over HDMI a reliable kiosk for one evening?

- Chrome autoplay policy: can a page play sound effects without a click? What one-time gesture or launch flags (`--autoplay-policy=no-user-gesture-required`, `--kiosk`) work today?
- Fullscreen/kiosk launch so no browser UI shows on the TV.
- Preventing sleep, screen dimming, screensaver, and lid-close issues on Linux/macOS/Windows (OS unknown — cover the common ones briefly).
- Web Audio API vs `<audio>` elements for low-latency overlapping sound effects.
- Gotchas: HDMI audio output selection, TV overscan, 1080p vs 4K canvas performance on a modest laptop.

Output: a concrete checklist for the dress rehearsal and constraints for the Sound design ticket.

## Answer

- **Sound:** a one-time "Start the night" click unlocks audio until the page reloads. Also launch Chrome with `--autoplay-policy=no-user-gesture-required` and a dedicated `--user-data-dir` plus `--kiosk`, so a reload doesn't bring back silence. Check that the flags took effect at `chrome://version`. The enterprise policies `AutoplayAllowed`/`AutoplayAllowlist` are the supported alternative.
- **Staying awake:** the browser's Wake Lock API needs HTTPS, so rely on OS settings as well: `systemd-inhibit` (Linux), `caffeinate -dis` (macOS), or `powercfg` timeouts 0 and lid action "do nothing" (Windows). Lid open, on AC power.
- **Display:** output 1080p @ 60 Hz and let the TV upscale. Avoid 4K (4× the pixels, and HDMI 1.4 tops out at 4K30). Set the TV to "Just Scan" / "Screen Fit" to stop it cropping the edges.
- **Sound constraints:** Web Audio, not `<audio>`. Preload short one-shots and run them through a master gain plus compressor. Cap overlapping sounds at 3–4 and turn a burst of kids into one flourish. Some TVs cut off the start of a sound after silence, so use a quiet ambience bed or lead-ins that can afford to lose their start (forum-sourced, test at rehearsal).
- The findings include an 11-step dress-rehearsal checklist.

Full findings: branch `research/laptop-kiosk-setup` (commit `78ac026`), file `.scratch/count-dracula/research/laptop-kiosk-setup.md`.
