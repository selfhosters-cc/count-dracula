// A fake SMTP server in-process: answers like the LAN's Exim relay (EHLO with PIPELINING and 8BITMIME, no TLS,
// no AUTH) and keeps what each client sent. `reply` overrides the answer to a command, by its first word.
export function fakeSmtp({ reply = {}, silentAt = null } = {}) {
  const sessions = []
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      open(socket) {
        socket.data = { lines: [], buffer: '', inData: false, body: '' }
        sessions.push(socket.data)
        if (silentAt === 'greeting') return
        socket.write('220 relay.example.test ESMTP Exim 4.97\r\n')
      },
      data(socket, chunk) {
        const s = socket.data
        s.buffer += Buffer.from(chunk).toString('latin1')
        let at
        while ((at = s.buffer.indexOf('\r\n')) >= 0) {
          const line = s.buffer.slice(0, at)
          s.buffer = s.buffer.slice(at + 2)
          if (s.inData) {
            if (line === '.') {
              s.inData = false
              socket.write(reply.END ?? '250 OK id=1abc\r\n')
            } else s.body += line + '\r\n'
            continue
          }
          s.lines.push(line)
          const verb = line.split(/[ :]/)[0].toUpperCase()
          if (verb === silentAt) continue
          if (reply[verb]) {
            socket.write(reply[verb])
            continue
          }
          if (verb === 'EHLO') socket.write('250-relay.example.test Hello\r\n250-SIZE 52428800\r\n250-8BITMIME\r\n250-PIPELINING\r\n250 HELP\r\n')
          else if (verb === 'MAIL' || verb === 'RCPT') socket.write('250 Accepted\r\n')
          else if (verb === 'DATA') {
            s.inData = true
            socket.write('354 Enter message, ending with "." on a line by itself\r\n')
          } else if (verb === 'QUIT') {
            socket.write('221 closing connection\r\n')
            socket.end()
          } else socket.write('500 unrecognized command\r\n')
        }
      },
    },
  })
  return { port: server.port, sessions, stop: () => server.stop(true) }
}
