import { getJSON, el } from './json.js';

/** Shared nav + footer, rendered from data/site.json on every page. */

export async function renderChrome({ active } = {}) {
  const data = await getJSON('data/site.json').catch(() => null);
  if (!data) return null;

  const nav = document.querySelector('[data-nav]');
  if (nav) {
    nav.replaceChildren(...data.nav.map((item) => {
      const a = el('a', 'site-nav__link', item.label, { href: item.href });
      if (item.href === active) {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'page');
      }
      return a;
    }));
  }

  const socials = document.querySelector('[data-socials]');
  if (socials) {
    socials.replaceChildren(...data.socials.map((s) =>
      el('li', null, el('a', 'site-footer__link', s.label, {
        href: s.href,
        rel: 'noopener',
        target: s.href.startsWith('mailto:') ? null : '_blank',
      }))));
  }

  for (const node of document.querySelectorAll('[data-site-name]')) {
    node.textContent = data.site.name;
  }
  for (const node of document.querySelectorAll('[data-year]')) {
    node.textContent = new Date().getFullYear();
  }

  return data;
}
