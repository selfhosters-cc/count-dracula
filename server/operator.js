// /operator's rules (v2 spec §13): each Household's status, and the health strip's tiles with their
// amber/red rules. Pure, so the rules are tested with fake counters and a fake clock.
const MINUTE = 60_000
const ACTIVE_MS = 30 * MINUTE // the same 30-minute window as nearby: only a counted kid is activity
const RECENT_MS = 10 * MINUTE
const BACKUP_LATE_MS = 30 * MINUTE // 2× the 15-minute interval
const RSS_LIMIT = 1024 * 1024 * 1024 // LXC 118's 1 GB
const RSS_AMBER = 800 * 1024 * 1024

// Spec v2.1 §10, in the order /operator sorts them.
export const STATUSES = ['Counting', 'Stale', 'Waiting', 'Ended', 'No night']

// door: { state: 'live' | 'ended' | null, kids, lastKidAt } for the Household's door's Event (state null:
// nothing open). Counting is an Active Household: a kid in the last 30 minutes, Live or Ended (a late kid).
export function householdStatus({ state, kids, lastKidAt }, now) {
  if (state == null) return 'No night'
  if (lastKidAt != null && now - lastKidAt <= ACTIVE_MS) return 'Counting'
  if (state === 'ended') return 'Ended'
  return kids ? 'Stale' : 'Waiting'
}

// The health strip, left to right. Each tile: { key, label, value, detail, level: 'ok' | 'amber' | 'red' }.
export function healthTiles(s, now) {
  const ago = (at) => (at == null ? 'never' : relative(now - at))
  const recent = (at) => at != null && now - at <= RECENT_MS
  const counting = s.statusCounts.Counting > 0
  return [
    {
      key: 'live',
      label: 'Households',
      value: STATUSES.map((status) => `${s.statusCounts[status]} ${status}`).join(' · '),
      level: 'ok',
    },
    {
      key: 'connections',
      label: 'Connections',
      value: `${s.connections.phones} phones · ${s.connections.tvScreens} TV screens · ${s.connections.total} of ${s.cap}`,
      level: s.connections.total >= s.cap ? 'red' : s.connections.total >= s.cap * 0.8 ? 'amber' : 'ok',
    },
    {
      key: 'refused',
      label: 'Refused',
      value: `${s.refusals.total} since start`,
      detail: `last ${ago(s.refusals.lastAt)}`,
      level: recent(s.refusals.lastAt) ? 'amber' : 'ok',
    },
    {
      key: 'errors',
      label: 'Errors',
      value: `${s.errors.total} since start`,
      detail: s.errors.last ? `${s.errors.last}, ${ago(s.errors.lastAt)}` : 'none',
      level: recent(s.errors.lastAt) ? 'red' : 'ok',
    },
    {
      key: 'lastTap',
      label: 'Last tap',
      value: ago(s.lastTapAt),
      level: counting && (s.lastTapAt == null || now - s.lastTapAt > RECENT_MS) ? 'amber' : 'ok',
    },
    {
      key: 'backup',
      label: 'Backup',
      value: s.backups ? ago(s.backupAt) : 'off (no backupDir)',
      level: s.backups && (s.backupAt == null || now - s.backupAt > BACKUP_LATE_MS) ? 'amber' : 'ok',
    },
    {
      key: 'server',
      label: 'Server',
      value: `up ${relative(now - s.startedAt, '')} · ${Math.round(s.rssBytes / 1024 / 1024)} MB of ${RSS_LIMIT / 1024 / 1024}`,
      detail: `switches: ${Object.entries(s.switches).map(([name, on]) => `${name} ${on ? 'on' : 'off'}`).join(', ')}`,
      level: s.rssBytes > RSS_AMBER ? 'amber' : 'ok',
    },
  ]
}

// "4 min ago", "2 h 5 min ago".
function relative(ms, suffix = ' ago') {
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 1) return suffix ? 'just now' : 'under a minute'
  const h = Math.floor(minutes / 60)
  return `${h ? `${h} h ` : ''}${minutes % 60} min${suffix}`
}
