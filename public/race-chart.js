// The race chart (spec §7): tonight's count against the Race-against event's ghost, by event time.
// Chart.js, vendored. Styled per the dataviz skill: recessive grid, text in ink tokens, identity from
// dash + weight + direct labels as well as colour. The spec fixes the two colours (checked on the real
// TV); the validator passes them on separation and contrast, and flags the ghost's pale low chroma,
// which is intended: it's a reference line, not a peer series. No hover layer: the TV is a kiosk.
import { Chart } from '/vendor/chartjs/chart.js'
import { eventNow, ghost as ghostCurve, minuteOfDay } from '/shared/night-maths.js'

const INK = '#f7efe0'
const INK_DIM = '#b3aacb'
const GRID = '#2c2449'
const PUMPKIN = '#ff7a1a'
const GHOST = '#c9d2ff'
const SURFACE = '#1f1838'

const X_MIN = 17 * 60 + 30 // 5:30pm event time
const X_MAX = 20 * 60 + 30 // 8:30pm

const timeLabel = (minute) => {
  const h = Math.floor(minute / 60)
  return `${((h + 11) % 12) + 1}${h >= 12 ? 'pm' : 'am'}`
}

// Draws the direct labels: "2025: 346" at the ghost's end, 👻 at the ghost's "now", tonight's count by its dot.
const labels = {
  id: 'raceLabels',
  afterDatasetsDraw(chart) {
    const { ctx, scales, options } = chart
    const marks = options.plugins.raceLabels
    if (!marks) return
    const fs = Math.min(26, Math.max(14, chart.height / 18)) // capped: a taller chart (leaderboard off) mustn't push labels off the edge
    ctx.save()
    ctx.textBaseline = 'middle'
    if (marks.ghostEnd) {
      ctx.font = `600 ${fs}px Fredoka, sans-serif`
      ctx.fillStyle = INK_DIM
      ctx.fillText(marks.ghostEnd.text, scales.x.right + fs * 0.4, scales.y.getPixelForValue(marks.ghostEnd.y))
    }
    if (marks.ghostNow) {
      ctx.font = `${fs * 1.6}px sans-serif`
      ctx.textAlign = 'center'
      const y = scales.y.getPixelForValue(marks.ghostNow.y)
      const above = marks.ghostNow.y >= marks.tonight?.y // keep 👻 off tonight's dot
      ctx.fillText('👻', scales.x.getPixelForValue(marks.ghostNow.x), y + (above ? -fs : fs))
    }
    if (marks.tonight) {
      ctx.font = `${fs * 1.3}px Bungee, sans-serif`
      ctx.textAlign = 'left'
      ctx.fillStyle = INK
      ctx.fillText(String(marks.tonight.y), scales.x.getPixelForValue(marks.tonight.x) + fs * 0.9, scales.y.getPixelForValue(marks.tonight.y))
    }
    ctx.restore()
  },
}

export function createRaceChart(canvas) {
  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets: [] },
    plugins: [labels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      events: [], // kiosk: no pointer, no hover layer
      animation: { duration: 600, easing: 'easeOutQuart' },
      layout: { padding: { top: 24, right: 150, bottom: 4, left: 8 } },
      parsing: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false }, raceLabels: null },
      scales: {
        x: {
          type: 'linear',
          min: X_MIN,
          max: X_MAX,
          grid: { display: false },
          border: { color: GRID },
          ticks: {
            color: INK_DIM,
            font: { family: 'Fredoka', size: 22, weight: 500 },
            stepSize: 60,
            callback: (v) => (v % 60 === 0 ? timeLabel(v) : ''),
          },
          afterBuildTicks: (axis) => {
            axis.ticks = []
            for (let m = Math.ceil(axis.min / 60) * 60; m <= axis.max; m += 60) axis.ticks.push({ value: m })
          },
        },
        y: {
          min: 0,
          max: 400,
          grid: { color: GRID, lineWidth: 1 },
          border: { display: false },
          ticks: { color: INK_DIM, font: { family: 'Fredoka', size: 22, weight: 500 }, stepSize: 100 },
        },
      },
    },
  })

  return {
    // state: the live state; realNow: Date.now(). Pass animate=false for the once-a-few-seconds clock tick.
    update(state, realNow, animate = true) {
      const shift = state.event.clockShiftMs ?? 0
      const now = minuteOfDay(eventNow(realNow, shift))
      const kidMinutes = state.kids.map((k) => minuteOfDay(eventNow(k.tappedAt, shift))).sort((a, b) => a - b)
      const count = kidMinutes.length
      const g = state.ghost

      // Builder's latitude (§16): if kids keep coming after 8:30pm, the axis stretches to "now".
      const xMax = Math.max(X_MAX, Math.ceil(now / 30) * 30)
      const top = Math.max(count, g?.total ?? 0)
      chart.options.scales.x.max = xMax
      chart.options.scales.y.max = Math.max(400, Math.ceil((top + 30) / 100) * 100)

      const datasets = []
      if (g) {
        const at = ghostCurve(g.buckets)
        const corners = [X_MIN, ...g.buckets.flatMap((b) => [toMinute(b.start), toMinute(b.end)]), xMax]
        datasets.push({
          label: g.label,
          data: [...new Set(corners)].sort((a, b) => a - b).map((x) => ({ x, y: at(x) })),
          borderColor: GHOST,
          borderWidth: 4,
          borderDash: [14, 10],
          borderCapStyle: 'round',
          pointRadius: 0,
          tension: 0,
        })
      }
      if (count) {
        const line = [{ x: kidMinutes[0], y: 0 }, ...kidMinutes.map((x, i) => ({ x, y: i + 1 }))]
        if (now > kidMinutes[count - 1]) line.push({ x: now, y: count })
        datasets.push({
          label: 'Tonight',
          data: line,
          borderColor: PUMPKIN,
          borderWidth: 7,
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
          pointRadius: line.map((_, i) => (i === line.length - 1 ? 11 : 0)), // the dot at "now"
          pointBackgroundColor: PUMPKIN,
          pointBorderColor: SURFACE, // a 2px surface ring where the dot overlaps the ghost
          pointBorderWidth: 3,
          stepped: false,
          tension: 0,
        })
      }
      chart.data.datasets = datasets
      chart.options.plugins.raceLabels = {
        ghostEnd: g && { text: `${g.label}: ${g.total}`, y: g.total },
        ghostNow: g && { x: Math.min(Math.max(now, X_MIN), xMax), y: ghostCurve(g.buckets)(now) },
        tonight: count ? { x: Math.max(now, kidMinutes[count - 1]), y: count } : null,
      }
      chart.update(animate ? undefined : 'none')
    },
  }
}

function toMinute(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
