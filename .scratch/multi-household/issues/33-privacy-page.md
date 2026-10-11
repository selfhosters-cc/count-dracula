# The /privacy page and support links

Type: build (AFK)
Status: done
Blocked by: 21, 25

## What to build

A plain privacy notice with the House rules, and one support address everywhere help is offered. See [spec §16](../spec.md#16-privacy-and-retention) and [§18 Support](../spec.md#18-launch-and-the-night-runbook). The wording comes from [Privacy notice and retention](15-privacy-notice-and-retention.md).

**The page**

- One static **`/privacy`** page in `public/`, about a minute to read, dated "Updated Oct 2026".
- Headings: *What we keep · Who else sees it · What's public · How long · Deleting · Contact*, then **House rules** (three bullets).
- The server fills in **`OPERATOR_CONTACT`**; the committed fallback is `privacy@count-dracula.example.com`.
- **What's public, about TV-link holders:** list what the TV actually shows. It doesn't show the display name ([spec §9](../spec.md#9-shareable-tv)), even though ticket 15's draft listed it.

**Links**

- The sign-up page footer, and the line under the Google button: *"By continuing you agree to the Privacy notice and House rules"*.
- The Location picker's line *"Only a ~5 km square is saved · Privacy"*.
- `/setup`'s settings area.
- Public Night summary share pages get the link in [ticket 44](44-summary-share-links.md).
- **Not** on the TV.

**Support links:** "Help: email us" (`OPERATOR_CONTACT`) in `/setup`'s footer, on `/help/tv` and on the sign-up page.

**Check every promise against the build.** Walk the table in [spec §16](../spec.md#16-privacy-and-retention). Any promise the build doesn't keep yet is either built in its ticket before opening, or left out of the page until it is.

## Acceptance criteria

- [x] `/privacy` shows the configured contact, and the fallback when none is set
- [x] Every link listed above is present, and none is on the TV
- [x] "Help: email us" is on `/setup`, `/help/tv` and the sign-up page
- [x] Every sentence on the page is true of the deployed build (the §16 table walked and ticked in the ticket's notes)
- [x] `bun test` passes

## Notes from the build

- `public/privacy.html`; the server fills `__CONTACT__` in any served page with `OPERATOR_CONTACT` (escaped), falling back to `privacy@count-dracula.example.com`. The same fill gives the "Help: email us" links on `/signup`, `/setup` (footer, with TV help) and `/help/tv`. Links to `/privacy`: the sign-up footer and the line under the Google button, the Location picker's line, and `/setup`'s Your household section. None on the TV.

**The spec §16 table, walked against the build at the opening line:**

| Promise | Kept by |
|---|---|
| Nights kept until a Manager deletes them | ✓ Nothing deletes nights by itself |
| Idle (2 years) and Abandoned (60 days) deleted without warning | ✓ Stated; the purge jobs are after Halloween (the first possible deletion is late Dec 2026) |
| Deleting is immediate; backups gone within 2 months | ✓ Hard delete (ticket 21); `VACUUM INTO` 14 days and the dev-box pull 14 days (ticket 32); vzdump at most ~9 weeks |
| No restores for one household | ✓ Stated |
| IP logs deleted after 30 days; key-like links blanked out | Ticket 34 (journald `MaxRetentionSec=30day`) and ticket 35 (Caddy log with masking), both before the opening line. Re-check this line in ticket 38 |
| Exact position never leaves the device | ✓ Geohash in the browser (ticket 25) |
| OSM only while picking a Location | ✓ Tiles only after "Pick on a map" (ticket 25) |
| One sign-in cookie, 90 days, renewed; no other cookies | ✓ Ticket 21; phones' `localStorage` isn't a cookie |
| Google, Cloudflare, OSM; no analytics or ads; hosted in Canada | ✓ |
| "Email us and we'll send you what we hold about you" | The SQLite query goes in `deploy/RUNBOOK.md` (ticket 37), before the opening line |
| TV-link holders see the live board, no phone names, no household name | ✓ Ticket 23 |

**Left out until built** (each ticket now says what to add): leaving a Household (ticket 39), Area figures and the Site-wide total (ticket 41), share links and Report reasons (ticket 44).
