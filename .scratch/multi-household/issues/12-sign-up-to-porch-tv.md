# From sign-up to a TV on the porch

Type: grilling (HITL)
Status: resolved
Blocked by: 05, 06

## Question

How does a stranger, with no help from us, get from "sign up" to a TV on their porch and helpers' phones counting?

- The first-run path: sign up → set location → first event live → open the TV on a laptop or smart TV → add helper phones (the existing join QR) → a mini rehearsal.
- What a stranger's TV is likely to be (laptop on HDMI as in v1, a smart-TV browser, a Chromecast tab) and what we can promise. The v1 kiosk scripts assume our laptop; do they ship to everyone, get simplified, or become a help page?
- Sound: the "Start the night" click, autoplay on smart-TV browsers.
- A built-in "test night" so strangers can rehearse before Oct 31 (v1's Clock shift and bulk add already exist).
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): sign-up already creates a live "Rehearsal" with a join key, a starter costume list and no golden tickets, and captures the browser's time zone. New Households race None; Expected kids is the only "how big a night" input.
- **Given** ([Shareable TV: link, code and QR](06-shareable-tv.md)): the porch TV opens the Household's TV link (Copy/Share from `/setup`), or a bare `/tv` shows a TV pairing code plus a scan-to-pair QR that a Manager redeems from their phone. Decide here how the kiosk scripts take the TV link and how the smart-TV walkthrough uses pairing.
- **Given** ([Fuzzy location](07-fuzzy-location.md)): first-run asks for a Location once, optional with **Skip**, using the map picker with **Use my location** (it can be set later in `/setup`). Decide here where that step sits in the first-run order.
- **Given** ([Public hosting and abuse](11-public-hosting-and-abuse.md)): the helper join QR always points at the public HTTPS URL (no `lanUrl`, no LAN route); the site sends `frame-ancestors 'none'`, so a TV link can't be embedded in another page (matters for smart-TV or signage apps that wrap a URL in a frame); creating a Household is limited to 3 per IP per day, and the Operator can Pause sign-ups.

## Answer

Resolved 2026-10-10 (HITL grilling). The user accepted every recommendation.

**First-run: 3 screens, then `/setup`**
1. **Name your household** (display name; the captured time zone shown read-only).
2. **Location**: the map picker from [Fuzzy location](07-fuzzy-location.md), with **Skip**.
3. **Put it on your TV**, pairing first: "On the TV's computer, open Chrome and go to **count-dracula.example.com/tv**." The TV shows its TV pairing code and scan-to-pair QR. The Manager scans that QR with the **phone's own camera app** (it opens `/setup?pair=…`) or types the 6 characters into a box. There's **no in-page QR scanner** and no QR-reader library (zero-dependency rule). The screen ticks over to "✓ Your TV is showing your Rehearsal" when the TV connects. Alternatives on the same screen: **Send the link instead** (Share / Copy the TV link), **Use this screen as the TV** (opens the TV link here), **Skip for now**, and **Help with TV setup** (`/help/tv`).
- Every screen can be skipped. First-run shows on each visit to `/setup` until screen 3 has been passed once.
- The TV's pairing screen itself says "On your phone, go to count-dracula.example.com/setup → Pair a TV, or scan this".
- A refused sign-up (Pause sign-ups, or the 3-per-IP-per-day limit) lands on a plain "Sign-ups are paused, try again later" page. No Household is created.

**Ready-for-Halloween checklist** (top of `/setup`; it ticks itself from real state, hides when done or dismissed)
1. **A TV is watching**: ticked by a TV-link stream connection.
2. **A phone counted a test kid**: ticked by any kid on the Rehearsal. Then "try **Reset the Rehearsal** so your TV starts at 0".
3. **Your Halloween night**: "goes live Sat Oct 31, 4:00 pm", with an **Expected kids** field. Ticked once Expected kids is set or skipped.

Location isn't an item: it's optional and first-run already asked.

**Which TVs**
- **Supported:** any computer (laptop or mini PC) on HDMI running **Chrome or Edge full-screen**, which is v1's tested setup.
- **Best effort, labelled so:** smart-TV browsers, a tablet in landscape, a cast Chrome tab. We say "test it on your rehearsal; if the sound or screen misbehaves, use a laptop". No phone-as-TV.

**Kiosk launchers and help**
- **A bare `/tv` remembers the TV link it was paired to** (`localStorage`) and goes straight to it on the next load. If that link has been rotated, or the Household is gone, it clears the stored link and shows pairing again. So the launchers stay generic: they open `/tv` and never carry a secret.
- **`/help/tv`**, a public page adapted from `kiosk/README.md`: power and sleep settings for Windows, macOS and Linux; full-screen; HDMI sound; the `/tv?border` overscan check; "a reload needs a click or key press for sound". It also has a smart-TV and other-devices section (open the browser, go to `/tv`, pair, test at your rehearsal).
- **Launchers are optional, under "Advanced":** the Windows `.bat` and a generic Linux `.sh` (systemd-inhibit + Chrome autoplay flag), served from `/kiosk/` as today. No macOS launcher before Halloween. `install-cachyos.sh` stays for us and isn't advertised.

**Sound: the board always shows**
- When audio isn't running, the live board renders normally with a corner pill: **"🔇 Click or press OK for sound"**. **Any click, touch or key** unlocks it, which covers TV remotes that can't aim at a button.
- The full-screen **Start the night** welcome shows only while no kid has been counted on the live Event and audio hasn't been unlocked on this page load. After the first kid, a reload only ever shows the pill.
- The same applies to remote TV-link viewers. **This amends [Shareable TV: link, code and QR](06-shareable-tv.md)**, which kept the full-screen click as the way in.

**The test night is the Rehearsal**
- No simulator. One person can do the whole test: TV on, own phone joined, a few taps, hear the pop.
- **Reset the Rehearsal** (while the Rehearsal is live) clears its kids.
- **Clock shift** and the **golden ticket** fields move under an **Advanced** fold in the event editor.
- A small **"🎭 Rehearsal"** chip in the TV top bar and the door phone header, also seen by TV-link viewers. Takeovers, sound and recap behave as on the night.

**From Rehearsal to the real night, by default**
- **Sign-up creates two Events:** the live **Rehearsal** (as decided in [What becomes per-household](05-what-becomes-per-household.md)) and **"Halloween 2026"**, not live, with a **Goes live at** of **Oct 31, 4:00 pm in the Household's zone**.
- A server **minute tick** makes it live at that time (v1 Go live, so the Rehearsal is frozen) and TVs follow. A Manager can change the time (for towns that trick-or-treat on Friday the 30th; Oct 31, 2026 is a Saturday) or **Go live** early. That includes **Go live on Halloween 2026 now** in the door phone's ☰ menu for a Manager-signed-in phone. Helpers can't Go live.
- **Signing up after that time** makes "Halloween 2026" live straight away; the Rehearsal is still created, not live.
- **One join key per Household, kept across Go live**, so phones joined at the rehearsal keep working on the night. v1 already carries the key over on Go live (`server/ledger.js`); where it's stored is a build detail. Change join key still cuts off old phones.

**End of the night**
- **Nudge:** on a live non-Rehearsal Event, after **8:30 pm** local with **no tap for 30 minutes**, the door phone shows **"Quiet out there? 🌙 End the night"**. It goes through the usual confirm, including the golden-ticket choices. Dismissing it hides it for 30 minutes.
- **Safety net:** a live non-Rehearsal Event still unended at **3:00 am** local the next morning is **ended automatically** by the same minute tick. Unclaimed golden tickets expire, as with "End anyway". `/setup` then says "Your night ended automatically at 3:00 am. Your summary is ready" and links to the [Night summary](09-shareable-night-summary.md).

**Helper phones**
- **Count on this phone**: a button for a signed-in Manager in `/setup` and the checklist. It stores the join key on this device and opens `/`.
- **Add a helper:** the join QR in `/setup` plus **Share join link** (`navigator.share` / Copy). The door menu's Add a helper is unchanged. Every join QR points at the public HTTPS URL.

**Handed on**
- How the Oct 24 rehearsal exercises all this (a stranger's phone doing first-run, auto go-live tested by setting a near **Goes live at**) → the v2 rehearsal and launch-day plan (map fog).

Glossary: Rehearsal and Goes live at added to [CONTEXT.md](../../../CONTEXT.md).
