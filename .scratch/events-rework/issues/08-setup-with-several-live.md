# /setup with several live Events

Type: prototype (HITL)
Status: ready-for-human
Blocked by: 02, 04

## Question

How should `/setup` look when a Household has any number of Events, several live? Today it's one column: Live now, Your TV, Edit <select>, Costumes, Night tools, Create an event, Past events, Location, Managers, Your account.

- An Event list (live / coming up / ended) with per-Event actions: Go live, Reset, End, Delete, Add missed kids (the way to tap into an Event the TV isn't showing).
- Household-level: the join key, Add a helper's QR, the TV link, Pair a TV and Count on this device (both credentials are per Household, per [Live Events and their credentials](02-live-events-and-credentials.md)); which open Event the TV and doors are on right now (the one that went live most recently, per [TVs and door phones](04-tvs-and-door-phones.md)).
- Where the Household-wide things go (Location, Managers, account).
- Phone width first: `/setup` is used on phones.
- Leave room for the help column ([The /setup help column's content](13-setup-help-column.md)): a sticky right column at ≥ 900 px, a "?" per section heading on phones (decided at charting).

A rough clickable prototype on a `prototype/` branch, linked here.
