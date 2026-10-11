// "⬇ Export event" (spec §6): one row per kid, then a half-hour summary.
import { toBuckets } from '../shared/night-maths.js'

const KID_COLUMNS = 'number,tapped_at,received_at,tag,source,deleted,phone,late'
const SUMMARY_COLUMNS = 'half_hour_start,half_hour_end,kids'

// night: { name, clockShiftMs, kids: [{ number, tappedAt, receivedAt, tag, source, deletedAt, phoneName, late }] }
export function toCsv(night) {
  const kids = night.kids.map((k) =>
    [k.number, stamp(k.tappedAt), stamp(k.receivedAt), k.tag ?? '', k.source, k.deletedAt ? stamp(k.deletedAt) : '', k.phoneName ?? '', k.late ? 'late' : '']
      .map(cell)
      .join(','),
  )
  const kept = night.kids.filter((k) => !k.deletedAt).map((k) => k.tappedAt)
  const summary = toBuckets(kept, night.clockShiftMs).map((b) => `${b.start},${b.end},${b.count}`)
  return [`event,${cell(night.name)}`, KID_COLUMNS, ...kids, '', SUMMARY_COLUMNS, ...summary].join('\n') + '\n'
}

// Local time, readable in a spreadsheet: 2026-10-31 18:42:10.
function stamp(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function cell(value) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
