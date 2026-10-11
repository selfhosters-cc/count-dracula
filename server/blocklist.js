// The blocklist (v2 spec §15): user text that reaches shared screens (a Household's name, a costume) is
// checked when it's saved. Whole words only, after folding case, accents and leetspeak, so "Scunthorpe"
// and "Cocktail" pass. Leaky by design: what gets through is handled by Rename and Suspend.
import { readFileSync } from 'node:fs'

const LIST = new URL('./vendor/blocklist/en.txt', import.meta.url)

// Leetspeak, folded to letters. "1" could be an i or an l, so both are tried.
const LEET = { 0: 'o', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b', 9: 'g', '!': 'i', '|': 'l' }

function words(text, one) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents
    .replace(/[0345789@$+!|]/g, (c) => LEET[c])
    .replaceAll('1', one)
    .split(/[^a-z]+/)
    .filter(Boolean)
}

const singles = new Set()
const phrases = []
for (const line of readFileSync(LIST, 'utf8').split('\n')) {
  const entry = words(line, 'i')
  if (entry.length === 1) singles.add(entry[0])
  else if (entry.length > 1) phrases.push(entry)
}

const listed = (word) => singles.has(word) || singles.has(word.replace(/e?s$/, ''))

function blockedWords(w) {
  if (w.some(listed)) return true
  // Spaced or dotted out: "f u c k", "f.u.c.k" (runs of single letters), and the whole text run together.
  const runs = w.join(' ').match(/\b[a-z](?: [a-z]\b)+/g) ?? []
  if (runs.some((run) => listed(run.replaceAll(' ', '')))) return true
  if (listed(w.join(''))) return true
  return phrases.some((phrase) => w.some((_, i) => phrase.every((p, j) => w[i + j] === p)))
}

export function isBlocked(text) {
  if (text == null || text === '') return false
  return blockedWords(words(text, 'i')) || blockedWords(words(text, 'l'))
}
