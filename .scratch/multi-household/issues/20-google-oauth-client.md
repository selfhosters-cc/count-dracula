# Google OAuth client and local.env

Type: task (HITL)
Status: ready-for-agent
Blocked by:

## What to build

The user creates the Google sign-in client, and fills in the private settings. See [spec §3 Signing in](../spec.md#3-identity-and-tenancy) and [§5](../spec.md#5-config-split). Nothing here is committed.

1. A Google Cloud project, and an **OAuth consent screen**: External, scopes `openid email profile` only, in **Testing** for now, with the user's two Google accounts added as test users. It's published on opening day ([ticket 38](38-open-sign-up.md) step 5).
2. A **Web application** OAuth client with the redirect URIs:
   - `https://<PUBLIC_HOST>/auth/google/callback`
   - a dev one: `http://localhost:3131/auth/google/callback` (Google accepts `localhost`, not a bare LAN IP)
3. Add to the git-ignored `deploy/local.env`:
   - `PUBLIC_HOST`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `OPERATOR_EMAILS`
   - `HOUSEHOLD1_MANAGER_EMAIL`
   - `OPERATOR_CONTACT` (the forwarding address on the user's own domain)

Tests never need this: [ticket 21](21-google-sign-in.md) runs against a fake Google. It's needed for a real sign-in on the dev box and in production.

## Acceptance criteria

- [ ] The consent screen asks only for `openid email profile` and is in Testing with both test users
- [ ] The client has the production and dev redirect URIs
- [ ] `deploy/local.env` has all six keys, and `git status` shows it isn't tracked
