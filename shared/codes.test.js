import { describe, expect, test } from 'bun:test'
import { maskCode, readCode, tvCodeFrom } from './codes.js'

describe('the one code box (spec v2.1 §11)', () => {
  test("a 6-character code, however it's typed: the server says which", () => {
    for (const typed of ['K7QM4X', 'K7Q-M4X', 'k7q-m4x', ' K7Q M4X ']) expect(readCode(typed)).toEqual({ code: 'K7QM4X' })
  })

  test('an old join key, as typed or out of a pasted join link', () => {
    expect(readCode('Ab3dEf7hJk')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode(' Ab3dE f7hJk ')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode('https://count-dracula.example.com/door?key=Ab3dEf7hJk')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode('count-dracula.example.com/?key=Ab3dEf7hJk&x=1')).toEqual({ join: 'Ab3dEf7hJk' }) // an old link
  })

  test("a TV's scan-to-pair link pasted in", () => {
    expect(readCode('https://count-dracula.example.com/setup?pair=K7QM4X')).toEqual({ tv: 'K7QM4X' })
  })

  test('the mask: capitals, and the dash put in as you type; a link or an old key left alone', () => {
    expect(['k', 'k7', 'k7q', 'k7qm', 'k7q-m4', 'K7QM4X', 'k7q m4x'].map(maskCode)).toEqual(['K', 'K7', 'K7Q', 'K7Q-M', 'K7Q-M4', 'K7Q-M4X', 'K7Q-M4X'])
    expect(maskCode('https://count-dracula.example.com/tv/k/abc')).toBe('https://count-dracula.example.com/tv/k/abc')
    expect(maskCode('Ab3dEf7hJk')).toBe('Ab3dEf7hJk')
    expect(maskCode('')).toBe('')
  })

  test("refuses what can't be either", () => {
    for (const text of ['', '   ', 'abc', 'K7QM4', 'O0O0O0', 'https://count-dracula.example.com/door', 'not a code!', 'x'.repeat(80)]) {
      expect(readCode(text)).toBeNull()
    }
  })

  test('tvCodeFrom only takes the TV alphabet (no lookalikes) at the right length', () => {
    expect(tvCodeFrom('k7q-m4x')).toBe('K7QM4X')
    expect(tvCodeFrom('K7QM4XX')).toBeNull()
    expect(tvCodeFrom('B7QM4X')).toBeNull() // B is a lookalike, never in a code
    expect(tvCodeFrom(null)).toBeNull()
  })
})
