// The two codes a person may type, in one box on the homepage (spec v2.1 §11): a TV's pairing code (6 characters
// with no lookalikes, shown on a bare /tv; a Manager enters it) and a Household's join code (its join key, under a
// helper's QR; a helper enters it). Their shapes never overlap, so nobody has to know which one they have.

// No lookalikes: no 0/O, 1/I/L, 2/Z, 5/S, 8/B or G/6.
export const TV_CODE_ALPHABET = 'ACDEFHJKMNPQRTUVWXY34679'
export const TV_CODE_LENGTH = 6

const TV_CODE = new RegExp(`^[${TV_CODE_ALPHABET}]{${TV_CODE_LENGTH}}$`)
const JOIN_CODE = /^[A-Za-z0-9]{8,40}$/

// A TV code as typed ("k7q-m4x", "K7Q M4X") → "K7QM4X", or null.
export function tvCodeFrom(text) {
  const code = String(text ?? '').replace(/[\s-]+/g, '').toUpperCase()
  return TV_CODE.test(code) ? code : null
}

// { tv: code } | { join: key } | null, from a code typed or a link pasted (/door?key=, an old /?key=, /setup?pair=).
export function readCode(text) {
  const raw = String(text ?? '').trim()
  const param = (name) => raw.match(new RegExp(`[?&]${name}=([^&#\\s]+)`))?.[1]
  if (param('pair')) {
    const tv = tvCodeFrom(decodeURIComponent(param('pair')))
    return tv ? { tv } : null
  }
  if (param('key')) {
    const join = decodeURIComponent(param('key'))
    return JOIN_CODE.test(join) ? { join } : null
  }
  const tv = tvCodeFrom(raw)
  if (tv) return { tv }
  const join = raw.replace(/\s+/g, '')
  return JOIN_CODE.test(join) ? { join } : null
}
