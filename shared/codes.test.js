import { describe, expect, test } from 'bun:test'
import { readCode, tvCodeFrom } from './codes.js'

describe('the one code box (spec v2.1 §11)', () => {
  test("a TV's pairing code, however it's typed", () => {
    for (const typed of ['K7QM4X', 'K7Q-M4X', 'k7q-m4x', ' K7Q M4X ']) expect(readCode(typed)).toEqual({ tv: 'K7QM4X' })
  })

  test('a join code, as typed or out of a pasted join link', () => {
    expect(readCode('Ab3dEf7hJk')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode(' Ab3dE f7hJk ')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode('https://count-dracula.example.com/door?key=Ab3dEf7hJk')).toEqual({ join: 'Ab3dEf7hJk' })
    expect(readCode('count-dracula.example.com/?key=Ab3dEf7hJk&x=1')).toEqual({ join: 'Ab3dEf7hJk' }) // an old link
  })

  test("a TV's scan-to-pair link pasted in", () => {
    expect(readCode('https://count-dracula.example.com/setup?pair=K7QM4X')).toEqual({ tv: 'K7QM4X' })
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
