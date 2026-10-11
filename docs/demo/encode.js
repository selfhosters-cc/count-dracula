// The README demo's encode (docs/demo/README.md): record.js's frames, held at a constant frame rate, into
// demo.webm (VP8, full size) and demo.gif (960 px wide, 10 fps, 128 colours).
//
//   FFMPEG=<an ffmpeg with libvpx and mjpeg> bun docs/demo/encode.js <frames dir> <out dir>
//
// Needs ImageMagick's `convert` for the GIF.
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const [frames, out] = process.argv.slice(2)
const ffmpeg = process.env.FFMPEG
if (!out || !ffmpeg) {
  console.error('Usage: FFMPEG=<ffmpeg> bun docs/demo/encode.js <frames dir> <out dir>')
  process.exit(2)
}
const shots = JSON.parse(readFileSync(join(frames, 'frames.json'), 'utf8'))
const DITHER = process.env.DITHER ?? '+dither' // or -dither FloydSteinberg
const START = 0.3 // the first frames are still the page settling into the screencast
const end = shots.at(-1).t

// The frame on screen at each tick: the latest one captured at or before it.
function sequence(fps) {
  const files = []
  let i = 0
  for (let t = START; t <= end; t += 1 / fps) {
    while (i + 1 < shots.length && shots[i + 1].t <= t) i++
    files.push(join(frames, shots[i].file))
  }
  return files
}

async function run(cmd, input) {
  const proc = Bun.spawn(cmd, { stdin: input ? 'pipe' : 'ignore', stdout: 'inherit', stderr: 'inherit' })
  if (input) {
    for (const file of input) {
      proc.stdin.write(readFileSync(file))
      await proc.stdin.flush()
    }
    await proc.stdin.end()
  }
  if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed`)
}

mkdirSync(out, { recursive: true })
const webm = join(out, 'demo.webm')
if (!process.env.GIF_ONLY) await run(
  [ffmpeg, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '25', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', '2M', '-crf', '12', '-quality', 'good', '-cpu-used', '0', '-auto-alt-ref', '0', webm],
  sequence(25),
)

const gifFrames = join(out, 'gif-frames')
rmSync(gifFrames, { recursive: true, force: true })
mkdirSync(gifFrames)
// ffmpeg scales (ImageMagick would hold every full-size frame at once); one palette for every frame, so the
// still parts of the board stay the same pixels from frame to frame and -layers Optimize can drop them.
await run(
  [ffmpeg, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '10', '-i', 'pipe:0',
    '-vf', 'scale=960:-2:flags=lanczos', '-f', 'image2', join(gifFrames, '%04d.png')],
  sequence(10),
)
const palette = join(gifFrames, 'palette.png')
const pngs = readdirSync(gifFrames).filter((f) => /^\d+\.png$/.test(f)).sort().map((f) => join(gifFrames, f))
await run(['convert', ...pngs.filter((_, i) => i % 6 === 0), '-append', '+dither', '-colors', '128', '-unique-colors', palette])
await run(['convert', '-delay', '10', '-loop', '0', ...pngs, ...DITHER.split(' '), '-remap', palette, '-fuzz', '1.5%', '-layers', 'Optimize', join(out, 'demo.gif')])
rmSync(gifFrames, { recursive: true })
console.log(`${webm} and demo.gif: ${(end - START).toFixed(1)} s`)
