# The /privacy page and support links

Type: build (AFK)
Status: ready-for-agent
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

- [ ] `/privacy` shows the configured contact, and the fallback when none is set
- [ ] Every link listed above is present, and none is on the TV
- [ ] "Help: email us" is on `/setup`, `/help/tv` and the sign-up page
- [ ] Every sentence on the page is true of the deployed build (the §16 table walked and ticked in the ticket's notes)
- [ ] `bun test` passes
