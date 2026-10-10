# Household identity and sign-up

Type: grilling (HITL)
Status: resolved
Blocked by: 01

## Question

Who signs up, and how do they get back in?

- Does a **person** sign up and own a Household, or is the Household itself the login? Can two adults in one home both manage it, and how does the second one join?
- Sign-in method: magic link, password, passkey, Google/Apple. Pick from what [Sign-in and email options](01-sign-in-and-email-options.md) shows is buildable by ~Oct 20.
- How this relates to the v1 roles: the **admin PIN** (replaced, or kept as a second factor for `/setup`?) and **helpers** who join a phone with the join key and never have an account.
- Who is an **Operator** (site-wide admin, today just us) and how they sign in, as distinct from a household's own manager.
- Sign-up fields: household display name, email, anything else. Verification before an event can go live?
- Recovery and "delete my household".

Settle the terms in [CONTEXT.md](../../../CONTEXT.md) (Household, the person who manages it, Helper, Operator).

## Answer

Resolved 2026-10-10 (HITL grilling). The user overrode the research's email route: **Google sign-in only, no email sending.**

**Who signs in**
- A **Manager** is a person with a Google account who belongs to exactly **one** Household, keyed by Google's stable account id (`sub`), not the email. One person running several Households is out of scope for v2.
- **Sign-up creates the Household and its first Manager together**, when Google sign-in completes.
- **Invite link:** any Manager taps **Invite**. That makes a single-use link that expires after 7 days and opens the phone's share sheet (`navigator.share({ url })`, HTTPS + a tap), with **Copy link** as the fallback where Web Share isn't available (Firefox desktop, some desktop Chrome). Whoever opens the link and signs in with Google joins as a Manager. Unused invites are listed and can be revoked.
- Every Manager has the same powers. Managers can remove other Managers. The last Manager can't leave; they delete the Household instead.

**How they sign in**
- **Google sign-in only**, scopes `openid email profile`. With only these scopes Google doesn't review the app. The consent screen must be set to **In production** (Testing mode caps at 100 test users). Without brand verification, people see the domain rather than an app name and logo, which is acceptable.
- **No email is sent at all.** No Resend, no SES, no sign-in links, no mail code. A local SMTP relay on the LAN exists if a later feature needs mail; its address stays out of the repo, and Bun has no SMTP client, so one would have to be written.
- **Sessions:** a random token stored server-side, in an HttpOnly, Secure, SameSite=Lax cookie. 90 days, renewed with use. Sign-out is included.
- Passkeys, email sign-in links and Apple sign-in come after Halloween (map: Out of scope).

**Roles compared with v1**
- **The admin PIN is gone.** `/setup` needs a signed-in Manager of that Household.
- **Helpers don't change:** no account; their phones join with the event's join key and keep the ☰ door menu. Where the join QR points (public URL or LAN) is for [Public hosting and abuse](11-public-hosting-and-abuse.md).
- **Operator:** a Manager whose Google email is on an operator list in the git-ignored `deploy/local.env`. They sign in the same way and also get `/operator`; what it shows is for [Operator dashboard](10-operator-dashboard.md).

**Sign-up**
- One field: the **Household display name**, at most 40 characters. Google's verified email means there is no separate verification step and never an unverified Household.
- **Bot protection:** requiring a Google account filters most bot sign-ups. Recommendation for [Public hosting and abuse](11-public-hosting-and-abuse.md): no Turnstile, just a per-IP rate limit on creating Households. That ticket also owns moderation of display names (blocklist, Operator rename), since they appear on shared screens.
- Location and the first live event belong to the first-run path in [From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md) and [Fuzzy location](07-fuzzy-location.md).

**Recovery and deletion**
- **Google handles recovery.** If a Manager loses their Google account, another Manager re-invites them; with no other Manager, the Operator adds them by hand.
- **"Delete my Household"**: any Manager, confirmed by typing the Household's name. It immediately hard-deletes the Household and everything it owns (events, taps, share links, location, Managers, invites). Retention and the privacy notice stay in the map's fog.

**Build-time setup (HITL, for the build tickets):** the user creates the Google Cloud project and OAuth client with the redirect URI on the real host; client id, secret and host go in `deploy/local.env`.

Glossary: Manager, Helper, Operator and Invite link added to [CONTEXT.md](../../../CONTEXT.md).
