// The codes a person may type, in one box on the homepage (spec v2.1 §11), all 6 characters with no lookalikes,
// shown as K7Q-M4X: a TV's pairing code (on a bare /tv; a Manager enters it), and a Household's join code (to count
// at its door) and watch code (to watch along). They look alike, so the server says which one it is. A join code is
// only ever exchanged there, for the long join key a phone keeps; an old 10-character join key still works too.

// No lookalikes: no 0/O, 1/I/L, 2/Z, 5/S, 8/B or G/6.
export const TV_CODE_ALPHABET = 'ACDEFHJKMNPQRTUVWXY34679'
export const TV_CODE_LENGTH = 6

const TV_CODE = new RegExp(`^[${TV_CODE_ALPHABET}]{${TV_CODE_LENGTH}}$`)
const JOIN_CODE = /^[A-Za-z0-9]{8,40}$/

// "K7Q-M4X": a code as it's shown and typed.
export const formatCode = (code) => `${code.slice(0, 3)}-${code.slice(3)}`

// A code box's mask, as someone types: capitals, and the dash put in after the third character ("k7qm" →
// "K7Q-M"). What can't be a 6-character code is left exactly as it is: a pasted link, or an old 10-character
// join key (mixed case, so it must not be touched).
export function maskCode(text) {
  const raw = String(text ?? '')
  if (/[^A-Za-z0-9\s-]/.test(raw)) return raw
  const chars = raw.replace(/[\s-]+/g, '')
  if (chars.length > TV_CODE_LENGTH) return raw
  const upper = chars.toUpperCase()
  return upper.length > 3 ? `${upper.slice(0, 3)}-${upper.slice(3)}` : upper
}

// Wires a code box to the mask. Deleting the dash itself takes the character before it too, so it never sticks.
export function maskCodeInput(input) {
  input.addEventListener('input', (e) => {
    const wasDash = e.inputType === 'deleteContentBackward' && /^[A-Za-z0-9]{3}$/.test(input.value)
    const next = maskCode(wasDash ? input.value.slice(0, 2) : input.value)
    if (next !== input.value) input.value = next
  })
}

// A new code: 6 characters from the alphabet, at random.
export function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(TV_CODE_LENGTH)), (b) => TV_CODE_ALPHABET[b % TV_CODE_ALPHABET.length]).join('')
}

// A code as typed ("k7q-m4x", "K7Q M4X") → "K7QM4X", or null.
export function tvCodeFrom(text) {
  const code = String(text ?? '').replace(/[\s-]+/g, '').toUpperCase()
  return TV_CODE.test(code) ? code : null
}

// { code } (a 6-character code: the server says which) | { tv: code } (a scan-to-pair link) | { join: key } (an old
// join key, or a join link) | null, from a code typed or a link pasted (/door?key=, an old /?key=, /setup?pair=).
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
  const code = tvCodeFrom(raw)
  if (code) return { code }
  const join = raw.replace(/\s+/g, '')
  return JOIN_CODE.test(join) ? { join } : null
}
