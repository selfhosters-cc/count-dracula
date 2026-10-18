# The Extension loader, its `core` and its addresses

Type: build (AFK)
Status: done
Blocked by: —

## What to build

The core can start Extensions it doesn't contain. See [v2.2 §3–4](../spec-v2.2.md#3-loading-an-extension) and [ADR 0001](../../../docs/adr/0001-extensions.md). With `EXTENSIONS` unset, nothing changes.

- **`startServer({ extensions: [...] })`**, and `server/main.js` filling it from the **`EXTENSIONS`** env key (entry-module paths, imported at boot).
- **The entry module:** `{ name, owns, migrations, start(core) → { handle(req, url), stop() } }`. Check `name` (`/^[a-z][a-z0-9]*$/`) and refuse a collision with another Extension or any core path. This ticket only accepts `owns` and `migrations`; [66](66-extension-tables-and-deletion.md) acts on them.
- **`core`:** `db`, `ledger`, `guard` (`read`, `manager`, `operator`, `take`), `clientIp(req)`, `serve(req, path)`, `now`, `log`, `env` (only `<NAME>_*`), `switches` (read-only), `siteSwitch` / `setSiteSwitch` (only `<name>.` keys). Nothing else.
- **Boot order:** Ledger and core migrations, then per Extension (list order): record, migrate, `start`. Then listen. A throw anywhere in that stops the server.
- **Addresses:** `route()` hands `/<name>`, `/<name>/…`, `/api/<name>` and `/api/<name>/…` to `handle`, behind the core's wrapper (cross-site refusal, security headers and CSP, error counting). A throw in `handle` is a counted 500.
- **Its `public/` folder:** when `handle` returns nothing, serve `public/` at `/<name>/…` (`/<name>` → `index.html`), templated and stamped like a core page, never `*.test.js`, nothing outside the folder. `core.serve(req, 'index.html')` gives the same templated page for any other address.
- **`handle`'s own `Cache-Control` is kept**; the wrapper sets only the security headers.
- **`app.stop()`** calls each `stop()` after the core's own timers.
- **A fixture Extension** under `test/` (e.g. `test/fixture-extension/`) for the core's tests. It describes no real Extension.

## Acceptance criteria

- [x] With `EXTENSIONS` unset, every existing test passes unchanged
- [x] The fixture's `handle` gets `GET /fixture/x` and `POST /api/fixture/y`; a cross-site POST to it is refused before `handle` runs; its responses carry the core's CSP
- [x] `GET /fixture` serves its `public/index.html` with `__VERSION__` filled; `GET /fixture/a.test.js` and `GET /fixture/../server/app.js` are 404
- [x] `core.serve(req, 'index.html')` from `handle` for `/fixture/abc123` gives the same templated page
- [x] A `Cache-Control` set by `handle` reaches the client unchanged
- [x] `core.env` holds only `FIXTURE_*` keys; `setSiteSwitch('other.x')` throws
- [x] `guard.manager` in an Extension route gives 401 signed out and 403 Suspended, as in a core route
- [x] A bad name, a name of `api`, `setup` or `door`, two Extensions with one name, and a throw in `start` each stop `startServer`
- [x] A throw in `handle` is a 500 counted on the health strip, and the server keeps serving
- [x] `app.stop()` calls the fixture's `stop()`
- [x] `bun test` passes
