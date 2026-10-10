// PROTOTYPE — throwaway (ticket: Shareable night summary). Four structurally different takes on a
// night summary built to screenshot and share, on one route, switched with ?variant=. Read-only.
//   A  Story poster   — one 9:16 card: hero count, verdict, race chart, stat tiles, golden numbers
//   B  Candy receipt  — an itemised receipt per costume; the barcode is the night's arrivals per minute
//   C  Wrapped slides — tap-through 9:16 stories, one stat per slide, screenshot any of them
//   D  Pumpkin patch  — a 1:1 feed post: every kid as a pumpkin, coloured by costume, count on top
// No hover layer anywhere: this is a screenshot surface, not something you explore.
import { biggestCrew, costumeOfTheNight, eventNow, ghost as ghostCurve, leaderboard, minuteOfDay, peakHalfHour, tagColour } from '/shared/night-maths.js'

const VARIANTS = [
  ['A', 'Story poster'],
  ['B', 'Candy receipt'],
  ['C', 'Wrapped slides'],
  ['D', 'Pumpkin patch'],
]
const params = new URLSearchParams(location.search)
const $ = (id) => document.getElementById(id)
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// ---- fake data: a 372-kid night shaped like 2025, crews of 1–9, 12 costumes, 5 golden tickets
function fakeNight() {
  let seed = 31
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const at = (h, m, s = 0) => new Date(2026, 9, 31, h, m, s).getTime()
  const tags = [
    ['Witch', '🧙'], ['Spider-Man', '🕷️'], ['Wednesday', '🖤'], ['Dinosaur', '🦖'], ['Princess', '👑'], ['Ghost', '👻'],
    ['Skeleton', '💀'], ['Pumpkin', '🎃'], ['Ninja', '🥷'], ['Bluey', '🐶'], ['Vampire', '🧛'], ['Zombie', '🧟'],
  ].map(([name, emoji], i) => ({ id: i + 1, name, emoji, order: i + 1 }))
  const weights = [14, 11, 13, 7, 9, 6, 5, 4, 4, 6, 3, 3]
  const pickTag = () => {
    if (rnd() < 0.3) return null
    let r = rnd() * weights.reduce((a, b) => a + b)
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return tags[i].id
    return null
  }
  const buckets = [
    [at(17, 38), at(18, 0), 16], [at(18, 0), at(18, 30), 80], [at(18, 30), at(19, 0), 118],
    [at(19, 0), at(19, 30), 121], [at(19, 30), at(20, 0), 37],
  ]
  const taps = []
  for (const [from, to, count] of buckets) {
    let left = count
    while (left > 0) {
      const size = Math.min(left, rnd() < 0.04 ? 9 : 1 + Math.floor(rnd() * rnd() * 6))
      let t = from + rnd() * (to - from - 60_000)
      const crewTag = rnd() < 0.15 ? pickTag() : undefined // the odd matching crew
      for (let i = 0; i < size; i++) taps.push({ tappedAt: (t += 2000 + rnd() * 4000), tagId: crewTag !== undefined ? crewTag : pickTag(), teen: rnd() < 0.04 })
      left -= size
    }
  }
  taps.sort((a, b) => a.tappedAt - b.tappedAt)
  const won = new Set([47, 118, 203, 259])
  const kids = taps.map((k, i) => ({ id: `k${i}`, number: i + 1, ...k, golden: won.has(i + 1) }))
  return {
    event: { name: 'Halloween 2026', clockShiftMs: 0, visitWindowMs: 15_000, ended: true },
    household: 'The Frosts on Maple St',
    kids,
    tags,
    ghost: {
      label: '2025',
      total: 346,
      buckets: [
        { start: '17:42', end: '18:00', count: 14 }, { start: '18:00', end: '18:30', count: 72 },
        { start: '18:30', end: '19:00', count: 107 }, { start: '19:00', end: '19:30', count: 119 },
        { start: '19:30', end: '20:00', count: 34 },
      ],
    },
    recap: {
      tickets: [
        { number: 47, state: 'won', kidNumber: 47 }, { number: 118, state: 'won', kidNumber: 118 },
        { number: 203, state: 'won', kidNumber: 203 }, { number: 256, state: 'rolled', kidNumber: 259 },
        { number: 388, state: 'expired', kidNumber: null },
      ],
    },
    // Invented: what a nearby line might say once location + nearby exist.
    hood: { rank: 3, homes: 12, areaKids: 2184, areaName: 'your part of town' },
  }
}

// ---- everything a variant needs, worked out once
function facts(state) {
  const shift = state.event.clockShiftMs ?? 0
  const kids = state.kids
  const total = kids.length
  const g = state.ghost
  const gap = g ? total - g.total : null
  const verdict = g == null ? null : gap > 0 ? `🏆 New record! +${gap} on ${g.label}` : gap < 0 ? `👻 ${g.label} wins by ${-gap}` : `🤝 Tied with ${g.label}`
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
  }
  const timeOf = (ms) => new Date(ms + shift).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  const peak = peakHalfHour(kids, shift)
  const crew = biggestCrew(kids, state.event.visitWindowMs ?? 15_000)
  const top = costumeOfTheNight(kids, state.tags)
  const board = leaderboard(kids, state.tags, 99).filter((t) => t.count)
  const untagged = kids.filter((k) => k.tagId == null).length
  const teens = kids.filter((k) => k.teen).length
  const first = kids.length ? Math.min(...kids.map((k) => k.tappedAt)) : null
  const last = kids.length ? Math.max(...kids.map((k) => k.tappedAt)) : null
  const tickets = state.recap?.tickets ?? []
  return {
    name: state.household ?? 'Our house', night: state.event.name, total, ghost: g, gap, verdict, peak, crew, top, board, untagged, teens,
    first, last, tickets, shift, clock, timeOf, hood: state.hood ?? null,
    peakText: peak ? `${clock(peak.start)}–${clock(peak.end)}` : '—',
    span: first ? `${timeOf(first)} – ${timeOf(last)}` : '',
  }
}

const show = { hood: params.get('hood') !== '0', name: params.get('name') !== '0' }
const hoodLine = (f) => (show.hood && f.hood ? `🏘 ${ordinal(f.hood.rank)} busiest of ${f.hood.homes} homes near you · ${f.hood.areaKids.toLocaleString()} kids in ${f.hood.areaName}` : '')
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const whoLine = (f) => (show.name ? `${esc(f.name)} · ${esc(f.night)}` : esc(f.night))

// ---- the race as a small SVG: tonight solid pumpkin, the ghost dashed and pale, direct labels
function raceSvg(state, f, { w = 600, h = 230 } = {}) {
  const pad = { l: 8, r: 150, t: 14, b: 26 }
  const x0 = 17 * 60 + 30, x1 = 20 * 60 + 30
  const yMax = Math.max(f.total, f.ghost?.total ?? 0) * 1.08 || 10
  const X = (m) => pad.l + ((m - x0) / (x1 - x0)) * (w - pad.l - pad.r)
  const Y = (v) => h - pad.b - (v / yMax) * (h - pad.t - pad.b)
  const mins = state.kids.map((k) => minuteOfDay(eventNow(k.tappedAt, f.shift))).sort((a, b) => a - b)
  const tonight = [`${X(x0)},${Y(0)}`, ...mins.map((m, i) => `${X(m).toFixed(1)},${Y(i + 1).toFixed(1)}`)]
  if (mins.length) tonight.push(`${X(Math.min(x1, mins.at(-1) + 5)).toFixed(1)},${Y(mins.length).toFixed(1)}`)
  let ghostPath = ''
  if (f.ghost) {
    const curve = ghostCurve(f.ghost.buckets)
    const pts = []
    for (let m = x0; m <= x1; m += 5) pts.push(`${X(m).toFixed(1)},${Y(curve(m)).toFixed(1)}`)
    ghostPath = `<polyline points="${pts.join(' ')}" fill="none" stroke="#c9d2ff" stroke-width="3" stroke-dasharray="8 7" opacity=".8"/>
      <text x="${X(x1) + 8}" y="${Y(f.ghost.total) + (f.gap > 0 ? 18 : -6)}" fill="#b3aacb" font-size="20" font-family="Fredoka">👻 ${f.ghost.label}: ${f.ghost.total}</text>`
  }
  const ticks = [18, 19, 20].map((hr) => `<text x="${X(hr * 60)}" y="${h - 4}" fill="#b3aacb" font-size="17" text-anchor="middle" font-family="Fredoka">${hr - 12}pm</text>
    <line x1="${X(hr * 60)}" x2="${X(hr * 60)}" y1="${pad.t}" y2="${h - pad.b}" stroke="#2c2449" stroke-width="1"/>`).join('')
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Tonight's count against ${f.ghost?.label ?? 'nothing'} through the night">
    ${ticks}
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2c2449" stroke-width="2"/>
    ${ghostPath}
    <polyline points="${tonight.join(' ')}" fill="none" stroke="#ff7a1a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="${tonight.at(-1).split(',')[0]}" cy="${tonight.at(-1).split(',')[1]}" r="6" fill="#ff7a1a" stroke="#1f1838" stroke-width="2"/>
    <text x="${X(x1) + 8}" y="${Y(f.total) + (f.gap > 0 ? -6 : 18)}" fill="#f7efe0" font-size="22" font-weight="600" font-family="Fredoka">Tonight: ${f.total}</text>
  </svg>`
}

const ticketSpans = (f) =>
  f.tickets
    .map((t) => (t.kidNumber != null ? `<span>#${t.kidNumber}</span>` : `<span class="miss">#${t.number}</span>`))
    .join('') || '<span class="miss">none</span>'

// ---- A: story poster (9:16), everything on one card
function variantA(state, f) {
  return `<div class="frame tall poster">
    <div class="brand">🧛 Count Dracula</div>
    <div class="who">${whoLine(f)}</div>
    <div class="big">${f.total}</div>
    <div class="unit">trick-or-treaters · ${f.span}</div>
    ${f.verdict ? `<div class="verdict">${f.verdict}</div>` : ''}
    <div class="chart">${raceSvg(state, f)}</div>
    <div class="rows">
      <div class="row"><div class="k">Peak half-hour</div><div class="v">${f.peakText}</div><div class="s">${f.peak?.count ?? 0} kids</div></div>
      <div class="row"><div class="k">Biggest crew</div><div class="v">${f.crew?.size ?? 0} at once</div><div class="s">${f.crew ? f.timeOf(f.crew.at) : ''}</div></div>
      <div class="row wide"><div class="k">Costume of the night 👑</div><div class="v">${f.top ? esc(`${f.top.emoji ?? ''} ${f.top.name}`) : '—'}</div><div class="s">${f.top ? `${f.top.count} kids · then ${f.board.slice(1, 3).map((t) => esc(`${t.emoji ?? ''} ${t.name}`)).join(', ')}` : ''}</div></div>
      <div class="row wide"><div class="k">🎫 Golden tickets won</div><div class="tickets">${ticketSpans(f)}</div></div>
    </div>
    ${hoodLine(f) ? `<div class="hood">${hoodLine(f)}</div>` : ''}
    <div class="foot">Count your own Halloween at <b>count-dracula.example.com</b></div>
  </div>`
}

// ---- B: candy receipt (9:16), itemised, the barcode is arrivals per minute
function variantB(state, f) {
  const perMinute = new Map()
  for (const k of state.kids) {
    const m = Math.floor(minuteOfDay(eventNow(k.tappedAt, f.shift)))
    perMinute.set(m, (perMinute.get(m) ?? 0) + 1)
  }
  const from = Math.floor(minuteOfDay(eventNow(f.first ?? 0, f.shift)))
  const to = Math.ceil(minuteOfDay(eventNow(f.last ?? 0, f.shift)))
  const peakMin = Math.max(1, ...perMinute.values())
  const n = Math.max(1, to - from + 1)
  const bars = []
  for (let m = from; m <= to; m++) {
    const c = perMinute.get(m) ?? 0
    const bh = c ? 20 + (c / peakMin) * 80 : 6
    bars.push(`<rect x="${((m - from) / n) * 300}" y="${100 - bh}" width="${Math.max(1, 300 / n - 0.8)}" height="${bh}" fill="#24201c"/>`)
  }
  const li = (name, q) => `<div class="li"><span class="n">${name}</span><span class="q">${q}</span></div>`
  const date = new Date(f.first ?? Date.now()).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `<div class="frame tall receipt-wrap"><div class="receipt">
    <div class="c shop">Count Dracula</div>
    <div class="c">${show.name ? esc(f.name) : 'TRICK-OR-TREAT DEPT.'}</div>
    <div class="c tiny">${date} · OPEN ${f.span}</div>
    <hr>
    ${f.board.map((t) => li(esc(`${t.emoji ?? ''} ${t.name}`), `×${t.count}`)).join('')}
    ${f.untagged ? li('❓ Mystery costume', `×${f.untagged}`) : ''}
    <hr>
    ${li('Teens (no ticket)', f.teens)}
    ${li(`Peak rush ${f.peakText}`, f.peak?.count ?? 0)}
    ${li('Biggest crew', f.crew?.size ?? 0)}
    <hr>
    <div class="li total"><span class="n" style="flex:1">TOTAL KIDS</span><span>${f.total}</span></div>
    ${f.ghost ? li(`vs ${f.ghost.label}`, `${f.gap > 0 ? '+' : ''}${f.gap}`) : ''}
    ${f.tickets.filter((t) => t.kidNumber != null).length ? `<div class="coupon">🎫 GOLDEN TICKETS REDEEMED: ${f.tickets.filter((t) => t.kidNumber != null).map((t) => `#${t.kidNumber}`).join(' ')}</div>` : ''}
    ${hoodLine(f) ? `<div class="c tiny">${hoodLine(f)}</div>` : ''}
    <svg class="barcode" viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Kids per minute through the night">${bars.join('')}</svg>
    <div class="c tiny">↑ every bar is a minute of the night ↑</div>
    <div class="c tiny" style="margin-top:2cqw">THANK YOU · COME AGAIN NEXT YEAR 🎃<br>count-dracula.example.com</div>
  </div></div>`
}

// ---- C: wrapped slides (9:16), tap / ←→ to step; each slide screenshots on its own
let slide = Number(params.get('slide') ?? 0)
function variantC(state, f) {
  const slides = [
    `<div class="eyebrow">${whoLine(f)}</div><div class="mid">Halloween<br>is over.</div><div class="line">Here's how the night went 🧛</div>`,
    `<div class="eyebrow">You handed out candy to</div><div class="huge">${f.total}</div><div class="line">trick-or-treaters between ${f.span}</div>`,
    f.ghost
      ? `<div class="eyebrow">Versus ${f.ghost.label}'s ghost 👻</div><div class="mid">${f.gap > 0 ? `+${f.gap}` : f.gap}</div><div class="line">${f.verdict}</div>${raceSvg(state, f)}`
      : `<div class="eyebrow">Next year</div><div class="mid">${f.total}</div><div class="line">is the number to beat</div>`,
    `<div class="eyebrow">The rush hit at</div><div class="mid">${f.peakText}</div><div class="line">${f.peak?.count ?? 0} kids in half an hour. The biggest crew was <b>${f.crew?.size ?? 0} at once</b> at ${f.crew ? f.timeOf(f.crew.at) : ''}.</div>`,
    `<div class="eyebrow">Costume of the night 👑</div><div class="huge esc-emoji">${esc(f.top?.emoji ?? '❓')}</div><div class="mid">${esc(f.top?.name ?? '—')}</div><div class="line">${f.top?.count ?? 0} of them. Then ${f.board.slice(1, 4).map((t) => esc(`${t.emoji ?? ''} ${t.name} (${t.count})`)).join(', ')}.</div>`,
    `<div class="eyebrow">Golden tickets 🎫</div><div class="mid gold">${f.tickets.filter((t) => t.kidNumber != null).map((t) => `#${t.kidNumber}`).join(' ') || 'none'}</div><div class="line">${f.tickets.filter((t) => t.kidNumber != null).length} lucky kids went home with a prize.</div>`,
    show.hood && f.hood
      ? `<div class="eyebrow">Around you 🏘</div><div class="huge">${ordinal(f.hood.rank)}</div><div class="line">busiest of ${f.hood.homes} homes near you. ${f.hood.areaKids.toLocaleString()} kids counted in ${f.hood.areaName} tonight.</div>`
      : null,
    `<div class="eyebrow">${whoLine(f)}</div><div class="huge">${f.total}</div><div class="line">${f.verdict ?? ''}<br>👑 ${esc(f.top?.name ?? '')} · ⏰ ${f.peakText} · 🎫 ${f.tickets.filter((t) => t.kidNumber != null).length}</div><div class="line" style="font-size:4cqw;opacity:.7">count-dracula.example.com</div>`,
  ].filter(Boolean)
  slide = ((slide % slides.length) + slides.length) % slides.length
  return `<div class="frame tall slides" id="slides">
    <div class="bars">${slides.map((_, i) => `<i class="${i <= slide ? 'on' : ''}"></i>`).join('')}</div>
    <div class="slide s${slide}">${slides[slide]}<div class="tap">tap for next · ${slide + 1}/${slides.length}</div></div>
  </div>`
}

// ---- D: pumpkin patch (1:1), one dot per kid in arrival order, coloured by costume, gold for winners
function variantD(state, f) {
  const n = state.kids.length
  const cols = Math.ceil(Math.sqrt(n * 1.6))
  const rows = Math.ceil(n / cols)
  const cell = 10
  const byId = new Map(state.tags.map((t) => [t.id, t]))
  const dots = state.kids
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((k, i) => {
      const cx = (i % cols) * cell + cell / 2
      const cy = Math.floor(i / cols) * cell + cell / 2
      const fill = k.golden ? '#ffcf3a' : tagColour(byId.get(k.tagId)?.order ?? null)
      return `<circle cx="${cx}" cy="${cy}" r="${k.golden ? 4.6 : 3.8}" fill="${fill}"${k.golden ? ' stroke="#fff6" stroke-width="1"' : ''}/>`
    })
    .join('')
  const legend = [
    ...f.board.slice(0, 6).map((t) => `<span><i style="background:${t.colour}"></i>${esc(`${t.emoji ?? ''} ${t.name}`)} ${t.count}</span>`),
    f.board.length > 6 ? `<span><i style="background:#8a84a8"></i>others</span>` : '',
    `<span><i style="background:#ff7a1a"></i>no costume tapped</span>`,
    `<span><i style="background:#ffcf3a"></i>golden ticket</span>`,
  ].join('')
  return `<div class="frame square patch">
    <div class="top"><div class="brand">🧛 Count Dracula</div><div class="who">${whoLine(f)}${hoodLine(f) ? `<br>${hoodLine(f)}` : ''}</div></div>
    <div class="field">
      <svg viewBox="0 0 ${cols * cell} ${rows * cell}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${n} kids in arrival order, coloured by costume">${dots}</svg>
      <div class="overlay"><div><div class="n">${f.total}</div><div class="v">${f.verdict ?? 'kids tonight'}</div></div></div>
    </div>
    <div class="legend">${legend}</div>
  </div>`
}

const RENDER = { A: variantA, B: variantB, C: variantC, D: variantD }

// ---- the switcher
let state
let current = VARIANTS.some(([k]) => k === params.get('variant')) ? params.get('variant') : 'A'
function render() {
  const f = facts(state)
  $('stage').innerHTML = RENDER[current](state, f)
  $('vlabel').textContent = `${current} — ${VARIANTS.find(([k]) => k === current)[1]}`
  $('t-hood').classList.toggle('off', !show.hood)
  $('t-name').classList.toggle('off', !show.name)
  const p = new URLSearchParams(location.search)
  p.set('variant', current)
  if (current === 'C') p.set('slide', slide)
  else p.delete('slide')
  history.replaceState(null, '', `?${p}`)
  $('slides')?.addEventListener('click', (e) => {
    slide += e.clientX < e.currentTarget.getBoundingClientRect().left + e.currentTarget.clientWidth / 3 ? -1 : 1
    render()
  })
}
const step = (d) => {
  const i = VARIANTS.findIndex(([k]) => k === current)
  current = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length][0]
  render()
}
$('prev').onclick = () => step(-1)
$('next').onclick = () => step(1)
$('t-hood').onclick = () => ((show.hood = !show.hood), render())
$('t-name').onclick = () => ((show.name = !show.name), render())
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]')) return
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
  if (current === 'C' && (e.key === ' ' || e.key === 'ArrowDown')) ((slide += 1), render(), e.preventDefault())
  if (current === 'C' && e.key === 'ArrowUp') ((slide -= 1), render())
})

const eventId = params.get('event')
state = eventId ? await fetch(`/api/snapshot?event=${encodeURIComponent(eventId)}`).then((r) => r.json()) : fakeNight()
await document.fonts.ready
render()
