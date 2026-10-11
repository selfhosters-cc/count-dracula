# Count Dracula

A Halloween trick-or-treater counter: helpers' phones at the door tap each kid in, and a porch-facing TV celebrates every kid live. The night-level terms (Kid, Kid number, Tag, Golden ticket, …) are defined in the [v1 spec's domain model](.scratch/count-dracula/spec.md#2-domain-model). This file adds the terms for running many households on one deployment, and its **Event** and **Join key** replace v1's.

## Language

**Household**:
One home that signs up and runs its own Halloween nights. It owns its Events, has at most 3 of them Live or Ended at once (possibly none), and keeps one time zone that every time of night is read in. Nothing it owns is visible to another Household unless it chooses to share.
_Avoid_: Account, tenant, user, customer

**Event**:
One night a Household counts, such as "Halloween 2026" or a test night. It moves through four states: **Upcoming**, then **Live** after Go live, **Ended** after End the night (late kids still count, and Resume makes it Live again), and **Past** (read-only) from noon the next day, local time, or earlier if a Manager closes it. Going live never changes another Event.
_Avoid_: Night (in definitions), session, party, Rehearsal (a practice night is just an Event: reset it or make another)

**Reset**:
Puts a Live or Ended Event back to Upcoming with no kids, golden tickets, Night summary or share links; its setup (name, Goes live at, Race against, costume tags) stays. Managers do it from `/setup`; it goes live again by Go live or at its Goes live at.
_Avoid_: Clear, wipe, restart, Reset the Rehearsal

**Manager**:
A person, signed in with their Google account, who runs one Household: its events, `/setup`, sharing and deletion. A Household can have several Managers, all equal.
_Avoid_: Admin, owner, user, account

**Invite link**:
A single-use link, valid for 7 days, that a Manager shares so another person can sign in with Google and become a Manager of the same Household.
_Avoid_: Magic link, sign-in link

**Helper**:
Someone tapping kids in on a door phone. Has no account; the phone joins a Household with its join key and taps into the Event its TV link shows. A Helper never picks an Event.
_Avoid_: User, volunteer, member

**Join key**:
The one secret a door phone holds to write to a Household: it writes to any of the Household's Live or Ended Events, and every write names its Event. It's kept across Events, so a phone set up for a test night works on the real one; Change join key cuts off every phone holding the old one.
_Avoid_: Event key, password, TV link (that's read-only)

**Operator**:
Whoever runs the deployment itself, across all Households (today, us). A Manager whose email is on the operator list in `deploy/local.env`.
_Avoid_: Admin, superuser, site admin

**TV link**:
The one secret link that lets a device watch a Household's open Events read-only, one Event at a time: the open Event that went live most recently, on the same TV page the porch shows, switching by itself. With none open it shows a "No night on right now" screen. The porch TV and every remote viewer use the same link. It never expires; rotating it cuts off every device holding the old one, the Household's own porch TV included.
_Avoid_: Share link (that's the Night summary's), watch link, viewer key, join key (that's for Helpers' writes)

**TV pairing code**:
A short code shown on a TV that has no TV link yet. A Manager enters or scans it to give that TV their Household's TV link. It expires after a few minutes and does nothing without a Manager.
_Avoid_: TV code, share code, join code

**Goes live at**:
The time an Upcoming Event becomes Live by itself (a scheduled Go live). It never changes another Event. Sign-up sets it on \"Halloween 2026\" to Oct 31, 4:00 pm in the Household's time zone; a Manager can change it or Go live early.
_Avoid_: Start time, scheduled start, auto-start

**Night summary**:
The shareable tap-through slides of one ended Event, viewable by a public share link for as long as the Household keeps sharing on.
_Avoid_: Recap (that's the TV's end-of-night screen), wrapped, report

**Location**:
A Household's optional, approximate place: a 5-character geohash cell (about 5 × 3 km) picked on a map in `/setup`. The exact point never leaves the browser. Having a Location is what puts a Household into nearby figures.
_Avoid_: Address, position, postal code, pin

**Area**:
The fixed region (the Location's 4-character geohash parent, about 20 × 25 km) whose rounded totals a Household adds to and sees as "near you". It shows nothing until at least 5 Households in it are active.
_Avoid_: Neighbourhood, radius, zone (that's the Household's time zone), nearby (that's the feature)

**Active Household**:
For nearby figures, a Household whose live, non-Rehearsal Event has counted at least one kid in the last 30 minutes. Only Active Households count toward an Area's minimum of 5 and its totals.
_Avoid_: Live household, online household

**Site-wide total**:
The kids counted right now across every Household with a live, non-Rehearsal Event, and how many such Households there are, with the top costume counted in at least 3 of them. Rounded to 5s, refreshed every 10 minutes, and hidden below 5 Households. It shows on the door phone when there are no nearby figures, and on the public sign-up page.
_Avoid_: Global count, total tonight (there's no single "tonight" across time zones)

**Estimated past event**:
A counts-only past Event a Household without a past night gets by typing in last year's total. The total is spread over a fixed typical half-hour curve to give a ghost to race, and it's labelled "last year (estimated)" wherever it shows.
_Avoid_: Fake ghost, seed, Expected kids (that's this year's guess for the golden range)

**Suspended**:
A Household the Operator has switched off without deleting anything: its Managers see a notice instead of `/setup`, its phones, TV link and Night summary links are refused, and it drops out of nearby figures. Unsuspending restores everything.
_Avoid_: Banned, disabled, blocked, deleted

**Report**:
A stranger's flag on a public Night summary share page ("Report this page"), stored with the Household, the page, the time and an optional short reason. The Operator sees open Reports per Household on `/operator` and dismisses them; acting on one means Rename or Suspend.
_Avoid_: Complaint, flag, ticket

**Pause sign-ups**:
The Operator's switch on `/operator` that stops new Households being created while every existing Household keeps working. The emergency move for a sign-up flood, usable without a redeploy.
_Avoid_: Lockdown, maintenance mode, closing the site

**House rules**:
The three rules every Household agrees to by signing in, on the same page as the privacy notice: decent names and costume text, one real Household per home, Managers are adults running their own door. They are what a Report, Rename or Suspend points to.
_Avoid_: Terms, terms of service, policy, code of conduct

**Idle Household**:
A Household no Manager has signed in to for 2 years. It's deleted with everything it owns, without warning, since nothing is ever emailed.
_Avoid_: Inactive, dormant, stale (Stale is an Operator-dashboard status on the night)

**Abandoned sign-up**:
A Household that never counted a kid outside its starter Rehearsal and that no Manager has signed in to for 60 days. It's deleted like an Idle Household, just sooner.
_Avoid_: Unused account, trial, bot account
