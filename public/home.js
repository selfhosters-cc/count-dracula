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
    for (const id of ['sign-in', 'code-line', 'sticky-cta', 'sticky-space']) $(id).hidden = true
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

// A TV's scan-to-pair QR on a signed-out phone lands here with ?pair=: every way in carries the code on to /setup.
const waitingTv = tvCodeFrom(new URLSearchParams(location.search).get('pair'))
if (waitingTv) {
  for (const input of document.querySelectorAll('input[name="pair"]')) input.value = waitingTv
  $('pair-note-code').textContent = `${waitingTv.slice(0, 3)}-${waitingTv.slice(3)}`
  $('pair-note').hidden = false
}

// Got a code?: a TV's code pairs that TV (through sign-in if need be), a join code opens the door phone.
// A join code is checked first, so a mistyped one says so here instead of on the door phone.
$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const say = (text) => {
    $('code-error').textContent = text
    $('code-error').hidden = !text
  }
  const code = readCode($('code-input').value)
  if (!code) return say("That isn't a code we know. A TV shows 6 characters, like K7Q-M4X; a host's helper code is 10 letters and numbers.")
  if (code.tv) return (location.href = `/setup?pair=${code.tv}`)
  const res = await fetch(`/api/snapshot?key=${encodeURIComponent(code.join)}`).catch(() => null)
  if (res && (res.status === 401 || res.status === 403)) return say("No door has that code. Check it with your host: it's under the QR on their phone.")
  say('')
  location.href = `/door?key=${encodeURIComponent(code.join)}`
})

// Just signed out (POST /auth/signout): say so, then tidy the address bar.
if (new URLSearchParams(location.search).has('signed-out')) {
  $('signed-out-note').hidden = false
  $('still-counting').hidden = !storedKey() // signing out never touches the door's join code on this phone
  history.replaceState(null, '', '/#sign-in')
}

