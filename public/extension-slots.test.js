import { describe, expect, spyOn, test } from 'bun:test'
import { loadSlots } from './extension-slots.js'

// Each Extension's slots.js, as import() would hand it back: its named exports are slot functions (v2.2 §8).
const modules = (byUrl) => (url) => (url in byUrl ? Promise.resolve(byUrl[url]) : Promise.reject(new TypeError(`Failed to fetch ${url}`)))
const quiet = () => spyOn(console, 'error').mockImplementation(() => {})

describe('page slots (v2.2 §8)', () => {
  test('with no Extension, every slot is empty', async () => {
    const slot = await loadSlots([], modules({}))

    expect(slot('home', { signedIn: false, place: 'line' })).toEqual([])
    expect(slot('setup.nightTools', {})).toEqual([])
  })

  test("a slot gives what the Extension's function gives for that ctx, as a list, each Extension's in order", async () => {
    const slot = await loadSlots(['/a/slots.js', '/b/slots.js'], modules({
      '/a/slots.js': { home: (ctx) => `a ${ctx.place}`, 'operator.site': () => ['a1', 'a2'] },
      '/b/slots.js': { home: (ctx) => (ctx.place === 'footer' ? 'b footer' : null) },
    }))

    expect(slot('home', { place: 'line' })).toEqual(['a line'])
    expect(slot('home', { place: 'footer' })).toEqual(['a footer', 'b footer'])
    expect(slot('operator.site', {})).toEqual(['a1', 'a2'])
    expect(slot('summary.closing', { eventId: 1 })).toEqual([])
  })

  test('a slot function that throws is logged and gives nothing; the others still fill it', async () => {
    const errors = quiet()
    const slot = await loadSlots(['/a/slots.js', '/b/slots.js'], modules({
      '/a/slots.js': { home: () => { throw new Error('a broke') } },
      '/b/slots.js': { home: () => 'b' },
    }))

    expect(slot('home', { place: 'line' })).toEqual(['b'])
    expect(errors).toHaveBeenCalled()
    expect(String(errors.mock.calls[0])).toContain('a broke')
    errors.mockRestore()
  })

  test("a slots.js that fails to load leaves its slots empty, and the page's slot still answers", async () => {
    const errors = quiet()
    const slot = await loadSlots(['/gone/slots.js', '/b/slots.js'], modules({ '/b/slots.js': { home: () => 'b' } }))

    expect(slot('home', { place: 'line' })).toEqual(['b'])
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  test("a slots.js whose import never settles is let go after the wait, like one that failed: the page still renders", async () => {
    const errors = quiet()
    const hangs = { '/hangs/slots.js': new Promise(() => {}) }
    const load = (url) => hangs[url] ?? modules({ '/b/slots.js': { home: () => 'b' } })(url)

    const slot = await loadSlots(['/hangs/slots.js', '/b/slots.js'], load, 20)

    expect(slot('home', { place: 'line' })).toEqual(['b'])
    expect(String(errors.mock.calls[0])).toContain('/hangs/slots.js')
    errors.mockRestore()
  })

  test('an export that is not a function is no slot', async () => {
    const slot = await loadSlots(['/a/slots.js'], modules({ '/a/slots.js': { home: 'not a function', default: () => 'x' } }))

    expect(slot('home', {})).toEqual([])
  })
})
