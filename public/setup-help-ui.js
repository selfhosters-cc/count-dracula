// The /setup help on the page (spec v2.1 §9), drawn from HELP (setup-help.js) as text, never as HTML.
// - At 900 px and up: a sticky column, titled Help, lists the topics on the screen showing, in page order. The
//   section in a band 15–45% down the viewport is open and highlighted; clicking a title scrolls to it. The
//   column never scrolls the page by itself.
// - On phones: a round "?" on each section's heading opens its help in place, under the heading. Which are open
//   is kept here, not in the DOM, because Tonight and a night's screen are redrawn after every command; a new
//   screen (another tab, or a night's screen opened or left) closes them all.
import { HELP } from './setup-help.js'
import { currentTopic } from './setup-view.js'
import { h } from './setup-dom.js'

export function helpBody(key) {
  const entry = HELP[key]
  if (!entry) return null
  return h('div', { className: 'help-body' },
    (entry.p ?? []).map((text) => h('p', { textContent: text })),
    entry.terms ? h('dl', {}, entry.terms.map(([term, text]) => [h('dt', { textContent: term }), h('dd', { textContent: text })])) : null,
    (entry.more ?? []).map(([label, href]) => h('p', {}, h('a', { className: 'link', href, textContent: `${label} ›` }))))
}

// column: the <aside>; root: what holds the sections; contact: the "Email us" address (a mailto: href).
export function createHelp({ column, root, contact }) {
  let screen = null // which screen the open "?"s belong to
  const open = new Set() // the topics whose "?" is open on this screen
  let current = null // the column's open topic
  let pinnedUntil = 0 // after a click in the column, its topic stays open while the page scrolls there
  let observer = null
  const inBand = new Set() // the sections in the band, as elements

  const visible = (el) => el.getClientRects().length > 0
  const order = (sections) => [...new Set(sections.map((el) => el.dataset.help))]

  // The "?" on a section's heading, and its help under the heading (or under the row the heading sits in).
  function decorate(section) {
    const key = section.dataset.help
    const heading = section.querySelector('h1, h2')
    if (!heading || !HELP[key]) return
    let button = heading.querySelector(':scope > .help-q')
    if (!button) {
      button = h('button', { type: 'button', className: 'help-q', textContent: '?' })
      button.addEventListener('click', () => {
        const k = section.dataset.help
        if (open.has(k)) open.delete(k)
        else open.add(k)
        decorate(section)
      })
      heading.append(button)
    }
    button.ariaLabel = `Help: ${HELP[key].title}`
    button.ariaExpanded = String(open.has(key))
    let anchor = heading
    while (anchor.parentElement && anchor.parentElement !== section) anchor = anchor.parentElement
    const shown = anchor.nextElementSibling?.classList.contains('help-inline') ? anchor.nextElementSibling : null
    if (!open.has(key)) return shown?.remove()
    if (shown?.dataset.for === key) return
    shown?.remove()
    anchor.after(h('div', { className: 'help-inline', data: { for: key } }, helpBody(key)))
  }

  function drawColumn(sections) {
    const keys = order(sections)
    column.hidden = keys.length === 0
    column.replaceChildren(
      h('h2', {}, 'Help'),
      ...keys.map((key) =>
        h('div', { className: `topic${key === current ? ' cur' : ''}` },
          h('button', { type: 'button', textContent: HELP[key]?.title ?? key, ariaExpanded: String(key === current), onclick: () => goTo(key) }),
          key === current ? helpBody(key) : null)),
      h('p', { className: 'foot muted' },
        h('a', { className: 'link', href: '/help/tv', textContent: 'TV help' }), ' · ',
        h('a', { className: 'link', href: contact, textContent: 'Email us' })))
  }

  const sections = () => [...root.querySelectorAll('[data-help]')].filter(visible)

  function goTo(key) {
    const section = sections().find((el) => el.dataset.help === key)
    current = key
    pinnedUntil = Date.now() + 1200
    drawColumn(sections())
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section.classList.add('flash')
    setTimeout(() => section.classList.remove('flash'), 900)
  }

  function follow() {
    if (Date.now() < pinnedUntil) return
    const list = sections()
    const next = currentTopic(order(list), new Set([...inBand].map((el) => el.dataset.help)), current)
    if (next !== current) {
      current = next
      drawColumn(list)
    }
  }

  function watch(list) {
    observer?.disconnect()
    inBand.clear()
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inBand.add(entry.target)
        else inBand.delete(entry.target)
      }
      follow()
    }, { rootMargin: '-15% 0px -55% 0px' })
    for (const el of list) observer.observe(el)
  }

  return {
    // After every draw: `screenKey` names the screen showing, and a new one closes every "?".
    update(screenKey) {
      if (screenKey !== screen) {
        screen = screenKey
        open.clear()
        current = null
        pinnedUntil = 0
      }
      for (const el of root.querySelectorAll('[data-help]')) decorate(el)
      const list = sections()
      current = currentTopic(order(list), new Set(), current)
      watch(list)
      drawColumn(list)
    },
  }
}
