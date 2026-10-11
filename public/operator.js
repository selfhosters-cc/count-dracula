// /operator (v2 spec §13), built for Halloween night and checked by looking at it: the health strip, every
// Household by status, and a detail view to Rename, fix the time zone, make an Invite link or Suspend.
// Polled every 30 s. Every name is set with textContent, never as HTML.
const $ = (id) => document.getElementById(id)
const POLL_MS = 30_000
const STATUSES = ['Counting', 'Stale', 'Waiting', 'Ended', 'No night'] // spec v2.1 §10, on the door's Event
let data = { pauseSignUps: false, health: [], households: [], now: Date.now() }
let detail = null // the open Household's /api/operator/household answer
let filter = null // a status chip, or null for all

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

load()
setInterval(load, POLL_MS)
