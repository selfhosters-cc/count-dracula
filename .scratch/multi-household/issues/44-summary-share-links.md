# Night summary share links and Reports

Type: build (AFK)
Status: ready-for-agent
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

## Acceptance criteria

- [ ] A share link opens the slides in a signed-out browser; with the toggle on, no display name appears anywhere in the page or its data
- [ ] Turning sharing off, deleting the night, or Suspending the Household makes the link "Not available"
- [ ] The preview tags point at the one fixed image
- [ ] A Report shows on `/operator`; Dismiss removes it and its reason; the 6th Report from one IP in a day is refused
- [ ] The switch turns every share page off
- [ ] A Report reason of `<img src=x onerror=alert(1)>` renders as text on `/operator`
- [ ] `bun test` passes
