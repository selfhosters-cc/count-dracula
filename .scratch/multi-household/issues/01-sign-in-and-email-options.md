# Sign-in and email options

Type: research (AFK)
Status: open
Blocked by:

## Question

What are the realistic ways for a household to sign up and sign in to a self-hosted Bun app with **zero npm dependencies**, ready in about a week?

- **Email delivery** for magic links / verification / recovery from a homelab server: providers with a free tier that fits a few hundred to a few thousand sign-ups in October (e.g. Resend, Postmark, Brevo, Amazon SES, an SMTP relay). For each: send API (plain HTTPS `fetch` vs SMTP), free-tier limits, what DNS it needs (SPF/DKIM/DMARC), time to get approved, and whether new accounts are sandboxed.
- **Auth primitives already in Bun**: `Bun.password` (algorithms, defaults), cookies/session helpers, crypto for tokens. What's built in vs what would need a library.
- **Passkeys/WebAuthn without a library**: how much server-side verification code is involved, browser support.
- **"Sign in with Google/Apple"**: what each requires (app review, domain verification, cost) and whether it fits the timeline.

Findings go to `research/01-sign-in-and-email-options.md`, every claim cited to a primary source.
