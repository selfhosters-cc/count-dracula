// Whose request it is (server/client-ip.js): CF-Connecting-IP counts only from a trusted proxy, and only when it's
// an address, so nobody resets their own rate limits or writes into the sign-in email by sending the header.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { LIMITS } from './guard.js'
import { clientIpOf, trustedProxies } from './client-ip.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

const PRIVATE = trustedProxies(undefined)

describe('clientIpOf', () => {
  test('a proxy on this machine or a private network is believed', () => {
    for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '172.18.0.4', '192.168.5.20', '100.91.0.7', 'fd7a:115c::1']) {
      expect({ peer, ip: clientIpOf('203.0.113.9', peer, PRIVATE) }).toEqual({ peer, ip: '203.0.113.9' })
    }
  })

  test('anyone else gets their own address, whatever header they send', () => {
    for (const peer of ['198.51.100.7', '2001:db8::7', '172.32.0.1']) {
      expect({ peer, ip: clientIpOf('203.0.113.9', peer, PRIVATE) }).toEqual({ peer, ip: peer })
    }
  })

  test("a header that isn't an address is ignored, even from a trusted proxy", () => {
    expect(clientIpOf('1.2.3.4 -- call 555-0100', '127.0.0.1', PRIVATE)).toBe('127.0.0.1')
    expect(clientIpOf('', '127.0.0.1', PRIVATE)).toBe('127.0.0.1')
    expect(clientIpOf(null, '::ffff:10.0.0.1', PRIVATE)).toBe('10.0.0.1')
    expect(clientIpOf(' 2001:db8::1 ', '127.0.0.1', PRIVATE)).toBe('2001:db8::1')
  })

  test('TRUSTED_PROXIES replaces the private ranges', () => {
    const trusted = trustedProxies('198.51.100.0/24, 2001:db8::1')

    expect(clientIpOf('203.0.113.9', '198.51.100.200', trusted)).toBe('203.0.113.9')
    expect(clientIpOf('203.0.113.9', '2001:db8::1', trusted)).toBe('203.0.113.9')
    expect(clientIpOf('203.0.113.9', '127.0.0.1', trusted)).toBe('127.0.0.1')
  })

  test('a TRUSTED_PROXIES that isn\'t addresses stops the server starting', () => {
    expect(() => trustedProxies('caddy')).toThrow('TRUSTED_PROXIES: not an address or a range: caddy')
    expect(() => trustedProxies('10.0.0.0/x')).toThrow('TRUSTED_PROXIES')
  })
})

describe('the rate limits, over HTTP', () => {
  function serve(env) {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const app = startServer({ configPath, port: 0, env, limits: { ...LIMITS, pairCode: { count: 2, perMs: 3_600_000 } } })
    running.push(app)
    return (ip) => fetch(`${app.url}/api/pair/code`, { method: 'POST', headers: { 'CF-Connecting-IP': ip } }).then((r) => r.status)
  }

  test('from a trusted proxy, each visitor has their own limit', async () => {
    const ask = serve({})

    expect([await ask('203.0.113.1'), await ask('203.0.113.1'), await ask('203.0.113.1'), await ask('203.0.113.2')]).toEqual([200, 200, 429, 200])
  })

  test('from anyone else, a new header each time is still one visitor', async () => {
    const ask = serve({ TRUSTED_PROXIES: '192.0.2.1' }) // the test's own requests come from 127.0.0.1: not trusted

    expect([await ask('203.0.113.1'), await ask('203.0.113.2'), await ask('203.0.113.3')]).toEqual([200, 200, 429])
  })
})
