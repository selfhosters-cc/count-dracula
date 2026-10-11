// A fake Google for the sign-in tests: the same seam as server/google.js. A test picks who signs in
// with authorize(authUrl, identity), which hands back the code Google would put on the callback.
export function fakeGoogle() {
  const codes = new Map()
  let next = 1
  return {
    authUrl({ state, nonce, redirectUri }) {
      const url = new URL('https://accounts.google.test/auth')
      url.search = new URLSearchParams({ state, nonce, redirect_uri: redirectUri })
      return url.href
    },
    async exchange({ code }) {
      const identity = codes.get(code)
      if (!identity) throw new Error('Unknown code')
      codes.delete(code)
      return identity
    },
    // identity: { sub, email, name, emailVerified = true }; the nonce comes from the auth URL unless given.
    authorize(authUrl, identity) {
      const code = `code-${next++}`
      const nonce = new URL(authUrl).searchParams.get('nonce')
      codes.set(code, { emailVerified: true, nonce, ...identity })
      return code
    },
  }
}
