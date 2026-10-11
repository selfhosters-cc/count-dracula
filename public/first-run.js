// First-run (v2 spec §6, v2.1 §8): three screens over /setup, shown on each visit until screen 3 has been passed once.
// Every screen can be skipped. 1: the household's name. 2: the Location. 3: put it on the TV.
import { createLocationPicker } from '/location-picker.js'
import { tvTick } from '/setup-view.js'

// root: an empty, hidden element. house: /api/household. admin(command): a Setup command, falsy if refused.
// redeem(code): pairs a TV, true if it did. tvUrl(): the TV link. share(url, title): share sheet or copy.
export function showFirstRun(root, { house, admin, redeem, tvUrl, share }) {
  const h = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props)
    node.append(...children)
    return node
  }
  let tvWatching = house.checklist.tvWatching
  let door = house.door // the door's Event: what the TV shows

  async function pass() {
    await admin({ type: 'passFirstRun' })
    root.hidden = true
  }

  function screen(n, ...children) {
    root.replaceChildren(h('div', { className: 'first-run' }, h('p', { className: 'muted', textContent: `Getting started · ${n} of 3` }), ...children))
    root.hidden = false
  }

  function nameScreen() {
    const input = h('input', { value: house.displayName, maxLength: 40, autocomplete: 'off', id: 'fr-name' })
    const next = h('button', { className: 'primary', type: 'submit', textContent: 'Next' })
    const skip = h('button', { type: 'button', textContent: 'Skip', onclick: locationScreen })
    const form = h('form', {}, h('label', { htmlFor: 'fr-name', textContent: 'Your household, as it shows on anything you share' }), input,
      h('p', { className: 'muted', textContent: `Time zone: ${house.timeZone} (from this phone). Your nights start and end by it.` }),
      h('div', { className: 'row' }, next, skip))
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (input.value.trim() !== house.displayName && !(await admin({ type: 'rename', displayName: input.value }))) return
      house.displayName = input.value.trim()
      locationScreen()
    })
    screen(1, h('h2', { textContent: 'Name your household' }), form)
  }

  function locationScreen() {
    const box = h('div')
    screen(2, h('h2', { textContent: 'Where are you? (optional)' }),
      h('p', { className: 'muted', textContent: 'A rough Location shows how busy it is near you on the night, and adds your door to it. You can add it later.' }), box)
    createLocationPicker(box, {
      cell: house.location,
      async save(cell) {
        if (!(await admin({ type: 'setLocation', cell }))) throw new Error("Couldn't save the Location")
        house.location = cell
        if (cell) tvScreen()
      },
      onSkip: tvScreen,
    })
  }

  let status
  function tvScreen() {
    const code = h('input', { placeholder: 'K7Q-M4X', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, id: 'fr-code' })
    const pair = h('form', { className: 'row' }, code, h('button', { className: 'primary', type: 'submit', textContent: 'Pair' }))
    pair.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (code.value.trim() && (await redeem(code.value.trim()))) status.textContent = 'Paired: waiting for your TV…'
    })
    status = h('p', { className: 'tv-status', id: 'fr-status' })
    const done = h('button', { className: 'primary', textContent: 'Done', onclick: pass, hidden: true, id: 'fr-done' })
    screen(3, h('h2', { textContent: 'Put it on your TV' }),
      h('p', {}, "On the TV's computer, open Chrome and go to ", h('b', { textContent: `${location.host}/tv` }), '. It shows a code: type it here, or scan its QR with your phone\'s camera.'),
      h('label', { htmlFor: 'fr-code', textContent: "The code on the TV" }), pair, status, done,
      h('div', { className: 'alternatives' },
        h('button', { type: 'button', textContent: 'Send the link instead', onclick: async () => { await share(tvUrl(), 'Our trick-or-treat TV'); await pass() } }),
        h('button', { type: 'button', textContent: 'Use this screen as the TV', onclick: async () => { await pass(); location.href = tvUrl() } }),
        h('button', { type: 'button', textContent: 'Skip for now', onclick: pass }),
        h('a', { href: '/help/tv', target: '_blank', textContent: 'Help with TV setup' })))
    render()
  }

  function render() {
    if (!status) return
    if (tvWatching) {
      const tick = tvTick(door) // "✓ Your TV is showing Test night" (spec v2.1 §8)
      status.replaceChildren(tick.text, ...(tick.name ? [h('i', { textContent: tick.name })] : []))
    } else if (!status.textContent) status.textContent = 'Waiting for a TV…'
    document.getElementById('fr-done').hidden = !tvWatching
  }

  nameScreen()
  return {
    // From /setup's poll: the TV ticks screen 3 over as soon as it connects.
    update(next) {
      tvWatching = next.checklist.tvWatching
      door = next.door
      render()
    },
  }
}
