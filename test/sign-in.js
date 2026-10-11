// The whole round trip: the sign-up form, Google, and the callback. Returns the callback's response.
export async function signIn({ app, google }, identity, { displayName, timeZone = 'America/Vancouver', state, invite, pair } = {}) {
  const form = new URLSearchParams({ timeZone })
  if (displayName != null) form.set('displayName', displayName)
  if (invite != null) form.set('invite', invite)
  if (pair != null) form.set('pair', pair)
  const started = await fetch(`${app.url}/auth/google/start`, { method: 'POST', body: form, redirect: 'manual' })
  if (started.status !== 303) return started
  const authUrl = started.headers.get('Location')
  const code = google.authorize(authUrl, identity)
  const callback = new URL(`${app.url}/auth/google/callback`)
  callback.search = new URLSearchParams({ code, state: state ?? new URL(authUrl).searchParams.get('state') })
  return fetch(callback, { redirect: 'manual' })
}

export const cookieOf = (res) => res.headers.get('Set-Cookie')?.split(';')[0] ?? null
