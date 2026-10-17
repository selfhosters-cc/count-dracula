// A fake SMTP server in-process: answers like the LAN's Exim relay (EHLO with PIPELINING and 8BITMIME, no TLS,
// no AUTH) and keeps what each client sent. `reply` overrides the answer to a command, by its first word.
// Like a mail service instead: `tls: 'implicit'` (TLS from the start, as on port 465) or `tls: 'starttls'` (offers
// STARTTLS), with the test-only certificate in test/fixtures (trust it with `ca`), and `auth: { user, pass }`
// offers AUTH PLAIN after TLS and refuses MAIL until it's done.
import net from 'node:net'
import tls from 'node:tls'
import { readFileSync } from 'node:fs'

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
export const ca = fixture('smtp-test-only.crt')
const certificate = { key: fixture('smtp-test-only.key'), cert: ca }

export function fakeSmtp({ reply = {}, silentAt = null, tls: mode = null, auth = null } = {}) {
  const sessions = []
  const sockets = new Set()

  const serve = (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    const s = { lines: [], buffer: '', inData: false, body: '', tls: mode === 'implicit', tlsFrom: mode === 'implicit' ? 0 : null, user: null }
    sessions.push(s)
    let out = socket
    const listen = (from) =>
      from.on('data', (chunk) => {
        s.buffer += Buffer.from(chunk).toString('latin1')
        let at
        while ((at = s.buffer.indexOf('\r\n')) >= 0) {
          const line = s.buffer.slice(0, at)
          s.buffer = s.buffer.slice(at + 2)
          if (s.inData) {
            if (line === '.') {
              s.inData = false
              out.write(reply.END ?? '250 OK id=1abc\r\n')
            } else s.body += line + '\r\n'
            continue
          }
          s.lines.push(line)
          const verb = line.split(/[ :]/)[0].toUpperCase()
          if (verb === silentAt) continue
          if (reply[verb]) {
            out.write(reply[verb])
            continue
          }
          if (verb === 'EHLO') {
            const offers = [mode === 'starttls' && !s.tls && 'STARTTLS', auth && s.tls && 'AUTH PLAIN LOGIN'].filter(Boolean)
            out.write(['relay.example.test Hello', 'SIZE 52428800', '8BITMIME', 'PIPELINING', ...offers, 'HELP'].map((o, i, all) => `250${i === all.length - 1 ? ' ' : '-'}${o}\r\n`).join(''))
          } else if (verb === 'STARTTLS' && mode === 'starttls' && !s.tls) {
            out.write('220 2.0.0 Ready to start TLS\r\n')
            from.removeAllListeners('data')
            s.tls = true
            s.tlsFrom = s.lines.length
            out = listen(new tls.TLSSocket(socket, { isServer: true, ...certificate }).on('error', () => {}))
          } else if (verb === 'AUTH' && auth && s.tls) {
            const [, user, pass] = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString().split('\0')
            if (user === auth.user && pass === auth.pass) {
              s.user = user
              out.write('235 2.7.0 Authentication successful\r\n')
            } else out.write('535 5.7.8 Authentication credentials invalid\r\n')
          } else if (verb === 'MAIL' && auth && !s.user) out.write('530 5.7.0 Authentication required\r\n')
          else if (verb === 'MAIL' || verb === 'RCPT') out.write('250 Accepted\r\n')
          else if (verb === 'DATA') {
            s.inData = true
            out.write('354 Enter message, ending with "." on a line by itself\r\n')
          } else if (verb === 'QUIT') {
            out.write('221 closing connection\r\n')
            out.end()
          } else out.write('500 unrecognized command\r\n')
        }
      })
    listen(socket)
    if (silentAt !== 'greeting') out.write('220 relay.example.test ESMTP Exim 4.97\r\n')
  }

  const server = mode === 'implicit' ? tls.createServer(certificate, serve) : net.createServer(serve)
  server.on('tlsClientError', () => {})
  server.listen(0, '127.0.0.1') // Bun binds at once, so the port is known now
  return {
    port: server.address().port,
    sessions,
    stop: () => {
      sockets.forEach((socket) => socket.destroy())
      server.close()
    },
  }
}
