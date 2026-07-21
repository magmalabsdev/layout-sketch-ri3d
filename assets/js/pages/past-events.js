import { getJSON, el, failure } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

function featureCard(e) {
  return el('article', 'event-feature', [
    el('div', 'event-feature__head', [
      el('h2', 'event-feature__title', e.title),
      el('p', null, [
        el('span', 'sk-tag sk-tag--fluid', e.format),
        ' ',
        el('span', 'sk-tag', e.year),
      ]),
    ]),
    el('p', 'event-feature__summary', e.summary),
    e.outcomes?.length
      ? el('div', null, [
          el('p', 't-mono-caps t-dim', 'Outcomes'),
          el('ul', null, e.outcomes.map((o) => el('li', null, o))),
        ])
      : null,
  ], {
    'data-dim': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'w,h',
    'data-dim-side': 'w:top h:right',
    'data-dim-priority': '5',
    'data-dim-vw': '1024+',
  });
}

async function renderFeatured() {
  const host = document.getElementById('featured');
  const { featured } = await getJSON('data/past-events.json');
  if (!featured?.length) {
    host.replaceChildren(el('p', 'is-empty', 'No past events recorded yet.'));
    return;
  }
  host.replaceChildren(...featured.map(featureCard));
}

async function renderOrganized() {
  const host = document.getElementById('organized');
  const { organized } = await getJSON('data/past-events.json');

  if (!organized?.length) {
    host.replaceChildren(el('p', 'is-empty', 'Nothing listed yet.'));
    return;
  }

  host.replaceChildren(...organized.map((e) => el('article', 'event-row', [
    el('div', 'event-row__head', [
      el('h3', 'event-row__title', e.title),
      el('p', 'event-row__meta', `${e.organizer} · ${e.role} · ${e.year}`),
    ]),
    el('p', null, e.summary),
  ], {
    'data-dim-child': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'w,h',
    'data-dim-side': 'w:bottom h:left',
    'data-dim-priority': '3',
  })));
}

export async function render() {
  await Promise.all([
    renderChrome({ active: 'past-events.html' }),
    renderFeatured().catch(failure(
      document.getElementById('featured'), 'Past events unavailable')),
    renderOrganized().catch(failure(
      document.getElementById('organized'), 'Event list unavailable')),
  ]);
}
