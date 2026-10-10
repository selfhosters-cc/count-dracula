# Laptop kiosk setup

Type: research (AFK)
Status: open
Blocked by:

## Question

How do we make a laptop running Chrome over HDMI a reliable kiosk for one evening?

- Chrome autoplay policy: can a page play sound effects without a click? What one-time gesture or launch flags (`--autoplay-policy=no-user-gesture-required`, `--kiosk`) work today?
- Fullscreen/kiosk launch so no browser UI shows on the TV.
- Preventing sleep, screen dimming, screensaver, and lid-close issues on Linux/macOS/Windows (OS unknown — cover the common ones briefly).
- Web Audio API vs `<audio>` elements for low-latency overlapping sound effects.
- Gotchas: HDMI audio output selection, TV overscan, 1080p vs 4K canvas performance on a modest laptop.

Output: a concrete checklist for the dress rehearsal and constraints for the Sound design ticket.
