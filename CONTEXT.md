# Count Dracula

A Halloween trick-or-treater counter: helpers' phones at the door tap each kid in, and a porch-facing TV celebrates every kid live. The night-level terms (Event, Kid, Kid number, Tag, Golden ticket, Join key, …) are defined in the [v1 spec's domain model](.scratch/count-dracula/spec.md#2-domain-model). This file adds the terms for running many households on one deployment.

## Language

**Household**:
One home that signs up and runs its own Halloween nights. It owns its Events, always has exactly one of them live, and keeps one time zone that every time of night is read in. Nothing it owns is visible to another Household unless it chooses to share.
_Avoid_: Account, tenant, user, customer

**Manager**:
A person, signed in with their Google account, who runs one Household: its events, `/setup`, sharing and deletion. A Household can have several Managers, all equal.
_Avoid_: Admin, owner, user, account

**Invite link**:
A single-use link, valid for 7 days, that a Manager shares so another person can sign in with Google and become a Manager of the same Household.
_Avoid_: Magic link, sign-in link

**Helper**:
Someone tapping kids in on a door phone. Has no account; the phone joins an event with its join key.
_Avoid_: User, volunteer, member

**Operator**:
Whoever runs the deployment itself, across all Households (today, us). A Manager whose email is on the operator list in `deploy/local.env`.
_Avoid_: Admin, superuser, site admin

**TV link**:
The one secret link that lets a device watch a Household's live Event read-only, on the same TV page the porch shows. The porch TV and every remote viewer use the same link. It never expires; rotating it cuts off every device holding the old one, the Household's own porch TV included.
_Avoid_: Share link (that's the Night summary's), watch link, viewer key, join key (that's for Helpers' writes)

**TV pairing code**:
A short code shown on a TV that has no TV link yet. A Manager enters or scans it to give that TV their Household's TV link. It expires after a few minutes and does nothing without a Manager.
_Avoid_: TV code, share code, join code

**Night summary**:
The shareable tap-through slides of one ended Event, viewable by a public share link for as long as the Household keeps sharing on.
_Avoid_: Recap (that's the TV's end-of-night screen), wrapped, report
