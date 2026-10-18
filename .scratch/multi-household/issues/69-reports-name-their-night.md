# Reports name their night

Type: build (AFK)
Status: done
Blocked by: —

## What to build

See [v2.2 §9](../spec-v2.2.md#9-reports-name-their-night).

- **Each Report in `/operator`'s Household detail names its night:** *"⚑ Oct 31, 9:14 pm · Halloween 2026: reason"* (or *"(no reason given)"*). `/api/operator`'s detail adds the Event's name for each Report; one whose Event is gone says *"(a deleted night)"*.
- **`privacy.html`, "How long":** *"If someone reports a page, the reason they give is deleted when the report is dealt with."* (was "a shared page"), and the notice's "Updated" date.
- **CONTEXT.md's Report** no longer says "share page" only (done with the spec).

## Acceptance criteria

- [x] A Report from a share page shows its Event's name and date on `/operator`
- [x] A Report whose Event was deleted shows "(a deleted night)" and can still be dismissed
- [x] `/privacy` says "reports a page"
- [x] `bun test` passes
