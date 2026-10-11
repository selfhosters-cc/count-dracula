// A tiny SMTP client for the one email the app sends: a sign-in link (see server/email-sign-in.js). It speaks
// to a relay on the LAN with plain SMTP: no TLS, no AUTH, one message per connection. Every reply code is
// checked, every wait has a timeout, and a refusal's error carries only the step and the code: a relay's
// reply text can hold the recipient's address, which stays out of the logs.

const ADDRESS = /^[\x21-\x7e]+@[\x21-\x7e]+\.[\x21-\x7e]+$/
const ADDRESS_FORBIDS = /[<>()[\]\\,;:"\s]/

// A plain address: printable ASCII, one @, a dot in the domain, nothing that breaks a header. The relay
// isn't asked for SMTPUTF8, so an address with anything else isn't one we can send to.
export function isMailAddress(address) {
  const s = String(address ?? '')
  return s.length <= 254 && ADDRESS.test(s) && !ADDRESS_FORBIDS.test(s) && s.indexOf('@') === s.lastIndexOf('@')
}

// "Count Dracula <sign-in@example.com>" → "sign-in@example.com"; a bare address stays as it is.
export function envelopeAddress(from) {
  const s = String(from ?? '').trim()
  return s.match(/<([^<>]+)>\s*$/)?.[1] ?? s
}

export class SmtpError extends Error {
  constructor(message, code = null) {
    super(message)
    this.name = 'SmtpError'
    this.code = code
  }
}

// One message to one recipient through the relay at host:port. Resolves once the relay has accepted it.
export async function sendMail({ host, port = 25, from, to, subject, text, html = null, timeoutMs = 15_000, helo }) {
  if (!isMailAddress(to)) throw new SmtpError('SMTP recipient is not a plain address')
  const sender = envelopeAddress(from)
  if (!isMailAddress(sender)) throw new SmtpError('SMTP sender is not a plain address')
  const message = buildMessage({ from, to, subject, text, html })
  const conn = await connect(host, Number(port) || 25, timeoutMs)
  try {
    await conn.expect('greeting', 220)
    conn.write(`EHLO ${helo ?? sender.split('@')[1]}\r\n`)
    await conn.expect('EHLO', 250)
    conn.write(`MAIL FROM:<${sender}>\r\n`)
    await conn.expect('MAIL FROM', 250)
    conn.write(`RCPT TO:<${to}>\r\n`)
    await conn.expect('RCPT TO', 250, 251)
    conn.write('DATA\r\n')
    await conn.expect('DATA', 354)
    conn.write(`${dotStuff(message)}.\r\n`)
    await conn.expect('end of data', 250)
    conn.write('QUIT\r\n')
    await conn.expect('QUIT', 221).catch(() => {}) // the message is in: a lost goodbye doesn't matter
  } catch (err) {
    if (!conn.closed) {
      conn.write('QUIT\r\n')
      await conn.expect('QUIT', 221).catch(() => {})
    }
    throw err
  } finally {
    conn.close()
  }
}

// The message as it goes after DATA: headers, a blank line and the body, CRLF line ends throughout. Text only,
// or text and HTML as multipart/alternative. A part that is plain ASCII with short lines goes 7bit, anything
// else quoted-printable, so the message is 7-bit clean either way.
export function buildMessage({ from, to, subject, text, html = null, date = new Date() }) {
  const domain = envelopeAddress(from).split('@')[1] ?? 'localhost'
  const headers = [
    `From: ${encodeDisplayName(from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${rfc5322Date(date)}`,
    `Message-ID: <${randomId()}@${domain}>`,
    'MIME-Version: 1.0',
  ]
  if (html == null) return `${[...headers, ...partHeaders('text/plain', text)].join('\r\n')}\r\n\r\n${partBody(text)}\r\n`
  const boundary = `=_cd_${randomId()}`
  const part = (type, body) => `--${boundary}\r\n${partHeaders(type, body).join('\r\n')}\r\n\r\n${partBody(body)}\r\n`
  return `${[...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`].join('\r\n')}\r\n\r\n${part('text/plain', text)}${part('text/html', html)}--${boundary}--\r\n`
}

// Quoted-printable (RFC 2045 §6.7) over UTF-8: =XX for '=', control bytes and anything over 126, a space or
// tab at a line's end too, and soft breaks ("=" CRLF) keeping each line within 76 characters.
export function quotedPrintable(input) {
  return crlfLines(input)
    .map((line) => {
      const bytes = new TextEncoder().encode(line)
      const tokens = []
      bytes.forEach((b, i) => {
        const last = i === bytes.length - 1
        const plain = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)
        tokens.push(plain ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`)
      })
      const out = []
      let current = ''
      for (const token of tokens) {
        if (current.length + token.length > 75) {
          out.push(`${current}=`)
          current = ''
        }
        current += token
      }
      out.push(current)
      return out.join('\r\n')
    })
    .join('\r\n')
}

function partHeaders(type, body) {
  return [`Content-Type: ${type}; charset=utf-8`, `Content-Transfer-Encoding: ${isSevenBit(body) ? '7bit' : 'quoted-printable'}`]
}

function partBody(body) {
  return isSevenBit(body) ? crlfLines(body).join('\r\n') : quotedPrintable(body)
}

function isSevenBit(body) {
  return crlfLines(body).every((line) => line.length <= 998 && /^[\x20-\x7e\t]*$/.test(line))
}

function crlfLines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
}

// A line that starts with "." gets another, so it can't end the message early (RFC 5321 §4.5.2).
function dotStuff(message) {
  return message.replace(/(^|\r\n)\./g, '$1..')
}

function encodeHeader(value) {
  const s = String(value ?? '').replace(/[\r\n]+/g, ' ')
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?utf-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

// From: keeps the address as it is and encodes only a display name with anything but ASCII.
function encodeDisplayName(from) {
  const s = String(from ?? '').replace(/[\r\n]+/g, ' ').trim()
  const m = s.match(/^(.*?)\s*<([^<>]+)>$/)
  if (!m || !m[1]) return s
  return `${encodeHeader(m[1])} <${m[2]}>`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function rfc5322Date(d) {
  const two = (n) => String(n).padStart(2, '0')
  return `${DAYS[d.getUTCDay()]}, ${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} +0000`
}

function randomId() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url')
}

// The TCP connection: write() queues and sends what the socket takes (the rest on drain); expect(step, ...codes)
// waits for the next whole reply, multi-line ones included, and rejects on a wrong code, a timeout or a close.
async function connect(host, port, timeoutMs) {
  let buffer = ''
  let outbox = Buffer.alloc(0)
  const replies = []
  let waiter = null
  let failure = null
  let socket = null
  const conn = { closed: false }

  const settle = () => {
    if (!waiter) return
    if (replies.length) {
      const w = waiter
      waiter = null
      w.resolve(replies.shift())
    } else if (failure) {
      const w = waiter
      waiter = null
      w.reject(failure)
    }
  }
  const flush = () => {
    if (!socket || !outbox.length || conn.closed) return
    const n = socket.write(outbox)
    outbox = outbox.subarray(Math.max(0, n))
  }

  socket = await Bun.connect({
    hostname: host,
    port,
    socket: {
      data(_socket, chunk) {
        buffer += Buffer.from(chunk).toString('latin1')
        let lines = []
        let at
        while ((at = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, at).replace(/\r$/, '')
          buffer = buffer.slice(at + 1)
          lines.push(line)
          if (/^\d{3}(?: |$)/.test(line)) {
            replies.push({ code: Number(line.slice(0, 3)), lines })
            lines = []
          }
        }
        if (lines.length) buffer = lines.map((l) => `${l}\r\n`).join('') + buffer
        settle()
      },
      drain: () => flush(),
      close() {
        conn.closed = true
        failure ??= new SmtpError('SMTP connection closed')
        settle()
      },
      error(_socket, err) {
        failure ??= new SmtpError(`SMTP connection failed: ${err?.code ?? err?.name ?? 'error'}`)
        settle()
      },
    },
  }).catch((err) => {
    throw new SmtpError(`SMTP could not connect: ${err?.code ?? err?.name ?? 'error'}`)
  })

  conn.write = (text) => {
    outbox = Buffer.concat([outbox, Buffer.from(text, 'latin1')])
    flush()
  }
  conn.expect = (step, ...codes) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter = null
        reject(new SmtpError(`SMTP ${step} timed out`))
        conn.close()
      }, timeoutMs)
      waiter = {
        resolve: (reply) => {
          clearTimeout(timer)
          if (codes.includes(reply.code)) resolve(reply)
          else reject(new SmtpError(`SMTP ${step} refused: ${reply.code}`, reply.code))
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      }
      settle()
    })
  conn.close = () => {
    if (conn.closed) return
    conn.closed = true
    socket.end()
  }
  return conn
}
