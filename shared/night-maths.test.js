import { describe, expect, test } from 'bun:test'
import { tagColour } from './night-maths.js'

describe('tagColour', () => {
  test('gives the first six costumes the six slots, in order', () => {
    expect([1, 2, 3, 4, 5, 6].map(tagColour)).toEqual(['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767'])
  })

  test('folds the 7th costume and later to grey', () => {
    expect(tagColour(7)).toBe('#8a84a8')
    expect(tagColour(12)).toBe('#8a84a8')
  })

  test('colours untagged kids orange', () => {
    expect(tagColour(null)).toBe('#ff7a1a')
  })
})
