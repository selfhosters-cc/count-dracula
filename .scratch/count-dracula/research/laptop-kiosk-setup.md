# Research: Laptop kiosk setup

Answers [issue 03](../issues/03-laptop-kiosk-setup.md). Researched 2026-10-10. Sources are listed as [n] at the bottom.

## 1. Sound without per-event gestures

- **Default policy:** sound is allowed once the user has interacted with the document [1]. Chromium checks `HasStickyUserActivation()` [3], and sticky activation is never reset once set [4]. So **one click covers the whole night**.
- **Web Audio:** an `AudioContext` created before the click starts `suspended`. Call `resume()` after the click [1]. Chromium applies the same check to `AudioContext` that it applies to `<audio>` [5].
- **Reload risk:** activation is per document, so a reload or crash can lose it. Chromium partly carries activation across some navigations [3], but don't rely on that.
- **Ways to skip the click:**
  - `--autoplay-policy=no-user-gesture-required` is a real switch [2]. Chrome's docs present it as a testing flag [1]. It doesn't trigger the "unsupported flag" warning [6].
  - The `AutoplayAllowed` / `AutoplayAllowlist` enterprise policies are meant "for kiosks or unattended systems" [1]. Chrome supports them on Windows, macOS and Linux [7].
- **Recommendation:** use both layers. Launch with the flag. The page also shows a full-screen **"Start the night"** button whenever `audioCtx.state !== 'running'`; one click on the laptop dismisses it. The flag covers reloads, and the button covers the flag failing.

## 2. Kiosk launch

- `--kiosk` turns on kiosk mode ("not Chrome OS kiosk mode"). `--start-fullscreen` is like pressing F11. `--no-first-run` suppresses dialogs and bubbles. `--noerrdialogs` suppresses error dialogs [2].
- **Use a dedicated `--user-data-dir`.** If Chrome is already running, quit it first or the flags won't apply [8]. Check the active command line at `chrome://version` [8].

```
chrome --user-data-dir=<dir> --no-first-run --noerrdialogs \
  --autoplay-policy=no-user-gesture-required --kiosk https://<tv-url>
```

On macOS, run the binary inside `Google Chrome.app/Contents/MacOS/` [8].

## 3. Staying awake

- **In the page:** `navigator.wakeLock.request('screen')` stops the screen dimming or locking. It **only works on HTTPS** and is released when the tab is hidden [9]. A plain `http://<lan-ip>` origin can't use it unless ticket 08 adds HTTPS or Chrome is launched with `--unsafely-treat-insecure-origin-as-secure` [2]. Treat it as a bonus.
- **Linux:** run Chrome under `systemd-inhibit --what=idle:sleep:handle-lid-switch` [10]. By default logind suspends when the lid closes, unless the laptop is docked or more than one display is connected. A desktop environment that holds the lid inhibitor overrides logind [11]. Also turn off screen blanking and suspend in the desktop's settings.
- **macOS:** `caffeinate -dis -w <pid>` keeps the display and system awake. `-s` only works on AC power [12]. Running with the lid closed needs AC power plus an external keyboard and mouse [13].
- **Windows:** `powercfg /change monitor-timeout-ac 0`, `standby-timeout-ac 0`, and `/setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0`. `powercfg /requests` shows what is holding the machine awake [14].
- **On every OS:** AC power, **lid open with brightness at zero**, no screensaver or lock screen, OS updates postponed.

## 4. Web Audio, not `<audio>`

- Media elements suit full-length tracks. Buffers suit short, sample-like sounds and give more precise control [15].
- An `AudioBufferSourceNode` plays only once, but it is "very inexpensive to create", fire-and-forget, and reuses one decoded `AudioBuffer`. It is built for strict timing [16].
- The default `latencyHint: "interactive"` picks the lowest glitch-free latency [17].
- Overlapping `<audio>` needs one element per voice [1]. Use it only for an ambient loop, if at all.

## 5. HDMI, overscan, performance

- **Audio output:** select the TV as the output in the OS sound settings, and check again after any reconnect.
- **Audio dropout after silence:** some TVs and soundbars clip the first moment of sound after silence or go to standby. The only evidence is forum reports [18], so rehearse with long gaps.
- **Overscan:** set the HDMI input to "Screen Fit", "Just Scan" or "Dot by Dot". Labels vary, and Samsung remembers the setting per input [19]. Keep key content off the outer ~5%.
- **1080p vs 4K:** 4K is 4× the pixels of 1080p. The canvas backing store also scales with `devicePixelRatio` [20]. HDMI 1.4 tops out at 3840×2160 @ 30 Hz [21]. **Output 1920×1080 @ 60 Hz** and let the TV upscale.

## Dress-rehearsal checklist (Oct 24)

1. Use the real laptop, cable, TV input and porch spot, on AC power.
2. Display output is 1080p @ 60 Hz and a test border is fully visible (no overscan).
3. Sound goes to the TV, OS volume is 100%, and the TV is porch-audible.
4. Launch with the documented command and confirm it in `chrome://version`.
5. Click "Start the night" once and confirm the AudioContext is `running`.
6. Add 5 kids in 3 s from two phones: sounds overlap, nothing clips, no stutter.
7. Wait 10+ min idle, then add a kid: the sound plays in full.
8. Reload the TV page: sound recovers.
9. Leave it idle 60 min: no dimming, screensaver, sleep or lock.
10. Unplug and replug HDMI: picture and audio route return.
11. Watch the FPS meter during the busiest animation.

## Constraints for Sound design (ticket 07)

- **Preload and decode** every sound at start. Short one-shots (≲3 s), served same-origin.
- Route all sounds through master `GainNode` → `DynamicsCompressorNode`. **Cap voices at 3–4** and coalesce bursts (one Visit, one flourish).
- No sound may need a gesture beyond the one-time start. Removals stay silent (already locked).
- Expect the TV to clip sound after silence: use a quiet ambience bed (which doubles as atmosphere), or give each sound a lead-in it can afford to lose.
- Unsourced judgment: use punchy mid-range sounds rather than bass, with normalised loudness.

## Sources

1. https://developer.chrome.com/blog/autoplay
2. https://peter.sh/experiments/chromium-command-line-switches/ (2026-10-10); `media/base/media_switches.cc`
3. Chromium `third_party/blink/renderer/core/html/media/autoplay_policy.cc`
4. https://developer.mozilla.org/en-US/docs/Web/Security/User_activation
5. Chromium `third_party/blink/renderer/modules/webaudio/audio_context.cc`
6. Chromium `chrome/browser/ui/startup/bad_flags_prompt.cc`
7. Chromium `components/policy/.../Miscellaneous/AutoplayAllowed.yaml`, `AutoplayAllowlist.yaml`; `chrome_content_browser_client.cc`
8. https://www.chromium.org/developers/how-tos/run-chromium-with-flags/ ; Chromium `docs/user_data_dir.md`
9. https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
10. systemd `man/systemd-inhibit.xml`
11. systemd `man/logind.conf.xml`
12. https://ss64.com/mac/caffeinate.html
13. https://support.apple.com/guide/macbook-pro/connect-an-external-display-apd8cdd74f57/mac ; https://support.apple.com/en-us/102501
14. https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/powercfg-command-line-options
15. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
16. https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
17. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
18. Forums only: https://lists.mythtv.org/pipermail/mythtv-users/2016-May/387026.html ; https://forums.tomsguide.com/threads/hdmi-sound-cutoff.209959/
19. Blog/forum only: https://www.markwilson.co.uk/blog/2012/12/tweaking-the-display-on-a-samsung-tv-for-use-as-a-computer-monitor.htm
20. https://web.dev/articles/canvas-hidipi
21. https://www.hdmi.org/spec/hdmi1_4b
