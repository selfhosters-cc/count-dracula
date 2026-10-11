# Browser security headers

Type: build (AFK)
Status: ready-for-agent
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

- [ ] A test checks the three headers on a page, an API route, a static file and the stream
- [ ] No inline `<script>` left in `public/*.html`
- [ ] The phone page, `/setup`, `/tv`, the tally sheet and the kiosk downloads all work with no CSP errors in the console (checked in the browser)
- [ ] `bun test` passes
