# Sign-in and email options

Type: research (AFK)
Status: resolved
Blocked by:

## Question

What are the realistic ways for a household to sign up and sign in to a self-hosted Bun app with **zero npm dependencies**, ready in about a week?

- **Email delivery** for magic links / verification / recovery from a homelab server: providers with a free tier that fits a few hundred to a few thousand sign-ups in October (e.g. Resend, Postmark, Brevo, Amazon SES, an SMTP relay). For each: send API (plain HTTPS `fetch` vs SMTP), free-tier limits, what DNS it needs (SPF/DKIM/DMARC), time to get approved, and whether new accounts are sandboxed.
- **Auth primitives already in Bun**: `Bun.password` (algorithms, defaults), cookies/session helpers, crypto for tokens. What's built in vs what would need a library.
- **Passkeys/WebAuthn without a library**: how much server-side verification code is involved, browser support.
- **"Sign in with Google/Apple"**: what each requires (app review, domain verification, cost) and whether it fits the timeline.

Findings go to `research/01-sign-in-and-email-options.md`, every claim cited to a primary source.

## Answer

Resolved 2026-10-10 (AFK). Findings, with a citation on every claim: [`research/sign-in-and-email:.scratch/multi-household/research/01-sign-in-and-email-options.md`](https://github.com/selfhosters-cc/count-dracula/blob/research/sign-in-and-email/.scratch/multi-household/research/01-sign-in-and-email-options.md) (`git show research/sign-in-and-email:.scratch/multi-household/research/01-sign-in-and-email-options.md`).

Recommendations for [Household identity and sign-up](04-household-identity-and-sign-up.md) to decide:

- **No npm dependencies needed.** Bun 1.3+ has `Bun.password` (argon2id default), a cookie API in `Bun.serve` routes, CSRF tokens, and Web Crypto that verifies ES256/RS256/Ed25519; checked on local Bun 1.4.2. We'd write the sessions table and rate limits (and SigV4 if SES).
- **Email magic links are the realistic route in a week.** Every provider has an HTTPS API, so plain `fetch`; Bun has no SMTP client. To stop mail scanners using up a link, the link opens a page and a button completes sign-in (flagged as not primary-sourced).
- **Providers (checked 2026-10-10):**
  - **Resend:** fastest to start, no documented review, ~15 min domain verification. Free tier is **100/day**, which opening day could exceed.
  - **Brevo:** 300/day free, but only after an account approval with no stated timeline.
  - **Amazon SES:** ~$0.10–0.16 per 1,000. Sandbox exit answered within 24 h. Needs ~50 lines of SigV4.
  - **Postmark:** free tier 100/month, too small.
- **Google sign-in fits:** free, and asking only for `openid email profile` needs no app verification. The token comes straight from Google over HTTPS, so no JWT library. Without the optional brand verification (privacy policy + Search Console domain), users see the domain rather than an app name and logo.
- **Passkeys:** ~250–300 lines without a library (no CBOR decoding needed), but they still need email for recovery → after Halloween.
- **Apple:** US$99/yr, an unpublished enrolment time, a 6-monthly secret rotation, and relay-email domain registration → poor fit.
- **Suggested route:** magic links via Resend, with either one month of Resend Pro (US$20) for Oct 25–Nov 1 or an SES production-access application filed now as the backup. Long sessions; Google only if a no-email option is wanted; passkeys and Apple after Halloween.
