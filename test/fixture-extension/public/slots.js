// The fixture's page slots (v2.2 §8): a small marked node in each, so a look at a page shows where each slot
// sits and what ctx it got. Each node counts the times its slot was drawn, and a button calls ctx.refresh(), so
// a redraw shows. Text goes in as textContent.
const drawn = {}
function node(tag, slot, text, props = {}) {
  drawn[slot] = (drawn[slot] ?? 0) + 1
  const n = Object.assign(document.createElement(tag), { textContent: `🧪 ${text} · drawn ${drawn[slot]}`, ...props })
  n.dataset.fixture = slot
  return n
}

function nightTools({ event, household, refresh }) {
  return node('button', 'setup.nightTools', `Fixture: night ${event.id} (${event.state}), household ${household.id}`, { className: 'small', onclick: refresh })
}

function summaryClosing({ eventId }) {
  return node('p', 'summary.closing', `Fixture: night ${eventId}`, { className: 'note' })
}

function home({ signedIn, place }) {
  return place === 'footer'
    ? node('a', 'home.footer', 'Fixture', { href: '/fixture' })
    : node('p', 'home.line', `Fixture line, signed ${signedIn ? 'in' : 'out'}`, { className: 'muted code-line' })
}

function operatorHousehold({ household, refresh }) {
  return node('button', 'operator.household', `Fixture: household ${household.id}`, { onclick: refresh })
}

function operatorSite({ refresh }) {
  return node('button', 'operator.site', 'Fixture site', { onclick: refresh })
}

export { nightTools as 'setup.nightTools', summaryClosing as 'summary.closing', home, operatorHousehold as 'operator.household', operatorSite as 'operator.site' }
