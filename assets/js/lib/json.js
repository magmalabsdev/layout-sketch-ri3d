/** Shared data layer: fetch once per path, render a visible failure state. */

const cache = new Map();

export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path, { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(`${path} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path);
}

/** A section that fails to load says so, rather than rendering as blank. */
export function renderMessage(host, title, detail) {
  if (!host) return;
  host.replaceChildren(el('div', 'sk-message', [
    el('h3', null, title),
    el('p', null, detail),
  ]));
}

export function failure(host, title) {
  return (err) => {
    console.error(err);
    renderMessage(host, title,
      `${err.message}. If you opened this file directly, serve the folder over HTTP instead — fetch() is blocked on file:// URLs.`);
  };
}

/**
 * Tiny element helper. `children` accepts a string, a node, or an array.
 */
export function el(tag, className, children, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  if (children != null) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c == null || c === false) continue;
      node.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
    }
  }
  return node;
}

/** Clones a <template> and returns its first element child. */
export function fromTemplate(id) {
  const tpl = document.getElementById(id);
  if (!tpl) throw new Error(`missing template #${id}`);
  return tpl.content.firstElementChild.cloneNode(true);
}

export function fill(root, map) {
  for (const [slot, value] of Object.entries(map)) {
    const node = root.querySelector(`[data-slot="${slot}"]`);
    if (!node) continue;
    if (value == null || value === '') node.remove();
    else if (value instanceof Node) node.replaceChildren(value);
    else node.textContent = value;
  }
  return root;
}

/** Links that are absent in the data shouldn't render as dead anchors. */
export function linkOrDrop(root, slot, href, label) {
  const node = root.querySelector(`[data-slot="${slot}"]`);
  if (!node) return;
  if (!href) { node.remove(); return; }
  node.href = href;
  node.textContent = label;
  node.rel = 'noopener';
  node.target = '_blank';
}
