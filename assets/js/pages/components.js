import { getJSON, el, failure } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

/**
 * Components carry two orthogonal classifications — scope (who it belongs to)
 * and type (what kind of thing it is). The page groups by scope then type,
 * and filters on both axes independently.
 */

let data = null;
const selected = { scope: null, type: null };

function quantityLabel(c) {
  if (c.scope === 'per-team') return '1 per team';
  if (c.scope === 'per-station') return '1 per station';
  return c.qty > 1 ? `×${c.qty}` : 'Event wide';
}

/** Which upgrade improves access to a component, keyed by its `upgrade` field. */
const UPGRADE_MARKS = {
  mechanical: 'M',
  electrical: 'E',
  software: 'S',
};

/**
 * Corner mark showing which upgrade boosts access to this component, drawn as
 * a CAD balloon callout. `"none"`, a missing field, or an unrecognised value
 * all render nothing rather than an empty circle.
 */
function upgradeMark(c) {
  const key = String(c.upgrade ?? 'none').toLowerCase();
  const letter = UPGRADE_MARKS[key];
  if (!letter) return null;

  const label = `Access upgraded by the ${key} upgrade`;
  return el('span', `component-card__upgrade component-card__upgrade--${key}`, [
    letter,
    // The letter alone is meaningless without the legend, so carry the full
    // wording for assistive tech and on hover.
    el('span', 'visually-hidden', ` — ${label}`),
  ], { title: label });
}

function card(c) {
  return el('li', 'component-card', [
    upgradeMark(c),
    el('p', 'component-card__name', c.name),
    el('p', 'component-card__qty', quantityLabel(c)),
    c.notes ? el('p', 'component-card__notes', c.notes) : null,
  ], {
    'data-dim-child': true, 'data-dim-mode': 'fluid', 'data-dim-size': 'w,h',
    // Dimensioned below the card: every type group is preceded by a heading,
    // and a top-side dimension would run straight through it.
    'data-dim-side': 'w:bottom h:left', 'data-dim-priority': '3',
  });
}

function renderChips(row, axis, options) {
  const chips = [
    el('button', 'chip', 'All', {
      type: 'button', 'aria-pressed': selected[axis] === null,
    }),
    ...options.map((o) => el('button', 'chip', o.label, {
      type: 'button', 'aria-pressed': selected[axis] === o.id,
    })),
  ];

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => {
      selected[axis] = i === 0 ? null : options[i - 1].id;
      renderAll();
    });
    // Chip width tracks its label, so these are never a uniform repeat —
    // the engine measures that itself and dimensions every chip on its own
    // rather than trying to describe them with a single pitch.
    Object.assign(chip.dataset, {
      dimChild: '', dimMode: 'fixed', dimSize: 'w,h', dimSide: 'w:bottom h:left',
      dimMin: '28', dimPriority: '4', dimVw: '1024+',
    });
  });

  // Chips live in their own wrapper so the row can place a sibling beside
  // them; the repeat-classification belongs on the wrapper, not the row.
  const wrap = el('div', 'filters__chips', chips, { 'data-dim-repeat': 'first' });
  row.replaceChildren(row.firstElementChild, wrap);
  return wrap;
}

const HOLE_PATTERN_COUNT = 3;

/**
 * A CAD material-sample plate filling the empty space beside the type chips.
 *
 * Its features are real elements, so the same engine that dimensions the rest
 * of the site measures them: each hole is located to its centre line from the
 * plate's datum edges, and the identical pattern holes collapse to one
 * dimensioned instance plus a pitch and an "Nx" count — the linear-pattern
 * convention, rather than three copies of the same numbers.
 */
function buildPlate() {
  const plate = el('div', 'filters__plate sk sk--fluid', null, {
    id: 'filters-plate',
    'aria-hidden': 'true',
    'data-dim': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'w,h',
    'data-dim-side': 'w:bottom h:right',
    'data-dim-radius': 'auto',
    'data-dim-priority': '2',
    'data-dim-vw': '1024+',
  });

  // Datum hole: fully located from both plate edges, establishing the origin
  // the rest of the drawing reads against.
  plate.appendChild(el('div', 'plate__hole plate__hole--lg', null, {
    'data-dim': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'none',
    'data-dim-radius': 'auto',
    'data-dim-dots': 'tangents',
    'data-dim-anchor': 'center',
    'data-dim-datum': '#filters-plate',
    'data-dim-from': 'left:#filters-plate:left; top:#filters-plate:top',
    'data-dim-min': '12',
    'data-dim-priority': '2',
    'data-dim-vw': '1024+',
  }));

  const holes = Array.from({ length: HOLE_PATTERN_COUNT }, () =>
    el('div', 'plate__hole', null, {
      'data-dim-child': true,
      'data-dim-mode': 'fluid',
      'data-dim-size': 'none',
      'data-dim-radius': 'auto',
      'data-dim-dots': 'tangents',
      'data-dim-anchor': 'center',
      'data-dim-datum': '#filters-plate',
      'data-dim-from': 'left:#filters-plate:left',
      'data-dim-min': '12',
      'data-dim-priority': '2',
      'data-dim-vw': '1024+',
    }));

  plate.appendChild(el('div', 'plate__pattern', holes, {
    'data-dim-repeat': 'first',
  }));

  return plate;
}


function renderGroups() {
  const host = document.getElementById('components');
  const scopes = data.scopes.filter((s) => !selected.scope || s.id === selected.scope);
  const groups = [];
  // Every card on this page is the same size, so exactly one carries the
  // dimensions. Repeating them per type group is just eight copies of 282x144.
  let annotated = false;

  for (const scope of scopes) {
    const inScope = data.components.filter((c) =>
      c.scope === scope.id && (!selected.type || c.type === selected.type));
    if (!inScope.length) continue;

    const typeBlocks = data.types
      .filter((t) => !selected.type || t.id === selected.type)
      .map((type) => {
        const items = inScope.filter((c) => c.type === type.id);
        if (!items.length) return null;
        const grid = el('ul', 'component-grid', items.map(card),
          annotated ? null : { 'data-dim-repeat': 'first' });
        annotated = true;
        return el('div', 'type-group', [
          el('h3', 'type-group__title', type.label),
          grid,
        ]);
      })
      .filter(Boolean);

    groups.push(el('section', 'scope-group', [
      el('div', 'scope-group__head', [
        el('h2', 'scope-group__title', scope.label),
        el('p', 't-sm t-dim', `${scope.note} · ${inScope.length} listed`),
      ]),
      ...typeBlocks,
    ]));
  }

  host.replaceChildren(...(groups.length
    ? groups
    : [el('p', 'is-empty', 'Nothing matches those filters.')]));
}

/** Built from the same map the marks are, so the key can't drift from them. */
function renderUpgradeLegend() {
  const host = document.querySelector('[data-upgrade-legend]');
  if (!host) return;
  host.replaceChildren(...Object.entries(UPGRADE_MARKS).map(([key, letter]) =>
    el('li', null, [
      el('span', 'upgrade-legend__mark', letter),
      `Improved by the ${key} upgrade`,
    ])));
}

function renderAll() {
  renderChips(document.querySelector('[data-filter-row="scope"]'), 'scope', data.scopes);
  const typeRow = document.querySelector('[data-filter-row="type"]');
  renderChips(typeRow, 'type', data.types);
  typeRow.appendChild(buildPlate());
  renderGroups();
  // Filtering replaces the whole grid, so annotations must re-scan.
  window.Sketch?.rescan();
}

async function renderComponents() {
  data = await getJSON('data/components.json');
  renderUpgradeLegend();
  renderAll();
}

export async function render() {
  await Promise.all([
    renderChrome({ active: 'components.html' }),
    renderComponents().catch(failure(
      document.getElementById('components'), 'Components unavailable')),
  ]);
}
