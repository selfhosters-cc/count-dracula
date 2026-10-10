# Privacy notice and retention

Type: grilling (HITL)
Status: open
Blocked by: 11

## Question

What do we tell Households about their data, and how long do we keep it?

- **What we hold** (all decided): each Manager's Google account id, email and name; the Household display name and IANA time zone ([What becomes per-household](05-what-becomes-per-household.md)); an optional Location, a 5-char geohash cell with no exact point and no history ([Fuzzy location](07-fuzzy-location.md)); Events, taps, costumes and phone names; invites, TV links, Night summary share links; server logs with IP addresses.
- **Third parties:** Google (sign-in), OpenStreetMap (tiles in the location picker get the viewer's IP), anything [Public hosting and abuse](11-public-hosting-and-abuse.md) adds.
- **The notice:** where it lives (a `/privacy` page linked from sign-up and the location picker?), how short, who the contact is. Which laws plausibly apply to a free hobby site open worldwide (PIPEDA, GDPR), and how much that matters here.
- **Retention:** how long ended nights, idle Households (never came back after Halloween), logs and backups are kept; whether anything is purged automatically.
- **Deletion:** delete is already an immediate hard delete ([Household identity and sign-up](04-household-identity-and-sign-up.md)). What about copies in backups, and a Manager leaving a Household?
- **Given** ([Operator dashboard](10-operator-dashboard.md)): the Operator sees each Household's display name, Area (never the cell), status, counts and sign-up date, and Manager emails in a Household's detail view. Each Operator action (rename, time zone, invite, suspend) writes a log line naming the Operator and the Household. Suspension keeps all data.
