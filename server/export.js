// "⬇ Export event" (spec §6): one row per kid, then a half-hour summary in the shape the ghost seed
// reads, so the Nov 1 export can seed next year's counts-only event as it is (config ghostSeed: the CSV).
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

// The ghost seed a past export makes: { name, buckets: [{ start, end, count }] }.
export function ghostSeedFromCsv(text) {
  const lines = text.split(/\r?\n/)
  const name = parseRow(lines[0])[1]
  const from = lines.indexOf(SUMMARY_COLUMNS)
  if (from < 0) throw new Error('No half-hour summary in this export')
  const buckets = lines
    .slice(from + 1)
    .filter(Boolean)
    .map((line) => {
      const [start, end, count] = parseRow(line)
      return { start, end, count: Number(count) }
    })
  return { name, buckets }
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

function parseRow(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted && c === '"' && line[i + 1] === '"') (current += '"'), i++
    else if (c === '"') quoted = !quoted
    else if (c === ',' && !quoted) cells.push(current), (current = '')
    else current += c
  }
  cells.push(current)
  return cells
}
