# Count Dracula — v2.2 addendum: Extensions

v2.2 adds one thing to [v2](spec.md) and [v2.1](spec-v2.1.md): **the core can load Extensions it doesn't contain.** countdracula.cc runs hosted-only features from a private repo on top of this open core. A self-hosted install sets nothing, runs no Extension and sees no change. The reasoning is in [ADR 0001](../../docs/adr/0001-extensions.md).

About this addendum:
- **Assembled:** 2026-10-18 from a private planning map for countdracula.cc's first Extension. Everything the core needs from those decisions is restated here, so nothing below depends on reading it. It makes **no new decisions** beyond the few marked **assembly call** or **builder's latitude**.
- **How to read it:** as changes on top of v2.1. **Anything not mentioned here behaves as in v2.1.** §13 lists every rule this changes.
- **Glossary:** [CONTEXT.md](../../CONTEXT.md) already has **Extension**. §2 summarises the rest.
- **Build tickets:** [issues/65–70](#12-build-order), in build order. Each deploys fix-forward as it lands, and none changes what a self-hoster sees, apart from ticket 69's wording.
- **Open questions:** none.
- **Only what the first Extension needs.** It is not a general plugin system, and nothing in the core moves out into one. The seam is **documented and unsupported**: one paragraph in the README, with no promise of stability.

## Contents

1. [Dates](#1-dates)
2. [Domain model changes](#2-domain-model-changes)
3. [Loading an Extension](#3-loading-an-extension)
4. [Its addresses](#4-its-addresses)
5. [Its tables](#5-its-tables)
6. [Deleting what it owns](#6-deleting-what-it-owns)
7. [Reading core data: the night-card read](#7-reading-core-data-the-night-card-read)
8. [Page slots and the privacy notice](#8-page-slots-and-the-privacy-notice)
9. [Reports name their night](#9-reports-name-their-night)
10. [Settings](#10-settings)
11. [Deploying, developing and testing](#11-deploying-developing-and-testing)
12. [Build order](#12-build-order)
13. [What changes from v2.1](#13-what-changes-from-v21)
14. [Where it lands in the code, and builder's latitude](#14-where-it-lands-in-the-code-and-builders-latitude)
15. [Out of scope](#15-out-of-scope)

---

## 1. Dates

| When | What happens |
|---|---|
| Oct 18 | Decisions (done) |
| From Oct 19 | Build tickets 65–70, in [build order](#12-build-order). Each deploys as it lands. Aim: all live by **Oct 23** |
| After 65–70 | countdracula.cc's first Extension can deploy. Its own plan has its own dates |
| **Sat Oct 31, 3 pm–midnight** | **The only change freeze**, as in v2 |

---

## 2. Domain model changes

([CONTEXT.md](../../CONTEXT.md) holds the full definitions.)

| Term | v2.2 |
|---|---|
| **Extension** | New. Private code a deployment runs on top of the core, named in the server's settings and started with it. It owns the addresses under its name, keeps its own tables, and leaves no trace of a Household or Event once the core deletes it. |
| **Report** | Can come from any public page that shows a night, not only a share page. Each Report on `/operator` names its night ([§9](#9-reports-name-their-night)). |

---

## 3. Loading an Extension

- **`startServer` takes an `extensions: [...]` option**, a list of entry modules. `server/main.js` fills it from the **`EXTENSIONS`** env key: a list of entry-module paths, imported at boot. Tests pass the option directly. With the key unset, the list is empty and nothing below happens.
- **An entry module exports** `{ name, owns, migrations, start(core) }`:
  - `name`: lower-case letters and digits (`/^[a-z][a-z0-9]*$/`). It must not collide with another Extension or with any core path (`/api`, `/door`, `/setup`, `/shared`, `/vendor`, …). Nor may it be the first part of a core table or index (`extension_owns`, `event_devices`, …: its steps may touch `<name>_…`) or of a core env key (`GOOGLE_CLIENT_SECRET`, `SMTP_PASS`, …: its `env` is `<NAME>_*`; the core's keys are listed once, in `server/env-keys.js`).
  - `owns`: which of its tables hold a Household or Event id ([§6](#6-deleting-what-it-owns)).
  - `migrations`: its own list of steps ([§5](#5-its-tables)).
  - `start(core)` returns `{ handle(req, url), stop() }`.
- **What `core` holds**, and nothing more:
  - `db`, for the Extension's own tables only.
  - `ledger`, for every read and write of core data ([§7](#7-reading-core-data-the-night-card-read)).
  - `guard`: the core's own `read`, `manager` and `operator` wrappers, unchanged, so an Extension's routes keep the same 401/403, Suspended and renewal rules. Plus **`take(rule, key)`**, the core's rate limiter, so an Extension can share a core rule (a Report's 5 per IP per day).
  - `clientIp(req)`: the address the core's own limits key on (behind Cloudflare and Caddy). **Assembly call:** a Report route needs it, and `handle` has no `server`.
  - `serve(req, path)`: serves one file of the Extension's `public/` folder, templated like a core page ([§4](#4-its-addresses)), for an address that isn't that file's own (`/<name>/<id>`).
  - `now`, `log` (lines go to the journal, as the core's do).
  - `env`: only the Extension's own `<NAME>_*` keys.
  - `switches`: the `config.json` switches, read-only.
  - `siteSwitch(key)` / `setSiteSwitch(key, value)`: only keys under `<name>.`.
  - There's no hub, no Ledger observer and no way to change the CSP. Anything else is added only when a ticket needs it.
- **Boot order:** the core opens the Ledger and runs its own migrations. Then, for each Extension in list order, it records `owns`, runs `migrations` and calls `start`. Only then does it listen.
- **Failures:**
  - **A throw at boot stops the server**, so `/healthz` never answers and the deploy rolls back. That covers a bad name, a collision, a failed migration and a throw in `start`.
  - **A throw in `handle`** goes through the core's wrapper like a throw in a core route: a 500, counted on `/operator`'s health strip.
- **`app.stop()` calls each Extension's `stop()`**, after stopping the core's own timers, so tests don't leak.
- **Runtime code imports nothing from the core's `server/`.** An Extension's browser code uses URLs (`/shared/…`, `/vendor/…`). Only its tests import core files, by relative path.

---

## 4. Its addresses

- **An Extension owns `/<name>`, `/<name>/…`, `/api/<name>` and `/api/<name>/…`.** `route()` hands every request under them to its `handle(req, url)`, behind the core's wrapper: the cross-site refusal for non-GETs, the security headers and CSP, error counting.
- **When `handle` returns nothing**, the core serves the Extension's `public/` folder at `/<name>/…`, as it serves `public/`:
  - `/<name>` serves `public/index.html`.
  - HTML is templated (`__CONTACT__`, `__ORIGIN__`, `__VERSION__`) and stamped (`?v=`), and JS imports are stamped, like core pages. `*.test.js` is never served.
  - Nothing outside that folder is reachable.
- **`handle`'s own `Cache-Control` is kept.** The wrapper sets the security headers only, so an Extension can stream a large file (with range requests, as `new Response(Bun.file(…))` gives) with its own caching.
- **One CSP for everything.** An Extension can't loosen it. Its scripts, styles, images and data are all `'self'`.
- Visits to an Extension's pages aren't counted ([§15](#15-out-of-scope)).

---

## 5. Its tables

- **An Extension's tables and indexes are named `<name>_…`**, created through `core.db` by its own `migrations`.
- **Its own counter:** a new core table, **`extension_versions (name TEXT PRIMARY KEY, version INTEGER NOT NULL)`** (a core migration). An Extension's steps run from its row, after the core's, **one transaction per step**, bumping its row inside it, as `user_version` works.
- **The core checks each step.** It compares `sqlite_master` before and after, and refuses to boot if a step created, dropped or changed anything not named `<name>_…`.
- **Add-only once live**, like the core's own list.
- Backups, `deploy/copy-db.js` and `deploy/pull-backup.sh` carry the tables already: it's the same file.

---

## 6. Deleting what it owns

SQLite reuses a deleted Household's or Event's id and no foreign keys are enforced, so a row left behind would attach to someone else's night. **The privacy promise is the core's guarantee**, and it holds even if an Extension is broken or removed.

- **`owns`** maps each of the Extension's tables to its Household and Event columns, e.g. `{ <name>_entries: { household: 'household_id', event: 'event_id' } }`. Either column may be left out.
- **The core records `owns` in the database** at boot (a core table, e.g. `extension_owns (tbl, household_col, event_col)`), replacing that Extension's rows. A table not named `<name>_…`, or a column it doesn't have, stops the boot.
- **The core deletes from every recorded table, in the same transaction**, as it already does for `share_links`:
  - **Delete Household**: every row with that Household's id (`accounts.deleteHousehold`, so also `deploy/redelete.js`, which runs **with no Extension loaded** and reads the recorded tables).
  - **Delete Event**: every row with that Event's id (`removeEvent`, so also clearing the estimate).
  - **Reset**: every row with that Event's id.
- **A recorded table that no longer exists** (an Extension removed with its tables dropped) is skipped, never an error.
- The Idle Household and Abandoned sign-up purges, when they're built, go through `accounts.deleteHousehold` and get this for free.

---

## 7. Reading core data: the night-card read

- **Core data is read only through Ledger methods**, never an Extension's own SQL on core tables. A private repo shouldn't break when a public table changes.
- **One new batched read, `ledger.nightCards(eventIds)`**, for a page that shows many nights at once (a full `summary()` loads every kid row, which is too heavy per night on a map). For each Event id that exists, one card:

| Field | What it is |
|---|---|
| `eventId`, `householdId` | |
| `state` | Upcoming, Live, Ended or Past |
| `countsOnly` | imported or estimated counts, with no night behind them |
| `kids` | the total, as the Night summary counts it |
| `area` | the Household's **current** Area (the 4-character parent of its Location), or null with no Location. Never the cell |
| `date` | the **local date the night went live** (`YYYY-MM-DD`), in the Household's **current** time zone. Null if it never went live |
| `topCostume` | the top costume as the Night summary picks it, as typed, with its emoji. Null with none |
| `peak` | the busiest half-hour as the Night summary words it (e.g. "8:00–8:30 pm"). Null with no kids |
| `vsLast` | the signed gap to its Race against's total, or null when it races None. Never the other Event's name |
| `name` | the Household's **current** display name |
| `suspended` | the Household is Suspended |
| `eligible` | **Ended or Past, not counts-only, at least one kid, and a Location set**. `why` names the first failing rule when false (`not-over`, `counts-only`, `no-kids`, `no-location`) |

- **The card agrees with the share page.** For any Event, `kids`, `topCostume` and `peak` equal what `nightFacts(summary(eventId))` gives (a test checks it).
- **The single-night view** uses the existing `summary(eventId)` with the caller's own name rule, and `ledger.addReport` stores a Report ([§9](#9-reports-name-their-night)).
- **Listing a Household's Events** (for a Manager's own nights) uses the reads `/setup` already has.

---

## 8. Page slots and the privacy notice

Core pages carry **named slots** an Extension may fill, so the public pages never name a feature a self-hoster can't have. With no Extension, every slot is empty and every page looks as in v2.1.

### The mechanism

- **A slot is a function the core calls as it renders**, not an element filled once: `/setup` rebuilds on every change, and the summary's slides are built in JS. A core page calls **`slot(name, ctx)`** where the slot sits and puts in the nodes that come back (an array, possibly empty).
- **`/extensions.js`**, served by the core, exports `slot`. It imports each Extension's `public/slots.js` (when it has one), whose named exports are slot functions: `export function 'setup.nightTools'`-style keys, or an exported object of them (builder's latitude).
- **An Extension can't break a core page.** **Assembly call:** a `slots.js` that fails to load leaves every slot empty, and a slot function that throws is logged to the console and gives nothing. The page renders on.
- **`ctx.refresh()`** asks the page to render again, for a slot whose status arrives later (as `/api/shares` feeds Sharing).

### The slots

| Slot | Where | ctx |
|---|---|---|
| `setup.nightTools` | `tools()` in `public/setup-night.js`, after Sharing: wherever Sharing shows, so a night's screen and the Tonight door card | `{ event: { id, state }, household: { id }, refresh }` |
| `summary.closing` | The Manager's `/summary` closing slide, after Share (`public/summary.js`), **not** the public share page. It doesn't depend on the `shareLinks` switch that hides Share | `{ eventId }` |
| `home` | The homepage: a line under the Site-wide line, and a footer link between "Privacy and House rules" and "TV setup help". The same for everyone, signed in or not | `{ signedIn, place: 'line' \| 'footer' }` |
| `operator.household` | A Household's detail on `/operator` | `{ household: { id }, refresh }` |
| `operator.site` | Beside Pause sign-ups on `/operator` | `{ refresh }` |

(`home`'s `place` is an **assembly call**: one slot with two spots needs to know which one it's filling.)

### The privacy notice

- **`__EXTENSIONS_PRIVACY__`**, filled server-side by `serveStatic` for `privacy.html`, is one more item in **"What's public"**, just before "Never public". Each Extension may give one HTML fragment (an `<li>`). With none it's empty.
- Where the fragment comes from (an export on the entry module, or a file in its `public/`) is **builder's latitude**.
- **The "Updated" date** shows the later of the core's own date and the date the Extension gives with its fragment, so the notice dates itself when a deployment's Extension changes what's public. **Assembly call** (builder's latitude on the shape).

---

## 9. Reports name their night

- **Each Report on `/operator` names its night:** *"⚑ Oct 31, 9:14 pm · Halloween 2026: reason"*. The Event's name comes from the Report's `event_id`; one since deleted says *"(a deleted night)"*.
- A Report doesn't record which page it came from. A share page and an Extension's page show the same night, so the fix is the same either way.
- **The privacy notice's "How long" line** becomes *"If someone reports a page, the reason they give is deleted when the report is dealt with."* (was "a shared page").

---

## 10. Settings

- **No `config.json` block.** An Extension's settings are **`<NAME>_*` env keys** in `deploy/local.env`, and `core.env` holds only those.
- **Anything flipped live** (an Operator's emergency switch) is a **`site_switches`** key under `<name>.`, through `core.siteSwitch` / `core.setSiteSwitch`.
- **Big data files live outside the install**, at a path an env key names, staged by the Extension's own scripts. `/opt/count-dracula` is replaced on every deploy.

---

## 11. Deploying, developing and testing

### Deploy

- **`EXTENSION_REPOS`**, a new optional `deploy/local.env` key, lists private checkouts. With it unset, `deploy.sh` behaves as in v2.1.
- **For each checkout**, `deploy.sh`:
  1. runs its **`bun test`**, and refuses to ship on a failure (after the core's own tests);
  2. copies each of its Extensions' folders, **without `*.test.js`**, into the tarball at **`extensions/<name>/`**;
  3. sets **`EXTENSIONS`** to their entry modules under `/opt/count-dracula/extensions/`;
  4. passes their **`<NAME>_*` keys** through to `/etc/count-dracula/env`, beside `ENV_KEYS`.
- **How a checkout names its Extensions** (a one-line list at its root, or every top-level folder with an entry module) is builder's latitude.
- **One version per deployment:** the public patch bump and tag, even for a private-only change. **`REVISION`** records every commit that shipped: the core's and each checkout's.
- **Rollback** swaps the Extensions with the core, as it swaps `/opt/count-dracula`. Migrations don't roll back, as in v2.1.
- The `Dockerfile` and `compose.yaml` are unchanged: self-hosters run no Extension.
- **The README** gains one short paragraph: the seam exists, it's how countdracula.cc runs its hosted-only features, it's documented in ADR 0001 and unsupported, with no promise of stability.

### Develop and test

- **The checkouts sit side by side.** There's no pinned core version: both suites run against exactly what ships.
- **Dev:** `EXTENSIONS=../<private checkout>/<name>/index.js bun server/main.js`.
- **A private repo's tests** use its own `bunfig.toml` preloading `../count-dracula/test/preload.js`, and call `startServer({ extensions: [ext], … })` with the core's fakes (`test/fake-google.js`, `test/sign-in.js`, …), over HTTP plus a read-only `Database`.
- **The core's own tests** use a tiny fixture Extension under `test/` to cover the loader, addresses, tables, deletion, slots and the privacy fragment. No real Extension is ever in the public repo.

### Security

An Extension runs with the core's full trust. **The core enforces only structure**: its addresses, its table names, deletion, the wrapper on every request, and the one CSP. Its own rules (a guard on every route, public reads listed explicitly, body size limits like the core's, escaping anything rendered from user text) are checked by **its own repo's "every route carries a credential" test**, modelled on `server/credentials.test.js`.

---

## 12. Build order

The tickets live in `issues/`, in v2's shape. **Build in number order** unless a ticket is blocked. All are AFK and deploy fix-forward as they land: with `EXTENSIONS` unset, none changes what anyone sees, apart from ticket 69's wording.

| # | Ticket | Type | Blocked by |
|---|---|---|---|
| 65 | [The Extension loader, its `core` and its addresses](issues/65-extension-loader.md) | AFK | — |
| 66 | [Extension tables and the ownership registry](issues/66-extension-tables-and-deletion.md) | AFK | 65 |
| 67 | [The night-card read](issues/67-night-card-read.md) | AFK | — |
| 68 | [Page slots and the privacy fragment](issues/68-page-slots.md) | AFK | 65 |
| 69 | [Reports name their night](issues/69-reports-name-their-night.md) | AFK | — |
| 70 | [Deploying Extensions](issues/70-deploying-extensions.md) | AFK | 65 |

- **Every deploy starts with a timestamped DB copy**, and its migrations only add (66 adds two core tables).
- **Cut rule:** none of 65–70 can be cut on its own: the first Extension needs all six. If they aren't live by **Oct 31, 3 pm**, nothing here ships during the freeze. They carry on from Nov 1.

---

## 13. What changes from v2.1

| v2.1 | v2.2 |
|---|---|
| `startServer` takes no modules; every route is in one table | An `extensions` option, filled from `EXTENSIONS`; an Extension owns `/<name>` and `/api/<name>` ([§3](#3-loading-an-extension), [§4](#4-its-addresses)) |
| One migration list on `user_version` | Plus `extension_versions`, one row per Extension ([§5](#5-its-tables)) |
| Delete Household, Delete Event and Reset delete core rows (and `share_links`) | Plus every table an Extension recorded in `owns`, in the same transaction, also in `redelete.js` ([§6](#6-deleting-what-it-owns)) |
| A night is read one at a time (`summary()`) | Plus `ledger.nightCards(eventIds)` ([§7](#7-reading-core-data-the-night-card-read)) |
| Core pages are closed | Five named slots and `/extensions.js`; `__EXTENSIONS_PRIVACY__` in "What's public" ([§8](#8-page-slots-and-the-privacy-notice)) |
| A Report on `/operator`: *"⚑ 9:14 pm: reason"*, from a share page | Names its night; can come from any public page showing a night ([§9](#9-reports-name-their-night)) |
| Privacy: "If someone reports a shared page…" | "…reports a page…" |
| `deploy.sh` ships the public repo only | Plus `EXTENSION_REPOS`, their tests, `extensions/<name>/`, their env keys and commits in `REVISION` ([§11](#11-deploying-developing-and-testing)) |

---

## 14. Where it lands in the code, and builder's latitude

- **`server/app.js`:** `startServer`'s new option, the `core` object (built from the guards, `clientIp`, the limiter and `serveStatic`, which today are local to the closure), the prefix dispatch in `route()` before the exact-key table, and `stop()`. `server/main.js` reads `EXTENSIONS`.
- **`server/migrations.js`:** one core step adding `extension_versions` and the `owns` table. The Extension runner sits beside `migrate()` (e.g. `migrateExtension(db, ext)`), with the `sqlite_master` check.
- **Deletion:** `accounts.deleteHousehold` (its "later tables must be added here" list), `removeEvent` and `reset` in `server/ledger.js`, and `deploy/redelete.js`. A shared helper (`deleteOwned(db, { household | event })`) keeps the three in step.
- **`ledger.nightCards`:** aggregate in SQL over `kids` and `tags`, or reuse `nightFacts` per Event on a lighter row set: builder's choice, as long as the share-page check in §7 holds and one call costs about one query per table, not one snapshot per Event.
- **Slots:** `public/setup-night.js` `tools()`, `public/summary.js` (the Manager's `closing` array, line 209), `public/home.html`/`home.js`, `public/operator.js` (the detail view and the Pause sign-ups row). `/extensions.js` is generated by the server from the loaded Extensions' names.
- **The privacy fragment:** `serveStatic`'s templating for `privacy.html` (`__EXTENSIONS_PRIVACY__`, and the date).
- **`deploy/deploy.sh`:** the test step, the tarball, `REVISION` and the env whitelist. `deploy/local.env.example` documents `EXTENSION_REPOS` with a fake path.

### Never

- A new npm dependency.
- A real hostname, a LAN address, or any description of a private Extension in the public repo: use the fixture Extension and `count-dracula.example.com`.

---

## 15. Out of scope

- **A general plugin system**, or moving core features into Extensions: ruled out ([ADR 0001](../../docs/adr/0001-extensions.md)).
- **Plans, billing and per-Household features in the core.** Every Manager request already names its Household through `guard.manager`, so an Extension can keep its own per-Household table later.
- **Ledger observers, hub events or a per-route CSP** for Extensions: nothing needs them yet.
- **Counting visits to an Extension's pages:** `VISIT_PAGES` stays the core's three. Nothing decided needs it.
- **Re-deleting Events after a backup restore.** `deletions` still logs only Households, so a restore brings back a deleted or Reset Event (and an Extension's rows for it). Accepted for now, as in v2. Whether the core should log Event deletes is its own question.
- **Found while planning, not in this addendum:** on the Manager's `/summary`, pressing Share re-sends the closing slide's "Show our name" box, which defaults to checked, so a name hidden in `/setup` comes back. A core bug to fix on its own.
