# The core can load Extensions it doesn't contain

countdracula.cc runs hosted-only features (the first is the Showcase, a public world map of nights) from a private repo, on top of this open, self-hostable core. A self-hosted install runs none of it and loses nothing: those features only mean anything with many Households. So that the hosted features don't fork the core, `startServer` takes an `extensions` option, which `server/main.js` fills from the `EXTENSIONS` env key, a list of entry modules imported at boot. It is not a general plugin system, and nothing in the core moves out into one: the seam holds only what the first Extension needs. It's documented for honesty and unsupported outside countdracula.cc, with no promise of stability.

## Considered Options

The choices a reader might "fix":

- **The core enforces deletion, not the Extension.** An Extension declares which of its tables hold a `household_id` or `event_id`. The core records that in the database and deletes those rows in the same transaction as Delete Household, Delete Event and Reset, as it does for share links. A callback was rejected: `deploy/redelete.js` runs without Extensions, and a broken or removed Extension would leave rows behind. SQLite reuses ids, so a leftover row would attach to someone else's night.
- **An Extension owns a name, not routes.** It gets every request under `/<name>` and `/api/<name>` through one `handle`, behind the core's own wrapper (cross-site refusal, headers, error counting), plus a static folder served at `/<name>/`. An exact-key route table can't hold `/showcase/<entry id>`, and a pattern router would be a second router to keep safe.
- **Core data only through the Ledger.** An Extension gets `db` for its own `<name>_` tables (run by its own migration counter, after the core's), but reads Events, Households and counts through Ledger methods, never its own SQL. A private repo shouldn't break when a public table changes.
- **Named slots, not named features.** Core pages carry empty slots an Extension's browser module may fill, so the public pages never mention a feature self-hosters can't have.
- **What an Extension can't do.** It can't loosen the CSP, pass a request outside its prefixes, or keep its own settings file: its settings are env keys prefixed with its name, and anything flipped live is a `site_switches` key under its name. The core knows nothing about plans. An Extension that charges per Household someday decides with its own tables, since every Manager request already names the Household.

## Consequences

An Extension runs with the core's full trust. Its credential rules are checked by its own repo's tests, modelled on `server/credentials.test.js`. The core enforces only the structure: prefixes, table names and deletion. A deploy that ships Extensions runs their tests too and refuses to ship on a failure. There's no pinned core version: both suites run against exactly what ships.
