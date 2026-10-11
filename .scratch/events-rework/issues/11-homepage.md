# The homepage

Type: prototype (HITL)
Status: ready-for-human
Blocked by:

## Question

What does the public homepage on `/` say and look like?

Decided at charting: `/` is the homepage; the door phone moves to `/door`; `/?key=…` redirects to `/door` with the key; a phone with a remembered key goes to the door, not the homepage; a signed-in Manager gets a "Go to Setup" button, not a redirect; `/signup` folds into it.

Open:

- **Content:** what Count Dracula is in a line or two, screenshots from `docs/screenshots/`, the site-wide total (ticket 46), Sign up / Sign in with Google, the House rules / Privacy line, Help: email us.
- **Tone and layout:** one screen or a scroll; phone first.
- **The site-wide line's wording outside the night:** it can show an October figure when 5+ Households test at once, and it shows last night's total until noon on Nov 1, while Ended Events are still open ([Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md)). "Count Dracula tonight" won't fit every case.
- Social preview (`og-image.png`, title, description).

A rough prototype on a `prototype/` branch, linked here.
