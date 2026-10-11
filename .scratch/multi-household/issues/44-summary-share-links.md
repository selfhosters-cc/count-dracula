# Night summary share links and Reports

Type: build (AFK)
Status: done
Blocked by: 40, 43

## What to build

A Manager shares a night's slides by a public link. Strangers can report the page. See [spec §12 Sharing](../spec.md#12-night-summary), [§15 Reports](../spec.md#15-hosting-capacity-and-abuse) and [§13](../spec.md#13-operator).

**Share links**

- The **Share** button on the closing slide makes (or reuses) the night's **share token** and opens the share sheet (`navigator.share`, Copy as the fallback).
- The public share page opens the slides **without signing in**.
- A per-share **toggle hides the display name**.
- In `/setup`, sharing for a night can be **turned off**, which kills the link. Deleting the night or the Household removes it.
- The **link preview** is one fixed Count Dracula image (Open Graph tags), never per night.
- A Suspended Household's share pages show a neutral "Not available".
- The share path is one of the shapes [ticket 35](35-public-host-on-caddy.md) masks in the Caddy log.
- **Switch:** an Operator-wide switch turns share links off (the pages answer "Not available").

**Footer and Reports**

- The footer links to **`/privacy`** and **"Report this page"**.
- A Report stores the Household, the page, the time and an optional short reason. At most **5 per IP per day**. No email.
- **`/operator`:** the Reports column fills in, and Households with an open Report are flagged. The detail view lists them with **Dismiss**, which deletes the reason.
- Delete my Household also deletes its share links and Reports.

- **`/privacy` (from [ticket 33](33-privacy-page.md)):** add, under *What's public*: share-link holders see that night's slides, the display name per the share's toggle, nearby only as "near you"; extend the pass-it-on line to "or turn sharing off in Setup"; under *How long*: Report reasons are deleted when the Operator dismisses the Report. Left out until they exist.

## Acceptance criteria

- [x] A share link opens the slides in a signed-out browser; with the toggle on, no display name appears anywhere in the page or its data
- [x] Turning sharing off, deleting the night, or Suspending the Household makes the link "Not available"
- [x] The preview tags point at the one fixed image
- [x] A Report shows on `/operator`; Dismiss removes it and its reason; the 6th Report from one IP in a day is refused
- [x] The switch turns every share page off
- [x] A Report reason of `<img src=x onerror=alert(1)>` renders as text on `/operator`
- [x] `bun test` passes

## Notes from the build

- **Tables** (migration step 10): `share_links` (one per night: token, household, event, `hide_name`) and `reports` (household, event, time, reason up to 200 characters). Turning sharing off deletes the link; sharing again makes a new one. Dismiss deletes the Report and its reason. Deleting the night deletes its link and Reports; Delete my Household deletes all of them.
- **The link is `/share?key=<token>`** (the summary page), with its data from `GET /api/share?key=`: inside the `?key=` mask, so ticket 35 needs no new shape. With the toggle on, the API answers `displayName: ''`, so the name is in neither the page nor its data. Not available (404) when the link is gone, sharing is switched off, or the Household is Suspended.
- **Routes:** `POST /api/share` (`{ eventId, hideName }` → `{ url }`; the same night reuses its link), `POST /api/share/off`, `GET /api/shares` (for `/setup`), `POST /api/report` (`{ key, reason }`, 5 per IP per day). `/operator` rows count open Reports (⚑); the detail lists them with Dismiss (`operator action=dismissReport`).
- **Switch:** `switches.shareLinks` (default on): off, there's no Share button and every share page is Not available.
- **Preview:** `public/og-image.png` (1200×630), made once by screenshotting a small HTML card in the browser with the vendored fonts; the share page's Open Graph and Twitter tags point at it absolutely (the server fills `__ORIGIN__`).
- `/setup`: **Stop sharing** beside a shared night's summary link. `/privacy` gained the share-link and Report-reason lines.
- Checked in the browser: Share with "Show our name" unticked → a signed-out browser opened the slides with no household name anywhere; Report with `<img src=x onerror=…>` → `/operator` flagged the row (⚑ 1), the reason showed as text, Dismiss removed it.
