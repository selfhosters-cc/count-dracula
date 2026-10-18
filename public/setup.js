// /setup (spec v2.1 §9): a signed-in Manager runs their Household. Three tabs, Tonight · Nights · Household,
// and a screen per night. setup-view.js decides what shows; setup-night.js and setup-household.js draw it.
import { formatCode, maskCodeInput } from '../shared/codes.js'
import { zonedTime, clockTime as zoneClock } from '../shared/night-maths.js'
import qrcode from '/vendor/qrcode/qrcode.js'
import { helperLink, helperWording, joinCodeLine, tvQrButton, tvQrSays, watchQrButton, watchQrSays } from './door-view.js'
import { $, h, option } from './setup-dom.js'
import {
  checklist, closeConfirm, deleteConfirm, doorEvent, endConfirm, goLiveConfirm, goLiveOffer, nightGroups, nightsTabLabel,
  pairOffer, resetConfirm, screenFrom, searchFor, tvTick, waitingNights,
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
const ui = { ending: null, missed: null, helper: { tonight: false, house: false, checklist: false }, tvQr: { until: 0, says: '', saidAt: 0 }, watchQr: { until: 0, says: '', saidAt: 0 } }
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
  ui.watchQr.until = Date.now() + house.watchQrMsLeft
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
    place === 'checklist' ? null : codeRow('📱 Join code', formatCode(house.joinCode)),
    h('div', { className: 'row' },
      h('button', { className: 'primary', textContent: '📱 Count on this device', onclick: countHere }),
      h('button', { textContent: '➕ Add a helper', ariaExpanded: String(open), onclick: () => {
        ui.helper[place] = !open
        render()
      } })),
    open ? [qr(), h('p', { className: 'muted', textContent: helperWording(house.displayName) }),
      h('p', { className: 'muted', textContent: joinCodeLine(formatCode(house.joinCode), location.origin) }),
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
    if (answer.shown) ui.watchQr.until = 0 // the TV shows one card at a time
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
  $('who-email').textContent = house.manager.email
  $('who').hidden = false
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
  if (ui.scrollTo && screen.tab === 'household') {
    document.querySelector(`[data-help="${ui.scrollTo}"]`)?.scrollIntoView({ block: 'start' })
    ui.scrollTo = null
  }
}

function renderTonight(ctx) {
  const door = ctx.door
  const others = events.filter((e) => e.open && e !== door).sort((a, b) => b.wentLiveAt - a.wentLiveAt)
  const waits = waitingNights(events)
  // The door's night, then the rest: side by side from 1200 px wide, one column on phones.
  $('tonight').replaceChildren(
    door ? doorCard(door, ctx) : nothingOpen(goLiveOffer(events), ctx),
    h('div', { className: 'tonight-side' },
      others.length ? alsoOpen(others, ctx) : null,
      waits.length ? waiting(waits, ctx) : null,
      h('section', { data: { help: 'helpers' } }, h('h2', {}, '📱 Helpers'), helperBox('tonight')),
      h('section', { data: { help: 'tv' } }, h('h2', {}, '📺 Your TV'), ...tvBox()),
      h('section', { data: { help: 'watch' } }, h('h2', {}, '👀 Watch'), ...watchBox())))
}

// Your TV on Tonight: whether a paired TV is on (only a paired TV shows the helper and watch QRs), the code a bare
// /tv shows, and Use this screen as the TV. Made once, so a half-typed code survives a redraw; the 3 s poll
// keeps the line under the heading current.
const pairInput = h('input', { placeholder: 'K7Q-M4X', ariaLabel: 'The code on the TV', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false })
for (const input of [pairInput, $('pair-code'), $('check-pair-code')]) maskCodeInput(input)
const tvStatus = h('p', { className: 'muted' })
const tvNodes = [
  tvStatus,
  h('form', { className: 'row', onsubmit: async (e) => {
    e.preventDefault()
    const code = pairInput.value.trim()
    if (!code || !(await household.redeem(code))) return
    pairInput.value = ''
    say('✓ Paired: your TV is showing your board')
  } }, pairInput, h('button', { className: 'primary', type: 'submit', textContent: 'Pair' })),
  h('p', { className: 'muted', textContent: `On the TV, open ${location.host}/tv: it shows a code to type here, or a QR to scan with your phone. Or open Setup on the TV itself and:` }),
  h('div', { className: 'row' }, h('button', { textContent: 'Use this screen as the TV', onclick: () => household.pairHere() })),
]
function tvBox() {
  renderTvStatus()
  // Arrived from the TV's pairing screen (/pair → /setup#pair-tv): straight to the box, ready to type, once.
  if (location.hash === '#pair-tv') {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`)
    setTimeout(() => {
      pairInput.scrollIntoView({ block: 'center' })
      pairInput.focus()
    })
  }
  return tvNodes
}
function renderTvStatus() {
  const { paired = 0, tvLink = 0 } = house.screens ?? {}
  const viewers = `${tvLink === 1 ? 'One screen is' : `${tvLink} screens are`} watching by the TV link, which can't show the QRs.`
  tvStatus.textContent = paired
    ? `✓ ${paired === 1 ? 'Your paired TV is on' : `${paired} paired TVs are on`}: it shows the helper and watch QRs.`
    : `No paired TV is on.${tvLink ? ` ${viewers}` : ''} Pair your porch TV so it can show the QRs.`
}

// A code to read out or type in, always in sight: "Got a code?" on the homepage takes either.
const codeRow = (label, code) => h('div', { className: 'code-row' }, h('span', { textContent: label }), h('b', { textContent: code }))

// Watching from anywhere: this device, someone else's by the TV link (the same one the porch TV holds) or its watch
// code, or the watch QR on the TV for someone at the porch to scan.
function watchBox() {
  return [
    codeRow('👀 Watch code', formatCode(house.watchCode)),
    h('div', { className: 'row' },
      h('button', { className: 'primary', textContent: '📺 Watch on this device', onclick: () => (location.href = `${household.tvUrl()}?from=setup`) }),
      h('button', { textContent: 'Send the TV link', onclick: () => share(household.tvUrl(), 'Watch our trick-or-treat count') }),
      h('button', { data: { watchQr: '' }, textContent: watchQrButton(watchQrLeft()).label, onclick: toggleWatchQr })),
    h('p', { className: 'muted', data: { watchQrSays: '' }, textContent: ui.watchQr.says, hidden: !ui.watchQr.says }),
  ]
}
const watchQrLeft = () => Math.max(0, ui.watchQr.until - Date.now())
function renderWatchQr() {
  if (ui.watchQr.says && Date.now() - ui.watchQr.saidAt > SAYS_MS) ui.watchQr.says = ''
  const { showing, label } = watchQrButton(watchQrLeft())
  for (const b of document.querySelectorAll('[data-watch-qr]')) {
    b.textContent = label
    b.setAttribute('aria-pressed', String(showing))
  }
  for (const p of document.querySelectorAll('[data-watch-qr-says]')) {
    p.textContent = ui.watchQr.says
    p.hidden = !ui.watchQr.says
  }
}
setInterval(renderWatchQr, 1_000)
async function toggleWatchQr() {
  const res = await fetch('/api/tv/watch-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Join-Key': house.joinKey },
    body: JSON.stringify({ show: !watchQrButton(watchQrLeft()).showing }),
  }).catch(() => null)
  if (!res?.ok) {
    ui.watchQr.says = res?.status === 429 ? 'Too many tries: wait a minute' : res ? await res.text() : "Couldn't reach the server"
  } else {
    const answer = await res.json()
    ui.watchQr.until = Date.now() + answer.msLeft
    if (answer.shown) ui.tvQr.until = 0 // the TV shows one card at a time
    ui.watchQr.says = watchQrSays(answer)
  }
  ui.watchQr.saidAt = Date.now()
  renderWatchQr()
  renderTvQr()
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
// hides when done or dismissed. A kid seen, a skip and the dismissal are the Household's (sign-in-simplify 06),
// so every Manager and phone sees the same list.
const remember = (what) => admin({ type: 'checklist', item: what })
const checks = () =>
  checklist({
    events,
    testNightId: house.testNightEventId,
    tvWatching: house.checklist.tvWatching,
    kid: house.checklist.kid,
    lastYear: house.lastYear,
    skipped: house.checklist.night,
    dismissed: house.checklist.hidden,
    named: house.checklist.named,
    located: house.location != null,
    day: zoneDay,
  })

function renderChecklist() {
  const view = checks()
  $('check-last-year-row').hidden = !house.canEstimateLastYear
  $('check-tv').classList.toggle('done', view.tv)
  const tick = tvTick(house.door) // "✓ Your TV is showing Test night" (spec v2.1 §8)
  $('check-tv-line').replaceChildren(tick.text, ...(tick.name ? [h('i', { textContent: tick.name })] : []))
  for (const where of document.querySelectorAll('.tv-where')) where.textContent = `${location.host}/tv`
  $('check-name-form').hidden = !view.also.name
  $('check-location').hidden = !view.also.location
  $('check-also').hidden = !view.also.name && !view.also.location
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
$('checklist-hide').addEventListener('click', () => remember('hidden'))
$('check-night-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const night = checks().night
  if (night && $('check-expected').value !== '') await admin({ type: 'settings', eventId: night.id, expectedKids: Number($('check-expected').value) }, 'Expected kids saved')
})
$('check-last-year-save').addEventListener('click', () => {
  if ($('check-last-year').value) admin({ type: 'setLastYear', total: Number($('check-last-year').value) }, 'Last year saved: race it on the night')
})
$('check-night-skip').addEventListener('click', () => remember('night'))
// Item 1, Put it on your TV (first-run's screen 3, sign-in-simplify 05): pair by the TV's code, send the link to
// whatever will be the TV, or make this screen the TV. It ticks when a TV connects (the 3 s poll).
$('check-pair-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const code = $('check-pair-code').value.trim()
  if (!code || !(await household.redeem(code))) return
  $('check-pair-code').value = ''
  say('Paired: waiting for your TV…')
})
$('check-tv-send').addEventListener('click', () => share(household.tvUrl(), 'Our trick-or-treat TV'))
$('check-tv-here').addEventListener('click', () => household.pairHere())
// Also, when you like: the name here; the Location on Household, where its map lives.
$('check-name-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if ($('check-name').value.trim()) await admin({ type: 'rename', displayName: $('check-name').value }, 'Household name saved')
})
$('check-location').addEventListener('click', () => {
  go({ tab: 'household', event: null })
  ui.scrollTo = 'location'
})

// ---- the help (spec v2.1 §9): the column at 900 px and up, a "?" on each heading on phones
const help = createHelp({ column: $('help-col'), root: $('admin'), contact: document.querySelector('footer a[href^="mailto:"]').href })

// ---- Household: everything not about one night
const household = wireHousehold({ house: () => house, events: () => events, admin, say, share, load, helperBox, zoneDay, setHouse: (next) => (house = next) })

await load()
$('admin').hidden = false

// What this phone remembered before the checklist was the Household's: sent up once, then forgotten here.
for (const what of ['kid', 'night', 'hidden']) {
  const key = `cd.checklist.${house.id}.${what}`
  try {
    if (localStorage.getItem(key) === '1' && !house.checklist[what]) await remember(what)
    localStorage.removeItem(key)
  } catch {}
}

help.update(screenKey())
household.start()

// The checklist's ticks from state the page can't hear over a stream: ask every 3 s.
setInterval(async () => {
  const res = await fetch('/api/household').catch(() => null)
  if (!res?.ok) return
  house = await res.json()
  ui.tvQr.until = Date.now() + house.joinQrMsLeft // shown or hidden from a door phone meanwhile
  ui.watchQr.until = Date.now() + house.watchQrMsLeft
  renderTvStatus()
  renderChecklist()
  help.update(screenKey()) // the checklist may have come or gone
}, 3_000)

// Arrived from a TV's scan-to-pair QR (/setup?pair=): a card asks, on whatever tab this is. The code leaves the
// address bar at once, so a reload doesn't ask again.
const offer = pairOffer(new URLSearchParams(location.search).get('pair'))
if (new URLSearchParams(location.search).has('pair')) history.replaceState(history.state, '', `${location.pathname}${searchFor(screen)}`)
if (offer) {
  $('pair-card-text').textContent = offer.text
  $('pair-card').hidden = false
  $('pair-card-yes').addEventListener('click', async () => {
    $('pair-card').hidden = true
    await household.pairTv(offer.code)
  })
  $('pair-card-no').addEventListener('click', () => ($('pair-card').hidden = true))
}
