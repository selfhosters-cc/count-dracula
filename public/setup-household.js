// /setup's Household tab (spec v2.1 §9): helpers and the join key, Your TV, Last year (estimated), the name,
// Location, Managers and the account. Its sections are static in setup.html; this wires them and fills them in.
// core: { house(), admin(command, done), say(text, isError), share(url, title), load(), helperBox(place),
//   zoneDay(ms), setHouse(house) }
import qrcode from '/vendor/qrcode/qrcode.js'
import { createLocationPicker } from '/location-picker.js'
import { $, h } from './setup-dom.js'

export function wireHousehold(core) {
  const { admin, say, share } = core
  const house = () => core.house()

  // ---- Pair a TV (spec §9): the code a bare /tv shows, typed or arriving from its QR as ?pair=<code>
  async function redeem(code) {
    const res = await fetch('/api/pair/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (res.status === 401) location.href = '/#sign-in'
    if (!res.ok) {
      say(await res.text(), true)
      return false
    }
    if (!house().firstRunPassed) await admin({ type: 'passFirstRun' }) // the TV's on: first-run's job is done
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

  // ---- the TV link (spec §9): shared from here only, never shown on the TV. It watches the door's Event.
  const tvUrl = () => `${location.origin}/tv/k/${house().tvToken}`
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
  $('tv-rotate').addEventListener('click', () => {
    if (confirm('Rotate the TV link? Every screen watching with the old link stops at once, your porch TV included, until it gets the new one.')) admin({ type: 'rotateTvLink' }, 'TV link rotated')
  })

  // ---- the join key: one per Household, on every night (spec v2.1 §4)
  $('change-key').addEventListener('click', async () => {
    if (!confirm('Change the join key? Every phone using the old key stops counting until it rejoins.')) return
    const old = house().joinKey
    const done = await admin({ type: 'changeKey' }, 'Join key changed')
    // This device counts on with the new key if it had the old one; everyone else rejoins.
    if (done && localStorage.getItem('cd.joinKey') === old) localStorage.setItem('cd.joinKey', done.joinKey)
  })

  // ---- Last year (estimated) (spec v2.1 §7): the Household's default Race against, made from one number
  $('last-year-form').addEventListener('submit', (e) => {
    e.preventDefault()
    if ($('s-last-year').value) admin({ type: 'setLastYear', total: Number($('s-last-year').value) }, 'Last year saved')
  })
  $('s-last-year-clear').addEventListener('click', () => {
    if (confirm('Clear last year? Every night racing it goes back to None.')) admin({ type: 'setLastYear', total: null }, 'Last year cleared')
  })

  // ---- the name, and the account
  $('name-form').addEventListener('submit', (e) => {
    e.preventDefault()
    admin({ type: 'rename', displayName: $('h-name').value }, 'Household name saved')
  })
  $('delete-household').addEventListener('click', async () => {
    const name = house().displayName
    const typed = prompt(`Delete "${name}" and everything in it, for good? Type its name to confirm.`)
    if (typed == null) return
    if (typed !== name) return say("That didn't match, so nothing was deleted", true)
    const res = await fetch('/api/household/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed }) })
    if (!res.ok) return say(await res.text(), true)
    location.href = '/'
  })

  // ---- Managers and invites (spec §3)
  async function loadManagers() {
    const res = await fetch('/api/managers')
    if (!res.ok) return
    const { me, managers, invites } = await res.json()
    $('managers').replaceChildren(
      ...managers.map((m) =>
        h('div', { className: 'item' },
          h('span', { className: 'grow', textContent: `${m.name || m.email}${m.id === me ? ' (you)' : ''}` }),
          m.name ? h('span', { className: 'muted', textContent: m.email }) : null,
          m.id === me ? null : h('button', { className: 'danger', textContent: 'Remove', onclick: () => removeManager(m) }))),
    )
    $('invites').replaceChildren(
      ...invites.map((i) =>
        h('div', { className: 'item' },
          h('span', { className: 'grow muted', textContent: `Invite from ${i.madeByName || i.madeByEmail || 'the Operator'}, until ${core.zoneDay(i.expiresAt)}` }),
          h('button', { textContent: 'Share', onclick: () => share(i.url, 'Help run our trick-or-treat night') }),
          h('button', { className: 'danger', textContent: 'Revoke', onclick: () => revokeInvite(i) }))),
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
    location.href = '/'
  })

  return {
    redeem,
    tvUrl,
    render() {
      const hs = house()
      if (document.activeElement !== $('h-name')) $('h-name').value = hs.displayName
      $('join-key').textContent = hs.joinKey
      $('house-helpers').replaceChildren(...core.helperBox('house').flat().filter(Boolean))
      $('tv-link').textContent = tvUrl()
      $('last-year').hidden = !hs.canEstimateLastYear
      if (document.activeElement !== $('s-last-year')) $('s-last-year').value = hs.lastYear ?? ''
      $('s-last-year-clear').hidden = hs.lastYear == null
      $('signed-in').textContent = hs.manager.email
      $('h-zone').textContent = hs.timeZone
    },
    // Once the page is up: Managers, and the Location picker (drawn once; it keeps its own map).
    start() {
      loadManagers()
      createLocationPicker($('location'), {
        cell: house().location,
        async save(cell) {
          if (!(await admin({ type: 'setLocation', cell }, cell ? 'Location saved' : 'Location removed'))) throw new Error("Couldn't save the Location")
        },
      })
    },
    // Arrived from a TV's scan-to-pair QR: the code is filled in, and one confirm pairs it.
    pairFromUrl() {
      const code = new URLSearchParams(location.search).get('pair')
      if (!code) return
      history.replaceState(null, '', `${location.pathname}?tab=household`)
      $('pair-code').value = code
      $('pair-form').scrollIntoView({ block: 'center' })
      pairTv(code)
    },
  }
}
