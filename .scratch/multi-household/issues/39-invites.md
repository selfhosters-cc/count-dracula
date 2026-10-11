# Invites and Managers leaving

Type: build (AFK)
Status: done
Blocked by: 21, 31

## What to build

More Managers join a Household by Invite link, and Managers can leave or be removed. The Operator gets the recovery invite. See [spec §3 Managers](../spec.md#3-identity-and-tenancy) and [§13](../spec.md#13-operator). This is the first ticket after the opening line, so its migration only adds.

- **Invite** (any Manager) makes a **single-use** link valid **7 days**. It opens the share sheet (`navigator.share({ url })`), with **Copy link** as the fallback.
- At most **20 per Household per day** (the bucket from [ticket 28](28-caps-and-rate-limits.md)).
- **Unused invites** are listed in `/setup` and can be **revoked**.
- **Opening one:** Google sign-in, then the person joins as a Manager.
  - An account that already manages a Household is told so and doesn't join (one Household per Manager).
  - A used, expired or revoked link says so.
- **Managers list** in `/setup`. Any Manager can **remove** another.
- **Leave:** the last Manager can't leave, and is pointed at Delete my Household instead.
- **Leaving or being removed hard-deletes** that Manager's Google id, email, name and sessions at once. The Household and its nights stay. Invites they made stay until used or revoked.
- **Operator:** **Make an Invite link** in the `/operator` detail view, an ordinary invite the Operator copies and sends themselves. It writes one audit log line.
- Delete my Household also deletes invites.
- Invite tokens appear only in a URL shape that [ticket 35](35-public-host-on-caddy.md)'s masking covers; add the shape there if it's new.

- **`/privacy` (from [ticket 33](33-privacy-page.md)):** add, under *Deleting*: *"Leaving a Household deletes your account details. The Household's nights stay with the other Managers."* It was left out until leaving exists.

## Acceptance criteria

- [x] A second Google account opens an invite and becomes an equal Manager; the same link then fails
- [x] An expired (fake clock) or revoked invite fails
- [x] An account that already manages a Household can't join another
- [x] The 21st invite in a day is refused
- [x] Remove and Leave leave no row with that Manager's id, email or sessions; the last Manager can't leave
- [x] The Operator's invite works and is logged
- [ ] The share sheet opens on a phone, and Copy works on desktop (checked in the browser)
  - Copy checked in the browser (the link landed on the clipboard and "Link copied" showed). The share sheet needs a real phone.
- [x] `bun test` passes

## Notes from the build

- `invites` table (migration step 8): token, household, `made_by` (a Manager, or NULL for the Operator's and once its maker leaves), created, expires (7 days), used, revoked.
- **The link is `/invite?key=<token>`**: inside ticket 35's `?key=` mask, so no new shape. `GET /invite` shows whose household it is, or why it doesn't work (used, expired, revoked, unknown: 410). Its button posts the invite through the usual Google sign-in; Accounts' `finishSignIn` joins the person and marks the invite used.
- An account that already manages another Household gets 409 "One household each" and the invite stays unused. Opening your own Household's invite just signs you in.
- **Routes:** `GET /api/managers` (`{ me, managers, invites }`), `POST /api/invites` (rate-limited 20 per Household per day; `{ url }`), `POST /api/invites/revoke` (`{ key }`), `POST /api/managers/remove` (`{ managerId }`), `POST /api/managers/leave`. The last Manager can't leave or be removed ("Delete my household instead").
- Leave/remove delete the Manager's sessions and row and null their invites' `made_by`, in one transaction. Delete my Household deletes its invites.
- `/operator`: **Make an Invite link** (action `invite`) returns the link and copies it; one `operator action=invite household=<id> by=<email>` line.
- `/privacy` gained the leaving sentence under *Deleting*.
