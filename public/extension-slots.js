// Page slots (v2.2 §8): what /extensions.js, which the server writes from the loaded Extensions, hands the core's
// pages. Each Extension's public/slots.js names its slot functions as named exports ('setup.nightTools', 'home', …);
// a page calls slot(name, ctx) where the slot sits, as it renders, and puts in the nodes that come back. An
// Extension can't break a core page: a slots.js that fails to load fills nothing, and a slot function that throws
// is logged and gives nothing.
export async function loadSlots(urls, load = (url) => import(url)) {
  const modules = await Promise.all(
    urls.map((url) =>
      load(url).catch((err) => {
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
