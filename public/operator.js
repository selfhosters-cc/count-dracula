// /operator (v2 spec §13): find a Household, Rename it, fix its time zone, Suspend it; Pause sign-ups.
// Every name is set with textContent, never as HTML.
const $ = (id) => document.getElementById(id)
let data = { pauseSignUps: false, households: [] }
let openId = null

function say(text, isError = false) {
  $('status').textContent = text
  $('status').classList.toggle('err', isError)
  if (!isError) setTimeout(() => $('status').textContent === text && ($('status').textContent = ''), 2500)
}

async function load() {
  const res = await fetch('/api/operator/households')
  if (res.status === 401) location.href = '/signup'
  if (!res.ok) return say(await res.text(), true)
  data = await res.json()
  render()
}

async function post(path, body, done) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) return say(await res.text(), true)
  say(done)
  await load()
}

const time = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function render() {
  $('pause-state').textContent = data.pauseSignUps ? 'paused' : 'open'
  $('pause').textContent = data.pauseSignUps ? 'Open sign-ups' : 'Pause sign-ups'
  $('pause').className = data.pauseSignUps ? 'primary' : 'danger'
  const q = $('search').value.trim().toLowerCase() // filtered here, so a renamed Household stays open
  $('households').replaceChildren(
    ...data.households.filter((h) => h.displayName.toLowerCase().includes(q)).map((h) => {
      const row = Object.assign(document.createElement('button'), { className: 'house', onclick: () => openHousehold(h.id) })
      row.append(Object.assign(document.createElement('span'), { textContent: h.displayName || '(no name yet)' }))
      if (h.suspendedSince) row.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'Suspended' }))
      return row
    }),
  )
  const h = data.households.find((x) => x.id === openId)
  $('detail').hidden = !h
  $('list-view').hidden = !!h
  if (!h) return
  $('d-name').textContent = h.displayName || '(no name yet)'
  $('d-state').textContent = `${h.suspendedSince ? `Suspended since ${time(h.suspendedSince)}` : 'Active'} · signed up ${time(h.signedUpAt)} · ${h.timeZone}`
  $('d-managers').textContent = h.managers.join(', ') || 'none'
  if (document.activeElement !== $('d-rename')) $('d-rename').value = h.displayName
  $('d-zone').value = h.timeZone
  $('d-suspend').textContent = h.suspendedSince ? 'Unsuspend' : 'Suspend'
}

function openHousehold(id) {
  openId = id
  render()
}

$('d-zone').replaceChildren(...Intl.supportedValuesOf('timeZone').map((zone) => Object.assign(document.createElement('option'), { value: zone, textContent: zone })))
$('search').addEventListener('input', render)
$('back').addEventListener('click', () => openHousehold(null))
$('pause').addEventListener('click', () => {
  const on = !data.pauseSignUps
  if (on && !confirm('Pause sign-ups? New households are turned away; everyone already here keeps working.')) return
  post('/api/operator/pause', { on }, on ? 'Sign-ups paused' : 'Sign-ups open')
})
$('rename-form').addEventListener('submit', (e) => {
  e.preventDefault()
  post('/api/operator/action', { householdId: openId, action: 'rename', value: $('d-rename').value }, 'Renamed')
})
$('zone-form').addEventListener('submit', (e) => {
  e.preventDefault()
  post('/api/operator/action', { householdId: openId, action: 'timeZone', value: $('d-zone').value }, 'Time zone fixed')
})
$('d-suspend').addEventListener('click', () => {
  const h = data.households.find((x) => x.id === openId)
  const action = h.suspendedSince ? 'unsuspend' : 'suspend'
  if (action === 'suspend' && !confirm(`Suspend "${h.displayName}"? Its phones, TV and Setup stop at once. Nothing is deleted.`)) return
  post('/api/operator/action', { householdId: openId, action }, action === 'suspend' ? 'Suspended' : 'Unsuspended')
})

load()
