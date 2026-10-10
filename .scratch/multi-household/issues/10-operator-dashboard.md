# Operator dashboard

Type: grilling (HITL)
Status: claimed
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
