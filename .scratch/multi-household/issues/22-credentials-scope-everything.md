# Every read and write carries a credential

Type: build (AFK)
Status: done
Blocked by: 19, 21

## What to build

Reads stop being open. Every request reaches only its own Household. Helper phones join through the public URL. See [spec §3 Roles](../spec.md#3-identity-and-tenancy), [§6 Helper phones](../spec.md#6-sign-up-first-run-and-the-rehearsal) and [§15 Hosting](../spec.md#15-hosting-capacity-and-abuse).

**Credentials**

- The **join key** leads to its Household's live Event: phone snapshot, stream, and every write.
  - EventSource can't send headers, so the stream takes the key as `?key=` (the Caddy log masks it, [ticket 35](35-public-host-on-caddy.md)).
- A **Manager session** reaches its Household's Setup reads, past events (`/api/snapshot?event=<id>`, so `/tv?event=<id>` recaps), the **tally sheet** and the export.
- No credential, or a credential of another Household, gets 403 on every route.
- **One join key per Household**, kept across Go live (as v1). Where it's stored is the builder's call ([spec §21](../spec.md#21-builders-latitude)).
- **Change join key** closes the old key's streams as well as refusing its writes.

**Remove the LAN and tailnet paths**

- Remove `/api/join`, `autoJoinHosts`, `lanUrl`, `lanAddress()` and `settings.lanUrl`.
- Every join QR, in the door menu and in `/setup`, points at the **public HTTPS URL** (the request's origin behind Caddy, or `PUBLIC_HOST`).

**In `/setup`**

- **Count on this phone:** stores the join key on this device and opens `/`.
- **Add a helper:** the join QR plus **Share join link** (`navigator.share`, with Copy as the fallback).

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), Guard ([spec §20](../spec.md#20-where-it-lands-in-the-code)).

## Acceptance criteria

- [x] A table-driven test hits every route with no credential, with another Household's key or session, and with the right one: only the right one works
- [x] `/tv?event=<id>` and the tally sheet need a Manager of that Household
- [x] After Change join key, old-key streams close and old-key writes get 403
- [x] A phone joined on the Rehearsal keeps working after Go live
- [x] No `lanUrl`, `autoJoinHosts`, `/api/join` or `lanAddress` left in the code
- [x] The helper QR encodes the public HTTPS URL
- [x] Count on this phone and Share join link work on a phone (checked in the browser)
- [x] `bun test` passes

## Notes from the build

- A request's credential is a join key (`X-Join-Key`, or `?key=` on `/api/stream`) or the `cd_session` cookie. The live snapshot and stream take either; writes take the key; Setup, `/api/snapshot?event=<id>`, `/tally` and `/setup` take a session (the pages redirect to `/signup` without one).
- Until [ticket 23](23-tv-link.md), a bare `/tv` works in a browser signed in as a Manager (its stream rides on the session cookie), and nowhere else.
- The join key stays on `households` (ticket 17). Change join key closes the streams opened with the old key; `/setup` moves this phone onto the new key if it had the old one.
- Join links and QRs use `location.origin`, which is the public HTTPS address behind Caddy.
- `server/credentials.test.js` is the table of every Household route: none, made-up, another Household's and the right credential.
- `deploy/README.md` still describes the tailnet auto-join; ticket 34 rewrites it.
