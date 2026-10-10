# Kid numbers under undo and late taps

Type: grilling (HITL)
Status: resolved
Blocked by:

## Question

How is a kid's number ("YOU'RE KID #N!", "#N 🧙" on the phone, milestones, golden tickets) assigned, and does it hold steady when kids are removed or taps arrive late?

This came up while assembling the [v1 spec](../spec.md). The tickets imply that a number is the running count at the moment a tap reaches the server: [Failure fallback](11-failure-fallback.md) talks of a golden number "going to a late tap" and milestones "crossed by late taps". But the chart orders kids by `tapped_at`, and nothing decides these points:

- **Undo or delete after a number is shown:** kids #56 and #57 are tapped and #57 is undone. Is the next kid #57 again? Does Recent renumber?
- **A golden winner undone** (a mis-tap, or the prize was already handed over): does the ticket come back as hidden, stay won, or roll forward? Same question for a milestone or Beat last year that has already fired.
- **"NEXT KID IS GOLDEN" with taps in flight:** the banner is computed from the server count. Is that good enough when another phone holds queued taps?
- **Recap and CSV numbering:** which order do they use, arrival or `tapped_at`?

Fold the answer into the spec's §2 (domain model), §8 (celebration rules) and §9 (golden tickets), and remove the §15 open-question entry.

## Answer

Resolved 2026-10-10 by grilling.

1. **A kid's number is the count at arrival.** It's the live (non-deleted) count at the moment the kid reaches the server, stored once and never rewritten.
   - The pop always matches the giant count: "YOU'RE KID #58!" appears while the TV reads 58.
   - After an undo or delete, the next kid reuses the freed number.
   - Late kids, backfill included, are numbered when they land. A backfill batch is numbered in tap-time order.
   - An unsent tap that's undone never gets a number.
   - Rejected: renumbering by tap time (numbers would change after the TV shouted them), and a counter that only goes up (the pop would stop matching the count after any undo).
2. **A golden win is final.** Once the takeover fires, the ticket stays won even if the winner is later undone or deleted.
   - The pill doesn't go back up, and the next kid to reach that number is ordinary.
   - The recap's golden card still lists the number. The gold pumpkin goes with the deleted kid.
   - Reviving the ticket would cost a second prize to fix what is usually a tapping mistake.
3. **Milestones and Beat last year fire once per event.** Each fires the first time it's crossed live. Re-crossing after an undo gets an ordinary pop. Crossed by late taps, a #100 is skipped for good, as before. The hero readout can still flip back and forth while the count dips.
4. **The server referees golden wins.**
   - Whichever tap reaches the server first takes the golden number.
   - The tapping phone still flashes its optimistic "#N" at once. The strong golden buzz and "🎫 GOLDEN — hand over the prize!" come only when the server confirms that phone's tap won. The other phone gets a normal buzz, and its flash corrects to its real number.
   - The "NEXT KID IS GOLDEN" banner shows only on phones that are **connected with an empty outbox**.
5. **Recent, the recap and the CSV use the stored number.**
   - Recent is ordered newest-arrived first and shows the tap time. Duplicate numbers after a delete are accepted; time and phone name tell them apart.
   - The CSV gains `number` and `received_at` columns.
   - The chart, ghost race, half-hour summary and peak half-hour keep using tap time.

**What follows:** no hidden ticket can ever sit below the count. Every golden number the count passes is either won live or rolled forward by a late tap, so removing kids or a backfill batch never brings a ticket back into play.

Folded into [spec.md](../spec.md) §2, §3, §4, §6, §8 and §9. §15 is removed.
