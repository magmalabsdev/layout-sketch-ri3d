/** WRITE PHASE ONLY. Nothing here reads geometry back out of the DOM. */

const NS = 'http://www.w3.org/2000/svg';
const pool = new Map();

export function createLayers(root = document.body) {
  const layers = {};
  for (const space of ['doc', 'fixed']) {
    let svg = document.querySelector(`svg[data-sketch-layer="${space}"]`);
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('data-sketch-layer', space);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      root.appendChild(svg);
    }
    layers[space] = svg;
  }
  return layers;
}

export function sizeLayers(layers, vp) {
  // The doc layer is sized to the whole document so it scrolls with the page,
  // which makes scrolling free for everything on it.
  layers.doc.setAttribute('width', vp.docW);
  layers.doc.setAttribute('height', vp.docH);
}

const el = (name, cls) => {
  const node = document.createElementNS(NS, name);
  if (cls) node.setAttribute('class', cls);
  return node;
};

function buildNode(item) {
  const g = el('g', 'sk-g');
  const { kind } = item.prim;

  if (kind === 'linear') {
    g.append(el('path', 'sk-ext'), el('path', 'sk-ext'), el('path', 'sk-dimline'),
      el('path', 'sk-arrow'), el('path', 'sk-arrow'), el('text', 'sk-label'));
  } else if (kind === 'leader') {
    g.append(el('path', 'sk-leader'), el('path', 'sk-arrow'), el('text', 'sk-label'));
  } else if (kind === 'outline') {
    g.append(el('rect', 'sk-outline'));
  }
  return g;
}

function setLabel(node, label) {
  if (!label || label.hidden) {
    node.style.display = 'none';
    return;
  }
  node.style.display = '';
  node.setAttribute('x', label.x);
  node.setAttribute('y', label.y);
  node.setAttribute('text-anchor', label.anchor);
  node.setAttribute('transform',
    label.rot ? `rotate(${label.rot} ${label.cx} ${label.cy})` : '');
  if (node.textContent !== label.text) node.textContent = label.text;
}

function updateNode(g, item) {
  const p = item.prim;
  g.setAttribute('class', item.fluid ? 'sk-g sk-g--fluid' : 'sk-g');

  if (p.kind === 'linear') {
    const [e1, e2, line, a1, a2, text] = g.children;
    e1.setAttribute('d', p.ext[0]);
    e2.setAttribute('d', p.ext[1]);
    line.setAttribute('d', p.line);
    a1.setAttribute('d', p.arrows[0]);
    a2.setAttribute('d', p.arrows[1]);
    setLabel(text, p.label);
    return;
  }

  if (p.kind === 'leader') {
    const [leader, arrow, text] = g.children;
    leader.setAttribute('d', p.leader);
    arrow.setAttribute('d', p.arrow);
    setLabel(text, p.label);
    return;
  }

  if (p.kind === 'outline') {
    const rect = g.children[0];
    rect.setAttribute('x', p.x);
    rect.setAttribute('y', p.y);
    rect.setAttribute('width', p.w);
    rect.setAttribute('height', p.h);
    rect.setAttribute('rx', p.r);
    return;
  }

  if (p.kind === 'dots') {
    // Dot count changes with the corner radii, so reconcile length first.
    while (g.children.length > p.points.length) g.lastChild.remove();
    while (g.children.length < p.points.length) {
      const c = el('circle', 'sk-dot');
      c.setAttribute('r', 3);
      g.appendChild(c);
    }
    p.points.forEach(([x, y], i) => {
      const c = g.children[i];
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
    });
  }
}

/**
 * Reuses keyed nodes rather than rebuilding innerHTML, which keeps CSS
 * transitions alive and avoids per-frame GC churn during a resize drag.
 */
export function paint(layers, plan) {
  const seen = new Set();

  for (const item of plan.prims) {
    seen.add(item.key);
    let g = pool.get(item.key);
    if (!g) {
      g = buildNode(item);
      pool.set(item.key, g);
      layers[item.space === 'fixed' ? 'fixed' : 'doc'].appendChild(g);
    }
    updateNode(g, item);
  }

  for (const [key, g] of pool) {
    if (!seen.has(key)) {
      g.remove();
      pool.delete(key);
    }
  }
}

export function clear() {
  for (const [, g] of pool) g.remove();
  pool.clear();
}
