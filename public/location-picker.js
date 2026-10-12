// The Location picker (v2 spec §10): nothing loads from OpenStreetMap until "Pick on a map" is tapped. The
// chosen point is snapped to a 5-character geohash cell in the browser and shown shaded, never as a pin;
// only the cell id is ever sent. Used on /setup's Household tab.
import { cellBounds, encodeGeohash } from '/shared/geohash.js'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

let leaflet // loaded once, on the first tap
async function loadLeaflet() {
  if (!leaflet) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/vendor/leaflet/leaflet.css' }))
    leaflet = (await import('/vendor/leaflet/leaflet.js')).default
  }
  return leaflet
}

// container: an empty element. save(cell) stores it (null removes it); it rejects with a message to show.
export function createLocationPicker(container, { cell = null, save }) {
  let saved = cell
  let picked = null
  let map = null
  let shade = null
  const h = (tag, props = {}, ...children) => appendAll(Object.assign(document.createElement(tag), props), children)

  const summary = h('p', { className: 'muted' })
  const pickButton = h('button', { type: 'button', className: 'primary' })
  const removeButton = h('button', { type: 'button', className: 'danger', textContent: 'Remove' })
  const buttons = h('div', { className: 'row' }, pickButton, removeButton)
  const mapBox = h('div', { className: 'picker-map' })
  const status = h('p', { className: 'muted' })
  const locateButton = h('button', { type: 'button', textContent: '📍 Use my location' })
  const saveButton = h('button', { type: 'button', className: 'primary', textContent: 'Save this square', disabled: true })
  const cancelButton = h('button', { type: 'button', textContent: 'Cancel' })
  const panel = h('div', { className: 'picker-panel', hidden: true }, mapBox, h('p', { className: 'muted', textContent: 'Tap your area on the map, or use your location.' }), h('div', { className: 'row' }, locateButton, saveButton, cancelButton), status)
  const note = h('p', { className: 'muted' }, 'Only a ~5 km square is saved · ', h('a', { href: '/privacy', textContent: 'Privacy', style: 'color: var(--orange)' }))
  container.replaceChildren(summary, buttons, panel, note)

  function render() {
    summary.textContent = saved ? '📍 Your Location is set: a square about 5 km across.' : 'No Location yet. It\'s optional: it shows how busy it is near you on the night.'
    pickButton.textContent = saved ? 'Change on a map' : 'Pick on a map'
    removeButton.hidden = !saved
    buttons.hidden = !panel.hidden
  }

  function choose(lat, lon) {
    const L = leaflet
    picked = encodeGeohash(lat, lon)
    shade?.remove()
    shade = L.rectangle(cellBounds(picked), { color: '#ff7a1a', weight: 2, fillOpacity: 0.35 }).addTo(map)
    saveButton.disabled = false
    status.textContent = ''
  }

  pickButton.addEventListener('click', async () => {
    panel.hidden = false
    render()
    const L = await loadLeaflet()
    if (!map) {
      map = L.map(mapBox, { worldCopyJump: true })
      L.tileLayer(TILES, { maxZoom: 15, attribution: CREDIT }).addTo(map)
      map.on('click', (e) => choose(e.latlng.lat, e.latlng.lng))
    }
    if (saved) map.fitBounds(cellBounds(saved), { maxZoom: 11 })
    else map.setView([30, 0], 2)
    map.invalidateSize()
  })

  locateButton.addEventListener('click', () => {
    if (!navigator.geolocation) return (status.textContent = "This browser can't find your location: tap the map instead.")
    status.textContent = 'Finding you…'
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.setView([coords.latitude, coords.longitude], 11)
        choose(coords.latitude, coords.longitude) // the exact point stays here: only its square is kept
      },
      () => (status.textContent = "Couldn't get your location: tap the map instead."),
      { enableHighAccuracy: false, timeout: 15_000 },
    )
  })

  saveButton.addEventListener('click', async () => {
    try {
      await save(picked)
      saved = picked
      panel.hidden = true
      render()
    } catch (err) {
      status.textContent = err.message
    }
  })

  cancelButton.addEventListener('click', () => {
    panel.hidden = true
    render()
  })

  removeButton.addEventListener('click', async () => {
    if (!confirm('Remove your Location? You stop seeing (and adding to) nearby figures.')) return
    await save(null)
    saved = null
    render()
  })

  render()
  return { setCell(cell) { saved = cell; render() } }
}

function appendAll(node, children) {
  node.append(...children)
  return node
}
