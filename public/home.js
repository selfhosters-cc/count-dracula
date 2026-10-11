// The homepage on / (spec v2.1 §11): the pitch, the site-wide line, How it works, Start and Sign in.
import { doorRedirect, joinKeyFrom } from '/door-view.js'
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
// sign in (/#sign-in, /#start) stays.
const goTo = doorRedirect({ pathname: location.pathname, search: location.search, hash: location.hash, storedKey: storedKey() })
if (goTo) location.replace(goTo)

// The browser's time zone rides along, and becomes a new Household's (v2 spec §6).
for (const input of document.querySelectorAll('input[name="timeZone"]')) {
  input.value = Intl.DateTimeFormat().resolvedOptions().timeZone
}

// The sticky Start / Sign in bar on phones: up while neither the top row nor the forms are on screen.
const sticky = $('sticky-cta')
const inView = new Map()
const watch = new IntersectionObserver((entries) => {
  for (const e of entries) inView.set(e.target.id, e.isIntersecting)
  sticky.classList.toggle('show', ![...inView.values()].some(Boolean))
})
for (const id of ['cta-top', 'start', 'sign-in', 'join']) watch.observe($(id))

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
  // Paused sign-ups show here, before anyone goes to Google. Sign in still works.
  $('start-button').hidden = home.signUpsPaused
  $('paused').hidden = !home.signUpsPaused
  // A signed-in Manager runs one Household: Welcome back replaces the row, the bar and both forms.
  if (home.household != null) {
    $('house-name').textContent = home.household
    $('signed-in').hidden = false
    for (const id of ['cta-top', 'start', 'sign-in', 'sticky-cta', 'sticky-space']) $(id).hidden = true
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

// Join a night: the code typed or the link pasted opens the door phone with that key, as a helper's QR would.
$('join-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const key = joinKeyFrom($('join-code').value)
  $('join-error').hidden = key != null
  if (key) location.href = `/door?key=${encodeURIComponent(key)}`
})

