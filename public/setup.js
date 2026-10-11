// /setup (v2 spec §6): a signed-in Manager runs their Household.
import { atEventTime, clockTime as zoneClock, eventNow, minuteOfDay, slots, stamp, zonedTime } from '/shared/night-maths.js'
import qrcode from '/vendor/qrcode/qrcode.js'
import { createLocationPicker } from '/location-picker.js'
import { showFirstRun } from '/first-run.js'

const $ = (id) => document.getElementById(id)
const HOUR = 3_600_000
let batches = []

let house = null // { id, displayName, timeZone, joinKey, manager, operator }
let joinKey = ''
let events = []
let editingId = null
let shares = [] // the nights shared by a public link: [{ eventId, url, hideName }]
let timeZone // the Household's: every time of night in Setup reads in it (v2 spec §8)

function say(text, isError = false) {
  $('status').textContent = text
  $('status').classList.toggle('err', isError)
  if (!isError) setTimeout(() => $('status').textContent === text && ($('status').textContent = ''), 2500)
}

// Setup is a signed-in Manager's: the session cookie rides along, and a lapsed one goes back to sign-in.
async function get(path) {
  const res = await fetch(path)
  if (res.status === 401) location.href = '/signup'
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function load() {
  house = await get('/api/household')
  joinKey = house.joinKey
  timeZone = house.timeZone
  events = await get('/api/events')
  batches = await get('/api/batches')
  shares = await get('/api/shares')
  render()
  return true
}

async function admin(command, done) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (res.status === 401) location.href = '/signup'
  if (!res.ok) {
    say(await res.text(), true)
    return null
  }
  const body = await res.json()
  await load()
  if (done) say(done)
  return body
}

// ---- helper phones (spec §6): this phone, or someone else's by QR or a shared link
const joinUrl = () => `${location.origin}/?key=${encodeURIComponent(joinKey)}`

$('count-here').addEventListener('click', () => {
  localStorage.setItem('cd.joinKey', joinKey)
  location.href = '/'
})

$('add-helper').addEventListener('click', () => {
  const qr = qrcode(0, 'M')
  qr.addData(joinUrl())
  qr.make()
  $('helper-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
  $('helper').hidden = !$('helper').hidden
})

$('share-join').addEventListener('click', () => share(joinUrl(), 'Help count trick-or-treaters'))

// The phone's share sheet, or Copy where there isn't one.
async function share(url, title) {
  if (navigator.share) {
    try {
      return await navigator.share({ title, url })
    } catch (err) {
      if (err.name === 'AbortError') return // they closed the share sheet
    }
  }
  await navigator.clipboard.writeText(url)
  say('Link copied')
}

// ---- Pair a TV (spec §9): the code a bare /tv shows, typed or arriving from its QR as ?pair=<code>
async function redeem(code) {
  const res = await fetch('/api/pair/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
  if (res.status === 401) location.href = '/signup'
  if (!res.ok) {
    say(await res.text(), true)
    return false
  }
  if (!house.firstRunPassed) await admin({ type: 'passFirstRun' }) // the TV's on: first-run's job is done
  return true
}

async function pairTv(code) {
  if (!confirm('Show our TV here?')) return
  if (!(await redeem(code))) return
  $('pair-code').value = ''
  say('✓ Paired: your TV is showing your board')
}

$('pair-form').addEventListener('submit', (e) => {
  e.preventDefault()
  if ($('pair-code').value.trim()) pairTv($('pair-code').value.trim())
})

// ---- the TV link (spec §9): shared from here only, never shown on the TV
const tvUrl = () => `${location.origin}/tv/k/${house.tvToken}`

$('tv-share').addEventListener('click', () => share(tvUrl(), 'Our trick-or-treat TV'))

$('tv-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(tvUrl())
  say('TV link copied')
})

$('tv-qr').addEventListener('click', () => {
  const qr = qrcode(0, 'M')
  qr.addData(tvUrl())
  qr.make()
  $('qr-full-code').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
  $('qr-full').hidden = false
})
$('qr-full').addEventListener('click', () => ($('qr-full').hidden = true))

$('tv-here').addEventListener('click', () => (location.href = tvUrl()))

$('tv-rotate').addEventListener('click', async () => {
  if (!confirm('Rotate the TV link? Every screen watching with the old link stops at once, your porch TV included, until it gets the new one.')) return
  if (await admin({ type: 'rotateTvLink' }, 'TV link rotated')) render()
})

// ---- the Rehearsal (spec §6): reset it to 0 while it's live, so the TV starts the night clean
async function resetRehearsal() {
  if (!confirm('Reset the Rehearsal? Its kids are cleared, and the TV and phones go back to 0.')) return
  await admin({ type: 'resetRehearsal' }, 'Rehearsal reset to 0')
}
$('reset-rehearsal').addEventListener('click', resetRehearsal)
$('check-reset').addEventListener('click', resetRehearsal)

// ---- the ready-for-Halloween checklist (spec §6): ticks itself from real state, hides when done or dismissed.
// A tick, a skip and the dismissal are remembered on this phone.
const remembered = (what) => {
  try {
    return localStorage.getItem(`cd.checklist.${house.id}.${what}`) === '1'
  } catch {
    return false
  }
}
const remember = (what) => {
  try {
    localStorage.setItem(`cd.checklist.${house.id}.${what}`, '1')
  } catch {}
}
// The night the checklist is about: the next one that goes live by itself, or the live non-Rehearsal one.
const halloweenNight = () =>
  events.filter((e) => e.goesLiveAt != null && !e.live && !e.frozen).sort((a, b) => a.goesLiveAt - b.goesLiveAt)[0] ??
  events.find((e) => e.live && !e.rehearsal)

function renderChecklist() {
  if (house.checklist.rehearsalKids > 0) remember('kid')
  const night = halloweenNight()
  const tv = house.checklist.tvWatching
  const kid = remembered('kid')
  const nightDone = !!night && (night.expectedKids != null || night.raceAgainstId != null || remembered('night'))
  $('check-tv').classList.toggle('done', tv)
  $('check-kid').classList.toggle('done', kid)
  $('check-night').classList.toggle('done', nightDone)
  $('check-night-when').textContent = !night
    ? 'Create it below, under Create an event.'
    : night.live ? `${night.name} is live.` : `${night.name} goes live ${zoneDay(night.goesLiveAt)}. How many kids do you expect?`
  $('check-night-form').hidden = !night || nightDone
  $('checklist').hidden = remembered('hidden') || (tv && kid && nightDone)
}
$('checklist-hide').addEventListener('click', () => {
  remember('hidden')
  renderChecklist()
})
$('check-night-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const night = halloweenNight()
  if (night && $('check-expected').value !== '') await admin({ type: 'settings', eventId: night.id, expectedKids: Number($('check-expected').value) }, 'Expected kids saved')
})
$('check-night-skip').addEventListener('click', () => {
  remember('night')
  renderChecklist()
})

// ---- a night shared by a public link (spec §12): turning sharing off kills the link
function sharingOff(event) {
  if (!shares.some((s) => s.eventId === event.id)) return []
  return [h('button', { className: 'danger', textContent: 'Stop sharing', onclick: async () => {
    if (!confirm(`Stop sharing "${event.name}"? Its public link stops working at once.`)) return
    const res = await fetch('/api/share/off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id }) })
    if (!res.ok) return say(await res.text(), true)
    say('Sharing off')
    await load()
  } })]
}

// ---- Managers and invites (spec §3)
async function loadManagers() {
  const res = await fetch('/api/managers')
  if (!res.ok) return
  const { me, managers, invites } = await res.json()
  $('managers').replaceChildren(
    ...managers.map((m) =>
      h('div', { className: 'item' },
        h('span', { className: 'grow', textContent: `${m.name || m.email}${m.id === me ? ' (you)' : ''}` }),
        ...(m.name ? [h('span', { className: 'muted', textContent: m.email })] : []),
        ...(m.id === me ? [] : [h('button', { className: 'danger', textContent: 'Remove', onclick: () => removeManager(m) })]),
      ),
    ),
  )
  $('invites').replaceChildren(
    ...invites.map((i) =>
      h('div', { className: 'item' },
        h('span', { className: 'grow muted', textContent: `Invite from ${i.madeByName || i.madeByEmail || 'the Operator'}, until ${zoneDay(i.expiresAt)}` }),
        h('button', { textContent: 'Share', onclick: () => share(i.url, 'Help run our trick-or-treat night') }),
        h('button', { className: 'danger', textContent: 'Revoke', onclick: () => revokeInvite(i) }),
      ),
    ),
  )
  $('leave').hidden = managers.length < 2 // the last Manager deletes the household instead
}

async function managerCall(path, body, done) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  if (!res.ok) {
    say(await res.text(), true)
    return null
  }
  if (done) say(done)
  await loadManagers()
  return res
}

$('invite').addEventListener('click', async () => {
  const res = await managerCall('/api/invites', {})
  if (res) await share((await res.json()).url, 'Help run our trick-or-treat night')
  await loadManagers()
})

function removeManager(m) {
  if (confirm(`Remove ${m.name || m.email}? Their account details are deleted; the household and its nights stay.`)) managerCall('/api/managers/remove', { managerId: m.id }, 'Removed')
}

function revokeInvite(i) {
  if (confirm('Cancel this invite link?')) managerCall('/api/invites/revoke', { key: i.key }, 'Invite cancelled')
}

$('leave').addEventListener('click', async () => {
  if (!confirm('Leave this household? Your account details are deleted. The household and its nights stay with the other Managers.')) return
  const res = await fetch('/api/managers/leave', { method: 'POST' })
  if (!res.ok) return say(await res.text(), true)
  location.href = '/signup'
})

// ---- your household: its name, signing out, and deleting it
$('name-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  await admin({ type: 'rename', displayName: $('h-name').value }, 'Household name saved')
})

$('delete-household').addEventListener('click', async () => {
  const typed = prompt(`Delete "${house.displayName}" and everything in it, for good? Type its name to confirm.`)
  if (typed == null) return
  if (typed !== house.displayName) return say("That didn't match, so nothing was deleted", true)
  const res = await fetch('/api/household/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed }) })
  if (!res.ok) return say(await res.text(), true)
  location.href = '/signup'
})

// ---- rendering
function appendAll(node, children) {
  node.append(...children)
  return node
}
const h = (tag, props, ...children) => appendAll(Object.assign(document.createElement(tag), props), children)
const option = (value, text, selected) => h('option', { value, textContent: text, selected })

function render() {
  const live = events.find((e) => e.live)
  const upcoming = events.filter((e) => !e.live && !e.frozen && !e.countsOnly)
  const past = events.filter((e) => e.frozen || e.countsOnly)
  const editable = [live, ...upcoming]
  if (!editable.some((e) => e.id === editingId)) editingId = live.id

  $('live-name').textContent = live.name
  $('time-zone').textContent = timeZone ?? ''
  if (document.activeElement !== $('h-name')) $('h-name').value = house.displayName
  $('signed-in').textContent = house.manager.email
  $('tv-link').textContent = tvUrl()
  $('h-zone').textContent = timeZone
  $('live-kids').textContent = live.kids
  $('join-key').textContent = joinKey || '(not set on this phone)'

  $('editing').replaceChildren(...editable.map((e) => option(e.id, e.live ? `${e.name} (live)` : e.name, e.id === editingId)))
  const editing = events.find((e) => e.id === editingId)
  $('s-name').value = editing.name
  $('s-race').replaceChildren(
    option('', 'None', editing.raceAgainstId == null),
    ...events.filter((e) => e.id !== editing.id).map((e) => option(e.id, e.name, e.id === editing.raceAgainstId)),
  )
  $('s-shift').value = editing.clockShiftMs / HOUR
  $('s-expected').value = editing.expectedKids ?? ''
  $('s-visit').value = editing.visitWindowMs / 1000
  $('s-golden').value = editing.goldenCount
  $('goes-row').hidden = editing.live
  $('goes-zone').textContent = timeZone
  $('s-goes').value = editing.goesLiveAt == null ? '' : stamp(editing.goesLiveAt, timeZone).slice(0, 16).replace(' ', 'T')
  $('auto-ended').hidden = !(live.ended && live.endedAutomatically)
  // An ended night has its summary straight away (spec §12).
  $('summary-link').hidden = !live.ended || live.countsOnly
  $('summary-link').href = `/summary?event=${live.id}`
  $('live-sharing').replaceChildren(...(live.ended ? sharingOff(live) : []))
  $('auto-ended-summary').href = `/summary?event=${live.id}`
  $('rehearsal-tools').hidden = !live.rehearsal
  renderChecklist()

  $('tags').replaceChildren(...editing.tags.map(tagRow))
  $('c-copy').replaceChildren(option('', 'Nothing (start empty)', true), ...events.filter((e) => !e.countsOnly).map((e) => option(e.id, e.name)))

  renderBackfill(live)

  $('upcoming').replaceChildren(
    ...upcoming.map((e) =>
      h('div', { className: 'item' },
        h('span', { className: 'grow', textContent: `${e.name} · ${e.tags.length} costumes${e.goesLiveAt == null ? '' : ` · goes live ${zoneDay(e.goesLiveAt)}`}` }),
        h('button', { className: 'primary', textContent: 'Go live', onclick: () => goLive(e, live) })),
    ),
  )
  $('past').replaceChildren(
    ...(past.length
      ? past.map((e) =>
          h('div', { className: 'item' },
            h('span', { className: 'grow', textContent: `${e.name} · ${e.countsOnly ? 'counts only' : `${e.kids} kids`}` }),
            ...(e.countsOnly ? [] : [
              h('a', { href: `/summary?event=${e.id}`, textContent: '✨ Night summary', style: 'color: var(--orange); font-weight: 700' }),
              ...sharingOff(e),
              h('a', { href: `/tv?event=${e.id}`, target: '_blank', textContent: 'View recap', style: 'color: var(--orange); font-weight: 700' }),
              h('button', { textContent: '⬇ Export', onclick: () => exportEvent(e) }),
            ]),
            h('button', { className: 'danger', textContent: 'Delete', onclick: () => deleteEvent(e) })),
        )
      : [h('p', { className: 'muted', textContent: 'None yet.' })]),
  )
}

// ---- Add missed kids: rows in event time, none later than the event's "now" (spec §6).
const clockTime = (ms, shift) => zoneClock(ms + shift, timeZone)
// "Sat Oct 31, 4:00 PM" in the Household's zone.
const zoneDay = (ms) => `${new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone })}, ${zoneClock(ms, timeZone)}`
function renderBackfill(live) {
  const shift = live.clockShiftMs
  const nowMinute = Math.floor(minuteOfDay(eventNow(Date.now(), shift), timeZone))
  const typed = new Map([...document.querySelectorAll('#backfill-rows input')].map((i) => [i.dataset.start, i.value]))
  $('backfill-rows').replaceChildren(
    ...slots('17:30', '21:00', 15).map(({ start, end }) => {
      const [hh, mm] = start.split(':').map(Number)
      const input = h('input', { type: 'number', min: 0, max: 1000, value: typed.get(start) ?? '', disabled: hh * 60 + mm > nowMinute })
      input.dataset.start = start
      input.dataset.end = end
      return h('label', {}, h('span', { textContent: `${clockTime(atEventTime(start, Date.now(), shift, timeZone), shift)}` }), input)
    }),
  )
  $('batches').replaceChildren(
    ...batches.map((b) => {
      const from = Math.min(...b.rows.map((r) => r.startMs))
      const to = Math.max(...b.rows.map((r) => r.endMs))
      return h('div', { className: 'item' },
        h('span', { className: 'grow', textContent: `+${b.kids} kids, ${clockTime(from, shift)}–${clockTime(to, shift)}` }),
        h('button', { className: 'danger', textContent: 'Remove', onclick: () => {
          if (confirm(`Remove these ${b.kids} added kids?`)) admin({ type: 'removeBatch', batchId: b.id }, `Removed ${b.kids} kids`)
        } }))
    }),
  )
}

$('backfill-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const live = events.find((ev) => ev.live)
  const rows = [...document.querySelectorAll('#backfill-rows input')]
    .filter((i) => !i.disabled && Number(i.value) > 0)
    .map((i) => ({
      startMs: atEventTime(i.dataset.start, Date.now(), live.clockShiftMs, timeZone),
      endMs: atEventTime(i.dataset.end, Date.now(), live.clockShiftMs, timeZone),
      count: Number(i.value),
    }))
  if (!rows.length) return say('Type a count in at least one row', true)
  const total = rows.reduce((n, r) => n + r.count, 0)
  document.querySelectorAll('#backfill-rows input').forEach((i) => (i.value = ''))
  await admin({ type: 'backfill', rows }, `Added ${total} kids`)
})

function tagRow(tag) {
  const emoji = h('input', { className: 'emoji', value: tag.emoji ?? '', ariaLabel: 'Emoji' })
  const name = h('input', { className: 'grow', value: tag.name, ariaLabel: 'Name' })
  const order = h('input', { className: 'order', type: 'number', min: 1, value: tag.order, ariaLabel: 'Order' })
  return h('div', { className: 'item tag-row' }, emoji, name, order,
    h('button', {
      textContent: 'Save',
      onclick: () => admin({ type: 'updateTag', tagId: tag.id, name: name.value, emoji: emoji.value || null, order: Number(order.value) }, `Saved ${name.value}`),
    }),
    h('button', {
      className: 'danger',
      textContent: '✕',
      ariaLabel: `Delete ${tag.name}`,
      onclick: () => {
        if (confirm(`Delete "${tag.name}"? Any kids wearing it become untagged.`)) admin({ type: 'deleteTag', tagId: tag.id }, `Deleted ${tag.name}`)
      },
    }))
}

// ---- actions
$('editing').addEventListener('change', (e) => {
  editingId = Number(e.target.value)
  render()
})

$('settings-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const race = $('s-race').value
  admin({
    type: 'settings',
    eventId: editingId,
    name: $('s-name').value,
    raceAgainstId: race === '' ? null : Number(race),
    clockShiftMs: Math.round(Number($('s-shift').value || 0) * HOUR),
    expectedKids: $('s-expected').value === '' ? null : Number($('s-expected').value),
    visitWindowMs: Math.round(Number($('s-visit').value || 15) * 1000),
    goldenCount: Number($('s-golden').value || 0),
    // The wall time typed is the Household's, whatever zone this phone is in.
    ...(editingId === events.find((ev) => ev.live).id
      ? {}
      : { goesLiveAt: $('s-goes').value ? zonedTime($('s-goes').value.slice(0, 10), $('s-goes').value.slice(11, 16), timeZone) : null }),
  }, 'Settings saved')
})

$('new-tag').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (await admin({ type: 'createTag', eventId: editingId, name: $('t-name').value, emoji: $('t-emoji').value || null }, `Added ${$('t-name').value}`)) {
    $('t-name').value = ''
    $('t-emoji').value = ''
  }
})

$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const copy = $('c-copy').value
  const done = await admin({ type: 'createEvent', name: $('c-name').value, copyTagsFrom: copy === '' ? null : Number(copy) }, `Created ${$('c-name').value}`)
  if (done) {
    $('c-name').value = ''
    editingId = done.deltas[0].event.id
    render()
  }
})

// ⬇ Export event: the server makes the CSV; fetch it and save it here.
async function exportEvent(event) {
  const res = await fetch(`/api/export?event=${event.id}`)
  if (!res.ok) return say(`Export failed: ${await res.text()}`, true)
  const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'event.csv'
  const link = h('a', { href: URL.createObjectURL(await res.blob()), download: name })
  link.click()
  URL.revokeObjectURL(link.href)
  say(`Exported ${name}`)
}
$('export-live').addEventListener('click', () => exportEvent(events.find((e) => e.live)))

function goLive(event, live) {
  if (!confirm(`Go live with "${event.name}"?\n\n"${live.name}" will be frozen as a past event. Phones and the TV switch over by themselves.`)) return
  admin({ type: 'goLive', eventId: event.id }, `${event.name} is live`)
}

function deleteEvent(event) {
  const typed = prompt(`Delete "${event.name}" for good? Type its name to confirm.`)
  if (typed == null) return
  if (typed !== event.name) return say("That didn't match, so nothing was deleted", true)
  admin({ type: 'deleteEvent', eventId: event.id, confirm: typed }, `Deleted ${event.name}`)
}

// Draws one more number between tonight's count + 5 and the top of the range (spec §9).
$('add-ticket').addEventListener('click', async () => {
  if (!confirm('Add a golden ticket to tonight? Its number is drawn secretly from the rest of the range.')) return
  const done = await admin({ type: 'addTicket' })
  if (done) say(`Ticket added: ${done.deltas[0].golden.left} left`)
})

$('change-key').addEventListener('click', async () => {
  if (!confirm('Change the join key? Every phone using the old key stops counting until it rejoins.')) return
  const done = await admin({ type: 'changeKey' }, 'Join key changed')
  if (done) {
    // This phone counts on with the new key if it had the old one; everyone else rejoins.
    if (localStorage.getItem('cd.joinKey') === joinKey) localStorage.setItem('cd.joinKey', done.joinKey)
    joinKey = done.joinKey
    $('helper').hidden = true
    render()
  }
})

await load()
$('admin').hidden = false
loadManagers()

// First-run until screen 3 has been passed once; not when a TV's QR brought us here to pair.
const firstRun = !house.firstRunPassed && !new URLSearchParams(location.search).has('pair')
  ? showFirstRun($('first-run'), { house: structuredClone(house), admin, redeem, tvUrl, share })
  : null

// The checklist and first-run's TV tick from state the page can't hear over a stream: ask every 3 s.
setInterval(async () => {
  const res = await fetch('/api/household').catch(() => null)
  if (!res?.ok) return
  house = await res.json()
  renderChecklist()
  firstRun?.update(house)
}, 3_000)
createLocationPicker($('location'), {
  cell: house.location,
  async save(cell) {
    if (!(await admin({ type: 'setLocation', cell }, cell ? 'Location saved' : 'Location removed'))) throw new Error("Couldn't save the Location")
  },
})

// Arrived from a TV's scan-to-pair QR: the code is filled in, and one confirm pairs it.
const pairParam = new URLSearchParams(location.search).get('pair')
if (pairParam) {
  history.replaceState(null, '', location.pathname)
  $('pair-code').value = pairParam
  $('pair-form').scrollIntoView({ block: 'center' })
  pairTv(pairParam)
}
