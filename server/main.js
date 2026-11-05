// Starts Count Dracula: `bun server/main.js [path/to/config.json]`.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { startServer } from './app.js'

const configPath = process.argv[2] ?? process.env.COUNT_DRACULA_CONFIG ?? 'config/config.json'
if (!existsSync(configPath)) {
  console.error(`No config file at ${configPath}. Copy config/config.example.json there.`)
  process.exit(1)
}

// EXTENSIONS (v2.2 §3): entry modules to start with the core, by path, separated by commas or spaces. Unset, none.
const extensions = await Promise.all((process.env.EXTENSIONS ?? '').split(/[\s,]+/).filter(Boolean).map((path) => import(resolve(path))))

const app = startServer({ configPath, extensions })
console.log(`Count Dracula on ${app.url}`)
console.log(`  TV:    ${app.url}/tv`)
// Never a join link: the log outlives the key's secrecy (a journal, a hosting log). Phones join from Setup.
console.log(`  Setup: ${app.url}/setup`)
