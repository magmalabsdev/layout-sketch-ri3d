import { getJSON, el, failure } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

const hourLabel = (h) => `${h}h`;

function definition(term, value) {
  return el('div', null, [el('dt', null, term), el('dd', null, value)]);
}

function list(title, items) {
  if (!items?.length) return null;
  return el('section', null, [
    el('h2', null, title),
    el('ul', null, items.map((i) => el('li', null, i))),
  ]);
}

function notFound(id) {
  return el('div', 'sk-message', [
    el('h3', null, 'Workshop not found'),
    el('p', null, id
      ? `No workshop matches the id "${id}". It may have been renamed or removed.`
      : 'No workshop id was given. Pick one from the schedule page.'),
    el('p', null, el('a', null, 'Back to all workshops', { href: 'schedule.html' })),
  ]);
}

async function renderWorkshop() {
  const host = document.getElementById('workshop-root');
  const id = new URLSearchParams(location.search).get('id');
  const { workshops } = await getJSON('data/workshops.json');
  const w = workshops.find((x) => x.id === id);

  if (!w) {
    host.replaceChildren(notFound(id));
    return;
  }

  document.title = `${w.title} — Layout Sketch 1`;

  host.replaceChildren(el('div', 'workshop-detail', [
    el('div', null, [
      el('h1', 't-xl', w.title),
      el('p', null, w.description),
    ]),
    el('dl', 'workshop-detail__meta', [
      definition('Host', w.host),
      definition('When', `${hourLabel(w.startHour)} – ${hourLabel(w.endHour)}`),
      definition('Room', w.room),
      definition('Level', w.level),
    ], {
      'data-dim': true,
      'data-dim-mode': 'fluid',
      'data-dim-size': 'w,h',
      'data-dim-side': 'w:bottom h:right',
      'data-dim-priority': '5',
      'data-dim-vw': '1024+',
    }),
    list('Prerequisites', w.prereqs),
    list('Materials provided', w.materials),
  ]));
}

export async function render() {
  await Promise.all([
    renderChrome({ active: 'schedule.html' }),
    renderWorkshop().catch(failure(
      document.getElementById('workshop-root'), 'Workshop unavailable')),
  ]);
}
