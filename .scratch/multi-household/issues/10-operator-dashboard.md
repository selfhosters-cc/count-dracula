# Operator dashboard

Type: grilling (HITL)
Status: resolved
Blocked by: 04, 05

## Question

What does the Operator see across all households, and what can they do?

- **Active**: which events count as active (live and not ended? had a tap today?).
- **Stale**: no activity for X minutes. Pick X (and whether it's one number or depends on the time of night), and what "activity" is: a tap, a phone or TV connected, a setup change.
- **Per row**: household name, area, count, last tap, phones and TVs connected, shared-TV viewers, sign-up date.
- **Actions**: none (read-only) vs hide from nearby, disable sharing, suspend a household, help a household recover.
- **Privacy**: does the Operator see exact or fuzzed locations, and the Managers' Google emails?
- **On the night**: is this also our "is the site healthy?" screen (error counts, connection totals), or is that separate?
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): the 8 feature switches are Operator-wide kill switches in config (no UI needed before Halloween), and the Operator can fix a Household's time zone. Decide whether either is shown or editable here.
- **Given** ([Fuzzy location](07-fuzzy-location.md)): a Household's only location data is an optional 5-char geohash cell; its Area is the 4-char parent. The Operator sees how many Households are in each Area, with no map. Decide here whether a row shows the Household's Area or cell.
- **Given** ([Nearby activity indicator](08-nearby-activity.md)): nearby defines an **Active Household** as a live, non-Rehearsal Event with a kid counted in the last 30 minutes. Decide whether the dashboard's "active" is the same.

## Answer

Resolved 2026-10-10 (HITL grilling).

**One page, `/operator`, built for Halloween night.** Open to a signed-in Manager whose email is on the operator list in `deploy/local.env`. The page has a health strip on top and a Household table below. It's a phone-sized page you check by looking at it: no alerts, no history graphs.

**Health strip:** one row of tiles, each with a plain amber/red rule.

| Tile | Shows | Amber / red |
|---|---|---|
| Live nights | Households in each status (same counts as the filter chips) | none |
| Connections | Phones · TV screens · total, against the site-wide cap | amber ≥ 80 % of cap, red at cap |
| Refused | Connections and sign-ups refused by caps or rate limits since start | amber if any in the last 10 min |
| Errors | 5xx responses + uncaught exceptions since start, and the last error's message and time (server-generated text only, never a request body) | red if any in the last 10 min |
| Last tap | Time since a kid was counted anywhere | amber > 10 min while any Household is Counting |
| Backup | Age of the last `VACUUM INTO` copy | amber > 2× its interval |
| Server | Uptime; RSS against the LXC's 512 MB; the 8 switches on/off (read-only, still edited in config) | amber RSS > 400 MB |

Counters are in memory and reset on restart; uptime shows when that happened. The cap numbers are whatever [Public hosting and abuse](11-public-hosting-and-abuse.md) sets.

**Status per Household.** Only a counted kid counts as activity; connections and setup changes don't. One 30-minute window all night, the same as nearby.

| Status | Rule |
|---|---|
| Counting | An Active Household: a live, non-Rehearsal Event with a kid counted in the last 30 min |
| Stale | A live, non-Rehearsal Event that has counted kids, but none in the last 30 min |
| Waiting | A live, non-Rehearsal Event with no kids yet |
| Rehearsal | The live Event is a Rehearsal |

Stale is information, not an alarm: usually a forgotten 🌙 End the night or a dead porch phone.

**Household table**
- Columns: **Status · Household** (full display name) **· Area** (4-char, or "—") **· Kids** (live Event) **· Last kid** (relative) **· Phones** (join-key connections) **· TV screens** (TV-link connections) **· Signed up**.
- TV screens is one number: the porch TV and remote viewers share the TV link, so they can't be told apart.
- Sorted Counting → Stale → Waiting → Rehearsal, most kids first within each.
- Status filter chips with counts, and a name search.
- Refreshed by polling one `/api/operator` endpoint every 30 s. No new SSE stream.
- No per-row charts. Tapping a row opens the Household's **detail view**.

**Privacy**
- The **Area only**, never the 5-char cell. The cell stays in the DB for the nearby maths.
- The table shows a **count of Managers**. Their Google emails appear only in the detail view, where recovery needs them.

**Actions (detail view only, never on the table)**
1. **Rename** the display name. The policy behind it (blocklist and so on) is for [Public hosting and abuse](11-public-hosting-and-abuse.md).
2. **Fix time zone**: pick from the IANA zones.
3. **Make an Invite link** for the Household: the Operator's recovery path for a locked-out Manager. It's the ordinary single-use, 7-day Invite link; the Operator copies it and sends it themselves.
4. **Suspend / Unsuspend**, reversible:
   - Managers see a "This Household is suspended" notice in place of `/setup`.
   - Join-key phones, the TV link and Night summary share links are refused, and open streams are closed.
   - The Household drops out of nearby and site-wide figures.
   - Nothing is deleted.

**Cut:** Operator delete (Managers delete their own; the Operator suspends, then deletes in the DB if they really must), ending a stale night, separate "hide from nearby" or "disable sharing" toggles (Suspend covers them), and editing switches here.

**Audit:** one structured log line per Operator action in the server log (journald), e.g. `operator action=suspend household=37 by=<operator email>`. No audit table or history screen. The detail view shows only the current state ("Suspended since 8:42 pm"). Suspended Households get the notice and no reason; there's no email to send.

**Handed on**
- The cap numbers the Connections tile reads, the counters for refused requests, the backup interval, and the moderation policy behind Rename and Suspend → [Public hosting and abuse](11-public-hosting-and-abuse.md).
- What the Operator can see (Manager emails in the detail view, the Area, status) and the Operator action log → [Privacy notice and retention](15-privacy-notice-and-retention.md).
- Push alerts and history graphs: after Halloween (map: Out of scope).

Glossary: **Suspended** added to [CONTEXT.md](../../../CONTEXT.md).
