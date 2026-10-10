// ES module face for Chart.js's self-contained UMD build (it sets globalThis.Chart when loaded).
import './chart.umd.js'

export const Chart = globalThis.Chart
