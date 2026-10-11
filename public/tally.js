// The print tally sheet (v1 spec §6), for when every phone is dead.
import { slots } from '/shared/night-maths.js'
import { tallySnapshotUrl } from '/tally-view.js'

const label = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
}
document.getElementById('rows').replaceChildren(
  ...slots('17:30', '21:00', 15).map(({ start, end }) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td class="time">${label(start)}–${label(end)}</td><td></td><td class="total"></td>`
    return tr
  }),
)
// The named Event's name (/tally?event=<id>), else the door's, read with the Manager's session; the sheet works
// without it too.
fetch(tallySnapshotUrl(location.search))
  .then((r) => r.json())
  .then((s) => s.event && (document.getElementById('title').textContent = `${s.event.name}: tally`)) // none with no night on
  .catch(() => {})

document.getElementById('print').addEventListener('click', () => print())
