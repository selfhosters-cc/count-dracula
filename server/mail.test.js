import { afterEach, describe, expect, test } from 'bun:test'
import { buildMessage, quotedPrintable, sendMail } from './mail.js'
import { fakeSmtp as startFakeSmtp } from '../test/fake-smtp.js'

const running = []
const fakeSmtp = (options) => {
  const smtp = startFakeSmtp(options)
  running.push(smtp)
  return smtp
}
afterEach(() => running.splice(0).forEach((s) => s.stop()))

const MAIL = {
  host: '127.0.0.1',
  from: 'Count Dracula <sign-in@count-dracula.example.com>',
  to: 'alice@example.com',
  subject: 'Your Count Dracula sign-in link',
  text: 'Hello\n.a line that starts with a dot\nbye',
}

describe('sendMail', () => {
  test('speaks EHLO, MAIL FROM, RCPT TO, DATA and QUIT to the relay, and the message arrives whole', async () => {
    const smtp = fakeSmtp()

    await sendMail({ ...MAIL, port: smtp.port })

    const [session] = smtp.sessions
    expect(session.lines).toEqual(['EHLO count-dracula.example.com', 'MAIL FROM:<sign-in@count-dracula.example.com>', 'RCPT TO:<alice@example.com>', 'DATA', 'QUIT'])
    expect(session.body).toContain('Subject: Your Count Dracula sign-in link\r\n')
    expect(session.body).toContain('From: Count Dracula <sign-in@count-dracula.example.com>\r\n')
    expect(session.body).toContain('To: alice@example.com\r\n')
  })

  test('dot-stuffs a line that starts with a dot, so it is not the end of the message', async () => {
    const smtp = fakeSmtp()

    await sendMail({ ...MAIL, port: smtp.port })

    expect(smtp.sessions[0].body).toContain('\r\n..a line that starts with a dot\r\n')
  })

  test('a refused recipient fails with the step and the code, never the reply text', async () => {
    const smtp = fakeSmtp({ reply: { RCPT: '550 alice@example.com: unrouteable address\r\n' } })

    const err = await sendMail({ ...MAIL, port: smtp.port }).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('SMTP RCPT TO refused: 550')
    expect(err.code).toBe(550)
    expect(smtp.sessions[0].lines).not.toContain('DATA')
    expect(smtp.sessions[0].lines.at(-1)).toBe('QUIT')
  })

  test('a refused message after DATA fails too', async () => {
    const smtp = fakeSmtp({ reply: { END: '452 insufficient system storage\r\n' } })

    expect((await sendMail({ ...MAIL, port: smtp.port }).catch((e) => e)).message).toBe('SMTP end of data refused: 452')
  })

  test('a relay that never answers times out', async () => {
    const smtp = fakeSmtp({ silentAt: 'MAIL' })

    const started = Date.now()
    const err = await sendMail({ ...MAIL, port: smtp.port, timeoutMs: 200 }).catch((e) => e)

    expect(err.message).toBe('SMTP MAIL FROM timed out')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  test('a relay with no greeting times out', async () => {
    const smtp = fakeSmtp({ silentAt: 'greeting' })

    expect((await sendMail({ ...MAIL, port: smtp.port, timeoutMs: 200 }).catch((e) => e)).message).toBe('SMTP greeting timed out')
  })

  test('nothing listening fails at once', async () => {
    const smtp = fakeSmtp()
    running.splice(0).forEach((s) => s.stop())

    await expect(sendMail({ ...MAIL, port: smtp.port })).rejects.toThrow()
  })

  test('a recipient with a line break or no @ is refused before connecting', async () => {
    const smtp = fakeSmtp()

    await expect(sendMail({ ...MAIL, port: smtp.port, to: 'alice@example.com\r\nBcc: x@example.com' })).rejects.toThrow('recipient')
    await expect(sendMail({ ...MAIL, port: smtp.port, to: 'alice' })).rejects.toThrow('recipient')
    expect(smtp.sessions).toHaveLength(0)
  })
})

describe('buildMessage', () => {
  const at = new Date('2026-10-11T19:04:05Z')

  test('Date, Message-ID, MIME headers, and a 7bit text part when the text is plain ASCII', () => {
    const msg = buildMessage({ ...MAIL, text: 'Hi\nthere', date: at })

    expect(msg).toContain('Date: Sun, 11 Oct 2026 19:04:05 +0000\r\n')
    expect(msg).toMatch(/\r\nMessage-ID: <[A-Za-z0-9_-]{16,}@count-dracula\.example\.com>\r\n/)
    expect(msg).toContain('MIME-Version: 1.0\r\n')
    expect(msg).toContain('Content-Type: text/plain; charset=utf-8\r\n')
    expect(msg).toContain('Content-Transfer-Encoding: 7bit\r\n')
    expect(msg.endsWith('\r\n\r\nHi\r\nthere\r\n')).toBe(true)
    expect(msg).not.toMatch(/[^\r]\n/) // CRLF only
  })

  test('text and HTML: multipart/alternative, each part quoted-printable once it has anything but ASCII', () => {
    const msg = buildMessage({ ...MAIL, text: 'At 7:04 PM — ok', html: '<p>At 7:04 PM</p>', date: at })

    const boundary = msg.match(/Content-Type: multipart\/alternative; boundary="([^"]+)"/)[1]
    expect(msg.split(`--${boundary}\r\n`)).toHaveLength(3)
    expect(msg).toContain(`--${boundary}--\r\n`)
    expect(msg).toContain('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nAt 7:04=E2=80=AFPM =E2=80=94 ok\r\n')
    expect(msg).toContain('Content-Type: text/html; charset=utf-8\r\n')
    expect([...msg].every((c) => c.charCodeAt(0) < 128)).toBe(true)
  })

  test('a display name with anything but ASCII is an encoded word', () => {
    const msg = buildMessage({ ...MAIL, from: 'Comte Drâcula <a@example.com>', date: at })

    expect(msg).toContain('From: =?utf-8?B?Q29tdGUgRHLDomN1bGE=?= <a@example.com>\r\n')
  })
})

describe('quotedPrintable', () => {
  test('encodes =, bytes over 126 and trailing spaces, and keeps lines at 76 characters with soft breaks', () => {
    expect(quotedPrintable('a=b')).toBe('a=3Db')
    expect(quotedPrintable('é')).toBe('=C3=A9')
    expect(quotedPrintable('end \nnext')).toBe('end=20\r\nnext')
    const long = quotedPrintable(`https://count-dracula.example.com/auth/email?token=${'x'.repeat(80)}`)
    for (const line of long.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
    expect(long.replaceAll('=\r\n', '')).toBe(`https://count-dracula.example.com/auth/email?token=3D${'x'.repeat(80)}`)
  })

  test('never splits an =XX escape across a soft break', () => {
    const out = quotedPrintable('é'.repeat(40))
    for (const line of out.split('\r\n')) expect(line).toMatch(/^(=[0-9A-F]{2})*=?$/)
  })
})
