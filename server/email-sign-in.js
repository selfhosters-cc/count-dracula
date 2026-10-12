// The sign-in email (spec v2.1 §11, sign-in-simplify 04): the code first, then the link, who asked and when, and
// "If you didn't ask, ignore this".
// Plain text, and a simple HTML part with the same words.

// to: the address as typed. code: the 6 digits for the same link. ip: who asked. at: when (ms). timeZone: the asking
// browser's, to say when in.
export function signInEmail({ link, code, to, ip, at, timeZone }) {
  const when = whenText(at, timeZone)
  const asked = `Someone asked to sign in to Count Dracula as ${to}${ip ? `, from the IP address ${ip},` : ''} at ${when}.`
  const text = [
    'Hi,',
    '',
    `Your sign-in code is ${code}. Type it where you asked to sign in.`,
    '',
    'Or open this link and press Sign in. The code and the link work once, for 15 minutes:',
    '',
    link,
    '',
    asked,
    "If you didn't ask, ignore this email: nobody can sign in without it.",
    '',
    'Count Dracula',
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
<p>Hi,</p>
<p>Your sign-in code is:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 8px">${esc(code)}</p>
<p>Type it where you asked to sign in. Or open this link and press Sign in:</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#ff7a1a;color:#1a0d00;font-weight:700;text-decoration:none">Sign in to Count Dracula</a></p>
<p style="font-size:13px;color:#555">Or copy this into your browser: ${esc(link)}</p>
<p>The code and the link work once, for 15 minutes.</p>
<p>${esc(asked)} If you didn't ask, ignore this email: nobody can sign in without it.</p>
<p>Count Dracula</p>
</body></html>`
  return { subject: `Your Count Dracula sign-in code: ${code}`, text, html }
}

// "g***@gmail.com": enough in a log to tell two people apart, not enough to be the address.
export function maskEmail(address) {
  const s = String(address ?? '')
  const at = s.lastIndexOf('@')
  if (at < 1) return '***'
  return `${s[0].toLowerCase()}***@${s.slice(at + 1).toLowerCase()}`
}

function whenText(at, timeZone) {
  const zone = timeZone || 'UTC'
  const d = new Date(at)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(d)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }).format(d)
  return `${time} on ${day} (${zone})`
}

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
