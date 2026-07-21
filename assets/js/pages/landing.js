import { getJSON, el, failure, fromTemplate, fill, linkOrDrop } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

async function renderSponsors() {
  const track = document.querySelector('[data-marquee-track]');
  if (!track) return;
  const { sponsors } = await getJSON('data/sponsors.json');

  const item = (s) => el('a', 'marquee__item', s.name, {
    href: s.url, rel: 'noopener', target: '_blank',
  });
  // The track is duplicated so translateX(-50%) loops seamlessly. The copy is
  // hidden from assistive tech to avoid announcing every sponsor twice.
  const first = sponsors.map(item);
  const second = sponsors.map((s) => {
    const node = item(s);
    node.setAttribute('aria-hidden', 'true');
    node.tabIndex = -1;
    return node;
  });
  track.replaceChildren(...first, ...second);
}

async function renderTeam() {
  const grid = document.getElementById('team-grid');
  const { team } = await getJSON('data/team.json');

  const cards = team.map((m) => {
    const card = fromTemplate('tpl-team-card');
    fill(card, {
      name: m.name,
      role: m.role,
      program: m.teamNumber ? `${m.program} ${m.teamNumber}` : m.program,
    });
    linkOrDrop(card, 'linkedin', m.linkedin, 'LinkedIn');
    linkOrDrop(card, 'github', m.github, 'GitHub');
    return card;
  });
  grid.replaceChildren(...cards);
  // The repeat container (data-dim-repeat="first" on #team-grid, in
  // index.html) picks the top-left card, dimensions it, and — since the
  // cards are all the same size — adds the grid pitch and a count leader
  // automatically. No per-page wiring needed here.
}

async function renderFaq() {
  const host = document.getElementById('faq-list');
  const { faq } = await getJSON('data/faq.json');

  host.replaceChildren(...faq.map((entry) => {
    const item = el('details', 'faq-item', [
      el('summary', 'faq-item__q', entry.q),
      el('p', 'faq-item__a', entry.a),
    ], {
      'data-dim-child': true,
      'data-dim-mode': 'fluid',
      'data-dim-size': 'h',
      'data-dim-side': 'h:right',
      'data-dim-radius': 'none',
      'data-dim-dots': 'none',
      'data-dim-priority': '3',
    });
    // The box changes height on toggle, so its annotations must re-measure.
    item.addEventListener('toggle', () => window.Sketch?.refresh());
    return item;
  }));
}

export async function render() {
  await Promise.all([
    renderChrome({ active: 'index.html' }),
    renderSponsors().catch(failure(
      document.querySelector('[data-marquee-track]'), 'Sponsors unavailable')),
    renderTeam().catch(failure(
      document.getElementById('team-grid'), 'Team unavailable')),
    renderFaq().catch(failure(
      document.getElementById('faq-list'), 'FAQ unavailable')),
  ]);
}
