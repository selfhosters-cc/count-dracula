// The core's env keys, the one list: the server's, and deploy/pack.sh's (`bun server/env-keys.js` prints these
// three lines for it). An Extension gets the keys named <NAME>_…, so none may be named for one's first part (v2.2 §3).

// A deploy needs these (deploy/local.env).
export const ENV_KEYS = ['PUBLIC_HOST', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OPERATOR_EMAILS', 'OPERATOR_CONTACT']
// Passed on when set: Continue with email stays hidden until SMTP_HOST and EMAIL_FROM are (SMTP_PORT defaults to 25;
// SMTP_USER and SMTP_PASS log in to a mail service over TLS), with PUBLIC_HOST above. TRUSTED_PROXIES is only for
// a proxy on a public address: the shared Caddy is on the LAN, which the app trusts already.
export const OPTIONAL_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'TRUSTED_PROXIES']
// Every key the core reads: those, the Extensions' entry modules (EXTENSIONS, which a deploy writes from
// EXTENSION_REPOS), and server/main.js's config path.
export const CORE_ENV_KEYS = [...ENV_KEYS, ...OPTIONAL_ENV_KEYS, 'EXTENSIONS', 'EXTENSION_REPOS', 'COUNT_DRACULA_CONFIG']

if (import.meta.main) for (const keys of [ENV_KEYS, OPTIONAL_ENV_KEYS, CORE_ENV_KEYS]) console.log(keys.join(' '))
