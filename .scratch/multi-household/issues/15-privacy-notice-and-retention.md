# Privacy notice and retention

Type: grilling (HITL)
Status: resolved
Blocked by: 11

## Question

What do we tell Households about their data, and how long do we keep it?

- **What we hold** (all decided): each Manager's Google account id, email and name; the Household display name and IANA time zone ([What becomes per-household](05-what-becomes-per-household.md)); an optional Location, a 5-char geohash cell with no exact point and no history ([Fuzzy location](07-fuzzy-location.md)); Events, taps, costumes and phone names; invites, TV links, Night summary share links; server logs with IP addresses.
- **Third parties:** Google (sign-in), OpenStreetMap (tiles in the location picker get the viewer's IP), anything [Public hosting and abuse](11-public-hosting-and-abuse.md) adds.
- **The notice:** where it lives (a `/privacy` page linked from sign-up and the location picker?), how short, who the contact is. Which laws plausibly apply to a free hobby site open worldwide (PIPEDA, GDPR), and how much that matters here.
- **Retention:** how long ended nights, idle Households (never came back after Halloween), logs and backups are kept; whether anything is purged automatically.
- **Deletion:** delete is already an immediate hard delete ([Household identity and sign-up](04-household-identity-and-sign-up.md)). What about copies in backups, and a Manager leaving a Household?
- **Given** ([Operator dashboard](10-operator-dashboard.md)): the Operator sees each Household's display name, Area (never the cell), status, counts and sign-up date, and Manager emails in a Household's detail view. Each Operator action (rename, time zone, invite, suspend) writes a log line naming the Operator and the Household. Suspension keeps all data.
- **Given** ([Public hosting and abuse](11-public-hosting-and-abuse.md)): Cloudflare proxies every request (it sees visitor IPs); `VACUUM INTO` backups keep a deleted Household for up to **14 days** (2 hours of 15-minute copies plus 14 daily ones, also pulled daily to the dev box, plus Proxmox vzdump); a **Report** stores an optional free-text reason from a stranger; rate limits key on IP in memory only; the Operator contact address (`OPERATOR_CONTACT` in `local.env`) is shown to Suspended Households. Decide what the notice says about each, and whether the 14 days needs to shrink.
- **Given** ([Multi-household extras shortlist](13-multi-household-extras.md)): the public sign-up page shows the **Site-wide total** on the night (rounded, ≥ 5 Households) with a top costume counted in ≥ 3 Households. A Household that types in last year's total stores it as an **Estimated past event**.

## Answer

Resolved 2026-10-10 (HITL grilling). The user accepted every recommendation; the only choice not offered as a default was the contact address (a forwarding address on their own domain).

**Posture.** A good-faith, plain-language notice, not compliance paperwork. Every promise is something the build already keeps. No cookie banner (one sign-in cookie, no analytics), no data-processing agreements, no DPO, no geo-blocking. PIPEDA and GDPR in principle apply; the real risks are a stranger's complaint or a broken promise of our own.

**The page.**
- One static **`/privacy`** page in `public/`, about a minute to read, dated at the top ("Updated Oct 2026"). Headings: *What we keep · Who else sees it · What's public · How long · Deleting · Contact*, then **House rules**.
- **House rules**, three bullets: keep names and costume text decent; one real Household per home, no fake ones; Managers are adults running their own door. The Operator can Rename or Suspend a Household that breaks them. No separate Terms page.
- **Linked from:** the sign-up page footer; one line under the Google button, *"By continuing you agree to the Privacy notice and House rules"* (no checkbox, no stored consent); the Location picker in `/setup` ("Only a ~5 km square is saved · Privacy"); the footer of public Night summary share pages; `/setup`'s settings area. **Not** on the TV.

**Contact.**
- One address for privacy questions, deletion help, Suspend appeals and leaked TV links: `OPERATOR_CONTACT` in `deploy/local.env` (the same value the Suspended page shows). In production it's a **forwarding address on the user's own domain**, never committed. The server fills it into `/privacy` when serving; the committed fallback is `privacy@count-dracula.example.com`.
- Promise: *"One person runs this as a hobby. Email us and we'll reply within a week (slower around Halloween)."* Nothing promised for the night itself. No contact form.

**Retention** (glossary: **Idle Household**, **Abandoned sign-up**).
- Ended nights, taps, costumes, phone names and an Estimated past event are kept **until a Manager deletes the night or the Household**.
- **Idle Household:** no Manager sign-in for **2 years** → deleted with everything it owns, without warning (nothing is emailed). The notice says so.
- **Abandoned sign-up:** never counted a kid outside its starter Rehearsal, no sign-in for **60 days** → deleted the same way.
- Suspension doesn't change either clock.
- **Both purge jobs are after Halloween** (the first Idle deletion can't fall before late 2028; the first Abandoned one not before late Dec 2026). The notice states both rules now.

**Backups.**
- The notice says: *"Deleting is immediate. Copies in our backups are gone within 2 months."* That covers the worst case found while grilling: the Proxmox weekly vzdump job (keep-last=2, keep-monthly=1) can hold LXC 118 for about 5–9 weeks. The daily vzdump (keep-daily=2) and `VACUUM INTO` (14 days) are inside it.
- **The dev-box daily pull keeps 14 days**; the same cron deletes older pulls (it had no retention).
- vzdump stays unchanged (it protects every container on the box).
- **No restores for individuals.** A mistaken delete is permanent, and the notice says so.
- A small **`deletions`** table (Household id + time, no names, rows dropped after 2 months) lets the Operator re-delete after a whole-database restore. `deploy/RUNBOOK.md` "Database file damaged" gains the step: after restoring, delete every Household listed in `deletions` since the backup's time.

**Logs.**
- **journald on LXC 118: `MaxRetentionSec=30day`** (it ran on defaults with no time limit). Refusal lines carry IPs; Operator action lines name only the Operator and the Household.
- **Caddy (shared, LXC 117):** the Count Dracula site block gets **its own access log** with `roll_keep_for 720h` and a size cap. **Tokens are masked** in logged paths and queries: the TV link token (`/tv/k/<token>`), the Night summary share token and `?key=` join keys are replaced with `REDACTED`. Then the log can't be used to watch a porch, and Halloween traffic doesn't push the other sites' logs out.
- Rate-limit buckets stay in memory only.
- **Report** reasons are deleted when the Operator dismisses the Report, otherwise kept with the Household and deleted with it.
- The notice says: *"Our servers log IP addresses to stop abuse and fix problems. Logs are deleted after 30 days."*

**Who else sees it.**
- **Google** (sign-in: they learn you signed in; we get account id, email, name), **Cloudflare** (proxies every request, sees visitor IPs and pages, TV viewers included), **OpenStreetMap tile servers** (only while picking a Location). One line each, linked to their policies. Then: *"No analytics, no ads, and we never sell or share your data."* And: *"Hosted on our own server in Canada."*
- **OSM tiles load only after a tap** (the map appears behind "Pick on a map", never on page load), so a Manager who skips Location never contacts OSM. Amends [Fuzzy location](07-fuzzy-location.md)'s picker.
- **Use my location** turns the position into the 5-char cell **in the browser**; only the cell is sent. *"Your exact position never leaves your device."*

**What's public.**
- TV link holders: the live board (count, ghost, costumes, display name; phone names stripped).
- Night summary share links: that night's slides, display name per the share's toggle, nearby only as "near you".
- Area figures (rounded, ≥ 5 Households) and the **Site-wide total** with a top costume from ≥ 3 Households, never pointing at one Household.
- Never public: emails, Manager names, the Location cell, phone names.
- *"Anyone you give your TV link or a share link to can pass it on. Rotate the TV link or turn sharing off in `/setup` to cut them off."*

**Children and Helpers.**
- *"We count trick-or-treaters, never who they are. We don't collect anything about them. Please don't type children's names into costumes or phone names."* No UI change; the blocklist and Report already cover abuse.
- Helpers aren't accounts. We keep only the phone name they type, inside the night.
- No age check (Google enforces its own minimum); the House rule covers who signs up.

**Managers, requests, cookies.**
- A Manager who **leaves or is removed** is hard-deleted at once (Google id, email, name, sessions). The Household and its nights stay with the other Managers; invites they made stay until used or revoked. *"Leaving a Household deletes your account details. The Household's nights stay with the other Managers."*
- **Access requests by email, answered by hand.** *"Email us and we'll send you what we hold about you."* `deploy/RUNBOOK.md` gets the SQLite query that pulls a Manager's row, their Household and its Events. Display name, time zone and Location are already correctable in `/setup`.
- *"One sign-in cookie, kept 90 days and renewed while you use it. No other cookies."*
- Changes to the notice: the date at the top changes. No email.

**Handed on**
- Build: the `/privacy` page with server-filled contact; the links listed above; the `deletions` table; dev-box pull 14-day prune; journald 30 days; the own Caddy log with token masking; the OSM tap; Report reason deletion on dismiss; Manager hard-delete on leave/remove; the two runbook entries → [Assemble the v2 spec and build tickets](14-assemble-the-v2-spec.md). All small; none of them is above the must-haves in build order, but the page, its links and the log/backup settings must be done before sign-up opens (~Oct 25).
- The Idle / Abandoned purge job and a self-serve "Download my data" export → after Halloween (map: Out of scope).
- The rehearsal checks `/privacy` shows the real contact and that a TV link token is masked in the Caddy log → [v2 rehearsal and launch-day plan](16-v2-rehearsal-and-launch-day.md).

Glossary: **House rules**, **Idle Household** and **Abandoned sign-up** added to [CONTEXT.md](../../../CONTEXT.md).
