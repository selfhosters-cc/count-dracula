// The homepage on / (spec v2.1 §11): the pitch, the site-wide line, How it works, and one way in: Continue with
// Google (or email), which signs in or starts a household.
import { doorRedirect } from '/door-view.js'
import { readCode, tvCodeFrom } from '/shared/codes.js'
import { homeSiteLine } from '/nearby-text.js'

const $ = (id) => document.getElementById(id)

function storedKey() {
  try {
    return localStorage.getItem('cd.joinKey')
  } catch {
    return null
  }
}

// A phone that remembers a door's key belongs on /door; only the browser knows the key. A Manager sent here to
// sign in (/#sign-in) stays.
const goTo = doorRedirect({ pathname: location.pathname, search: location.search, hash: location.hash, storedKey: storedKey() })
if (goTo) location.replace(goTo)

// The browser's time zone rides along, and becomes a new Household's (v2 spec §6).
for (const input of document.querySelectorAll('input[name="timeZone"]')) {
  input.value = Intl.DateTimeFormat().resolvedOptions().timeZone
}

// The sticky Sign in or start / Got a code? bar on phones: up while neither the sign-in block nor the code box is on screen.
const sticky = $('sticky-cta')
const inView = new Map()
const watch = new IntersectionObserver((entries) => {
  for (const e of entries) inView.set(e.target.id, e.isIntersecting)
  sticky.classList.toggle('show', ![...inView.values()].some(Boolean))
})
for (const id of ['sign-in', 'code']) watch.observe($(id))

const getJson = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null)

// "🎃 Counting now on Count Dracula: 212 houses · ~3,140 kids", or "🌙 Last night …"; hidden below 5 Households.
getJson('/api/site').then((answer) => {
  const line = homeSiteLine(answer)
  $('site-line').hidden = !line
  if (!line) return
  const lead = document.createElement('b')
  lead.textContent = line.lead
  $('site-text').replaceChildren(lead, line.rest)
})

getJson('/api/home').then((home) => {
  if (!home) return
  // Paused sign-ups show here, before anyone goes to Google. Signing in still works, so the buttons stay.
  $('paused').hidden = !home.signUpsPaused
  // Continue with email, once the server can send mail.
  $('email-form').hidden = !home.emailSignIn
  // A signed-in Manager runs one Household: Welcome back replaces the sign-in block and the bar.
  if (home.household != null) {
    $('house-name').textContent = home.household
    $('signed-in').hidden = false
    for (const id of ['sign-in', 'code-line', 'tv-line', 'sticky-cta', 'sticky-space']) $(id).hidden = true
    watch.disconnect()
  }
})

// Count on this device: this phone remembers the Household's join key and opens the door phone, as in /setup.
$('count-here').addEventListener('click', async () => {
  const house = await getJson('/api/household')
  if (!house?.joinKey) return (location.href = '/setup') // signed out meanwhile, or Suspended: Setup says which
  try {
    localStorage.setItem('cd.joinKey', house.joinKey)
  } catch {}
  location.href = '/door'
})

// Watch on this device: the Household's TV link, as in /setup.
$('watch-here').addEventListener('click', async () => {
  const house = await getJson('/api/household')
  location.href = house?.tvToken ? `/tv/k/${house.tvToken}?from=home` : '/setup'
})

// Make this the porch TV: Use this screen as the TV, as in /setup: paired with no code, then the bare /tv, which keeps it.
$('tv-here').addEventListener('click', async () => {
  const res = await fetch('/api/pair/here', { method: 'POST' }).catch(() => null)
  if (!res?.ok) return (location.href = '/setup') // signed out meanwhile, or Suspended: Setup says which
  try {
    localStorage.setItem('cd.tvLink', JSON.stringify(await res.json())) // tv.js's stored link: { tvToken, deviceToken }
  } catch {
    return (location.href = '/tv') // can't keep it: the bare /tv pairs by its code instead
  }
  location.href = '/tv'
})

// A TV's scan-to-pair QR on a signed-out phone lands here with ?pair=: every way in carries the code on to /setup.
const waitingTv = tvCodeFrom(new URLSearchParams(location.search).get('pair'))
if (waitingTv) {
  for (const input of document.querySelectorAll('input[name="pair"]')) input.value = waitingTv
  $('pair-note-code').textContent = `${waitingTv.slice(0, 3)}-${waitingTv.slice(3)}`
  $('pair-note').hidden = false
}

// Got a code?: a TV's code pairs that TV (through sign-in if need be), a join code opens the door phone, and a
// watch code the TV view. Join and watch codes look alike, so the server says which; a mistyped one says so here.
$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const say = (text) => {
    $('code-error').textContent = text
    $('code-error').hidden = !text
  }
  const tvLink = $('code-input').value.match(/\/tv\/k\/[A-Za-z0-9_-]+/)?.[0] // a watch link pasted in
  if (tvLink) return (location.href = tvLink)
  const code = readCode($('code-input').value)
  if (!code) return say("That isn't a code we know. Codes are 6 letters and numbers, like K7Q-M4X.")
  if (code.tv) return (location.href = `/setup?pair=${code.tv}`)
  const res = await fetch(`/api/code?code=${encodeURIComponent(code.code ?? code.join)}`).catch(() => null)
  if (res?.status === 404) return say('No door or TV has that code. Check it with your host: their phone shows both.')
  if (res?.status === 429) return say('Too many tries: wait a while and try again.')
  const found = res?.ok ? await res.json() : null
  say('')
  if (found?.pair) return (location.href = `/setup?pair=${found.pair}`)
  location.href = found?.watch ?? `/door?key=${encodeURIComponent(found?.join ?? code.join)}`
})

// Just signed out (POST /auth/signout): say so, then tidy the address bar.
if (new URLSearchParams(location.search).has('signed-out')) {
  $('signed-out-note').hidden = false
  $('still-counting').hidden = !storedKey() // signing out never touches the door's join code on this phone
  history.replaceState(null, '', '/#sign-in')
}

