# Browser security headers

Type: build (AFK)
Status: done
Blocked by:

## What to build

The same security headers go on every app response, and inline scripts move out. See [spec §15 Browser security headers](../spec.md#15-hosting-capacity-and-abuse).

- On every response (pages, API, static files, SSE):
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
- Move the inline `<script type="module">` blocks in `index.html`, `setup.html` and `tally.html` to `.js` files.
- HSTS stays with Caddy.
- **Later tickets** add no inline scripts and no third-party script hosts.

## Acceptance criteria

- [x] A test checks the three headers on a page, an API route, a static file and the stream
- [x] No inline `<script>` left in `public/*.html`
- [x] The phone page, `/setup`, `/tv`, the tally sheet and the kiosk downloads all work with no CSP errors in the console (checked in the browser)
- [x] `bun test` passes

## Notes from the build

- `withSecurityHeaders` in `server/app.js` sets the three headers on every response, whatever route made it (pages, API, static files, the stream, redirects, 404s).
- The inline modules moved to `public/index.js`, `public/setup.js` and `public/tally.js`; the tally sheet's `onclick="print()"` became a listener. `server/headers.test.js` fails on any inline `<script>` or `on…=` handler in `public/*.html`.
- `public/sounds/audition.html` (the dev-only sound audition page from v1) still has inline script and won't run under the CSP; it isn't linked from anything.
- Checked in the browser: `/`, `/setup` (with the map open and the full-screen QR), `/tally`, a bare `/tv`, a TV link, `/signup` and `/help/tv` load with no CSP errors; the kiosk download carries the headers.
- `form-action` also covers the redirect after the sign-up form, so only Google itself can be the sign-in destination. (The dev-only stand-in Google on another port no longer works from a browser.)
