// Starts Count Dracula: `bun server/main.js [path/to/config.json]`.
import { existsSync } from 'node:fs'
import { startServer } from './app.js'

const configPath = process.argv[2] ?? process.env.COUNT_DRACULA_CONFIG ?? 'config/config.json'
if (!existsSync(configPath)) {
  console.error(`No config file at ${configPath}. Copy config/config.example.json there.`)
  process.exit(1)
}

const app = startServer({ configPath })
console.log(`Count Dracula on ${app.url}`)
console.log(`  TV:    ${app.url}/tv`)
const [first] = app.ledger.households()
if (first) console.log(`  Phone: ${app.url}/door?key=${app.ledger.household(first.id).joinKey()}`)
