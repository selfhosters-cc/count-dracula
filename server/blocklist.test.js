import { describe, expect, test } from 'bun:test'
import { isBlocked } from './blocklist.js'

describe('isBlocked', () => {
  test('catches listed words whatever the case, accents, leetspeak or spacing', () => {
    for (const text of ['Shit', 'SHIT HAPPENS', 'Holy sh1t', 'sh!t', 'Fück', 'f u c k', 'f.u.c.k', 'F-U-C-K witch', '@sshole', 'a$$hole', 'motherfuckers', 'Two Girls One Cup']) {
      expect({ text, blocked: isBlocked(text) }).toEqual({ text, blocked: true })
    }
  })

  test('lets innocent names through, even when a listed word hides inside a longer one', () => {
    for (const text of ['Scunthorpe', 'Cocktail waitress', 'Bass player', 'Grape', 'Dickens', 'Classy lass', 'Spider-Man', 'Witch', '🎃 Other', 'The Smiths on Elm St', 'Peacock', 'Shiitake', 'Assassin']) {
      expect({ text, blocked: isBlocked(text) }).toEqual({ text, blocked: false })
    }
  })

  test('nothing to check is not blocked', () => {
    expect(isBlocked('')).toBe(false)
    expect(isBlocked(null)).toBe(false)
  })
})
