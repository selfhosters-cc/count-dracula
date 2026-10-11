// The sign-in link's email (spec v2.1 §11): who asked and when, the link, and "If you didn't ask, ignore this".
// Plain text, and a simple HTML part with the same words.

export const EMAIL_SUBJECT = 'Your Count Dracula sign-in link'

// to: the address as typed. ip: who asked. at: when (ms). timeZone: the asking browser's, to say when in.
export function signInEmail({ link, to, ip, at, timeZone }) {
  const when = whenText(at, timeZone)
  const asked = `Someone asked to sign in to Count Dracula as ${to}${ip ? `, from the IP address ${ip},` : ''} at ${when}.`
  const text = [
    'Hi,',
    '',
    asked,
    '',
    'To sign in, open this link and press Sign in. It works once, for 15 minutes:',
    '',
    link,
    '',
    "If you didn't ask, ignore this email: nobody can sign in without the link.",
    '',
    'Count Dracula',
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
<p>Hi,</p>
<p>${esc(asked)}</p>
<p>To sign in, open this link and press Sign in. It works once, for 15 minutes:</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#ff7a1a;color:#1a0d00;font-weight:700;text-decoration:none">Sign in to Count Dracula</a></p>
<p style="font-size:13px;color:#555">Or copy this into your browser: ${esc(link)}</p>
<p>If you didn't ask, ignore this email: nobody can sign in without the link.</p>
<p>Count Dracula</p>
</body></html>`
  return { subject: EMAIL_SUBJECT, text, html }
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
