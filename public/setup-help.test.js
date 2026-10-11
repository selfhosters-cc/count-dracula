import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { HELP } from './setup-help.js'
import { currentTopic, nightHelpKey } from './setup-view.js'

// Every data-help key the /setup modules can put on the page: the static ones in setup.html, the drawn ones in
// the scripts (`data: { help: '…' }`), and the night header's, which follows its state (nightHelpKey).
const MODULES = ['setup.html', 'setup.js', 'setup-night.js', 'setup-household.js', 'setup-dom.js', 'setup-view.js', 'setup-help-ui.js']
const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
function keysInUse() {
  const keys = new Set()
  for (const file of MODULES) {
    const text = source(file)
    for (const [, key] of text.matchAll(/data-help="([a-z-]+)"/g)) keys.add(key)
    for (const [, key] of text.matchAll(/data:\s*\{\s*help:\s*'([a-zA-Z-]+)'/g)) keys.add(key)
  }
  for (const state of ['upcoming', 'live', 'ended', 'past']) keys.add(nightHelpKey({ state }))
  keys.add(nightHelpKey({ state: 'past', countsOnly: true }))
  return keys
}

describe('the /setup help (spec v2.1 §9)', () => {
  test('the night header is the only key drawn from a value, and it comes from nightHelpKey', () => {
    const dynamic = MODULES.flatMap((f) => [...source(f).matchAll(/data:\s*\{\s*help:\s*([^'\s][^}]*)\}/g)].map((m) => m[1].trim()))
    expect(dynamic).toEqual(['nightHelpKey(e)'])
  })

  test('every data-help key has an entry, and every entry is used', () => {
    const used = [...keysInUse()].sort()
    expect(used).toHaveLength(23)
    expect(Object.keys(HELP).sort()).toEqual(used)
  })

  test('each entry is plain text: a title, and paragraphs, terms or links', () => {
    for (const [key, entry] of Object.entries(HELP)) {
      expect(Object.keys(entry).every((k) => ['title', 'p', 'terms', 'more'].includes(k))).toBe(true)
      expect(typeof entry.title).toBe('string')
      expect(entry.p?.length || entry.terms?.length).toBeTruthy()
      expect(entry.p?.length ?? 0).toBeLessThanOrEqual(2)
      const strings = [entry.title, ...(entry.p ?? []), ...(entry.terms ?? []).flat(), ...(entry.more ?? []).flat()]
      for (const s of strings) {
        expect(typeof s).toBe('string')
        expect(s, key).not.toMatch(/<[a-z/]|\*\*|`/i) // no HTML, no Markdown
      }
      for (const [, href] of entry.more ?? []) expect(href).toMatch(/^\/[a-z/#-]*$/)
    }
  })

  test('no "Rehearsal", and nearby has no minimum', () => {
    const text = JSON.stringify(HELP)
    expect(text).not.toMatch(/rehearsal/i)
    expect(text).not.toMatch(/5 houses/)
    expect(JSON.stringify(HELP.location)).toContain('once another house nearby is counting')
  })
})

describe("the column's open topic", () => {
  const order = ['door', 'also', 'helpers']
  test('the first section in the band, in page order', () => {
    expect(currentTopic(order, new Set(['helpers', 'also']), 'door')).toBe('also')
  })
  test('nothing in the band keeps the one open', () => {
    expect(currentTopic(order, new Set(), 'also')).toBe('also')
  })
  test("one that's gone from the screen gives way to the first", () => {
    expect(currentTopic(order, new Set(), 'tools')).toBe('door')
    expect(currentTopic([], new Set(), 'tools')).toBe(null)
  })
})
