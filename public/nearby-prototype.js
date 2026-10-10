// PROTOTYPE — throwaway (ticket: Nearby activity indicator). Lives only on the prototype/nearby-activity branch.
// Three takes on "what's happening close by", mounted on the real /tv and phone (/) pages with fake Area data:
//   ?variant=A  Ambient: an always-on strip on the TV's top bar and under the phone's count
//   ?variant=B  Moments: nothing always-on; each 10-minute refresh slides a card up on the TV and toasts the phone
//   ?variant=C  Phone only: the TV stays location-free; a "Tonight near you" section with a chart in the door menu
// Data: ?area=busy|early|quiet|none (busy suburb at the peak, the same suburb at 5:50, a sparse town below
// the 5-Household minimum, a Household with no Location). Below the minimum: ?fallback=hide|site.
// The bottom bar (or ← →) switches; N fires the next "refresh" now. Refreshes are every 30 s here, not 10 min.

const params = new URLSearchParams(location.search)
const onTv = location.pathname === '/tv'
const VARIANTS = { A: 'Ambient strip', B: 'Moments on refresh', C: 'Phone only, with a chart' }
const AREAS = { busy: 'Busy suburb, 7:40 pm', early: 'Same suburb, 5:50 pm', quiet: 'Sparse town (3 counting)', none: 'No Location set' }
const MIN_HOUSEHOLDS = 5
const REFRESH_MS = 30_000

// ---- fake figures. "last30" is what the server would publish at each 10-minute refresh: kids counted in the
// Area in the half hour before, by active Households (a live, non-Rehearsal Event with a kid in the last 30 min).
const SERIES = {
  busy: [3, 8, 14, 22, 31, 38, 47, 58, 66, 79, 88, 93, 84, 87].map((v, i) => ({ min: 17 * 60 + 30 + i * 10, v })),
  early: [2, 6, 9, 12].map((v, i) => ({ min: 17 * 60 + 20 + i * 10, v })),
  quiet: [1, 2, 4, 5, 6, 4].map((v, i) => ({ min: 17 * 60 + 50 + i * 10, v })),
}
const FIGURES = {
  busy: { active: 14, tonight: 642, top: ['🕷️', 'Spider-Man'], yoursTonight: 52, yours30: 11 },
  early: { active: 6, tonight: 19, top: ['👑', 'Princess'], yoursTonight: 3, yours30: 3 },
  quiet: { active: 3, tonight: 31, top: ['🦖', 'Dinosaur'], yoursTonight: 9, yours30: 2 },
}
const SITE = { active: 212, tonight: 3140 } // the whole deployment, same ≥ 5 rule

const state = {
  variant: VARIANTS[params.get('variant')] ? params.get('variant') : 'A',
  area: AREAS[params.get('area')] ? params.get('area') : 'busy',
  fallback: params.get('fallback') === 'site' ? 'site' : 'hide',
  tick: 0, // how many refreshes have happened (walks the series forward a step for the demo)
}

const round5 = (n) => Math.max(0, Math.round(n / 5) * 5)
const fmt = (n) => n.toLocaleString('en-US')
const kids = (n) => (round5(n) === 0 ? 'under 5 kids' : `~${fmt(round5(n))} kids`)
const clockText = (min) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')}`

// What the server would hand this Household right now: Area figures, the site-wide fallback, or nothing.
function figures() {
  if (state.area === 'none') return { kind: 'no-location', site: state.fallback === 'site' ? SITE : null }
  const f = FIGURES[state.area]
  if (f.active < MIN_HOUSEHOLDS) return { kind: 'below', site: state.fallback === 'site' ? SITE : null }
  const all = SERIES[state.area]
  const series = all.slice(0, Math.max(1, all.length - 3 + (state.tick % 4))) // replay the last few refreshes
  const now = series.at(-1)
  const prev = series.at(-2)
  const best = Math.max(...series.map((p) => round5(p.v)))
  const trend =
    round5(now.v) === best && series.length > 3 ? 'Busiest half hour yet round here'
    : prev && round5(now.v) > round5(prev.v) ? 'Picking up round here'
    : prev && round5(now.v) < round5(prev.v) ? 'Starting to quieten down round here'
    : 'Steady round here'
  return { kind: 'area', ...f, last30: now.v, at: now.min, series, trend, avgHouse: f.tonight / f.active }
}

// ---- styles: a little of each page's own look, plus the prototype bar
const css = document.createElement('style')
css.textContent = `
  .nb-proto-bar { position: fixed; left: 0; right: 0; margin: 0 auto; width: fit-content; bottom: 10px; z-index: 1000; display: flex; flex-wrap: wrap; justify-content: center;
    align-items: center; gap: 6px; max-width: calc(100vw - 20px); padding: 6px 8px; border-radius: 14px; background: #fff; color: #111;
    font: 600 13px/1.2 system-ui, sans-serif; box-shadow: 0 6px 24px #000c; cursor: auto; user-select: none; }
  .nb-proto-bar button, .nb-proto-bar select { font: inherit; border: 1px solid #ccc; background: #f3f3f3; color: #111; border-radius: 8px; padding: 4px 8px; cursor: pointer; }
  .nb-proto-bar .label { min-width: 12em; text-align: center; }
  .nb-proto-bar .tag { color: #a14400; }
  body.nb-cursor { cursor: auto !important; }
  @media (max-width: 600px) { .nb-proto-bar { font-size: 11px; gap: 4px; padding: 4px 6px; bottom: 4px; } .nb-proto-bar .label { min-width: 0; } .nb-proto-bar .tag { display: none; } }

  /* TV, A: an ambient block under the hero's rush meter */
  .nb-strip { margin-top: 2vh; max-width: 30em; padding: .8vh 1vw; border-radius: 14px; background: var(--night-2);
    font-size: clamp(11px, 1.25vw, 24px); color: var(--ink-dim); font-weight: 600; line-height: 1.3; }
  .nb-strip .k { letter-spacing: .12em; text-transform: uppercase; color: var(--pumpkin); font-size: .8em; }
  .nb-strip b { font-family: var(--f-display); font-weight: 400; color: var(--ink); }
  /* TV, B: the card that slides up on each refresh */
  .nb-moment { position: fixed; left: 50%; bottom: 4.5vh; z-index: 32; translate: -50% 0; width: min(64vw, 1200px); transform: translateY(140%);
    transition: transform .7s cubic-bezier(.3, 1.3, .5, 1); background: var(--night-2); border: 3px solid var(--pumpkin); border-radius: 22px;
    padding: 2.2vh 2.4vw; display: grid; grid-template-columns: auto 1fr; gap: .2vh 2vw; align-items: center; box-shadow: 0 20px 60px #000c; pointer-events: none; }
  .nb-moment.on { transform: translateY(0); }
  .nb-moment .icon { grid-row: span 3; font-size: clamp(40px, 6vw, 120px); }
  .nb-moment .k { font-family: var(--f-spooky); color: var(--pumpkin); font-size: clamp(18px, 2.6vw, 50px); }
  .nb-moment .h { font-family: var(--f-display); font-size: clamp(20px, 2.9vw, 58px); line-height: 1.05; }
  .nb-moment .s { color: var(--ink-dim); font-size: clamp(14px, 1.6vw, 30px); font-weight: 600; }

  /* phone, A: the strip under the count */
  .nb-line { margin: 0 12px 6px; padding: 8px 12px; border-radius: 12px; background: var(--panel); color: var(--dim); font-size: 14px;
    display: flex; gap: 6px; align-items: baseline; white-space: nowrap; overflow: hidden; }
  .nb-line b { color: var(--text); font-variant-numeric: tabular-nums; }
  .nb-line .rest { overflow: hidden; text-overflow: ellipsis; }
  .nb-line a { color: var(--orange); }

  /* phone, B: the toast on refresh */
  .nb-toast { position: absolute; left: 12px; right: 12px; top: 64px; z-index: 30; background: var(--panel2); border: 2px solid var(--orange);
    border-radius: 16px; padding: 12px 14px; display: flex; gap: 12px; align-items: center; box-shadow: 0 10px 30px #000c;
    transform: translateY(calc(-100% - 90px)); transition: transform .5s cubic-bezier(.3, 1.3, .5, 1); pointer-events: none; }
  .nb-toast.on { transform: translateY(0); }
  .nb-toast .icon { font-size: 30px; }
  .nb-toast .h { font-weight: 800; font-size: 17px; }
  .nb-toast .s { color: var(--dim); font-size: 13px; }

  /* phone, C: the head chip and the menu section */
  .nb-chip { background: var(--panel2); border-radius: 12px; height: 44px; padding: 0 10px; font-weight: 800; font-size: 15px; margin-left: 8px; }
  .nb-section h4 { display: flex; justify-content: space-between; }
  .nb-section h4 small { text-transform: none; letter-spacing: 0; font-weight: 600; }
  .nb-hero { display: flex; align-items: baseline; gap: 8px; }
  .nb-hero b { font-size: 34px; font-variant-numeric: tabular-nums; }
  .nb-hero span { color: var(--dim); }
  .nb-trend { color: var(--orange); font-weight: 700; font-size: 14px; margin: 2px 0 8px; }
  .nb-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .nb-stats div { background: var(--panel2); border-radius: 12px; padding: 8px 10px; }
  .nb-stats .k { color: var(--dim); font-size: 12px; }
  .nb-stats .v { font-weight: 800; font-size: 18px; font-variant-numeric: tabular-nums; }
  .nb-stats .nb-span { grid-column: 1 / -1; }
  .nb-chart { position: relative; margin-top: 8px; background: var(--panel2); border-radius: 12px; padding: 8px 8px 4px; }
  .nb-chart .t { font-size: 12px; color: var(--dim); margin: 0 0 4px 4px; }
  .nb-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .nb-tip { position: absolute; pointer-events: none; background: #000d; color: var(--text); font-size: 12px; padding: 4px 8px; border-radius: 8px;
    white-space: nowrap; translate: -50% -110%; display: none; }
  .nb-note { color: var(--dim); font-size: 14px; line-height: 1.4; margin: 4px 0; }
  .nb-note a { color: var(--orange); }
`
document.head.append(css)

const el = (tag, cls, html) => Object.assign(document.createElement(tag), { className: cls ?? '', innerHTML: html ?? '' })
const $ = (sel) => document.querySelector(sel)

// ---- the figures as words (one place, so every variant says the same thing)
function siteLine(site) {
  return `${fmt(site.active)} houses counting tonight · ~${fmt(round5(site.tonight))} kids`
}
const BELOW_NOTE = `Nearby figures appear once ${MIN_HOUSEHOLDS} houses near you are counting.`
const NO_LOCATION_NOTE = 'Add your rough location in <a href="/setup">Setup</a> to see what\'s happening near you.'

// ==== Variant A: ambient strip, always on
function renderA(f) {
  if (onTv) {
    if (f.kind !== 'area' && !f.site) return
    const strip = el('div', 'nb-strip nb-own')
    strip.innerHTML =
      f.kind === 'area'
        ? `<div class="k">🏘️ Near you tonight</div><div><b>${kids(f.last30)}</b> in the last half hour · ${f.active} houses · ${f.top[0]} ${f.top[1]} rules</div>`
        : `<div class="k">🎃 Count Dracula tonight</div><div>${siteLine(f.site)}</div>`
    $('.hero').append(strip)
    return
  }
  const line = el('div', 'nb-line nb-own')
  if (f.kind === 'area') line.innerHTML = `🏘️ <span class="rest">Near you: <b>${kids(f.last30)}</b> in 30 min · <b>${f.active}</b> houses</span>`
  else if (f.site) line.innerHTML = `🎃 <span class="rest">Count Dracula tonight: <b>${fmt(f.site.active)}</b> houses · <b>~${fmt(round5(f.site.tonight))}</b> kids</span>`
  else if (f.kind === 'no-location') line.innerHTML = `🏘️ <span class="rest"><a href="/setup">Add your location</a> to see nearby</span>`
  else return // below the minimum, no fallback: nothing at all
  $('.head').after(line)
}

// ==== Variant B: a moment on each refresh, nothing always-on
let momentTimer
function momentText(f) {
  if (f.kind === 'area') {
    const extra = [`${f.top[0]} ${f.top[1]} is the costume of the night round here`, f.trend, `${f.active} houses near you are counting`]
    return { icon: '🏘️', k: 'Meanwhile, near you…', h: `${kids(f.last30)} in the last half hour`, s: extra[state.tick % extra.length] }
  }
  if (f.site) return { icon: '🎃', k: 'Meanwhile, on Count Dracula…', h: `${fmt(f.site.active)} houses are counting tonight`, s: `~${fmt(round5(f.site.tonight))} kids so far` }
  return null
}
function renderB(f, { fire }) {
  const text = momentText(f)
  if (onTv) {
    const card = el('div', 'nb-moment nb-own')
    document.body.append(card)
    if (!text || !fire) return
    card.innerHTML = `<div class="icon">${text.icon}</div><div class="k">${text.k}</div><div class="h">${text.h}</div><div class="s">${text.s}</div>`
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('on')))
    clearTimeout(momentTimer)
    momentTimer = setTimeout(() => card.classList.remove('on'), 10_000)
    return
  }
  const toast = el('div', 'nb-toast nb-own')
  $('#app').append(toast)
  if (!text || !fire) return
  toast.innerHTML = `<div class="icon">${text.icon}</div><div><div class="h">${f.kind === 'area' ? `Near you: ${text.h}` : text.h}</div><div class="s">${text.s}</div></div>`
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('on')))
  clearTimeout(momentTimer)
  momentTimer = setTimeout(() => toast.classList.remove('on'), 5_000)
}

// ==== Variant C: phone only; the TV stays location-free
function renderC(f) {
  if (onTv) return
  const section = el('div', 'nb-section nb-own')
  const panel = $('#menu .panel')
  panel.insertBefore(section, panel.querySelector('.grab').nextSibling)
  if (f.kind === 'area') {
    const chip = el('button', 'nb-chip nb-own', `🏘️ ${round5(f.last30) === 0 ? '<5' : `~${round5(f.last30)}`}`)
    chip.setAttribute('aria-label', 'Tonight near you')
    chip.onclick = () => $('#menu-open').click()
    $('#menu-open').before(chip)
    const yours = Number($('#total')?.textContent) || f.yoursTonight
    const avg = round5(f.avgHouse)
    const vs = yours > avg + 2 ? 'busier than most near you' : yours < avg - 2 ? 'quieter than most near you' : 'about average near you'
    section.innerHTML = `
      <h4>Tonight near you <small>updated ${clockText(f.at)}</small></h4>
      <div class="nb-hero"><b>${kids(f.last30)}</b><span>in the last half hour</span></div>
      <div class="nb-trend">${f.trend}</div>
      <div class="nb-chart"><div class="t">Kids near you in each half hour</div>${chartSvg(f.series)}<div class="nb-tip"></div></div>
      <div class="nb-stats">
        <div><div class="k">Houses counting</div><div class="v">${f.active}</div></div>
        <div><div class="k">Kids near you tonight</div><div class="v">~${fmt(round5(f.tonight))}</div></div>
        <div class="nb-span"><div class="k">Costume of the night round here</div><div class="v">${f.top[0]} ${f.top[1]}</div></div>
        <div class="nb-span"><div class="k">You vs the average house near you</div><div class="v">${yours} vs ~${avg}: ${vs}</div></div>
      </div>`
    wireTip(section, f.series)
    return
  }
  section.innerHTML =
    `<h4>Tonight near you</h4>` +
    `<p class="nb-note">${f.kind === 'no-location' ? NO_LOCATION_NOTE : BELOW_NOTE}</p>` +
    (f.site ? `<p class="nb-note">🎃 Count Dracula tonight: <b>${siteLine(f.site)}</b></p>` : '')
}

// Single series, no legend (the title names it): a 2px line over a faint area, dots at each refresh, the last labelled.
const W = 320, H = 120, PAD = { l: 26, r: 10, t: 14, b: 18 }
function chartGeometry(series) {
  const first = 17 * 60, last = 21 * 60 // the evening: 5 pm to 9 pm
  const max = Math.max(50, ...series.map((p) => round5(p.v)))
  const top = Math.ceil(max / 25) * 25
  const x = (min) => PAD.l + ((min - first) / (last - first)) * (W - PAD.l - PAD.r)
  const y = (v) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b)
  return { first, last, top, x, y }
}
function chartSvg(series) {
  const { first, last, top, x, y } = chartGeometry(series)
  const pts = series.map((p) => [x(p.min), y(round5(p.v))])
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('')
  const area = `${line}L${pts.at(-1)[0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z`
  const grid = [0, top / 2, top].map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ffffff14"/><text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end" fill="#a99cbc" font-size="10">${v}</text>`).join('')
  const hours = []
  for (let m = first; m <= last; m += 60) hours.push(`<text x="${x(m)}" y="${H - 4}" text-anchor="middle" fill="#a99cbc" font-size="10">${clockText(m)}</text>`)
  const end = pts.at(-1)
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kids counted near you in each half hour, every 10 minutes since ${clockText(series[0].min)}">
    ${grid}${hours.join('')}
    <path d="${area}" fill="#ff7a1a22"/>
    <path d="${line}" fill="none" stroke="#ff7a1a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="2.5" fill="#ff7a1a"/>`).join('')}
    <circle cx="${end[0]}" cy="${end[1]}" r="4.5" fill="#ff7a1a" stroke="#2d2340" stroke-width="2"/>
    <text x="${end[0]}" y="${end[1] - 9}" text-anchor="middle" fill="#f5efe6" font-size="11" font-weight="700">~${round5(series.at(-1).v)}</text>
    <line class="nb-cross" y1="${PAD.t}" y2="${H - PAD.b}" stroke="#f5efe6" stroke-opacity=".4" visibility="hidden"/>
  </svg>`
}
function wireTip(section, series) {
  const box = section.querySelector('.nb-chart')
  const svg = box.querySelector('svg')
  const tip = box.querySelector('.nb-tip')
  const cross = svg.querySelector('.nb-cross')
  const { x, y } = chartGeometry(series)
  const show = (ev) => {
    const r = svg.getBoundingClientRect()
    const sx = ((ev.clientX - r.left) / r.width) * W
    const p = series.reduce((a, b) => (Math.abs(x(b.min) - sx) < Math.abs(x(a.min) - sx) ? b : a))
    cross.setAttribute('x1', x(p.min)), cross.setAttribute('x2', x(p.min)), cross.setAttribute('visibility', 'visible')
    tip.style.display = 'block'
    tip.style.left = `${8 + (x(p.min) / W) * r.width}px`
    tip.style.top = `${8 + 18 + (y(round5(p.v)) / H) * r.height}px`
    tip.textContent = `${clockText(p.min - 30)}–${clockText(p.min)}: ${kids(p.v)}`
  }
  const hide = () => ((tip.style.display = 'none'), cross.setAttribute('visibility', 'hidden'))
  svg.addEventListener('pointermove', show)
  svg.addEventListener('pointerdown', show)
  svg.addEventListener('pointerleave', hide)
}

// ---- render, the fake refresh clock and the switcher
function render({ fire = false } = {}) {
  document.querySelectorAll('.nb-own').forEach((n) => n.remove())
  const f = figures()
  ;({ A: renderA, B: renderB, C: renderC })[state.variant](f, { fire })
  renderBar()
}

function setParam(key, value) {
  state[key] = value
  const p = new URLSearchParams(location.search)
  p.set(key, value)
  history.replaceState(null, '', `${location.pathname}?${p}`)
  render({ fire: true })
}

const bar = el('div', 'nb-proto-bar')
document.body.append(bar)
document.body.classList.add('nb-cursor')
const keys = Object.keys(VARIANTS)
const cycle = (step) => setParam('variant', keys[(keys.indexOf(state.variant) + step + keys.length) % keys.length])
function renderBar() {
  bar.innerHTML = `
    <button data-step="-1" aria-label="Previous variant">←</button>
    <span class="label"><span class="tag">PROTOTYPE</span> ${state.variant} — ${VARIANTS[state.variant]}${state.variant === 'C' && onTv ? ' (TV unchanged)' : ''}</span>
    <button data-step="1" aria-label="Next variant">→</button>
    <select data-key="area">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}" ${k === state.area ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select data-key="fallback"><option value="hide" ${state.fallback === 'hide' ? 'selected' : ''}>Below 5: show nothing</option><option value="site" ${state.fallback === 'site' ? 'selected' : ''}>Below 5: site-wide total</option></select>
    <button data-refresh title="Fire the next 10-minute refresh now (N)">↻ N</button>`
}
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (b?.dataset.step) cycle(Number(b.dataset.step))
  if (b?.hasAttribute('data-refresh')) refresh()
})
bar.addEventListener('change', (e) => setParam(e.target.dataset.key, e.target.value))
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
  if (e.key === 'ArrowLeft') cycle(-1)
  if (e.key === 'ArrowRight') cycle(1)
  if (e.key === 'n' || e.key === 'N') refresh()
})

function refresh() {
  state.tick++
  render({ fire: true })
}
setInterval(refresh, REFRESH_MS)
render()
setTimeout(() => render({ fire: true }), 1_500) // let the page draw first, then show the first "refresh"
