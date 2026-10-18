# Deploying Extensions

Type: build (AFK)
Status: open
Blocked by: 65

## What to build

`deploy.sh` can ship private Extensions with the core. See [v2.2 §11](../spec-v2.2.md#11-deploying-developing-and-testing). With `EXTENSION_REPOS` unset, a deploy is exactly as today.

- **`EXTENSION_REPOS`** in `deploy/local.env` (optional; `local.env.example` gets a commented line with a fake path) lists private checkouts.
- **For each:** run its `bun test` after the core's and refuse to ship on a failure; copy each Extension's folder, without `*.test.js`, into the tarball at `extensions/<name>/`; set `EXTENSIONS` to their entry modules under `/opt/count-dracula/extensions/`; pass their `<NAME>_*` keys from `local.env` into `/etc/count-dracula/env`.
- **How a checkout names its Extensions** is the builder's choice (a list at its root, or every top-level folder with an entry module). A dirty private checkout is refused, as the public one is.
- **`REVISION`** lists the core's commit and each checkout's.
- **One version per deployment:** the public patch bump and tag, even for a private-only change.
- **The README:** one short paragraph after "or host it yourself": countdracula.cc runs a few hosted-only features as Extensions; the seam is in ADR 0001, documented and unsupported, with no promise of stability.
- **`deploy/RUNBOOK.md`:** a line in the deploy section on `EXTENSION_REPOS`, and that rollback swaps Extensions with the core.

## Acceptance criteria

- [ ] With `EXTENSION_REPOS` unset, the tarball and `/etc/count-dracula/env` are as before (a dry run, or a test of the packaging step)
- [ ] With a checkout of the fixture: its tests run, a failing one stops the deploy, the tarball holds `extensions/fixture/` with no `*.test.js`, `EXTENSIONS` and `FIXTURE_*` reach the env file, and `REVISION` has both commits
- [ ] No real path, hostname or LAN address is committed
- [ ] `bun test` passes
