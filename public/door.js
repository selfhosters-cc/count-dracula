// The door phone on /door (v1 spec §4–5, v2.1 §4): counting, the ☰ door menu, the soundboard.
import { connectLive } from '/live.js'
import { createOutbox, uuid } from '/outbox.js'
import { doorScreen, doorView, goLiveNowTarget, helperLink, helperWording, joinCodeLine, quietNudge, refusedKey, tvQrButton, tvQrSays, watchLink, watchQrButton, watchQrSays } from '/door-view.js'
import { noNightLines } from '/no-night.js'
import { phoneNearby } from '/nearby-text.js'
import qrcode from '/vendor/qrcode/qrcode.js'
import { clockTime, eventNow, releaseOpen } from '/shared/night-maths.js'
import { formatCode } from '/shared/codes.js'

const $ = (id) => document.getElementById(id)
const EMOJIS = ['🧙', '🧛', '🧟', '👻', '🎃', '🦸', '🕷️', '👑', '🦖', '🐶', '🐱', '🦄', '🤖', '🦇', '🧚', '🏴‍☠️', '🐉', '🤡', '❓']

// The join key arrives as ?key=… once (a helper QR, Share join link, or Count on this device) and is remembered.
const params = new URLSearchParams(location.search)
if (params.get('key')) {
  localStorage.setItem('cd.joinKey', params.get('key'))
  // Take it out of the address bar, so a reload after "Change key" can't put the old one back.
  params.delete('key')
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''))
}
const joinKey = localStorage.getItem('cd.joinKey') ?? ''

// A refused key (spec v2.1 §4): forgotten unless its Household is only Suspended, and the phone says so, with
// one way on: the homepage.
function refused({ suspended }) {
  const { forget, says } = refusedKey({ hadKey: !!joinKey, suspended })
  if (forget) localStorage.removeItem('cd.joinKey')
  $('gone-text').textContent = says
  $('gone-home').hidden = suspended
  $('gone').hidden = false
}

let problem = ''

function post(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Join-Key': joinKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  })
}

async function send(entry) {
  const res = entry.type === 'remove' ? await post('/api/remove', { kidId: entry.kidId, eventId: entry.eventId, stamp: entry.stamp }) : await post('/api/taps', entry)
  problem = res.status === 403 ? 'Wrong join key: taps are kept until it is fixed' : ''
  if (res.status === 400) return // the server will never take it; don't block the queue behind it
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

const clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
}

function flash(text, gold = false) {
  const f = $('flash')
  f.classList.toggle('gold', gold)
  f.textContent = text
  f.classList.remove('on')
  void f.offsetWidth
  f.classList.add('on')
}

let toastTimer
function toast(text) {
  $('toast').textContent = text
  $('toast').classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $('toast').classList.remove('on'), 1800)
}

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const timeOf = (ms, timeZone) => clockTime(ms, timeZone) // in the Household's zone
const label = (row) => (row.tag ? `${row.tag.emoji ?? ''} ${row.tag.name}`.trim() : 'no costume')

function pillHtml(status) {
  if (status === 'sent') return '<span class="sent">✓ sent</span>'
  if (status === 'ok') return ''
  const n = status.waiting ?? status.down
  const line = status.down ? `<div class="down">Server's down — keep tapping, don't reload.</div>` : ''
  return `<span class="waiting">⏳ ${n} waiting to send</span>${line}`
}

function start(phoneName) {
  $('who').style.display = 'none'
  const outbox = createOutbox({ send, storage: localStorage, clock, phoneName })
  const live = connectLive(`/api/stream?key=${encodeURIComponent(joinKey)}`) // EventSource can't send headers
  live.onRefused(refused)
  let view = doorView(null, outbox)
  // Every write names the Event this phone shows and the go-live stamp it saw (spec v2.1 §4). With no night
  // on, there's none to name, and the server refuses the write.
  const night = () => {
    const event = live.state?.event
    return event ? { eventId: event.id, stamp: event.wentLiveAt } : {}
  }
  // The optimistic "#N" just shown; corrected if the server numbers that kid differently.
  let lastFlash = null
  let teenArmed = false
  let teenTimer

  // ---- costume tiles, keyed by tag id and updated in place so a press is never swapped out mid-tap
  const tiles = new Map()
  function tileFor(tag) {
    let tile = tiles.get(tag.id)
    if (!tile) {
      tile = document.createElement('button')
      tile.className = 'tile'
      tile.dataset.tag = tag.id
      tile.append(...['e', 'nm', 'dim'].map((cls) => Object.assign(document.createElement('span'), { className: cls })))
      tiles.set(tag.id, tile)
    }
    tile.style.setProperty('--c', tag.colour)
    tile.children[0].textContent = tag.emoji ?? ''
    tile.children[1].textContent = tag.name
    tile.children[2].textContent = tag.count
    return tile
  }

  // The Event on screen. When the door moves, anything begun on the old one (End's choices) goes with it.
  let shownEventId
  let ending = null // the Event End was pressed on, while its choices or confirm are up
  function render() {
    view = doorView(live.state, outbox, { connected: live.connected })
    const screen = doorScreen(live.state)
    const eventId = live.state?.event?.id ?? null
    if (live.state && eventId !== shownEventId) {
      shownEventId = eventId
      ending = null
      $('end-choices').hidden = true
    }
    // Nothing open: "No night on right now" and what's next, no board, no tap buttons (spec v2.1 §4).
    $('app').classList.toggle('idle', screen === 'no-night')
    $('no-night').hidden = screen !== 'no-night'
    if (screen === 'no-night') {
      const lines = noNightLines(live.state.next, Date.now())
      $('no-night-next').textContent = lines.next ?? ''
      $('no-night-countdown').textContent = lines.countdown ?? ''
      closeSounds()
    }
    renderGolden()
    $('nudge').hidden = !quietNudge(live.state, Date.now(), nudgeDismissedAt())
    const nearbyText = phoneNearby(live.state?.nearby) // the Area, or else the Site-wide total
    $('nearby').hidden = !nearbyText
    $('nearby').textContent = nearbyText ?? ''
    $('total').textContent = view.total ?? '–'
    $('untagged').textContent = view.untagged == null ? '' : `${view.untagged} untagged`
    $('pill').innerHTML = pillHtml(outbox.status)
    $('problem').textContent = problem
    const wanted = view.tags.map(tileFor)
    const grid = $('grid')
    for (const [id, tile] of tiles) {
      if (wanted.includes(tile)) continue
      tile.remove() // a costume deleted in Setup, or a different event after Go live
      tiles.delete(id)
    }
    wanted.forEach((tile, i) => {
      if (grid.children[i] !== tile) grid.insertBefore(tile, grid.children[i])
    })
    $('undo').disabled = !view.undo
    if (recentOpen) renderRecent()
    if (sheetOpen) renderSheet()
  }

  // ---- Undo and Recent: both go through the outbox, so they work offline too
  function removeKid(row) {
    outbox.remove(row.id, night())
    const number = row.number == null ? 'an unsent kid' : `#${row.number}`
    toast(`Removed ${number} · ${label(row)}${row.mine ? '' : ` (${row.phoneName}'s)`}`)
    render()
  }

  $('undo').addEventListener('click', () => {
    if (view.undo) removeKid(view.undo)
  })

  let recentOpen = false
  let recentHtml = ''
  function renderRecent() {
    const html = view.recent.length
      ? view.recent
          .map(
            (r) => `
      <div class="row ${r.queued ? 'queued' : ''}">
        <span class="n">${r.number == null ? '⏳' : '#' + r.number}</span>
        <span class="who">${esc(label(r))}${r.teen ? '<span class="badge teen">teen</span>' : ''}<span class="badge ${r.mine ? 'me' : ''}">${esc(r.phoneName)}</span>
          <div class="meta">${timeOf(r.tappedAt, live.state?.timeZone)}${r.queued ? ' · ⏳ not sent yet' : ''}</div></span>
        <button class="x" data-remove="${esc(r.id)}" aria-label="Delete">✕</button>
      </div>`,
          )
          .join('')
      : '<div class="empty">No kids yet</div>'
    if (html !== recentHtml) $('recent-rows').innerHTML = recentHtml = html // don't swap rows under a thumb
  }
  $('recent-open').addEventListener('click', () => {
    recentOpen = true
    $('recent').classList.add('on')
    renderRecent()
  })
  const closeRecent = () => {
    recentOpen = false
    $('recent').classList.remove('on')
  }
  $('recent-close').addEventListener('click', closeRecent)
  $('recent').addEventListener('click', (e) => {
    if (e.target === $('recent')) return closeRecent()
    const x = e.target.closest('[data-remove]')
    const row = x && view.recent.find((r) => r.id === x.dataset.remove)
    if (row) removeKid(row)
  })

  // 🧑 Teen arms the next kid only (a tile, +1 or + New), and lets go by itself after 30 s.
  function armTeen(on) {
    teenArmed = on
    clearTimeout(teenTimer)
    if (on) teenTimer = setTimeout(() => armTeen(false), 30_000)
    $('teen').setAttribute('aria-pressed', on)
    $('app').classList.toggle('teen', on)
    $('add').textContent = on ? '+1 Teen' : '+1 Kid'
    renderGolden()
  }
  $('teen').addEventListener('click', () => armTeen(!teenArmed))

  function renderGolden() {
    $('golden').hidden = !view.goldenBanner
    $('golden').textContent = teenArmed
      ? '⭐ NEXT KID IS GOLDEN — a teen passes it on to a later kid'
      : '⭐ NEXT KID IS GOLDEN — get the prize ready'
  }

  function tap(tagId) {
    const teen = teenArmed
    const entry = outbox.tap(tagId, { teen, night: night() })
    if (teen) armTeen(false)
    render()
    const tag = view.tags.find((t) => t.id === tagId)
    showFlash(entry.id, view.total, teen ? '🧑' : tag?.emoji)
    navigator.vibrate?.(20)
  }

  function showFlash(kidId, number, emoji) {
    lastFlash = { kidId, number, emoji }
    flash(`#${number}${emoji ? ' ' + emoji : ''}`)
  }

  live.on((update) => {
    outbox.sync(update)
    const kid = update.delta?.type === 'kid.added' ? update.delta.kid : null
    if (kid && update.delta.moments?.includes('golden') && outbox.mine.has(kid.id)) {
      // The server confirmed this phone's tap won (spec §9): the strong buzz and the prize prompt.
      lastFlash = null
      flash('🎫 GOLDEN — hand over the prize!', true)
      navigator.vibrate?.([80, 60, 80, 60, 300])
    } else if (kid && lastFlash && kid.id === lastFlash.kidId && kid.number !== lastFlash.number) {
      showFlash(kid.id, kid.number, lastFlash.emoji) // another phone got there first
    }
    render()
  })

  $('add').addEventListener('click', () => tap(null))
  $('grid').addEventListener('click', (e) => {
    const tile = e.target.closest('[data-tag]')
    if (tile) tap(Number(tile.dataset.tag))
  })
  addEventListener('online', () => outbox.retryNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') outbox.retryNow()
  })
  setInterval(render, 500) // acks and the 5 s / 2 min thresholds

  // ---- ☰ door menu (spec §5): the TV's sound and "Add a helper". Writes need the join key.
  const mix = () => live.state?.settings.mix ?? { volume: 1, mutes: {} }
  let mixTimer
  function sendMix(next) {
    clearTimeout(mixTimer)
    mixTimer = setTimeout(async () => {
      const res = await post('/api/mix', next).catch(() => null)
      if (!res?.ok) toast(res?.status === 403 ? 'Wrong join key: scan a helper code' : "Couldn't reach the TV")
    }, 120) // the slider fires a lot; send where it settles
  }
  function renderMenu() {
    const m = mix()
    if (document.activeElement !== $('volume')) $('volume').value = Math.round(m.volume * 100)
    for (const b of $('menu').querySelectorAll('[data-mute]')) b.setAttribute('aria-pressed', String(!!m.mutes[b.dataset.mute]))
    const joined = !!joinKey
    const left = live.state?.golden?.left ?? 0
    const shift = live.state?.event?.clockShiftMs ?? 0
    $('release-box').hidden = !(left > 0 && releaseOpen(eventNow(Date.now(), shift), live.state?.timeZone))
    $('release').textContent = `🎫 Release remaining tickets (${left})`
    renderSounds()
    $('unjoined').hidden = joined
    // With nothing open, ☰ keeps its device items (and Go live now): no End, Resume or Release.
    const open = !!live.state?.event
    if (!open) $('release-box').hidden = true
    $('end-night').hidden = !open
    if (!open) $('end-choices').hidden = true
    $('night-head').hidden = !open && $('go-live-now').hidden
    const ended = !!live.state?.event?.ended
    $('end-night').textContent = ended ? '☀️ Resume the night' : '🌙 End the night'
    for (const c of $('menu').querySelectorAll('input, [data-mute], #helper-show, #release, #end-night, #watch-tv, #watch-send, #watch-here, #join-send')) c.disabled = !joined
  }
  $('menu-open').addEventListener('click', () => {
    renderMenu()
    loadCodes()
    renderGoLiveNow()
    $('helper-qr').hidden = true
    $('helper-tv').hidden = true
    $('menu').classList.add('on')
  })
  $('menu-close').addEventListener('click', () => $('menu').classList.remove('on'))
  $('menu').addEventListener('click', (e) => {
    if (e.target === $('menu')) $('menu').classList.remove('on')
  })
  $('volume').addEventListener('input', () => sendMix({ ...mix(), volume: Number($('volume').value) / 100 }))
  $('menu').querySelector('.mutes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mute]')
    if (!b) return
    const m = mix()
    sendMix({ ...m, mutes: { ...m.mutes, [b.dataset.mute]: !m.mutes[b.dataset.mute] } })
    b.setAttribute('aria-pressed', String(!m.mutes[b.dataset.mute])) // feels instant; the delta confirms
  })
  live.on(({ delta }) => {
    if (!delta || delta.type === 'mix.changed' || delta.type === 'event.ended' || 'golden' in delta) renderMenu()
  })
  // ---- the soundboard page: swipe left from counting (or tap the 🔊 edge tab), swipe right to come back
  // A press names the Event on the TV, so with none open there's no soundboard.
  const soundboard = () => (live.state?.event ? (live.state.settings.soundboard ?? []) : [])
  function renderSounds() {
    const sounds = soundboard()
    $('sounds-tab').hidden = !sounds.length // switched off → no page, no tab
    $('sounds-from-menu').hidden = !sounds.length
    if (!sounds.length) closeSounds()
    const labels = sounds.map((s) => `${s.slot}:${s.emoji}:${s.label}`).join('|')
    if ($('board').dataset.labels !== labels) {
      $('board').dataset.labels = labels
      $('board').replaceChildren(
        ...sounds.map((s) => {
          const b = document.createElement('button')
          b.dataset.slot = s.slot
          b.append(Object.assign(document.createElement('span'), { className: 'e', textContent: s.emoji ?? '🔊' }), s.label)
          return b
        }),
      )
    }
    for (const b of $('board').children) b.disabled = !joinKey
  }
  const soundsOpen = () => $('sounds').classList.contains('on')
  function openSounds() {
    if (!soundboard().length) return
    renderSounds()
    $('menu').classList.remove('on')
    $('sounds').classList.add('on')
    $('sounds').setAttribute('aria-hidden', 'false')
  }
  function closeSounds() {
    $('sounds').classList.remove('on')
    $('sounds').setAttribute('aria-hidden', 'true')
  }
  $('sounds-tab').addEventListener('click', openSounds)
  $('sounds-from-menu').addEventListener('click', openSounds)
  $('sounds-close').addEventListener('click', closeSounds)

  // A deliberate sideways swipe: far enough, mostly horizontal and quick. Taps on tiles stay taps.
  let swipe = null
  $('app').addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    swipe = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null
  }, { passive: true })
  $('app').addEventListener('touchend', (e) => {
    if (!swipe) return
    const t = e.changedTouches[0]
    const dx = t.clientX - swipe.x
    const dy = t.clientY - swipe.y
    const quick = Date.now() - swipe.at < 700
    swipe = null
    if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return
    const sheetUp = ['menu', 'sheet', 'recent'].some((id) => $(id).classList.contains('on')) || $('who').style.display === 'flex'
    if (dx < 0 && !soundsOpen() && !sheetUp) openSounds()
    else if (dx > 0 && soundsOpen()) closeSounds()
  }, { passive: true })

  $('board').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-slot]')
    if (!b) return
    const res = await post('/api/soundboard', { slot: Number(b.dataset.slot), ...night() }).catch(() => null)
    if (res?.status === 400) return toast("That night isn't on the TV any more") // the door's Event moved
    if (!res?.ok) return toast("Couldn't reach the TV")
    if (!(await res.json()).played) return toast('Cooling down: one sound every 3 s')
    navigator.vibrate?.(15)
    // The shared 3 s cooldown, shown as a bar emptying.
    $('board').classList.add('cooling')
    $('cool-fill').animate([{ width: '100%' }, { width: '0%' }], { duration: 3_000, easing: 'linear' }).finished.then(() => $('board').classList.remove('cooling'))
  })
  // The quiet nudge (spec §7): it opens the usual End the night, choices and all. ✕ hides it for 30 minutes.
  function nudgeDismissedAt() {
    return Number(localStorage.getItem('cd.nudgeDismissedAt') ?? -Infinity)
  }
  // Its End names the Event it was shown for: the door's (spec v2.1 §5).
  $('nudge-end').addEventListener('click', () => {
    renderMenu()
    $('menu').classList.add('on')
    $('end-night').click()
  })
  $('nudge-dismiss').addEventListener('click', () => {
    localStorage.setItem('cd.nudgeDismissedAt', String(Date.now()))
    render()
  })

  // "Go live on Halloween 2026 now" (spec v2.1 §5): only on a phone where a Manager of this Household is signed
  // in, for the Upcoming Event with the soonest Goes live at, whether or not others are open. It's a Setup
  // command, so the server refuses it from a join key alone, and at the 3-open cap like any Go live.
  let scheduled = null // { id, name } of the next night with a Goes live at, for a Manager's phone
  async function findScheduled() {
    scheduled = null
    const house = await fetch('/api/household').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    // This phone: who's signed in, if anyone, and Sign out (Count Dracula's session only; the door's code stays).
    $('menu-who').hidden = $('menu-signout').hidden = !house
    if (house) $('menu-who-email').textContent = house.manager?.email ?? ''
    if (house?.joinKey !== joinKey) return
    const events = await fetch('/api/events').then((r) => (r.ok ? r.json() : [])).catch(() => [])
    scheduled = goLiveNowTarget(events)
  }
  async function renderGoLiveNow() {
    await findScheduled()
    $('go-live-now').hidden = !scheduled
    if (scheduled) $('go-live-now').textContent = `🎃 Go live on ${scheduled.name} now`
    $('night-head').hidden = !live.state?.event && !scheduled
  }
  $('go-live-now').addEventListener('click', async () => {
    if (!scheduled || !confirm(`Go live on ${scheduled.name} now? The TV and the door phones switch over to it.`)) return
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'goLive', eventId: scheduled.id }) }).catch(() => null)
    if (res?.status === 400) toast(await res.text()) // at the cap: "End or close one of your live nights first"
    else toast(res?.ok ? `🎃 ${scheduled.name} is live` : "Couldn't go live: check the connection")
    $('menu').classList.remove('on')
  })

  // 🚪 Stop counting on this phone: it forgets the door's code and goes to the homepage. Not while taps wait to
  // send, or they'd be lost.
  $('stop-counting').addEventListener('click', () => {
    const waiting = outbox.pending.length
    if (waiting) return toast(`${waiting} tap${waiting === 1 ? " hasn't" : "s haven't"} sent yet: try again once ${waiting === 1 ? 'it has' : 'they have'}`)
    const where = live.state?.household ? `${live.state.household}'s door` : 'this door'
    if (!confirm(`Stop counting at ${where} on this phone? It forgets the door. To help again, scan the QR or enter the code.`)) return
    try {
      localStorage.removeItem('cd.joinKey')
    } catch {}
    location.href = '/'
  })

  // 🌙 End the night / Resume. With tickets left, the spec's three choices instead of a plain yes/no. The Event
  // is named when End is pressed (the nudge's included), and the choices go if the door moves meanwhile.
  const nightCall = async (path, done) => {
    $('end-choices').hidden = true
    const named = ending ?? night()
    ending = null
    const res = await post(path, named).catch(() => null)
    toast(res?.ok ? done : "Couldn't reach the server")
  }
  $('end-night').addEventListener('click', () => {
    ending = night()
    if (live.state?.event?.ended) return nightCall('/api/resume', '☀️ The night is back on')
    const left = live.state?.golden?.left ?? 0
    if (left > 0) {
      $('end-question').textContent = `🎫 ${left} golden ticket${left === 1 ? '' : 's'} never found. Release ${left === 1 ? 'it' : 'them'} to the next ${left === 1 ? 'kid' : `${left} kids`} instead?`
      $('end-choices').hidden = false
      return
    }
    if (confirm('End the night? Straggler taps still count, and any phone can resume it.')) nightCall('/api/end', '🌙 Night ended')
    else ending = null
  })
  $('end-release').addEventListener('click', () => nightCall('/api/release', '🎫 Released: the next kids win'))
  $('end-anyway').addEventListener('click', () => nightCall('/api/end', '🌙 Night ended: the tickets expired'))
  $('end-cancel').addEventListener('click', () => {
    ending = null
    $('end-choices').hidden = true
  })
  $('release').addEventListener('click', async () => {
    const left = live.state?.golden?.left ?? 0
    if (!confirm(`Release the ${left} golden ticket${left === 1 ? '' : 's'} left? The next ${left} kid${left === 1 ? '' : 's'} at the door will win.`)) return
    const res = await post('/api/release', night()).catch(() => null)
    toast(res?.ok ? `🎫 Released: the next ${left} kid${left === 1 ? '' : 's'} win` : "Couldn't release: check the connection")
  })

  let codes = null // { joinCode, watchCode, tvToken }, from /api/codes

  // A phone that scans this joins without typing anything. Only ever drawn here, never on the TV. It names the
  // Household, never an Event, so it's right on every night (spec v2.1 §4).
  $('helper-show').addEventListener('click', () => {
    const url = helperLink(location.origin, joinKey) // the public HTTPS address
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    $('helper-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
    $('helper-qr').append(
      Object.assign(document.createElement('p'), { className: 'says', textContent: helperWording(live.state?.household) }),
      ...(codes ? [Object.assign(document.createElement('p'), { textContent: joinCodeLine(formatCode(codes.joinCode), location.origin) })] : []),
      Object.assign(document.createElement('p'), { textContent: url }),
    )
    $('helper-qr').hidden = false
    $('tv-qr-says').textContent = ''
    $('helper-tv').hidden = false
    renderTvQr()
  })

  // "📺 Show on the TV" (spec v2.1 §4): the same QR on the Household's paired TVs for 2 minutes. The stream
  // says while it's showing (from /setup too), with the time left but never the key.
  const tvQrLeft = () => Math.max(0, (live.state?.joinQr?.until ?? 0) - Date.now())
  function renderTvQr() {
    const { showing, label } = tvQrButton(tvQrLeft())
    $('tv-qr').textContent = label
    $('tv-qr').setAttribute('aria-pressed', String(showing))
    $('tv-qr').disabled = !joinKey
  }
  live.on(({ cause }) => {
    if (cause === 'joinQr' || cause === 'snapshot') renderTvQr()
  })
  let saidAt = 0
  setInterval(() => {
    if ($('helper-tv').hidden) return
    if (Date.now() - saidAt > 10_000) $('tv-qr-says').textContent = '' // the answer fades; the button keeps the state
    renderTvQr()
  }, 1_000)
  $('tv-qr').addEventListener('click', async () => {
    const show = !tvQrButton(tvQrLeft()).showing
    const res = await post('/api/tv/join-qr', { show }).catch(() => null)
    saidAt = Date.now()
    if (!res?.ok) {
      $('tv-qr-says').textContent = res?.status === 429 ? 'Too many tries: wait a minute' : res?.status === 403 ? 'Wrong join key: scan a helper code' : "Couldn't reach the TV"
      return
    }
    $('tv-qr-says').textContent = tvQrSays(await res.json())
    renderTvQr()
  })

  // ---- Watchers and helpers: the two codes, read each time ☰ opens (a Change join key or Rotate TV link in /setup
  // shows at once), and the watch QR on every screen watching for 2 minutes. Both links go out by the phone's own
  // share sheet.
  async function loadCodes() {
    const res = await fetch('/api/codes', { headers: { 'X-Join-Key': joinKey } }).catch(() => null)
    codes = res?.ok ? await res.json() : null
    $('watch-code').textContent = codes ? formatCode(codes.watchCode) : '—'
    $('join-code').textContent = codes ? formatCode(codes.joinCode) : '—'
  }
  async function shareLink(url, title) {
    if (navigator.share) return navigator.share({ title, url }).catch(() => {})
    await navigator.clipboard?.writeText(url).catch(() => {})
    toast('Link copied')
  }
  $('watch-send').addEventListener('click', () => codes && shareLink(watchLink(location.origin, codes.tvToken), `Watch our trick-or-treat count`))
  // The TV's view on this phone, with ‹ Door to come back (tv.js).
  $('watch-here').addEventListener('click', () => codes && (location.href = `${watchLink(location.origin, codes.tvToken)}?from=door`))
  $('join-send').addEventListener('click', () => shareLink(helperLink(location.origin, joinKey), `Help count trick-or-treaters at ${live.state?.household || 'our door'}`))
  const watchQrLeft = () => Math.max(0, (live.state?.watchQr?.until ?? 0) - Date.now())
  function renderWatchQr() {
    const { showing, label } = watchQrButton(watchQrLeft())
    $('watch-tv').textContent = label
    $('watch-tv').setAttribute('aria-pressed', String(showing))
  }
  live.on(({ cause }) => {
    if (cause === 'watchQr' || cause === 'snapshot') renderWatchQr()
  })
  let watchSaidAt = 0
  setInterval(() => {
    if (Date.now() - watchSaidAt > 10_000) $('watch-says').textContent = ''
    renderWatchQr()
  }, 1_000)
  $('watch-tv').addEventListener('click', async () => {
    const res = await post('/api/tv/watch-qr', { show: !watchQrButton(watchQrLeft()).showing }).catch(() => null)
    watchSaidAt = Date.now()
    if (!res?.ok) {
      $('watch-says').textContent = res?.status === 429 ? 'Too many tries: wait a minute' : res?.status === 403 ? 'Wrong join key: scan a helper code' : "Couldn't reach the TV"
      return
    }
    $('watch-says').textContent = watchQrSays(await res.json())
    renderWatchQr()
  })
  if (joinKey) loadCodes()

  // ---- "+ New" costume with Catch-up. Online only: one direct POST, safe to retry with the same kid id.
  let sheetOpen = false
  let draft = null

  for (const emoji of EMOJIS) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: emoji })
    b.dataset.emoji = emoji
    $('emojis').append(b)
  }

  function canCreate() {
    return live.connected && outbox.pending.length === 0
  }

  function renderSheet() {
    draft.n = Math.max(0, Math.min(draft.n, view.catchUp.max))
    $('new-n').textContent = draft.n
    for (const b of $('emojis').children) b.classList.toggle('sel', b.dataset.emoji === draft.emoji)
    const next = (view.total ?? 0) + 1
    const numbers = view.catchUp.preview(draft.n)
    $('new-hint').textContent = draft.n === 0
      ? `Counts this kid as #${next}. ${view.catchUp.max} untagged kids available to catch up.`
      : `Counts this kid as #${next}, and re-tags ${numbers.map((n) => '#' + n).join(', ')} as ${draft.emoji} ${draft.name.trim() || '…'}.`
    $('new-offline').textContent = canCreate() ? '' : 'Needs a connection — tap +1 Kid for now'
    $('new-create').disabled = draft.sending || !canCreate()
  }

  $('new').addEventListener('click', () => {
    draft = { name: '', emoji: EMOJIS[0], n: 0, kidId: uuid(), tappedAt: Date.now(), teen: teenArmed, sending: false }
    $('new-form').querySelector('h3').textContent = draft.teen ? 'New costume · 🧑 teen' : 'New costume'
    $('new-name').value = ''
    sheetOpen = true
    $('sheet').classList.add('on')
    renderSheet()
    setTimeout(() => $('new-name').focus(), 50)
  })

  function closeSheet() {
    sheetOpen = false
    $('sheet').classList.remove('on')
  }

  $('new-cancel').addEventListener('click', closeSheet)
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet()
  })
  $('new-name').addEventListener('input', (e) => {
    draft.name = e.target.value
    renderSheet()
  })
  $('new-form').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b?.dataset.emoji) draft.emoji = b.dataset.emoji
    else if (b?.dataset.step) draft.n += Number(b.dataset.step)
    else return
    renderSheet()
  })

  $('new-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!canCreate() || draft.sending) return
    const name = draft.name.trim() || 'Mystery'
    const number = (view.total ?? 0) + 1
    draft.sending = true
    renderSheet()
    try {
      const res = await post('/api/catch-up', {
        ...night(),
        tag: { name, emoji: draft.emoji },
        n: draft.n,
        kid: { id: draft.kidId, tappedAt: draft.tappedAt, phoneName, ...(draft.teen && { teen: true }) },
      })
      // A refused name ("Pick another name") is said as is, and the sheet stays open to fix it.
      if (res.status === 400) return toast(await res.text())
      if (!res.ok) throw new Error(res.status === 403 ? 'Wrong join key' : `HTTP ${res.status}`)
      outbox.claim(draft.kidId)
      armTeen(false)
      closeSheet()
      toast(`New: ${draft.emoji} ${name} ×${draft.n + 1}`)
      // The deltas are published before the reply, so the real number may already be here.
      const landed = live.state?.kids.find((k) => k.id === draft.kidId)
      showFlash(draft.kidId, landed?.number ?? number, draft.emoji)
      navigator.vibrate?.(20)
    } catch (err) {
      toast(`Couldn't create it (${err.message}). Try again.`)
    } finally {
      draft.sending = false
      render()
    }
  })

  render()
}

// First open: ask once, remember on the phone.
const savedName = localStorage.getItem('cd.phoneName')
if (savedName) {
  start(savedName)
} else {
  $('who').style.display = 'flex'
  // Name the door: the Household's name comes with a phone's snapshot (never a TV's).
  fetch('/api/snapshot', { headers: { 'X-Join-Key': joinKey } })
    .then((res) => (res.ok ? res.json() : null))
    .then((snap) => {
      if (!snap?.household) return
      const where = Object.assign(document.createElement('b'), { textContent: snap.household })
      $('who-intro').replaceChildren("You're counting trick-or-treaters for ", where, ': one tap per kid at the door. First, who\'s holding this phone?')
    })
    .catch(() => {})
  const choose = (name) => {
    name = name.trim()
    if (!name) return
    localStorage.setItem('cd.phoneName', name)
    start(name)
  }
  for (const b of $('who').querySelectorAll('[data-name]')) b.addEventListener('click', () => choose(b.dataset.name))
  $('who').addEventListener('submit', (e) => {
    e.preventDefault()
    choose($('custom').value)
  })
}
