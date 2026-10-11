// "⬇ Export event" (spec §6): one row per kid, then a half-hour summary.
import { stamp, toBuckets } from '../shared/night-maths.js'

const KID_COLUMNS = 'number,tapped_at,received_at,tag,source,deleted,phone,late'
const SUMMARY_COLUMNS = 'half_hour_start,half_hour_end,kids'

// night: { name, clockShiftMs, timeZone, kids: [{ number, tappedAt, receivedAt, tag, source, deletedAt, phoneName, late }] }
export function toCsv(night) {
  const kids = night.kids.map((k) =>
    [k.number, stamp(k.tappedAt, night.timeZone), stamp(k.receivedAt, night.timeZone), k.tag ?? '', k.source, k.deletedAt ? stamp(k.deletedAt, night.timeZone) : '', k.phoneName ?? '', k.late ? 'late' : '']
      .map(cell)
      .join(','),
  )
  const kept = night.kids.filter((k) => !k.deletedAt).map((k) => k.tappedAt)
  const summary = toBuckets(kept, night.clockShiftMs, night.timeZone).map((b) => `${b.start},${b.end},${b.count}`)
  return [`event,${cell(night.name)}`, KID_COLUMNS, ...kids, '', SUMMARY_COLUMNS, ...summary].join('\n') + '\n'
}

function cell(value) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
