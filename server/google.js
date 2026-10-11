// Google sign-in (v2 spec §3): the authorization-code flow with openid email profile. The ID token comes
// straight from Google's token endpoint over HTTPS, so its claims are read without checking a signature
// (OpenID Connect Core §3.1.3.7); its audience, issuer and expiry are still checked.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

export function googleClient({ clientId, clientSecret, fetch = globalThis.fetch, now = Date.now }) {
  return {
    authUrl({ state, nonce, redirectUri }) {
      const url = new URL(AUTH_URL)
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        prompt: 'select_account',
      })
      return url.href
    },

    // → { sub, email, emailVerified, name, nonce }
    async exchange({ code, redirectUri }) {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      })
      if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
      const { id_token: idToken } = await res.json()
      const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString('utf8'))
      if (claims.aud !== clientId) throw new Error('Google ID token is for another client')
      if (!ISSUERS.has(claims.iss)) throw new Error('Google ID token has the wrong issuer')
      if (!(claims.exp * 1000 > now())) throw new Error('Google ID token has expired')
      return { sub: claims.sub, email: claims.email, emailVerified: claims.email_verified === true, name: claims.name ?? null, nonce: claims.nonce }
    },
  }
}
