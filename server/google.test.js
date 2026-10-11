import { describe, expect, test } from 'bun:test'
import { googleClient } from './google.js'

const NOW = Date.parse('2026-10-12T12:00:00Z')
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const idToken = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.signature`
const good = { aud: 'client-1', iss: 'https://accounts.google.com', exp: NOW / 1000 + 600, sub: '1234', email: 'alice@example.com', email_verified: true, name: 'Alice', nonce: 'n-1' }

function client(claims, calls = []) {
  const fetch = async (url, init) => {
    calls.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) })
    return Response.json({ id_token: idToken(claims) })
  }
  return googleClient({ clientId: 'client-1', clientSecret: 'secret-1', fetch, now: () => NOW })
}

describe('Google sign-in', () => {
  test('sends people to Google for openid email profile, with the state and nonce', () => {
    const url = new URL(client(good).authUrl({ state: 's-1', nonce: 'n-1', redirectUri: 'https://count-dracula.example.com/auth/google/callback' }))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-1',
      scope: 'openid email profile',
      response_type: 'code',
      state: 's-1',
      nonce: 'n-1',
      redirect_uri: 'https://count-dracula.example.com/auth/google/callback',
    })
  })

  test("trades the code for the account's id, email and name", async () => {
    const calls = []

    const who = await client(good, calls).exchange({ code: 'c-1', redirectUri: 'https://count-dracula.example.com/auth/google/callback' })

    expect(who).toEqual({ sub: '1234', email: 'alice@example.com', emailVerified: true, name: 'Alice', nonce: 'n-1' })
    expect(calls).toEqual([{
      url: 'https://oauth2.googleapis.com/token',
      body: { code: 'c-1', client_id: 'client-1', client_secret: 'secret-1', redirect_uri: 'https://count-dracula.example.com/auth/google/callback', grant_type: 'authorization_code' },
    }])
  })

  test.each([
    ['another client', { aud: 'client-2' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: NOW / 1000 - 1 }],
  ])('refuses a token for %s', async (_, claims) => {
    await expect(client({ ...good, ...claims }).exchange({ code: 'c', redirectUri: 'r' })).rejects.toThrow()
  })
})
