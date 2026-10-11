# Vendored client libraries

Served from `/vendor/`. No CDN on the night (spec §3 "Client libraries"). No build step: plain ES modules.

| What | Version | Source | Licence |
|---|---|---|---|
| Motion (`animate`) | 13.4.4 | npm `motion`, `dist/motion.js` → `motion/motion.umd.js`; `motion/motion.js` re-exports it as an ES module | MIT |
| Chart.js | 4.5.1 | npm `chart.js`, `dist/chart.umd.js` → `chartjs/chart.umd.js`; `chartjs/chart.js` re-exports it as an ES module | MIT |
| qrcode-generator | 2.0.4 | npm `qrcode-generator`, `dist/qrcode.mjs` → `qrcode/qrcode.js` (licence in its header) | MIT |
| canvas-confetti | 1.9.4 | npm `canvas-confetti`, `dist/confetti.module.mjs` → `canvas-confetti/confetti.module.js` | ISC |
| Leaflet | 1.9.4 | npm `leaflet` (integrity `sha512-nxS1ynzJ…`), `dist/leaflet.js` → `leaflet/leaflet.umd.js`, `leaflet/leaflet.js` re-exports `L`; `leaflet.css` and `images/` alongside. Only the Location picker in `/setup` loads it | BSD-2-Clause (`leaflet/LICENSE`) |
| Bungee, Creepster, Fredoka | Google Fonts (bungee v17, creepster v13, fredoka v17) | Latin woff2 subsets; `fonts/fonts.css` declares them | SIL OFL 1.1 |

Vendored 2026-10-10 (Leaflet 2026-10-11). To update, replace the files and this table.
