// Reads an SSE response frame by frame: { id, event, data, retry } or { comment }.
export function readFrames(res) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  async function next() {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read()
      if (done) throw new Error('stream closed')
      buffer += value
    }
    const end = buffer.indexOf('\n\n')
    const frame = buffer.slice(0, end)
    buffer = buffer.slice(end + 2)
    if (frame.startsWith(':')) return { comment: frame.slice(1) }
    const fields = Object.fromEntries(
      frame.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trimStart()]),
    )
    return { id: fields.id, event: fields.event, data: JSON.parse(fields.data), retry: fields.retry }
  }

  // Resolves true once the server has closed the stream (anything still buffered is skipped).
  async function closed() {
    for (;;) {
      const { done } = await reader.read()
      if (done) return true
    }
  }

  return { next, closed, cancel: () => reader.cancel() }
}
