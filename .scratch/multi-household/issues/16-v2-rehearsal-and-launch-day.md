# v2 rehearsal and launch-day plan

Type: grilling (HITL)
Status: resolved
Blocked by:

## Question

How does the **Oct 24 rehearsal** work as the multi-household acceptance test, and what do **Oct 25–31** look like once strangers' nights depend on us?

- **The rehearsal as acceptance test.** What has to pass on Oct 24 for the freeze to hold, and who plays which part: a second test Household (a second Google account) alongside Household #1; a stranger's phone doing the 3-screen first-run and pairing a TV by code/QR ([From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md)); many remote TV-link viewers at once; nearby and the Site-wide total with fewer than 5 real Households (fake test Households? a lowered minimum on a copy?); a Night summary shared and Reported; Operator actions (Rename, Suspend, Pause sign-ups) on `/operator`. Which of it runs against production and which on a copy.
- **Auto go-live and auto-end.** Testing "Halloween 2026" going live by itself by setting a near **Goes live at**, and the 3 am auto-end, without upsetting Household #1's real night.
- **Load.** When and where the research's appendix scripts are re-run on LXC 118 to confirm the caps ([Public hosting and abuse](11-public-hosting-and-abuse.md)), and whether that happens on Oct 24 or before.
- **Pass/fail and the freeze.** What counts as a blocker that moves sign-up from ~Oct 25, versus a known issue we ship with. Rehearsing `deploy/RUNBOOK.md` (restore from `VACUUM INTO`, the re-delete step, Pause sign-ups, the suspected-breach steps).
- **Opening sign-up (~Oct 25).** Who flips it on and in what order (Pause sign-ups off, `/privacy` with the real `OPERATOR_CONTACT`, the Google OAuth consent screen published).
- **Oct 25–31 support.** Where strangers get help (the `OPERATOR_CONTACT` address only? a status line on the sign-up page?), and how quickly we look.
- **On the night (Oct 31).** Who's on call, what's watched (`/operator` health strip), and the decisions written down in advance: when to lower caps, when to Pause sign-ups, what to do if the site goes down at 7 pm while our own porch is running on it.
- **Given** ([Privacy notice and retention](15-privacy-notice-and-retention.md)): the rehearsal should check that `/privacy` shows the real contact, that a TV link token appears masked in the Count Dracula Caddy log, and that OSM tiles only load after the tap.

## Answer

Resolved 2026-10-10 (HITL grilling). The user dropped the Oct 24 rehearsal and the fixed sign-up date: **build it all, deploy as soon as it's ready, open sign-up the moment it's safe**. Everything else followed the recommendations.

**No rehearsal, no fixed dates**
- There is **no Oct 24 rehearsal**, no Oct 28 re-test and no rehearsal checklist. The Oct 24 date and its 3 pm–midnight change freeze are gone. This amends the map's calendar and the change freeze in [Public hosting and abuse](11-public-hosting-and-abuse.md).
- **Nothing disruptive runs on production.** No stopping the LXC, no restart drill, no restore on the live DB. Every deploy already restarts the service.
- **Our own porch** (hardware, sound, the TV) is tested like any Household's: our own Rehearsal, whenever it suits, with the `/setup` checklist and `/help/tv`. v1's hardware checks (overscan, HDMI sound, volume ceiling, kiosk flags) are ours to run that way.
- **The only freeze:** Oct 31, **3 pm–midnight**. No deploys unless the site is down; `deploy.sh` warns inside that window.

**Opening: what must be deployed before sign-up opens**
- **Core path:** Google sign-in, Households with the Household #1 migration, per-Household Events and zones, the 3-screen first-run, TV pairing by code + QR, the TV link, counting on the live TV, auto go-live and auto-end.
- **Public-safety set:** per-Household SSE channels, the caps and the rate limits; the blocklist on names and costumes; CSP and the other headers; Rename, Suspend and Pause sign-ups (a bare `/operator` with just these is enough at first); `VACUUM INTO` backups; `/privacy`; the masked Count Dracula Caddy log.
- **After opening, in later deploys:** the full `/operator` health strip and Household table; nearby and the Site-wide total; the Night summary and its share links; the estimated ghost; the top-costume clause; `/help/tv` polish.
- **Every deploy after opening is fix-forward:** a timestamped DB copy first, and migrations that only add, never rewrite.

**Opening-day checklist** (in `deploy/RUNBOOK.md`, done by the user, in order)
1. Tag `v1-final` and take a timestamped copy of the SQLite file.
2. Deploy v2. The migration runs; sign in with the email in `local.env` to become Household #1's Manager. Check "Halloween 2025 (counts)", the Rehearsal and Race against survived, and our TV pairs.
3. **Load check** (below); adjust the caps and redeploy if needed.
4. **Privacy checks** (handed on by [Privacy notice and retention](15-privacy-notice-and-retention.md)): `/privacy` shows the real `OPERATOR_CONTACT` and a test email to it arrives; a TV-link token appears **masked** in the Caddy log; OSM tiles load only after the tap in the Location picker.
5. **Google consent screen:** production redirect URI, app name and `/privacy` link set, then **Publish**. Until this step it stays in **Testing**, so only listed test users can sign in. That is the gate between deploying and opening.
6. **Test Household** with the user's second Google account, through the public URL, on a phone that has never opened the site: the 3-screen first-run; pair a second browser as its TV by code and by QR; set its "Halloween 2026" **Goes live at** to 10 minutes ahead and watch it go live with its TV following; leave it overnight and check next morning that it **ended at 3 am** and its summary is ready; then **delete** it (testing the hard delete). This is the one place auto go-live and auto-end are tested before Oct 31.
7. Pause sign-ups off: **sign-up is open.**

**Load check**
- A build task adds **`deploy/loadtest.js`**: the [Public exposure](03-public-exposure-limits.md) appendix method (the original scripts were never committed) re-done against the v2 per-Household hub. It opens N TV-link viewers on one Household plus a few on others, taps, and reports fan-out time per tap and RSS. About half a day.
- It runs **on LXC 118 against a second instance on a spare port with a scratch DB**, never the real DB, and not through Cloudflare or Caddy (the per-IP cap would block it; CPU is what's measured).
- **Once, right after the v2 deploy and before opening.** About 15 minutes.
- **Pass:** a tap reaches 200 viewers on one Household in under ~100 ms, and 3,000 site-wide streams stay under ~800 MB RSS. Otherwise lower the caps to what passes.

**Checked off production**
- **Nearby's ≥ 5 view:** on the dev box, a seed script makes 6 fake Households in one Area with taps and costumes. Look at the TV box and the phone strip there, including a costume in only 2 Households (hidden) and one on the blocklist (hidden). The build tickets' tests cover the same rules. **No fake Households on production.**
- **Restore drill:** on the dev box, from the daily pulled `VACUUM INTO` copy (stop, copy into place, start, check counts). It checks the off-box pull at the same time. Once, any time before Oct 31.
- Production only ever shows the **below-minimum** view (no TV box, the Site-wide total on the phone), which is what most Households will see.

**Blockers**
- **Core path** problems (sign-in and first-run, TV pairing and link, counting with the live TV and outbox, going live auto and manual, End the night with the summary ready) are **fixed forward** whenever they turn up. If strangers would be signing up into something broken, **Pause sign-ups** until it's fixed. Our own porch keeps v1's last resort: the paper tally sheet plus a Nov 1 backfill.
- A **switch-off-able feature** (nearby and the Site-wide total, Night summary share links, the estimated ghost, the top-costume clause) still broken at **3 pm on Oct 31** is **switched off site-wide** for the night. Never debugged on Halloween.
- **`v1-final` is a rollback only until the first stranger signs up.** After that it would erase their Households, so it's retired; the tag and DB copy are kept, not used.

**Support, sign-up to Oct 31**
- **One channel: `OPERATOR_CONTACT`.** "Help: email us" from `/setup`'s footer, `/help/tv` and the sign-up page. No forum, chat, status page or banner.
- Inbox checked **once a day**; on **Oct 31** at **3 pm** and about **6 pm**. Nothing promised during the night; replies the next day.
- A question that comes up twice becomes a line on `/help/tv` (a fix-forward deploy), not a separate FAQ.

**Oct 31**
- **On call:** the user, alone, best effort, between kids at our own door. `/operator` on the phone at **4 pm** (Households went live), **6 pm**, then in lulls.
- **Decided in advance:**
  - **Near the caps or RSS amber:** do nothing. The caps already refuse TV-link viewers first. Lowering caps means a redeploy that drops every stream: only if the process is actually restarting from memory pressure.
  - **Sign-up flood:** Pause sign-ups. Otherwise sign-up stays open all night (a late sign-up's "Halloween 2026" goes live at once).
  - **A Report or bad name:** Rename or Suspend at the next glance. Never urgent.
  - **Site down mid-evening:** phones keep counting into the outbox, TVs freeze calmly. **One 10-minute attempt**: `journalctl -u count-dracula`, restart, restore the newest `VACUUM INTO` copy if the DB is damaged. Not back by then: **stop debugging**, our porch goes to the paper tally, and every Household's outboxes drain when the site returns.
  - **Home internet down:** nothing to do; wait.
- **Nov 1:** check that every live non-Rehearsal Event auto-ended at 3 am, export our night, and write a short "what broke" note for after Halloween.

**Handed on**
- The build order, with the **core path + public-safety set** first and the opening line drawn after them, plus build tasks for `deploy/loadtest.js`, the nearby seed script, the opening-day checklist and the support links → [Assemble the v2 spec and build tickets](14-assemble-the-v2-spec.md).
