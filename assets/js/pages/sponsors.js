import { getJSON, el, failure, fromTemplate, fill, linkOrDrop } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

const money = (n) => `$${n.toLocaleString()}`;

async function renderIntro() {
  const host = document.getElementById('prospectus-intro');
  const { intro } = await getJSON('data/prospectus.json');
  host.textContent = intro;
}

async function renderWhy() {
  const host = document.getElementById('why-list');
  const { why } = await getJSON('data/prospectus.json');
  host.replaceChildren(...why.map((reason) => el('li', null, reason)));
}

async function renderStats() {
  const host = document.getElementById('stats-list');
  const { stats } = await getJSON('data/prospectus.json');
  host.replaceChildren(...stats.map((s) =>
    el('div', null, [el('dt', null, s.label), el('dd', null, s.value)])));
}

function tierHeadCell(t) {
  return el('th', 'tier-head', [
    el('span', 'tier-head__name', t.label),
    el('span', 'tier-head__price', money(t.price)),
  ], {
    scope: 'col',
    // Uniform-size repeat: collapses to one dimensioned cell, the column
    // pitch, and a "4x" count leader — the same treatment as the filter
    // chips and team cards, not four stacked copies of the same numbers.
    'data-dim-child': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'w,h',
    'data-dim-side': 'w:top h:left',
    'data-dim-priority': '3',
    'data-dim-vw': '1024+',
  });
}

/**
 * A benefit's value per tier is either a boolean ("true"/"false", rendered as
 * a checkbox) or free text (e.g. "mention", "keynote"), rendered as a label
 * instead — a checkmark can't say which of two included tiers gets more.
 */
function benefitCell(tier, raw) {
  const value = String(raw ?? 'false').trim().toLowerCase();

  if (value === 'true' || value === 'false') {
    const included = value === 'true';
    return el('td', included ? 'is-included' : null, [
      el('span', `benefit-table__check${included ? ' is-included' : ''}`, null, { 'aria-hidden': 'true' }),
      // The checkbox glyph is decorative; this is what a screen reader gets.
      el('span', 'visually-hidden', `${tier.label}: ${included ? 'included' : 'not included'}`),
    ]);
  }

  return el('td', 'has-value', el('span', 'benefit-table__value', raw));
}

async function renderTiers() {
  const host = document.getElementById('benefit-table');
  const { tiers, benefits } = await getJSON('data/prospectus.json');

  const headRow = el('tr', null, [
    // No data-dim-child, so the repeat classification skips it — only the
    // four tier cells compete for the pattern, same as the filter chips'
    // label span being excluded from their row.
    el('th', 'benefit-table__corner', null, { scope: 'col' }),
    ...tiers.map(tierHeadCell),
  ]);
  headRow.dataset.dimRepeat = 'first';

  const rows = benefits.map((b) => el('tr', null, [
    el('th', 'benefit-table__label', b.benefit, { scope: 'row' }),
    ...tiers.map((t) => benefitCell(t, b[t.id])),
  ]));

  host.replaceChildren(el('thead', null, headRow), el('tbody', null, rows));
}

async function renderTeam() {
  const grid = document.getElementById('sponsor-team-grid');
  const { team } = await getJSON('data/team.json');

  grid.replaceChildren(...team.map((m) => {
    const card = fromTemplate('tpl-team-card');
    fill(card, {
      name: m.name,
      role: m.role,
      program: m.teamNumber ? `${m.program} ${m.teamNumber}` : m.program,
    });
    linkOrDrop(card, 'linkedin', m.linkedin, 'LinkedIn');
    linkOrDrop(card, 'github', m.github, 'GitHub');
    return card;
  }));
}

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

async function renderTrackRecord() {
  const host = document.getElementById('sponsor-featured');
  const { featured } = await getJSON('data/past-events.json');
  if (!featured?.length) {
    host.replaceChildren(el('p', 'is-empty', 'No past events recorded yet.'));
    return;
  }
  host.replaceChildren(...featured.map(featureCard));
}

async function renderOrganized() {
  const host = document.getElementById('sponsor-organized');
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

async function renderContact() {
  const host = document.getElementById('sponsor-contact');
  const { contact } = await getJSON('data/prospectus.json');

  host.replaceChildren(
    el('p', null, contact.note),
    el('dl', 'hero__meta hero__meta--flush', [
      el('div', null, [el('dt', null, 'Contact'), el('dd', null, contact.name)]),
      el('div', null, [el('dt', null, 'Deadline'), el('dd', null, contact.deadline)]),
    ]),
    el('a', 'sk-btn sk-btn--primary', 'Email us', {
      href: `mailto:${contact.email}`,
      id: 'btn-sponsor-contact',
      'data-dim': true,
      'data-dim-mode': 'fixed',
      'data-dim-priority': '4',
    }),
  );
}

export async function render() {
  await Promise.all([
    renderChrome(),
    renderIntro().catch(failure(
      document.getElementById('prospectus-intro'), 'Intro unavailable')),
    renderWhy().catch(failure(
      document.getElementById('why-list'), 'Unavailable')),
    renderStats().catch(failure(
      document.getElementById('stats-list'), 'Unavailable')),
    renderTiers().catch(failure(
      document.getElementById('benefit-table'), 'Tiers unavailable')),
    renderTeam().catch(failure(
      document.getElementById('sponsor-team-grid'), 'Team unavailable')),
    renderTrackRecord().catch(failure(
      document.getElementById('sponsor-featured'), 'Past events unavailable')),
    renderOrganized().catch(failure(
      document.getElementById('sponsor-organized'), 'Event list unavailable')),
    renderContact().catch(failure(
      document.getElementById('sponsor-contact'), 'Contact unavailable')),
  ]);
}
