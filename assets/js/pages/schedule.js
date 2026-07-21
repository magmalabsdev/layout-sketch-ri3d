import { getJSON, el, failure } from '../lib/json.js';
import { renderChrome } from '../lib/chrome.js';

/**
 * One constant maps event time to pixels for the whole chart. The scale is
 * one minute to one pixel, so a block's height in px is literally its
 * duration in minutes and the axis is true to scale end to end.
 */
const MINUTE_PX = 1;
const HOUR_PX = 60 * MINUTE_PX;

/** Below this height a block only has room for its title. */
const COMPACT_PX = 58;

/** Below this height a phase band sets its label in tighter type to fit. */
const PHASE_TIGHT_PX = 150;

const hourLabel = (h) => `${h}h`;

function renderAxis(schedule) {
  const { event, phases } = schedule;
  const axis = el('div', 'gantt__axis');
  axis.style.height = `${event.durationHours * HOUR_PX}px`;

  const every = event.tickEvery ?? 12;
  for (let h = 0; h <= event.durationHours; h += every) {
    const tick = el('div', 'gantt__tick', hourLabel(h));
    tick.style.top = `${h * HOUR_PX}px`;
    axis.appendChild(tick);
  }

  // The main event phase is filled in on the side axis. Alternation is set
  // here rather than with :nth-child, since ticks share the same parent.
  phases.forEach((phase, i) => {
    const height = (phase.endHour - phase.startHour) * HOUR_PX;
    // The label runs along the band, so a short phase has little room for it.
    // The height is known arithmetically here, so the tighter type is applied
    // without measuring anything back out of the DOM.
    const tight = height < PHASE_TIGHT_PX;
    const band = el('div',
      `gantt__phase${i % 2 ? ' gantt__phase--alt' : ''}${tight ? ' gantt__phase--tight' : ''}`,
      el('span', null, phase.label),
      // Whatever the band's height, the full name stays reachable.
      { title: `${phase.label} · ${hourLabel(phase.startHour)} – ${hourLabel(phase.endHour)}` });
    band.style.top = `${phase.startHour * HOUR_PX}px`;
    band.style.height = `${height}px`;
    axis.appendChild(band);
  });
  return axis;
}

function renderLane(lane, blocks, workshops) {
  const col = el('div', 'gantt__lane');
  col.style.height = `${blocks.duration * HOUR_PX}px`;

  for (const b of blocks.items.filter((x) => x.lane === lane.id)) {
    const height = (b.endHour - b.startHour) * HOUR_PX;
    const known = b.workshopId && workshops.has(b.workshopId);
    const compact = height < COMPACT_PX;
    const node = el(
      known ? 'a' : 'div',
      `gantt__block${compact ? ' gantt__block--compact' : ''}`,
      [
        el('strong', null, b.title),
        // A short block has room for its title or its time span, not both.
        compact ? null : el('span', null,
          `${hourLabel(b.startHour)} – ${hourLabel(b.endHour)}`),
      ],
      {
        ...(known ? { href: `workshop.html?id=${encodeURIComponent(b.workshopId)}` } : null),
        title: `${b.title} · ${hourLabel(b.startHour)} – ${hourLabel(b.endHour)}`,
        // Every block's duration differs by design — that's the whole point
        // of a Gantt chart — so every block gets its own dimension, not a
        // shared representative. A block's height in px isn't itself a
        // meaningful quantity, only the duration it encodes is: dim-time-axis
        // makes the label read "18h" (duration), not "216" (pixels).
        'data-dim': true,
        'data-dim-mode': 'fixed',
        'data-dim-size': 'h',
        'data-dim-side': 'h:right',
        'data-dim-time-axis': 'h',
        'data-dim-unit': 'h',
        'data-dim-scale': String(1 / HOUR_PX),
        // The shortest blocks (3h = 36px) fall under the engine's default
        // 48px min-size, which would silently drop them.
        'data-dim-min': '20',
        'data-dim-priority': '3',
        'data-dim-vw': '1024+',
      },
    );
    node.style.top = `${b.startHour * HOUR_PX}px`;
    node.style.height = `${height}px`;
    col.appendChild(node);
  }
  return col;
}

async function renderGantt() {
  const host = document.getElementById('gantt');
  const [schedule, wsData] = await Promise.all([
    getJSON('data/schedule.json'),
    getJSON('data/workshops.json').catch(() => ({ workshops: [] })),
  ]);
  const workshops = new Map(wsData.workshops.map((w) => [w.id, w]));

  const heads = [el('div', 'gantt__head', 'Phase')];
  const cols = [renderAxis(schedule)];
  const blocks = { items: schedule.blocks, duration: schedule.event.durationHours };

  for (const lane of schedule.lanes) {
    heads.push(el('div', 'gantt__head', lane.label));
    cols.push(renderLane(lane, blocks, workshops));
  }
  host.replaceChildren(...heads, ...cols);
}

async function renderWorkshopList() {
  const host = document.getElementById('workshop-list');
  const { workshops } = await getJSON('data/workshops.json');

  host.replaceChildren(...workshops.map((w) => el('a', 'workshop-row', [
    el('span', 'workshop-row__title', w.title),
    el('span', 'workshop-row__meta',
      `${hourLabel(w.startHour)} · ${w.room} · ${w.level}`),
  ], {
    href: `workshop.html?id=${encodeURIComponent(w.id)}`,
    'data-dim-child': true,
    'data-dim-mode': 'fluid',
    'data-dim-size': 'w,h',
    'data-dim-side': 'w:top h:left',
    'data-dim-priority': '3',
  })));
}

export async function render() {
  await Promise.all([
    renderChrome({ active: 'schedule.html' }),
    renderGantt().catch(failure(
      document.getElementById('gantt'), 'Schedule unavailable')),
    renderWorkshopList().catch(failure(
      document.getElementById('workshop-list'), 'Workshops unavailable')),
  ]);
}
