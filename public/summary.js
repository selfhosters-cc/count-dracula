// The Night summary (v2 spec §12): Wrapped-style tap-through 9:16 slides of one ended night, one stat each,
// so any slide screenshots on its own, plus a receipt with the kids-per-minute barcode. Built from stored data,
// in the Household's zone. Names are set as text, never as HTML.
import { nightFacts } from '/shared/summary.js'
import { eventNow, ghost as ghostCurve, minuteOfDay, raceWindow } from '/shared/night-maths.js'

const $ = (id) => document.getElementById(id)
const fmt = (n) => n.toLocaleString('en-US')
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const h = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children.filter((c) => c != null))
  return node
}
const text = (cls, content) => h('div', { className: cls, textContent: content })
const costume = (t) => `${t.emoji ? `${t.emoji} ` : ''}${t.name}`

// ---- the race: tonight solid pumpkin, the ghost dashed, direct labels (numbers only, labels escaped)
function raceSvg(summary, f) {
  const w = 600
  const hgt = 260
  const pad = { l: 8, r: 150, t: 16, b: 28 }
  const shift = summary.event.clockShiftMs ?? 0
  const mins = summary.kids.map((k) => minuteOfDay(eventNow(k.tappedAt, shift), summary.timeZone)).sort((a, b) => a - b)
  const { min: x0, max: x1 } = raceWindow(mins, mins.at(-1) ?? 20 * 60)
  const yMax = Math.max(f.total, f.ghost?.total ?? 0) * 1.08 || 10
  const X = (m) => pad.l + ((m - x0) / (x1 - x0)) * (w - pad.l - pad.r)
  const Y = (v) => hgt - pad.b - (v / yMax) * (hgt - pad.t - pad.b)
  const tonight = [`${X(x0)},${Y(0)}`, ...mins.map((m, i) => `${X(m).toFixed(1)},${Y(i + 1).toFixed(1)}`)]
  const curve = ghostCurve(f.ghost.buckets)
  const ghostPts = []
  for (let m = x0; m <= x1; m += 5) ghostPts.push(`${X(m).toFixed(1)},${Y(curve(m)).toFixed(1)}`)
  const ticks = []
  for (let hr = Math.ceil(x0 / 60); hr * 60 <= x1; hr++) {
    ticks.push(`<line x1="${X(hr * 60)}" x2="${X(hr * 60)}" y1="${pad.t}" y2="${hgt - pad.b}" stroke="#2c2449"/>`)
    ticks.push(`<text x="${X(hr * 60)}" y="${hgt - 6}" fill="#b3aacb" font-size="18" text-anchor="middle" font-family="Fredoka">${((hr + 11) % 12) + 1}${hr % 24 < 12 ? 'am' : 'pm'}</text>`)
  }
  const end = tonight.at(-1).split(',')
  const label = f.ghost.estimated ? 'last year (estimated)' : f.ghost.label
  return `<svg viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Tonight against ${esc(label)}">
    ${ticks.join('')}
    <polyline points="${ghostPts.join(' ')}" fill="none" stroke="#c9d2ff" stroke-width="3" stroke-dasharray="8 7" opacity=".8"/>
    <text x="${X(x1) + 8}" y="${Y(f.ghost.total) + (f.gap > 0 ? 20 : -6)}" fill="#b3aacb" font-size="20" font-family="Fredoka">👻 ${esc(label)}: ${f.ghost.total}</text>
    <polyline points="${tonight.join(' ')}" fill="none" stroke="#ff7a1a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="${end[0]}" cy="${end[1]}" r="6" fill="#ff7a1a"/>
    <text x="${X(x1) + 8}" y="${Y(f.total) + (f.gap > 0 ? -6 : 20)}" fill="#f7efe0" font-size="22" font-weight="600" font-family="Fredoka">Tonight: ${f.total}</text>
  </svg>`
}

// ---- the receipt: costume line items, teens, the total, vs last year, tickets as a coupon, the barcode
function receipt(summary, f, showName) {
  const li = (name, q) => h('div', { className: 'li' }, h('span', { className: 'n', textContent: name }), h('span', { textContent: String(q) }))
  const peak = Math.max(1, ...f.perMinute)
  const n = Math.max(1, f.perMinute.length)
  const bars = f.perMinute.map((c, i) => {
    const bh = c ? 20 + (c / peak) * 80 : 6
    return `<rect x="${(i / n) * 300}" y="${100 - bh}" width="${Math.max(1, 300 / n - 0.8)}" height="${bh}" fill="#24201c"/>`
  })
  const date = f.first ? new Date(f.first).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: summary.timeZone }) : ''
  const barcode = h('div')
  barcode.innerHTML = `<svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Kids per minute through the night">${bars.join('')}</svg>`
  return h('div', { className: 'receipt' },
    text('c shop', 'Count Dracula'),
    text('c', showName && f.displayName ? f.displayName : 'TRICK-OR-TREAT DEPT.'),
    text('c tiny', `${date}${f.span ? ` · OPEN ${f.span}` : ''}`),
    h('hr'),
    ...f.board.map((t) => li(costume(t), `×${t.count}`)),
    f.untagged ? li('❓ Mystery costume', `×${f.untagged}`) : null,
    h('hr'),
    li('Teens (no ticket)', f.teens),
    li(`Peak rush ${f.peakText}`, f.peak?.count ?? 0),
    li('Biggest crew', f.crew?.size ?? 0),
    h('hr'),
    h('div', { className: 'li total' }, h('span', { textContent: 'TOTAL KIDS', style: 'flex: 1' }), h('span', { textContent: String(f.total) })),
    f.ghost ? li(`vs ${f.ghost.estimated ? 'last year (estimated)' : f.ghost.label}`, `${f.gap > 0 ? '+' : ''}${f.gap}`) : null,
    f.won.length ? text('coupon', `🎫 GOLDEN TICKETS REDEEMED: ${f.won.map((n) => `#${n}`).join(' ')}`) : null,
    barcode.firstElementChild,
    text('c tiny', '↑ every bar is a minute of the night ↑'),
    text('c tiny', 'THANK YOU · COME AGAIN NEXT YEAR 🎃'),
  )
}

// The slides, in spec order; a slide with nothing to say is left out.
export function buildSlides(summary, { showName = true, closing = [] } = {}) {
  const f = nightFacts(summary)
  const who = showName && f.displayName ? `${f.displayName} · ${f.night}` : f.night
  const ghostName = f.ghost?.estimated ? 'last year (estimated)' : f.ghost ? `${f.ghost.label}'s ghost` : ''
  const slides = [
    [text('eyebrow', who), text('mid', 'The night is over.'), text('line', "Here's how it went 🧛")],
    [text('eyebrow', 'You handed out candy to'), text('huge', fmt(f.total)), text('line', f.total ? `trick-or-treaters between ${f.span}` : 'trick-or-treaters')],
    f.ghost
      ? (() => {
          const chart = h('div', { className: 'chart' })
          chart.innerHTML = raceSvg(summary, f)
          return [text('eyebrow', `Versus ${ghostName} 👻`), text('mid', f.gap > 0 ? `+${f.gap}` : String(f.gap)), text('line', f.verdict), chart]
        })()
      : [text('eyebrow', 'Next year'), text('mid', fmt(f.numberToBeat)), text('line', 'is the number to beat')],
    f.peak
      ? [text('eyebrow', 'The rush hit at'), text('mid', f.peakText), text('line', `${f.peak.count} kids in half an hour. The biggest crew was ${f.crew?.size ?? 0} at once, at ${f.crewAt}.`)]
      : null,
    f.top
      ? [
          text('eyebrow', 'Costume of the night 👑'),
          text('huge', f.top.emoji ?? '❓'),
          text('mid', f.top.name),
          text('line', `${f.top.count} of them.${f.board.length > 1 ? ` Then ${f.board.slice(1, 4).map((t) => `${costume(t)} (${t.count})`).join(', ')}.` : ''}`),
        ]
      : null,
    f.tickets.length
      ? [
          text('eyebrow', 'Golden tickets 🎫'),
          text('mid gold', f.won.map((n) => `#${n}`).join(' ') || 'none found'),
          text('line', f.won.length ? `${f.won.length} lucky kid${f.won.length === 1 ? '' : 's'} went home with a prize.` : 'Nobody found one this year.'),
        ]
      : null,
    f.nearby
      ? [
          text('eyebrow', 'Near you 🏘️'),
          text('huge', fmt(f.nearby.houses)),
          text('line', `${f.nearby.houses === 1 ? 'house was' : 'houses were'} counting near you when your night ended, with ${f.nearby.kids30 ? `~${fmt(f.nearby.kids30)}` : 'under 5'} kids in their last half hour.${f.nearby.topCostume ? ` Top costume: ${costume(f.nearby.topCostume)}.` : ''}`),
        ]
      : null,
    [receipt(summary, f, showName)],
    [text('eyebrow', who), text('huge', fmt(f.total)), text('line', [f.verdict, f.top ? `👑 ${f.top.name}` : null, f.peak ? `⏰ ${f.peakText}` : null, f.won.length ? `🎫 ${f.won.length}` : null].filter(Boolean).join(' · ')), ...closing],
  ]
  // The intro, the closing card and the receipt (which prints its own) carry no brand line.
  return slides.map((content, i) => (content ? { content, background: `s${i}`, branded: i > 0 && i < 7 } : null)).filter(Boolean)
}

// ---- the stage: tap the right two-thirds (or → / space) for the next slide, the left third (or ←) for back
export function showSlides(summary, options = {}) {
  const slides = buildSlides(summary, options)
  let index = 0
  function render() {
    $('bars').replaceChildren(...slides.map((_, i) => h('i', { className: i <= index ? 'on' : '' })))
    const slide = slides[index]
    $('slide').replaceChildren(
      h('div', { className: `slide ${slide.background}` },
        slide.branded ? text('brand', 'Count Dracula') : null,
        ...slide.content,
        text('tap', `tap for next · ${index + 1}/${slides.length}`)),
    )
  }
  const step = (d) => {
    index = Math.min(slides.length - 1, Math.max(0, index + d))
    render()
  }
  $('frame').addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return
    const box = e.currentTarget.getBoundingClientRect()
    step(e.clientX < box.left + box.width / 3 ? -1 : 1)
  })
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') step(1)
    if (e.key === 'ArrowLeft') step(-1)
  })
  $('message').hidden = true
  $('frame').hidden = false
  render()
}

const params = new URLSearchParams(location.search)

// The Share button on a Manager's closing slide (spec §12): the night's one public link, the share sheet or
// Copy, and a toggle that keeps the household's name off the link.
function shareControls(eventId, displayName) {
  const show = h('input', { type: 'checkbox', checked: true })
  const status = text('note', displayName ? `"${displayName}" shows on the link unless you untick this.` : '')
  const button = h('button', { type: 'button', textContent: 'Share' })
  button.addEventListener('click', async (e) => {
    e.stopPropagation()
    const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, hideName: !show.checked }) })
    if (!res.ok) return (status.textContent = "Sharing is off right now.")
    const { url } = await res.json()
    if (navigator.share) {
      try {
        return await navigator.share({ title: 'Our Halloween night', url })
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(url)
    status.textContent = 'Link copied. Turn sharing off any time in Setup.'
  })
  show.addEventListener('click', (e) => e.stopPropagation())
  return h('div', { className: 'share' }, h('label', {}, show, 'Show our name'), button, status)
}

// "Report this page", on a public share page only.
function reportFooter(key) {
  $('footer').hidden = false
  $('report').addEventListener('click', () => ($('report-form').hidden = false))
  $('report-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, reason: $('report-reason').value }) })
    $('report-form').replaceChildren(text('', res.ok ? 'Thanks: the Operator will take a look.' : res.status === 429 ? 'Too many reports from here today.' : 'Not available.'))
  })
}

if (location.pathname === '/summary') {
  // A Manager's own summary: /summary?event=<id>.
  const eventId = params.get('event')
  const res = await fetch(`/api/summary?event=${encodeURIComponent(eventId)}`)
  if (res.status === 401) location.href = '/signup'
  else if (!res.ok) $('message').textContent = "There's no summary for this night yet: it appears once the night has ended."
  else {
    const summary = await res.json()
    await document.fonts.ready
    showSlides(summary, { closing: summary.switches.shareLinks === false ? [] : [shareControls(Number(eventId), summary.displayName)] })
  }
} else if (location.pathname === '/share') {
  // A public share link: no sign-in. The name is off when the Household's toggle says so.
  const key = params.get('key')
  const res = await fetch(`/api/share?key=${encodeURIComponent(key)}`)
  if (!res.ok) $('message').textContent = 'Not available'
  else {
    await document.fonts.ready
    showSlides(await res.json(), { showName: true })
    reportFooter(key)
  }
}
