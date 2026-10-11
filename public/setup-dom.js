// /setup's small DOM helpers. Text always goes in as textContent, never as HTML.
export const $ = (id) => document.getElementById(id)

// h('button', { className: 'primary', onclick }, 'child', node): `data` sets data-* attributes.
export function h(tag, props = {}, ...children) {
  const { data, ...rest } = props ?? {}
  const node = Object.assign(document.createElement(tag), rest)
  for (const [k, v] of Object.entries(data ?? {})) node.dataset[k] = v
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false && c !== ''))
  return node
}

export const option = (value, text, selected) => h('option', { value, textContent: text, selected })
