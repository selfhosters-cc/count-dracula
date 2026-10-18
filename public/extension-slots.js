// Page slots (v2.2 §8): what /extensions.js, which the server writes from the loaded Extensions, hands the core's
// pages. Each Extension's public/slots.js names its slot functions as named exports ('setup.nightTools', 'home', …);
// a page calls slot(name, ctx) where the slot sits, as it renders, and puts in the nodes that come back. An
// Extension can't break a core page: a slots.js that fails to load, or hasn't loaded within waitMs (the pages wait
// on /extensions.js before they render), fills nothing, and a slot function that throws is logged and gives nothing.
const WAIT_MS = 3_000

export async function loadSlots(urls, load = (url) => import(url), waitMs = WAIT_MS) {
  const modules = await Promise.all(
    urls.map((url) =>
      withinWait(load(url), waitMs).catch((err) => {
        console.error(`Extension slots at ${url} didn't load:`, err)
        return {}
      })),
  )
  return function slot(name, ctx) {
    return modules.flatMap((module) => {
      if (typeof module[name] !== 'function') return []
      try {
        return [module[name](ctx)].flat().filter((node) => node != null)
      } catch (err) {
        console.error(`Extension slot ${name} failed:`, err)
        return []
      }
    })
  }
}

// The promise's own outcome, or a rejection once waitMs has gone by without one.
function withinWait(promise, waitMs) {
  let timer
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`not loaded within ${waitMs} ms`)), waitMs)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}
