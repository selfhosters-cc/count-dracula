# Google sign-in, Managers and deleting a Household

Type: build (AFK)
Status: done
Blocked by: 17

## What to build

People sign in with Google and become Managers. Signing up creates a Household. The admin PIN goes. See [spec §3](../spec.md#3-identity-and-tenancy).

**Sign-in**

- The Google authorization-code flow with `state` (and a nonce), scopes `openid email profile`. The callback is at `/auth/google/callback`. The token comes straight from Google over HTTPS, so there's no JWT library.
- Google sits behind a **seam**: tests use a fake Google.
- **Sessions:** a random token stored server-side, in an `HttpOnly; Secure; SameSite=Lax` cookie. 90 days, renewed with use. **Sign out** is included.
- A Manager is keyed by Google's `sub`, and belongs to exactly one Household.

**Sign-up**

- A signed-out **sign-up page** with the Google button and, under it, *"By continuing you agree to the Privacy notice and House rules"* (the link arrives with [ticket 33](33-privacy-page.md)).
- The one field is the **display name** (≤ 40 characters). Carry it through the Google round trip; first-run screen 1 ([ticket 27](27-first-run-and-rehearsal.md)) can change it.
- When Google sign-in completes, it creates the Household (the create Household command from [ticket 17](17-households-and-migration.md)) and its first Manager together, with the zone from the browser.
- A Google account that's already a Manager signs in to its Household; it never makes a second one.
- A refused sign-up shows a plain **"Sign-ups are paused, try again later"** page and creates nothing. Expose one check that [ticket 28](28-caps-and-rate-limits.md) (limits) and [ticket 31](31-bare-operator.md) (Pause sign-ups) plug into.

**Household #1 and Operators**

- The first sign-in whose verified email is `HOUSEHOLD1_MANAGER_EMAIL` becomes Household #1's Manager, keyed by `sub` from then on. It doesn't create a new Household.
- A Manager whose email is in `OPERATOR_EMAILS` is an Operator (`/operator` arrives with [ticket 31](31-bare-operator.md)).

**`/setup` on a session**

- `/setup` and every Setup command need a signed-in Manager of that Household. **Remove the admin PIN** from `config.js`, `app.js` and `setup.html`.
- `/setup` can set the display name.

**Delete my Household**

- Any Manager, confirmed by typing the Household's name.
- It **hard-deletes at once** the Household and everything it owns: events, kids, tags, tickets, batches, moments, Managers, sessions, and anything later tickets add (invites, share links, Reports). Later tickets must extend it.
- It writes one row to **`deletions`** (household id + time, nothing else). Rows older than 2 months are dropped.
- Its open streams close.

**Modules:** a new Accounts module ([spec §20](../spec.md#20-where-it-lands-in-the-code)).

## Acceptance criteria

- [x] With the fake Google: a new account signs up and lands in `/setup` of a new Household with a live Rehearsal
- [x] The same account signing in again reaches the same Household; it can't make a second one
- [x] `HOUSEHOLD1_MANAGER_EMAIL` becomes Household #1's Manager; later sign-ins match on `sub`, even if the email changes
- [x] A forged or replayed `state` is refused
- [x] The session cookie is HttpOnly, Secure and SameSite=Lax; it's renewed with use, expires after 90 days unused, and Sign out ends it
- [x] `/setup` and Setup commands refuse without a session, and refuse a Manager of another Household
- [x] No admin PIN anywhere in the code or config
- [x] A display name over 40 characters is refused
- [x] Delete needs the typed name, leaves no row of that Household in any table, writes one `deletions` row, and closes its streams
- [x] A display name of `<img src=x onerror=alert(1)>` renders as text in `/setup`
- [x] `bun test` passes

## Notes from the build

- **Accounts** (`server/accounts.js`): `beginSignIn({ displayName, timeZone, redirectUri })` → Google's URL; `finishSignIn({ code, state, redirectUri, ip })` → `{ token, householdId, created }` or `{ refused: 'state' | 'unverified' | 'noHousehold' | 'paused' }`; `session(token)`; `signOut(token)`; `deleteHousehold(id, confirm)`. States are in memory, single-use, 10 minutes.
- **The sign-up check** for tickets 28 and 31: `startServer({ canSignUp })` → Accounts calls `canSignUp({ ip })` just before creating a Household. Signing in to an existing Household never asks it.
- **Google seam:** `server/google.js` (`authUrl`, `exchange`); tests use `test/fake-google.js`. The ID token's `aud`, `iss` and `exp` are checked; no signature check, since it comes straight from Google's token endpoint over TLS.
- **Routes:** `/signup` (page), `POST /auth/google/start`, `GET /auth/google/callback`, `POST /auth/signout`, `GET /api/household`, `POST /api/household/delete`. Setup's reads and `/api/admin` take the session cookie (`cd_session`) and no join key; `rename` is a Setup command. `GET /setup` without a session goes to `/signup`.
- **Delete:** later tickets add their tables to `accounts.deleteHousehold` (or the Ledger's `deleteHousehold`). `server/sign-in.test.js`'s `rowsOf` checks every table for leftover rows, so a new table pointing at a Household, event or Manager is covered automatically.
- **Secrets:** `startServer` reads `PUBLIC_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPERATOR_EMAILS` and `HOUSEHOLD1_MANAGER_EMAIL` from the environment. How the service gets `deploy/local.env` into its environment is ticket 34.
- The `Secure` cookie only sticks over HTTPS or on `localhost`, so a dev sign-in has to use `http://localhost:3131` (which is also the dev redirect URI in ticket 20).
- Checked in the browser with a stand-in Google: sign-up lands in `/setup` with the starter costumes; a `<img src=x onerror=…>` display name shows as text; Sign out goes back to `/signup`.
- The admin PIN is gone from the code, config, `deploy.sh` and READMEs.
