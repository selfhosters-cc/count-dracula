// /operator (v2 spec §13), built for Halloween night and checked by looking at it: the health strip, every
// Household by status, and a detail view to Rename, fix the time zone, make an Invite link or Suspend. Above
// the table, the Stats section: sign-ups, nights and the devices that joined them; each Household's nights in its detail.
// Polled every 30 s. Every name is set with textContent, never as HTML.
const $ = (id) => document.getElementById(id)
const POLL_MS = 30_000
const STATUSES = ['Counting', 'Stale', 'Waiting', 'Ended', 'No night'] // spec v2.1 §10, on the door's Event
let data = { pauseSignUps: false, health: [], households: [], now: Date.now() }
let detail = null // the open Household's /api/operator/household answer
let filter = null // a status chip, or null for all
let stats = null // the Stats section's /api/operator/stats answer
const STATS_MS = 5 * 60_000
const DAY = 24 * 60 * 60_000
const SVG = 'http://www.w3.org/2000/svg'

function say(text, isError = false) {
  $('status').textContent = text
  $('status').classList.toggle('err', isError)
  if (!isError) setTimeout(() => $('status').textContent === text && ($('status').textContent = ''), 2500)
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

async function load() {
  const res = await fetch('/api/operator')
  if (res.status === 401) location.href = '/#sign-in'
  if (!res.ok) return say(await res.text(), true)
  data = await res.json()
  if (detail) await loadDetail(detail.id)
  render()
}

// Stats change slowly: read when the page opens and every 5 minutes, not with the 30 s poll.
async function loadStats() {
  const res = await fetch('/api/operator/stats')
  if (!res.ok) return
  stats = await res.json()
  renderStats()
}

const stat = (label, value, detail) =>
  el('div', { className: 'stat' }, el('div', { className: 'k', textContent: label }), el('div', { className: 'v', textContent: value.toLocaleString() }), ...(detail ? [el('div', { className: 'd', textContent: detail })] : []))

function renderStats() {
  if (!stats) return
  const { households: h, nights: n, devices: d } = stats
  $('stats').replaceChildren(
    stat('Households', h.total, `${h.lastWeek} in the last 7 days`),
    stat('Tried the Test night', h.triedTestNight, 'counted a kid on it'),
    stat('No night yet', h.noNightYet, 'no kid outside the Test night'),
    stat('With a Location', h.withLocation, `${h.suspended} Suspended`),
    stat('Nights counted', n.counted, `${n.live} Live · ${n.ended} Ended · ${n.past} Past · ${n.upcoming} Upcoming`),
    stat('Kids', n.kids, 'outside Test nights'),
    stat('Phones', d.phones, `over ${d.nights} ${d.nights === 1 ? 'night' : 'nights'}`),
    stat('TV screens', d.tvScreens, `${d.pairedTvs} TVs paired by code`),
  )
  renderSignUps()
}

// One bar per day of the Operator's own calendar, today last. Hover a day for its count.
function renderSignUps() {
  const today = new Date(stats.now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime() - 29 * DAY
  const days = Array.from({ length: 30 }, (_, i) => ({ at: new Date(start + i * DAY + DAY / 2).setHours(0, 0, 0, 0), n: 0 }))
  for (const h of data.households) {
    const day = new Date(h.signedUpAt).setHours(0, 0, 0, 0)
    const slot = days.find((d) => d.at === day)
    if (slot) slot.n++
  }
  const W = 300, H = 90, step = W / days.length, max = Math.max(1, ...days.map((d) => d.n))
  const svg = $('signups')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  const node = (tag, attrs) => {
    const n = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    return n
  }
  const dayName = (at) => new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  svg.replaceChildren(
    node('line', { x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5 }),
    ...days.map((d, i) => {
      const g = node('g', {})
      const title = node('title', {})
      title.textContent = `${dayName(d.at)}: ${d.n} sign-up${d.n === 1 ? '' : 's'}`
      const h = (d.n / max) * (H - 4)
      g.append(title, node('rect', { class: 'hit', x: i * step, y: 0, width: step, height: H }), node('rect', { class: 'bar', x: i * step + 1, y: H - h, width: step - 2, height: h, rx: Math.min(1.5, h / 2) }))
      return g
    }),
  )
  const total = days.reduce((t, d) => t + d.n, 0)
  svg.setAttribute('aria-label', `Sign-ups per day over the last 30 days: ${total} in all, at most ${max} in one day`)
  $('signups-from').textContent = dayName(days[0].at)
}

async function loadDetail(id) {
  const res = await fetch(`/api/operator/household?id=${id}`)
  detail = res.ok ? await res.json() : null
}

async function post(path, body, done) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) return say(await res.text(), true)
  say(done)
  await load()
  return res
}

const time = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const ago = (ms) => {
  if (ms == null) return '—'
  const minutes = Math.floor((data.now - ms) / 60_000)
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`
}

function render() {
  $('health').replaceChildren(
    ...data.health.map((t) => el('div', { className: `tile ${t.level}` }, el('div', { className: 'k', textContent: t.label }), el('div', { className: 'v', textContent: t.value }), ...(t.detail ? [el('div', { className: 'd', textContent: t.detail })] : []))),
  )
  $('pause-state').textContent = data.pauseSignUps ? 'paused' : 'open'
  $('pause').textContent = data.pauseSignUps ? 'Open sign-ups' : 'Pause sign-ups'
  $('pause').className = data.pauseSignUps ? 'primary' : 'danger'

  const count = (status) => data.households.filter((h) => h.status === status).length
  $('chips').replaceChildren(
    ...[null, ...STATUSES].map((status) =>
      el('button', { textContent: `${status ?? 'All'} ${status ? count(status) : data.households.length}`, ariaPressed: String(filter === status), onclick: () => ((filter = status), render()) })),
  )
  const q = $('search').value.trim().toLowerCase()
  // Counting → Stale → Waiting → Ended → No night, the most kids first within each.
  const rows = data.households
    .filter((h) => (filter == null || h.status === filter) && h.displayName.toLowerCase().includes(q))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.kids - a.kids)
  $('households').replaceChildren(
    ...rows.map((h) =>
      el('button', { className: 'house', onclick: () => openHousehold(h.id) },
        el('span', { className: 'top' },
          el('span', { className: `status ${h.status.replace(' ', '-')}`, textContent: h.status }),
          el('span', { className: 'name', textContent: h.displayName || '(no name yet)' }),
          ...(h.reports ? [el('span', { className: 'flag', textContent: `⚑ ${h.reports}` })] : []),
          ...(h.suspendedSince ? [el('span', { className: 'tag', textContent: 'Suspended' })] : [])),
        el('span', { className: 'meta', textContent: `${h.area} · ${h.kids} kids · last kid ${ago(h.lastKidAt)} · ${h.phones} phones · ${h.tvScreens} TV · ${h.managers} managers · signed up ${time(h.signedUpAt)}` }))),
  )

  $('detail').hidden = !detail
  $('list-view').hidden = !!detail
  $('stats-view').hidden = !!detail
  if (!detail) return
  $('d-name').textContent = detail.displayName || '(no name yet)'
  $('d-state').textContent = `${detail.status} · ${detail.kids} kids · last kid ${ago(detail.lastKidAt)} · ${detail.suspendedSince ? `Suspended since ${time(detail.suspendedSince)}` : 'Active'} · Area ${detail.area} · ${detail.timeZone} · signed up ${time(detail.signedUpAt)}`
  $('d-managers').textContent = detail.managers.join(', ') || 'none'
  $('d-reports').replaceChildren(
    ...detail.reports.map((r) =>
      el('div', { className: 'house' }, el('span', { className: 'top' }, el('span', { className: 'name', textContent: `⚑ ${time(r.at)}: ${r.reason || '(no reason given)'}` }), el('button', { textContent: 'Dismiss', onclick: () => dismissReport(r.id) })))),
  )
  if (document.activeElement !== $('d-rename')) $('d-rename').value = detail.displayName
  if (document.activeElement !== $('d-zone')) $('d-zone').value = detail.timeZone
  $('d-suspend').textContent = detail.suspendedSince ? 'Unsuspend' : 'Suspend'
  // Every night, newest first; the totals leave the Test night out, as the Stats section does.
  const devices = (v) => (v == null ? '—' : String(v))
  const STATE = { upcoming: 'Upcoming', live: 'Live', ended: 'Ended', past: 'Past' }
  $('d-nights').replaceChildren(
    ...[...detail.nights].reverse().map((n) =>
      el('tr', {},
        el('td', { textContent: n.testNight && n.name !== 'Test night' ? `${n.name} (Test night)` : n.name }),
        el('td', { textContent: STATE[n.state] }),
        el('td', { textContent: n.wentLiveAt ? time(n.wentLiveAt) : '—' }),
        el('td', { textContent: String(n.kids) }),
        el('td', { textContent: devices(n.phones) }),
        el('td', { textContent: devices(n.tvScreens) }))),
  )
  const real = detail.nights.filter((n) => !n.testNight && n.state !== 'upcoming')
  const sum = (key) => real.reduce((t, n) => t + (n[key] ?? 0), 0)
  $('d-totals').replaceChildren(
    el('td', { textContent: `${real.length} ${real.length === 1 ? 'night' : 'nights'}` }), el('td'), el('td'),
    el('td', { textContent: String(sum('kids')) }), el('td', { textContent: String(sum('phones')) }), el('td', { textContent: String(sum('tvScreens')) }),
  )
}

async function openHousehold(id) {
  $('d-invite-url').textContent = ''
  if (id == null) detail = null
  else await loadDetail(id)
  render()
}

function dismissReport(reportId) {
  post('/api/operator/action', { householdId: detail.id, action: 'dismissReport', value: reportId }, 'Report dismissed')
}

$('d-zone').replaceChildren(...Intl.supportedValuesOf('timeZone').map((zone) => el('option', { value: zone, textContent: zone })))
$('search').addEventListener('input', render)
$('back').addEventListener('click', () => openHousehold(null))
$('pause').addEventListener('click', () => {
  const on = !data.pauseSignUps
  if (on && !confirm('Pause sign-ups? New households are turned away; everyone already here keeps working.')) return
  post('/api/operator/pause', { on }, on ? 'Sign-ups paused' : 'Sign-ups open')
})
$('rename-form').addEventListener('submit', (e) => {
  e.preventDefault()
  post('/api/operator/action', { householdId: detail.id, action: 'rename', value: $('d-rename').value }, 'Renamed')
})
$('zone-form').addEventListener('submit', (e) => {
  e.preventDefault()
  post('/api/operator/action', { householdId: detail.id, action: 'timeZone', value: $('d-zone').value }, 'Time zone fixed')
})
// The recovery path for a locked-out Manager: an ordinary invite, copied here and sent by the Operator.
$('d-invite').addEventListener('click', async () => {
  const res = await fetch('/api/operator/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId: detail.id, action: 'invite' }) })
  if (!res.ok) return say(await res.text(), true)
  const { url } = await res.json()
  $('d-invite-url').textContent = url
  await navigator.clipboard?.writeText(url).catch(() => {})
  say('Invite link made and copied: send it yourself')
})
$('d-suspend').addEventListener('click', () => {
  const action = detail.suspendedSince ? 'unsuspend' : 'suspend'
  if (action === 'suspend' && !confirm(`Suspend "${detail.displayName}"? Its phones, TV and Setup stop at once. Nothing is deleted.`)) return
  post('/api/operator/action', { householdId: detail.id, action }, action === 'suspend' ? 'Suspended' : 'Unsuspended')
})

load().then(loadStats)
setInterval(load, POLL_MS)
setInterval(loadStats, STATS_MS)
