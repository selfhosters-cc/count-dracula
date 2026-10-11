import { phoneNearby } from '/nearby-text.js'

// The sign-up page: the browser's time zone rides along, and becomes the new Household's (v2 spec §6).
for (const input of document.querySelectorAll('input[name="timeZone"]')) {
  input.value = Intl.DateTimeFormat().resolvedOptions().timeZone
}

// "🎃 Count Dracula tonight: 212 houses · ~3,140 kids" (v2 spec §14), when at least 5 Households are counting.
fetch('/api/site')
  .then((r) => (r.ok ? r.json() : null))
  .then((answer) => {
    const line = answer?.site ? phoneNearby({ area: null, site: answer.site }) : null
    const el = document.getElementById('site-line')
    el.textContent = line ?? ''
    el.hidden = !line
  })
  .catch(() => {})
