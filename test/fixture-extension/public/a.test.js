// A test file inside the fixture's public/ folder, so the core's tests can check it's never served.
import { expect, test } from 'bun:test'

test("the fixture's page leaves its release for the core to fill in", async () => {
  expect(await Bun.file(new URL('./index.html', import.meta.url)).text()).toContain('__VERSION__')
})
