// The bare /tv's pairing screen (v2 spec §9): asks for a code, shows it with a scan-to-pair QR, and waits
// for a Manager to redeem it. A code that expires is replaced; once paired, onPaired gets the TV link.
const POLL_MS = 2_000

export function startPairing({ show, onPaired }) {
  let current = null
  let timer = null

  async function fresh() {
    const res = await fetch('/api/pair/code', { method: 'POST' })
    if (!res.ok) throw new Error(`No pairing code: ${res.status}`)
    current = await res.json()
    show(current)
  }

  async function poll() {
    if (!current) return fresh()
    const res = await fetch('/api/pair/wait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waitToken: current.waitToken }),
    })
    if (res.status === 410) return fresh() // expired: a new code
    if (!res.ok) return
    const answer = await res.json()
    if (!answer.paired) return
    clearInterval(timer)
    onPaired(answer)
  }

  fresh().catch(() => {}) // a server that's away: the next poll asks again
  timer = setInterval(() => poll().catch(() => {}), POLL_MS)
}

// "K7Q-M4X": the code as the TV shows it and a person types it.
export const formatCode = (code) => `${code.slice(0, 3)}-${code.slice(3)}`
