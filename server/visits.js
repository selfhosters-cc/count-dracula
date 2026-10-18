// Visits to the public pages, counted by the server itself (no analytics service, no cookie): per day and page,
// views and distinct visitors, and per day where visitors came from. A visitor is a hash of their address and
// browser with a key made at random each day and never stored, so nothing kept can be tied back to anyone; a
// restart makes a new key, so someone seen before it counts again that day. Days are the Operator's (Toronto).
const DAY_ZONE = 'America/Toronto'
export const VISIT_PAGES = new Set(['/', '/privacy', '/help/tv'])

// Machines, not people: search crawlers, link previews (WhatsApp, iMessage, Slack…), monitors, scripts, headless browsers.
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|embedly|curl|wget|python|go-http|java\/|node|bun\/|headless|lighthouse|monitor|uptime/i

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: DAY_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayOf = (ms) => dayFmt.format(ms) // "2026-10-31"

// Android apps send their package as the referrer: the common ones by name.
const APPS = {
  'com.whatsapp': 'WhatsApp',
  'com.facebook.katana': 'Facebook',
  'com.facebook.orca': 'Messenger',
  'com.instagram.android': 'Instagram',
  'org.telegram.messenger': 'Telegram',
  'com.reddit.frontpage': 'Reddit',
  'com.google.android.gm': 'Gmail',
  'com.google.android.googlequicksearchbox': 'Google',
  'com.discord': 'Discord',
  'com.twitter.android': 'X',
}

// Where a visitor came from: ?ref= or ?utm_source= on the link (a label someone chose), else the Referer's site
// (an Android app's referrer, android-app://com.whatsapp/, is the app), else "direct". Never a path or a query.
export function sourceOf({ url, referer, host }) {
  const params = new URL(url).searchParams
  const tagged = (params.get('ref') ?? params.get('utm_source') ?? '').trim().toLowerCase().slice(0, 40)
  if (tagged) return tagged
  if (!referer) return 'direct'
  let from
  try {
    from = new URL(referer)
  } catch {
    return 'direct'
  }
  if (from.protocol === 'android-app:') return APPS[from.hostname] ?? (from.hostname || 'direct')
  const site = from.hostname.replace(/^www\./, '')
  return site && site !== host.replace(/^www\./, '') ? site : null // null: a visit from our own pages
}

export function createVisits({ db, now = Date.now }) {
  let today = null
  let key = null
  let seen = new Set() // today's visitors, as page|hash
  const views = db.query(`
    INSERT INTO site_visits (day, page, views, visitors) VALUES (?1, ?2, 1, ?3)
    ON CONFLICT (day, page) DO UPDATE SET views = views + 1, visitors = visitors + ?3
  `)
  const arrival = db.query(`
    INSERT INTO site_sources (day, source, visitors) VALUES (?, ?, 1)
    ON CONFLICT (day, source) DO UPDATE SET visitors = visitors + 1
  `)

  return {
    // One page view: { page, ip, userAgent, referer, url, host }. Returns false for what isn't counted.
    record({ page, ip, userAgent = '', referer = null, url, host }) {
      if (!VISIT_PAGES.has(page) || !userAgent || BOTS.test(userAgent)) return false
      const day = dayOf(now())
      if (day !== today) {
        today = day
        key = crypto.getRandomValues(new Uint8Array(32))
        seen = new Set()
      }
      const visitor = new Bun.CryptoHasher('sha256', key).update(`${ip}|${userAgent}`).digest('base64url')
      const firstToday = !seen.has(visitor)
      const firstOnPage = !seen.has(`${page}|${visitor}`)
      seen.add(visitor)
      seen.add(`${page}|${visitor}`)
      views.run(day, page, firstOnPage ? 1 : 0)
      if (firstToday) {
        const source = sourceOf({ url, referer, host })
        if (source) arrival.run(day, source)
      }
      return true
    },

    // The last `days` days (today included) for /operator: { days: [{ day, page, views, visitors }], sources:
    // [{ source, visitors }] (most first) }.
    summary(days = 30) {
      const from = dayOf(now() - (days - 1) * 86_400_000)
      return {
        days: db.query('SELECT day, page, views, visitors FROM site_visits WHERE day >= ? ORDER BY day, page').all(from),
        sources: db.query('SELECT source, SUM(visitors) AS visitors FROM site_sources WHERE day >= ? GROUP BY source ORDER BY visitors DESC, source LIMIT 12').all(from),
      }
    },
  }
}
