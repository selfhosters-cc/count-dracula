# Kid numbers under undo and late taps

Type: grilling (HITL)
Status: open
Blocked by:

## Question

How is a kid's number ("YOU'RE KID #N!", "#N 🧙" on the phone, milestones, golden tickets) assigned, and does it hold steady when kids are removed or taps arrive late?

This came up while assembling the [v1 spec](../spec.md). The tickets imply that a number is the running count at the moment a tap reaches the server: [Failure fallback](11-failure-fallback.md) talks of a golden number "going to a late tap" and milestones "crossed by late taps". But the chart orders kids by `tapped_at`, and nothing decides these points:

- **Undo or delete after a number is shown:** kids #56 and #57 are tapped and #57 is undone. Is the next kid #57 again? Does Recent renumber?
- **A golden winner undone** (a mis-tap, or the prize was already handed over): does the ticket come back as hidden, stay won, or roll forward? Same question for a milestone or Beat last year that has already fired.
- **"NEXT KID IS GOLDEN" with taps in flight:** the banner is computed from the server count. Is that good enough when another phone holds queued taps?
- **Recap and CSV numbering:** which order do they use, arrival or `tapped_at`?

Fold the answer into the spec's §2 (domain model), §8 (celebration rules) and §9 (golden tickets), and remove the §15 open-question entry.
