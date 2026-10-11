// /setup (spec v2.1 §9): a signed-in Manager runs their Household. Three tabs, Tonight · Nights · Household,
// and a screen per night. setup-view.js decides what shows; setup-night.js and setup-household.js draw it.
import { zonedTime, clockTime as zoneClock } from '../shared/night-maths.js'
import qrcode from '/vendor/qrcode/qrcode.js'
import { showFirstRun } from '/first-run.js'
import { helperLink, helperWording, joinCodeLine, tvQrButton, tvQrSays } from './door-view.js'
import { $, h, option } from './setup-dom.js'
import {
  checklist, closeConfirm, deleteConfirm, doorEvent, endConfirm, goLiveConfirm, goLiveOffer, nightGroups, nightsTabLabel,
  resetConfirm, screenFrom, searchFor, waitingNights,
} from './setup-view.js'
import { alsoOpen, doorCard, nightRow, nightScreen, nothingOpen, typedMissed, waiting } from './setup-night.js'
import { wireHousehold } from './setup-household.js'
import { createHelp } from './setup-help-ui.js'

let house = null // /api/household: { id, displayName, timeZone, joinKey, tvToken, checklist, lastYear, … }
let events = []
let shares = [] // the nights shared by a public link: [{ eventId, url, hideName }]
let batches = [] // the shown night's Add missed kids batches
let screen = screenFrom(location.search) // { tab: 'tonight' | 'nights' | 'household', event: id or null }
// What's open on screen: End's choices (an Event id), Add missed kids (an Event id), a helper's QR (by place).
const ui = { ending: null, missed: null, helper: { tonight: false, house: false, checklist: false }, tvQr: { until: 0, says: '', saidAt: 0 } }
const timeZone = () => house.timeZone // the Household's: every time of night in Setup reads in it

let sayTimer
function say(text, isError = false) {
  $('status').textContent = text
  $('status').classList.toggle('err', isError)
  clearTimeout(sayTimer)
  sayTimer = setTimeout(() => $('status').textContent === text && ($('status').textContent = ''), isError ? 6000 : 2500)
}
$('status').addEventListener('click', () => ($('status').textContent = ''))

// Setup is a signed-in Manager's: the session cookie rides along, and a lapsed one goes back to sign-in.
async function get(path) {
  const res = await fetch(path)
  if (res.status === 401) location.href = '/#sign-in'
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function load() {
  house = await get('/api/household')
  ui.tvQr.until = Date.now() + house.joinQrMsLeft
  ;[events, shares] = await Promise.all([get('/api/events'), get('/api/shares')])
  const shown = shownNight()
  batches = shown?.open ? await get(`/api/batches?event=${shown.id}`) : []
  render()
  return true
}

async function admin(command, done) {
  const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
  if (res.status === 401) location.href = '/#sign-in'
  if (!res.ok) {
    say(await res.text(), true)
    return null
  }
  const body = await res.json()
  await load()
  if (done) say(done)
  return body
}

// End, Resume and Release are the door phone's commands (any phone with the join key): Setup sends them the
// same way, naming the Event and the go-live stamp it shows.
async function nightCall(path, event, done) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Join-Key': house.joinKey },
    body: JSON.stringify(named(event)),
  }).catch(() => null)
  if (!res?.ok) say(res ? await res.text() : "Couldn't reach the server", true)
  await load()
  if (res?.ok && done) say(done)
}
// What a night command names: the Event and its go-live stamp.
const named = (event) => ({ eventId: event?.id, stamp: event?.wentLiveAt })

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

// "Sat Oct 31, 4:00 PM" in the Household's zone.
const zoneDay = (ms) => `${new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: timeZone() })}, ${zoneClock(ms, timeZone())}`

// ---- the screens: a tab, or a night's screen (kept in the URL, so a reload or the phone's Back keeps it)
const shownNight = () => (screen.event == null ? null : events.find((e) => e.id === screen.event) ?? null)
// Which screen is showing, for the help: a new one closes every "?".
const screenKey = () => (screen.event == null ? screen.tab : `night:${screen.event}`)

function go(next, { push = false } = {}) {
  if (next.event !== screen.event) {
    ui.missed = null
    ui.ending = null
  }
  screen = next
  const url = `${location.pathname}${searchFor(screen)}`
  if (push) history.pushState({ setup: true }, '', url)
  else history.replaceState(history.state, '', url)
  load().catch((err) => say(err.message, true))
  scrollTo(0, 0)
}
const openNight = (e) => go({ tab: screen.tab === 'nights' ? 'nights' : 'tonight', event: e.id }, { push: true })
addEventListener('popstate', () => {
  screen = screenFrom(location.search)
  ui.missed = ui.ending = null
  load().catch((err) => say(err.message, true))
})
for (const tab of document.querySelectorAll('[role="tab"]')) tab.addEventListener('click', () => go({ tab: tab.dataset.tab, event: null }))

// ---- the actions every night's buttons call (setup-night.js)
const act = {
  open: openNight,
  tab: (tab) => go({ tab, event: null }),
  back() {
    if (history.state?.setup) history.back()
    else go({ tab: screen.tab, event: null })
  },
  goLive(e) {
    if (confirm(goLiveConfirm(e))) admin({ type: 'goLive', eventId: e.id }, `${e.name} is live`)
  },
  // 🌙 End the night. With golden tickets still to find, v2's three choices instead of a plain yes/no.
  end(e) {
    if (e.golden?.left > 0) {
      ui.ending = e.id
      return render()
    }
    if (confirm(endConfirm(e))) nightCall('/api/end', e, `🌙 ${e.name} ended`)
  },
  endRelease(e) {
    ui.ending = null
    nightCall('/api/release', e, '🎫 Released: the next kids win')
  },
  endAnyway(e) {
    ui.ending = null
    nightCall('/api/end', e, `🌙 ${e.name} ended: the tickets expired`)
  },
  endCancel() {
    ui.ending = null
    render()
  },
  resume: (e) => nightCall('/api/resume', e, `☀️ ${e.name} is back on`),
  close(e) {
    if (confirm(closeConfirm(e))) admin({ type: 'close', eventId: e.id }, `${e.name} is closed`)
  },
  // Reset (spec v2.1 §6): back to Upcoming with no kids. Above 20 kids, the Event's name typed.
  reset(e) {
    const { typed, text } = resetConfirm(e, Date.now())
    let confirmed
    if (typed) {
      confirmed = prompt(text)
      if (confirmed === null) return
      if (confirmed !== e.name) return say('The name didn’t match, so nothing was reset', true)
    } else if (!confirm(text)) return
    admin({ type: 'reset', eventId: e.id, confirm: confirmed }, `${e.name} is back to Upcoming`)
  },
  // Delete (spec v2.1 §3): refused while Live; the name typed when it has kids.
  delete(e) {
    const { typed, text } = deleteConfirm(e)
    let confirmed
    if (typed) {
      confirmed = prompt(text)
      if (confirmed == null) return
      if (confirmed !== e.name) return say("That didn't match, so nothing was deleted", true)
    } else if (!confirm(text)) return
    admin({ type: 'deleteEvent', eventId: e.id, confirm: confirmed }, `Deleted ${e.name}`)
  },
  // Draws one more number between the night's count + 5 and the top of its range (spec §9).
  async ticket(e) {
    if (!confirm(`Add a golden ticket to "${e.name}"? Its number is drawn secretly from the rest of the range.`)) return
    const done = await admin({ type: 'addTicket', ...named(e) })
    if (done) say(`Ticket added: ${done.deltas[0].golden.left} left`)
  },
  // Add missed kids: on the night's own screen. From Tonight, it opens there.
  missed(e, fromTonight) {
    if (fromTonight) {
      go({ tab: 'tonight', event: e.id }, { push: true })
      ui.missed = e.id
      return
    }
    ui.missed = ui.missed === e.id ? null : e.id
    render()
  },
  async backfill(e, rows, clear) {
    if (!rows.length) return say('Type a count in at least one row', true)
    const total = rows.reduce((n, r) => n + r.count, 0)
    clear()
    ui.typed = null
    await admin({ type: 'backfill', rows, ...named(e) }, `Added ${total} kids to ${e.name}`)
  },
  removeBatch(e, b) {
    if (confirm(`Remove these ${b.kids} added kids?`)) admin({ type: 'removeBatch', batchId: b.id, ...named(e) }, `Removed ${b.kids} kids`)
  },
  // ⬇ CSV: the server makes it; fetch it and save it here.
  async csv(e) {
    const res = await fetch(`/api/export?event=${e.id}`)
    if (!res.ok) return say(`Export failed: ${await res.text()}`, true)
    const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'event.csv'
    const link = h('a', { href: URL.createObjectURL(await res.blob()), download: name })
    link.click()
    URL.revokeObjectURL(link.href)
    say(`Exported ${name}`)
  },
  // The Night summary's public link (spec §12): turning sharing off kills it, and on again makes a new one.
  async share(e, on, box) {
    if (!on) {
      if (!confirm(`Stop sharing "${e.name}"? Its public link stops working at once.`)) return (box.checked = true)
      const res = await fetch('/api/share/off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: e.id }) })
      if (!res.ok) say(await res.text(), true)
      else say('Sharing off')
      return load()
    }
    const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: e.id, hideName: false }) })
    if (!res.ok) say(res.status === 404 ? 'Sharing is off right now' : await res.text(), true)
    else say(`Sharing on: "${house.displayName}" shows on the link unless you untick Show our name`)
    await load()
  },
  async showName(e, show) {
    const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: e.id, hideName: !show }) })
    if (!res.ok) say(await res.text(), true)
    else say(show ? 'Your name shows on the link' : 'Your name is off the link')
    await load()
  },
  shareLink: (s) => share(s.url, 'Our Halloween night'),
  saveSettings(e, { goesLive, ...changes }) {
    admin({
      type: 'settings',
      eventId: e.id,
      ...changes,
      // The wall time typed is the Household's, whatever zone this phone is in.
      ...(goesLive === undefined ? {} : { goesLiveAt: goesLive ? zonedTime(goesLive.slice(0, 10), goesLive.slice(11, 16), timeZone()) : null }),
    }, 'Settings saved')
  },
  addTag: (e, { name, emoji }) => admin({ type: 'createTag', eventId: e.id, name, emoji }, `Added ${name}`),
  saveTag: (tag, changes) => admin({ type: 'updateTag', tagId: tag.id, ...changes }, `Saved ${changes.name}`),
  deleteTag(tag) {
    if (confirm(`Delete "${tag.name}"? Any kids wearing it become untagged.`)) admin({ type: 'deleteTag', tagId: tag.id }, `Deleted ${tag.name}`)
  },
}

// ---- helper phones (spec v2.1 §4): this device, or someone else's by QR or a shared link. Both open /door, and
// the wording names the Household, never an Event: one key works on every night.
const joinUrl = () => helperLink(location.origin, house.joinKey)
function helperBox(place) {
  const open = ui.helper[place]
  const qr = () => {
    const code = qrcode(0, 'M')
    code.addData(joinUrl())
    code.make()
    const box = h('div', { className: 'qr-box' })
    box.innerHTML = code.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
    return box
  }
  return [
    h('div', { className: 'row' },
      h('button', { className: 'primary', textContent: '📱 Count on this device', onclick: countHere }),
      h('button', { textContent: '➕ Add a helper', ariaExpanded: String(open), onclick: () => {
        ui.helper[place] = !open
        render()
      } })),
    open ? [qr(), h('p', { className: 'muted', textContent: helperWording(house.displayName) }),
      h('p', { className: 'muted', textContent: joinCodeLine(house.joinKey, location.origin) }),
      h('div', { className: 'row' },
        h('button', { className: 'primary', textContent: 'Share join link', onclick: () => share(joinUrl(), `Help count trick-or-treaters at ${house.displayName}`) }),
        h('button', { data: { tvQr: '' }, textContent: tvQrButton(tvQrLeft()).label, onclick: toggleTvQr })),
      h('p', { className: 'muted', data: { tvQrSays: '' }, textContent: ui.tvQr.says, hidden: !ui.tvQr.says })] : null,
  ]
}

// "📺 Show on the TV" (spec v2.1 §4): the helper QR on the paired TVs for 2 minutes, sent like the door phone's
// night commands, with the join key. The buttons and the line under them update in place, not by a redraw.
const SAYS_MS = 10_000 // how long the line under the buttons stays
const tvQrLeft = () => Math.max(0, ui.tvQr.until - Date.now())
function renderTvQr() {
  if (ui.tvQr.says && Date.now() - ui.tvQr.saidAt > SAYS_MS) ui.tvQr.says = ''
  const { showing, label } = tvQrButton(tvQrLeft())
  for (const b of document.querySelectorAll('[data-tv-qr]')) {
    b.textContent = label
    b.setAttribute('aria-pressed', String(showing))
  }
  for (const p of document.querySelectorAll('[data-tv-qr-says]')) {
    p.textContent = ui.tvQr.says
    p.hidden = !ui.tvQr.says
  }
}
setInterval(renderTvQr, 1_000)
async function toggleTvQr() {
  const res = await fetch('/api/tv/join-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Join-Key': house.joinKey },
    body: JSON.stringify({ show: !tvQrButton(tvQrLeft()).showing }),
  }).catch(() => null)
  if (!res?.ok) {
    ui.tvQr.says = res?.status === 429 ? 'Too many tries: wait a minute' : res ? await res.text() : "Couldn't reach the server"
  } else {
    const answer = await res.json()
    ui.tvQr.until = Date.now() + answer.msLeft
    ui.tvQr.says = tvQrSays(answer)
  }
  ui.tvQr.saidAt = Date.now()
  renderTvQr()
}
function countHere() {
  localStorage.setItem('cd.joinKey', house.joinKey)
  location.href = '/door'
}

// ---- drawing
const context = () => ({ events, door: doorEvent(events), timeZone: timeZone(), shares, batches, day: zoneDay, now: Date.now, ui, act })

function render() {
  $('house-name').textContent = house.displayName
  const night = shownNight()
  if (screen.event != null && !night) { // deleted meanwhile: back to the tab it opened from
    screen = { tab: screen.tab, event: null }
    history.replaceState(null, '', `${location.pathname}${searchFor(screen)}`)
  }
  for (const tab of document.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === screen.tab))
  $('tab-nights').textContent = nightsTabLabel(events)
  $('screen-tonight').hidden = !!night || screen.tab !== 'tonight'
  $('screen-nights').hidden = !!night || screen.tab !== 'nights'
  $('screen-household').hidden = !!night || screen.tab !== 'household'
  $('screen-night').hidden = !night

  const ctx = context()
  if (night) {
    ui.typed = ui.missed === night.id ? typedMissed($('night')) : null
    $('night').replaceChildren(...nightScreen(night, ctx).filter(Boolean))
  } else $('night').replaceChildren()
  renderTonight(ctx)
  renderNights(ctx)
  household.render()
  renderChecklist()
  help.update(screenKey())
}

function renderTonight(ctx) {
  const door = ctx.door
  const others = events.filter((e) => e.open && e !== door).sort((a, b) => b.wentLiveAt - a.wentLiveAt)
  const waits = waitingNights(events)
  $('tonight').replaceChildren(...[
    door ? doorCard(door, ctx) : nothingOpen(goLiveOffer(events), ctx),
    others.length ? alsoOpen(others, ctx) : null,
    waits.length ? waiting(waits, ctx) : null,
    h('section', { data: { help: 'helpers' } }, h('h2', {}, '📱 Helpers'), helperBox('tonight')),
  ].filter(Boolean))
}

function renderNights(ctx) {
  const { open, coming, past } = nightGroups(events)
  const group = (title, list) => (list.length ? [h('div', { className: 'group-title', textContent: title }), list.map((e) => nightRow(e, ctx))] : [])
  const all = [...group(`Open (${open.length} of 3)`, open), ...group('Coming up', coming), ...group('Past', past)]
  $('nights').replaceChildren(...(all.length ? all.flat() : [h('p', { className: 'muted', textContent: 'No nights yet. Make one below.' })]))
  const copy = $('c-copy').value
  $('c-copy').replaceChildren(option('', 'Nothing (start empty)', copy === ''), ...events.filter((e) => !e.countsOnly).map((e) => option(e.id, e.name, String(e.id) === copy)))
}

$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const copy = $('c-copy').value
  const done = await admin({ type: 'createEvent', name: $('c-name').value, copyTagsFrom: copy === '' ? null : Number(copy) }, `Made ${$('c-name').value}`)
  if (done) {
    $('c-name').value = ''
    openNight(done.deltas[0].event) // a new night opens its screen
  }
})

// ---- the ready-for-Halloween checklist (spec v2.1 §8), at the top of Tonight: ticks itself from real state,
// hides when done or dismissed. A tick, a skip and the dismissal are remembered on this phone.
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
const checks = () =>
  checklist({
    events,
    testNightId: house.testNightEventId,
    tvWatching: house.checklist.tvWatching,
    kid: remembered('kid'),
    lastYear: house.lastYear,
    skipped: remembered('night'),
    dismissed: remembered('hidden'),
    day: zoneDay,
  })

function renderChecklist() {
  if (house.checklist.anyKids > 0) remember('kid')
  const view = checks()
  $('check-last-year-row').hidden = !house.canEstimateLastYear
  $('check-tv').classList.toggle('done', view.tv)
  $('check-kid').classList.toggle('done', view.kid)
  $('check-kid-tools').replaceChildren(...(view.kid ? [] : helperBox('checklist').flat().filter(Boolean)))
  $('check-kid-line').hidden = !view.kidLine
  $('check-kid-line').textContent = view.kidLine ?? ''
  $('check-night').hidden = !view.night
  $('check-night').classList.toggle('done', view.nightDone)
  $('check-night-when').textContent = view.nightLine ?? ''
  $('check-night-form').hidden = !view.night || view.nightDone
  $('checklist').hidden = view.hidden
}
$('checklist-hide').addEventListener('click', () => {
  remember('hidden')
  renderChecklist()
})
$('check-night-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const night = checks().night
  if (night && $('check-expected').value !== '') await admin({ type: 'settings', eventId: night.id, expectedKids: Number($('check-expected').value) }, 'Expected kids saved')
})
$('check-last-year-save').addEventListener('click', () => {
  if ($('check-last-year').value) admin({ type: 'setLastYear', total: Number($('check-last-year').value) }, 'Last year saved: race it on the night')
})
$('check-night-skip').addEventListener('click', () => {
  remember('night')
  renderChecklist()
})

// ---- the help (spec v2.1 §9): the column at 900 px and up, a "?" on each heading on phones
const help = createHelp({ column: $('help-col'), root: $('admin'), contact: document.querySelector('footer a[href^="mailto:"]').href })

// ---- Household: everything not about one night
const household = wireHousehold({ house: () => house, events: () => events, admin, say, share, load, helperBox, zoneDay, setHouse: (next) => (house = next) })

if (new URLSearchParams(location.search).has('pair')) screen = { tab: 'household', event: null }
await load()
$('admin').hidden = false

help.update(screenKey())
household.start()

// First-run until screen 3 has been passed once; not when a TV's QR brought us here to pair.
const firstRun = !house.firstRunPassed && !new URLSearchParams(location.search).has('pair')
  ? showFirstRun($('first-run'), { house: structuredClone(house), admin, redeem: household.redeem, tvUrl: household.tvUrl, share })
  : null

// The checklist and first-run's TV tick from state the page can't hear over a stream: ask every 3 s.
setInterval(async () => {
  const res = await fetch('/api/household').catch(() => null)
  if (!res?.ok) return
  house = await res.json()
  ui.tvQr.until = Date.now() + house.joinQrMsLeft // shown or hidden from a door phone meanwhile
  renderChecklist()
  help.update(screenKey()) // the checklist may have come or gone
  firstRun?.update(house)
}, 3_000)

// Arrived from a TV's scan-to-pair QR: the Household tab, the code filled in, and one confirm pairs it.
household.pairFromUrl()
