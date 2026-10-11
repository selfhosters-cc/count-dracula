// Loaded before every test file (bunfig.toml). Each test starts its own server on a random port, and the
// OS can hand a stopped server's port to the next one: a pooled keep-alive connection to the old server
// then hangs the next test's first request. So test requests never reuse a connection.
const fetchWithPool = globalThis.fetch
globalThis.fetch = (input, init = {}) => fetchWithPool(input, { keepalive: false, ...init })
