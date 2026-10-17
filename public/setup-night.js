// /setup's night pieces (spec v2.1 §9): Tonight's door card and rows, the Nights rows, and a night's screen.
// Each builds DOM from one Event and a context `ctx` that setup.js hands in:
//   { events, door, timeZone, shares, day(ms), now(), ui: { ending, missed }, batches, act: { … } }
// and every button calls one of ctx.act's handlers with the Event.
import { raceChoices } from '../shared/race-against.js'
import { atEventTime, clockTime as zoneClock, eventNow, minuteOfDay, slots, stamp, tickNoteText } from '../shared/night-maths.js'
import { endQuestion, goldenLine, nightActions, nightHelpKey, nightTools, noteActions, noteHeadline, rowActions, STATE_LABEL, whenLine } from './setup-view.js'
import { h, option } from './setup-dom.js'

const HOUR = 3_600_000

export const pill = (e) => h('span', { className: `pill ${e.state}`, textContent: e.countsOnly ? 'Imported' : STATE_LABEL[e.state] })
export const doorPill = (e, ctx) => (ctx.door && e.id === ctx.door.id ? h('span', { className: 'pill door', textContent: 'On the door & TV' }) : null)

const ACTION = {
  goLive: ['▶ Go live', 'primary'],
  end: ['■ End the night', 'primary'],
  resume: ['▶ Resume', ''],
  close: ['Close now', ''],
  reset: ['↺ Reset', 'danger'],
  delete: ['Delete', 'danger'],
}
function actionButton(name, e, ctx, small) {
  const [label, cls] = ACTION[name]
  return h('button', { className: `${cls}${small ? ' small' : ''}`, textContent: label, ariaLabel: `${label.replace(/^\W+/, '')}: ${e.name}`, onclick: () => ctx.act[name](e) })
}
const actionRow = (names, e, ctx, small = false) => h('div', { className: 'row actions' }, names.map((n) => actionButton(n, e, ctx, small)))

// End with golden tickets still to find: v2's three choices, under the Event's actions.
function endChoices(e, ctx) {
  if (ctx.ui.ending !== e.id) return null
  return h('div', { className: 'choices' },
    h('p', { textContent: endQuestion(e.golden?.left ?? 0) }),
    h('div', { className: 'row' },
      h('button', { className: 'primary', textContent: '🎫 Release & keep going', onclick: () => ctx.act.endRelease(e) }),
      h('button', { textContent: '🌙 End anyway', onclick: () => ctx.act.endAnyway(e) }),
      h('button', { textContent: 'Cancel', onclick: () => ctx.act.endCancel(e) })))
}

// What the tick did to it (spec v2.1 §5), with the auto-end's Resume, Close now and summary.
function notes(e, ctx) {
  if (!e.note) return null
  const buttons = noteActions(e.note).map((a) =>
    a === 'summary' ? summaryLink(e, '✨ Summary') : h('button', { className: 'small', textContent: ACTION[a][0], onclick: () => ctx.act[a](e) }))
  return h('div', { className: 'note' }, tickNoteText(e.note, ctx.timeZone), buttons.length ? h('div', { className: 'row' }, buttons) : null)
}

const summaryLink = (e, text = '✨ Night summary') => h('a', { className: 'link', href: `/summary?event=${e.id}`, textContent: text })

// The Night summary's public link (spec v2.1 §7): on or off, and whether the Household's name shows on it.
function sharing(e, ctx) {
  const shared = ctx.shares.find((s) => s.eventId === e.id)
  const on = h('input', { type: 'checkbox', checked: !!shared, onchange: (ev) => ctx.act.share(e, ev.target.checked, ev.target) })
  const parts = [h('label', { className: 'toggle' }, on, 'Sharing on')]
  if (shared) {
    const name = h('input', { type: 'checkbox', checked: !shared.hideName, onchange: (ev) => ctx.act.showName(e, ev.target.checked) })
    parts.push(h('label', { className: 'toggle' }, name, 'Show our name'), h('button', { className: 'small', textContent: 'Share link', onclick: () => ctx.act.shareLink(shared) }))
  }
  return parts
}

// The night tools that make sense in its state. On Tonight, Add missed kids opens the night's screen.
function tools(e, ctx, { onTonight = false } = {}) {
  const t = []
  for (const tool of nightTools(e)) {
    if (tool === 'ticket') t.push(h('button', { className: 'small', textContent: '🎫 Add a golden ticket', onclick: () => ctx.act.ticket(e) }))
    if (tool === 'missed') t.push(h('button', { className: 'small', textContent: '➕ Add missed kids', ariaExpanded: String(!onTonight && ctx.ui.missed === e.id), onclick: () => ctx.act.missed(e, onTonight) }))
    if (tool === 'csv') t.push(h('button', { className: 'small', textContent: '⬇ CSV', onclick: () => ctx.act.csv(e) }))
    if (tool === 'tally') t.push(h('a', { className: 'link', href: `/tally?event=${e.id}`, target: '_blank', textContent: '🖨 Tally sheet' }))
    if (tool === 'summary') t.push(summaryLink(e), ...sharing(e, ctx))
    if (tool === 'recap') t.push(h('a', { className: 'link', href: `/tv?event=${e.id}`, target: '_blank', textContent: '📺 TV recap' }))
  }
  return t.length ? h('div', { className: 'row tools' }, t) : null
}

const when = (e, ctx) => [whenLine(e, ctx.day), goldenLine(e)].filter(Boolean).join(' · ')

// ---- Tonight

// The door's Event, large (spec v2.1 §9).
export function doorCard(e, ctx) {
  return h('section', { className: 'door-card', data: { help: 'door' } },
    h('h2', { className: 'eyebrow' }, 'On the door & TV', pill(e)),
    h('div', { className: 'big' }, String(e.kids), ' ', h('small', { textContent: e.kids === 1 ? 'kid' : 'kids' })),
    h('b', { textContent: e.name }),
    h('p', { className: 'muted', textContent: when(e, ctx) }),
    notes(e, ctx),
    actionRow(nightActions(e), e, ctx),
    endChoices(e, ctx),
    tools(e, ctx, { onTonight: true }),
    h('p', {}, h('button', { className: 'link-button', textContent: 'Settings and costumes ›', onclick: () => ctx.act.open(e) })))
}

// Every other open Event, as a short row, its notes under it.
export function alsoOpen(list, ctx) {
  return h('section', { data: { help: 'also' } },
    h('h2', {}, 'Also open'),
    list.map((e) => [
      h('div', { className: 'item' },
        h('span', { className: 'grow' }, h('b', { textContent: e.name }), ' ', pill(e), h('br'), h('span', { className: 'muted', textContent: whenLine(e, ctx.day) })),
        h('span', { className: 'row' },
          rowActions(e).map((a) => actionButton(a, e, ctx, true)),
          h('button', { className: 'small', textContent: '›', ariaLabel: `Open ${e.name}`, onclick: () => ctx.act.open(e) }))),
      notes(e, ctx),
      endChoices(e, ctx),
    ]))
}

// Upcoming nights that couldn't go live at the cap: their note, one tap from their screen.
export function waiting(list, ctx) {
  return h('section', { data: { help: 'waiting' } },
    h('h2', {}, '⏳ Waiting to go live'),
    list.map((e) => [notes(e, ctx), h('p', {}, h('button', { className: 'link-button', textContent: `${e.name} ›`, onclick: () => ctx.act.open(e) }))]))
}

// Nothing open: the next scheduled Event and Go live on it now (the door ☰'s Event).
export function nothingOpen(next, ctx) {
  return h('section', { className: 'door-card', data: { help: 'nothing' } },
    h('h2', {}, '🌙 No night on right now'),
    h('p', { className: 'muted', textContent: next ? `${next.name} goes live by itself ${ctx.day(next.goesLiveAt)}. The TV and door phones show a countdown.` : 'Nothing is scheduled. Go live on a night from Nights.' }),
    next
      ? h('div', { className: 'row' }, h('button', { className: 'primary', textContent: `▶ Go live on ${next.name} now`, onclick: () => ctx.act.goLive(next) }))
      : h('p', {}, h('button', { className: 'link-button', textContent: 'Your nights ›', onclick: () => ctx.act.tab('nights') })))
}

// ---- Nights

export function nightRow(e, ctx) {
  return h('button', { className: 'night-row', onclick: () => ctx.act.open(e) },
    h('span', { className: 'grow' },
      h('b', { textContent: e.name }), ' ', pill(e), ' ', doorPill(e, ctx), h('br'),
      h('span', { className: 'muted', textContent: whenLine(e, ctx.day) }),
      e.note ? [h('br'), h('span', { className: 'headline', textContent: `● ${noteHeadline(tickNoteText(e.note, ctx.timeZone))}` })] : null),
    h('span', { className: 'chev', textContent: '›' }))
}

// ---- a night's screen

// The header and Night tools, then Settings and Costumes: side by side from 1200 px wide, one column on phones.
export function nightScreen(e, ctx) {
  const imported = !!e.countsOnly
  return [
    h('p', {}, h('button', { className: 'link-button', textContent: '‹ All nights', onclick: () => ctx.act.back() })),
    h('div', { className: 'night-cols' },
      h('div', { className: 'night-main' },
        h('header', { className: 'night-head', data: { help: nightHelpKey(e) } },
          h('h1', {}, h('span', { textContent: e.name }), pill(e), doorPill(e, ctx)),
          h('p', { className: 'muted', textContent: when(e, ctx) }),
          notes(e, ctx),
          actionRow(nightActions(e), e, ctx),
          endChoices(e, ctx)),
        imported ? null : h('section', { data: { help: 'tools' } }, h('h2', {}, 'Night tools'), tools(e, ctx), e.open && ctx.ui.missed === e.id ? missedKids(e, ctx) : null)),
      h('div', { className: 'night-side' },
        h('section', { data: { help: 'settings' } }, h('h2', {}, 'Settings'), imported ? h('p', { className: 'muted', textContent: 'Imported counts can only be raced against or deleted.' }) : settingsForm(e, ctx)),
        imported ? null : h('section', { data: { help: 'costumes' } }, h('h2', {}, 'Costumes'), costumes(e, ctx)))),
  ]
}

// Settings (spec v2.1 §9): Name, Race against, Expected kids, Visit window, Advanced, and Goes live at for an
// Upcoming night only. A Past night's are read-only.
function settingsForm(e, ctx) {
  const past = e.state === 'past'
  const input = (props) => h('input', { disabled: past, ...props })
  const name = input({ id: 's-name', value: e.name, maxLength: 40 })
  const race = h('select', { id: 's-race', disabled: past },
    option('', 'None', e.raceAgainstId == null),
    raceChoices(ctx.events, e).map((r) => option(r.id, r.name, r.id === e.raceAgainstId)))
  const expected = input({ id: 's-expected', type: 'number', min: 0, value: e.expectedKids ?? '' })
  const visit = input({ id: 's-visit', type: 'number', min: 1, value: e.visitWindowMs / 1000 })
  const shift = input({ id: 's-shift', type: 'number', step: 0.25, value: e.clockShiftMs / HOUR })
  const golden = input({ id: 's-golden', type: 'number', min: 0, value: e.goldenCount })
  const upcoming = e.state === 'upcoming'
  const goes = input({ id: 's-goes', type: 'datetime-local', value: e.goesLiveAt == null ? '' : stamp(e.goesLiveAt, ctx.timeZone).slice(0, 16).replace(' ', 'T') })
  const form = h('form', {},
    h('label', { htmlFor: 's-name', textContent: 'Name' }), name,
    h('label', { htmlFor: 's-race', textContent: 'Race against' }), race,
    h('div', { className: 'row' },
      h('div', {}, h('label', { htmlFor: 's-expected', textContent: 'Expected kids' }), expected),
      h('div', {}, h('label', { htmlFor: 's-visit', textContent: 'Visit window (s)' }), visit)),
    h('details', { className: 'advanced' }, h('summary', { textContent: 'Advanced' }),
      h('label', { htmlFor: 's-shift', textContent: "Clock shift (hours): move this night's clock for a daytime test" }), shift,
      h('label', { htmlFor: 's-golden', textContent: 'Golden tickets (drawn at Go live)' }), golden),
    upcoming ? [h('label', { htmlFor: 's-goes', textContent: `Goes live by itself at (${ctx.timeZone}; empty: only when you press Go live)` }), goes] : null,
    past ? h('p', { className: 'muted', textContent: 'A Past night is read-only.' }) : h('p', {}, h('button', { className: 'primary', type: 'submit', textContent: 'Save settings' })))
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    ctx.act.saveSettings(e, {
      name: name.value,
      raceAgainstId: race.value === '' ? null : Number(race.value),
      clockShiftMs: Math.round(Number(shift.value || 0) * HOUR),
      expectedKids: expected.value === '' ? null : Number(expected.value),
      visitWindowMs: Math.round(Number(visit.value || 15) * 1000),
      goldenCount: Number(golden.value || 0),
      ...(upcoming ? { goesLive: goes.value } : {}),
    })
  })
  return form
}

// Costumes: that night's tags. A Past night's are read-only.
function costumes(e, ctx) {
  if (e.state === 'past') {
    return e.tags.length
      ? e.tags.map((t) => h('div', { className: 'item', textContent: `${t.emoji ?? ''} ${t.name}`.trim() }))
      : h('p', { className: 'muted', textContent: 'No costumes.' })
  }
  const emoji = h('input', { className: 'emoji', placeholder: '🎃', autocomplete: 'off', ariaLabel: 'New costume emoji' })
  const name = h('input', { className: 'grow', maxLength: 40, placeholder: 'New costume name', autocomplete: 'off', ariaLabel: 'New costume name' })
  const add = h('form', { className: 'item tag-row' }, emoji, name, h('button', { type: 'submit', textContent: 'Add' }))
  add.addEventListener('submit', (ev) => {
    ev.preventDefault()
    ctx.act.addTag(e, { name: name.value, emoji: emoji.value || null })
  })
  return [h('div', {}, e.tags.map((t) => tagRow(t, ctx))), add]
}

function tagRow(tag, ctx) {
  const emoji = h('input', { className: 'emoji', value: tag.emoji ?? '', ariaLabel: 'Emoji' })
  const name = h('input', { className: 'grow', maxLength: 40, value: tag.name, ariaLabel: 'Name' })
  const order = h('input', { className: 'order', type: 'number', min: 1, value: tag.order, ariaLabel: 'Order' })
  return h('div', { className: 'item tag-row' }, emoji, name, order,
    h('button', { textContent: 'Save', onclick: () => ctx.act.saveTag(tag, { name: name.value, emoji: emoji.value || null, order: Number(order.value) }) }),
    h('button', { className: 'danger', textContent: '✕', ariaLabel: `Delete ${tag.name}`, onclick: () => ctx.act.deleteTag(tag) }))
}

// ➕ Add missed kids (spec §6), into this Event, whichever the door is on: a count per 15-minute row in its own
// event time, none later than its "now". Typed counts survive a redraw of the same night.
function missedKids(e, ctx) {
  const shift = e.clockShiftMs ?? 0
  const clock = (ms) => zoneClock(ms + shift, ctx.timeZone)
  const nowMinute = Math.floor(minuteOfDay(eventNow(ctx.now(), shift), ctx.timeZone))
  const typed = ctx.ui.typed ?? new Map()
  const inputs = slots('17:30', '21:00', 15).map(({ start, end }) => {
    const [hh, mm] = start.split(':').map(Number)
    return h('input', { type: 'number', min: 0, max: 1000, value: typed.get(start) ?? '', disabled: hh * 60 + mm > nowMinute, ariaLabel: `Kids from ${start}`, data: { start, end } })
  })
  const form = h('form', {},
    h('div', { className: 'backfill' }, inputs.map((i) => h('label', {}, h('span', { textContent: clock(atEventTime(i.dataset.start, ctx.now(), shift, ctx.timeZone)) }), i))),
    h('p', {}, h('button', { className: 'primary', type: 'submit', textContent: 'Add these kids' })))
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const rows = inputs
      .filter((i) => !i.disabled && Number(i.value) > 0)
      .map((i) => ({
        startMs: atEventTime(i.dataset.start, ctx.now(), shift, ctx.timeZone),
        endMs: atEventTime(i.dataset.end, ctx.now(), shift, ctx.timeZone),
        count: Number(i.value),
      }))
    ctx.act.backfill(e, rows, () => inputs.forEach((i) => (i.value = '')))
  })
  const batches = (ctx.batches ?? []).map((b) => {
    const from = Math.min(...b.rows.map((r) => r.startMs))
    const to = Math.max(...b.rows.map((r) => r.endMs))
    return h('div', { className: 'item' },
      h('span', { className: 'grow', textContent: `+${b.kids} kids, ${clock(from)}–${clock(to)}` }),
      h('button', { className: 'danger small', textContent: 'Remove', onclick: () => ctx.act.removeBatch(e, b) }))
  })
  return h('div', { className: 'missed', id: 'missed' },
    h('h3', { textContent: `➕ Add missed kids to ${e.name}` }),
    h('p', { className: 'muted', textContent: "Type a count per 15-minute row (this night's time). They're added as untagged kids, spread across each row, and never celebrate." }),
    form,
    batches)
}

// What's typed into the open Add missed kids rows, kept across a redraw.
export function typedMissed(root) {
  return new Map([...root.querySelectorAll('.backfill input')].map((i) => [i.dataset.start, i.value]))
}
