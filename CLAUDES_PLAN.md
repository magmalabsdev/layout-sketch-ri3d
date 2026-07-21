# Layout Sketch 1 — Hackathon Site

## Context

`layout-sketch-ri3d` is an empty repo (a LICENSE and `Layout Sketch Logo.png`). We're building the public site for **Layout Sketch 1**, a 120-hour Ri3D + FRC competition hackathon.

The defining constraint is the visual identity: the site must read as an **engineering CAD sketch**. The logo establishes the exact drawing conventions to reproduce — gray `#D0D0D0` fills, 2px black outlines, extension lines that start with a small gap off the shape and overshoot the dimension line, double-headed arrows with a pixel label (horizontal labels centered above the line, vertical labels rotated −90° like the logo's `320`), radius leaders with a **single arrowhead on the arc** and the label at the tail (`R64`, `R32`), and small control dots at **both fillet tangent points and box corners** — a filleted corner gets its two tangent dots *and* the sharp corners get theirs.

Per `.claude/CLAUDE.md`, *every* button, image, and non-text design element carries these annotations: width, height, corner radius, and position relative to viewport walls or neighbouring elements. The two-color rule is load-bearing: **fixed** geometry is drawn black `#000000`; elements whose size or position **changes with the viewport** are drawn "undefined blue" `#736CFF`. Blue values must be *measured live* — resizing the window visibly updates them. That makes annotation a runtime system, not decoration, and it is the bulk of the work here.

Content that changes (team, schedule, components, past events) is JSON-serialized and rendered client-side, following `magmalabsdev/magmalabs.dev`: pure HTML/CSS/JS, no framework or build step, `fetch()` + promise-singleton cache + programmatic DOM construction + a friendly error card on failure.

**Decisions confirmed with the user:**
- Vertical Gantt = time down the left axis, three parallel lane columns.
- Workshops = one `workshop.html` template driven by `?id=`.
- JSON seeded with **minimal stub data** (1–2 entries per file).
- Repeated grid items get **one representative annotation set + gap + container**, per CAD practice — not 12 identical stacked sets.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `--sk-bg` | `#E3FDFF` | page background |
| `--sk-fill` | `#D0D0D0` | button / shape fill |
| `--sk-ink` | `#000000` | outlines + **fixed** dimensions |
| `--sk-fluid` | `#736CFF` | **responsive** elements + their dimensions; page frame |
| `--sk-warn` | `#E20000` | deadlines, not-found states, errors |

Font: **Space Mono** 400/700, self-hosted woff2 (`assets/fonts/`) so metrics are stable and there's no third-party request.

## File layout

```
index.html  schedule.html  workshop.html  past-events.html  components.html  404.html
assets/css/  tokens.css  base.css  sketch.css  pages.css  print.css
assets/js/sketch/  config.js schema.js registry.js measure.js layout.js
                   primitives.js render.js index.js
assets/js/lib/json.js          fetch + cache + error card
assets/js/pages/  landing.js schedule.js workshop.js past-events.js components.js
data/  site.json sponsors.json team.json faq.json schedule.json
       workshops.json past-events.json components.json
```

Flat page files (not `dir/index.html`) — simpler, and `workshop.html?id=` is already flat.

## The annotation engine (`assets/js/sketch/`)

### Overlay layers

Two SVG layers, `pointer-events:none`, `aria-hidden="true"`, `user-select:none`:

- **`doc`** — `position:absolute`, sized to `scrollWidth/scrollHeight`, no `viewBox` (1:1 user units). Coordinates are `rect + scrollX/scrollY`. The browser scrolls it with the page, so **scrolling costs zero repaints** for ~95% of elements.
- **`fixed`** — `position:fixed; inset:0`, raw `getBoundingClientRect()` coordinates, repainted on scroll. Holds only `position:fixed`/`sticky` elements. Sticky belongs here unconditionally: `getBoundingClientRect` reports current visual position, which is correct in both stuck and unstuck states.

Routing is automatic (walk ancestors for `fixed`/`sticky`), overridable with `data-dim-space`.

### Authoring API

Deliberately small — ~10 attributes, not a general-purpose CAD language:

```html
<a class="sk sk--fluid" href="#register"
   data-dim                              <!-- opt in -->
   data-dim-id="btn-register"            <!-- stable key, and a target for `from` -->
   data-dim-mode="fluid"                 <!-- fluid|fixed — REQUIRED, no auto-detection -->
   data-dim-size="w,h"                   <!-- w | h | w,h | none -->
   data-dim-side="w:bottom h:right"      <!-- which edge each extent sits on -->
   data-dim-radius="auto"                <!-- auto = one callout per distinct radius value -->
   data-dim-from="left:page; top:#hero-title"   <!-- side:target; target = page|viewport|#id -->
   data-dim-repeat="first"               <!-- on a container: annotate first child + gap only -->
   data-dim-vw="768+"                    <!-- viewport range in which to render -->
   data-dim-priority="4">REGISTER</a>
```

**`data-dim-mode` is explicit, never inferred.** There is no API for "does this depend on the viewport" — `getComputedStyle` returns used values in px, and `getMatchedCSSRules` is gone. Heuristics here would be wrong in both directions, and the fixed/fluid distinction is exactly what the brief cares about. The author knows; the author declares.

### Frame pipeline

`invalidate(reason) → rAF coalesce → read → plan → paint`, strictly phase-separated so there is no layout thrash:

1. **Read** — batch all `getBoundingClientRect()` and `getComputedStyle()` into plain measurement records. Radii and border widths are cached per element on an `epoch` counter that bumps on mutation/resize but **never on scroll** (`getComputedStyle` is the expensive read).
2. **Plan** — pure functions, zero DOM access: `spec + measurement → DrawPlan` of primitives.
3. **Paint** — one write pass into a **keyed SVG node pool** (`${specId}:${kind}:${axis}`), updating attributes rather than rebuilding `innerHTML`. Keeps CSS transitions alive so blue numbers can ease during a resize.

Triggers: `ResizeObserver` on `documentElement`, `MutationObserver` on body, capture-phase `scroll` (capture because nested `overflow:auto` scroll doesn't bubble), `resize`, `visualViewport` resize+scroll (iOS toolbar), `document.fonts` `loadingdone`, and one-shot `load` on every annotated `<img>`.

### Correctness details that are easy to get wrong

- **CSS radius overlap scaling.** When adjacent radii exceed an edge length, browsers scale *all* radii by a common factor `f = min(1, w/(tl+tr), w/(bl+br), h/(tl+bl), h/(tr+br))`. The computed value is not the rendered value — without this, a pill button labeled `R64` points at a corner that renders as R40. Implement per CSS Backgrounds 3 §5.5, and resolve `%` radii against the box.
- **Border-stroke alignment.** CSS borders draw *inside* the border box; SVG strokes straddle their path. Inset dots and overlay-drawn outlines by `borderWidth/2` or every dot sits a pixel outside its outline.
- **Sub-pixel hysteresis.** Rects return `159.99999999999997`. Rounding naively makes labels flicker between 159/160 during a resize drag — only change the displayed integer when it differs from the last shown value by >0.5.
- **`documentElement.clientWidth`, never `innerWidth`** — the latter includes the scrollbar, making every distance-to-right-wall wrong. Set `scrollbar-gutter: stable` so a scrollbar appearing mid-session doesn't reflow every dimension at once.
- **MutationObserver self-trigger.** The overlay writes into the DOM the observer watches. The `closest('[data-sketch-layer]')` guard is mandatory, not defensive.
- **Label widths without a DOM read.** Space Mono is monospace: calibrate the advance ratio once at boot via an offscreen canvas (triggers no layout) after `document.fonts.ready`, then all label widths are arithmetic.
- **No transform-based hover states on annotated elements** — `getBoundingClientRect` is post-transform, so a `scale(1.02)` hover makes the numbers dance.
- Avoid `content-visibility:auto` on annotated ancestors (zeroes descendant rects).

### Legibility

Cheapest stages first:

1. **Eligibility** — drop below `minSizePx` (48), radius below 6px, outside `data-dim-vw`, zero-rect or hidden.
2. **Repeat collapse** — `data-dim-repeat="first"` on a container annotates the first child, the grid gap, and the container itself. This is the user-confirmed approach and also standard CAD.
3. **Lane allocation** — per side, greedy interval coloring; lane *n* sits at `baseGap + n·laneStep` outward. Sort short spans to inner lanes so overall dimensions push outward (matching the logo, where `320` sits furthest left).
4. **Label de-overlap** — a few iterations of axial separation: labels slide only *along their own dimension line* (CAD-legal), then fall back to outside-the-arrowhead placement with a leader tick, then suppress by ascending `data-dim-priority`. n is small enough that O(n²) overlap checks are fine — no spatial index needed.
5. **Tight spans** — when `span < 2·arrowLen + labelWidth`, flip arrowheads to point inward from outside the extension lines and stub the line past each. Below 24px, drop the dimension entirely.
6. **Responsive tiers** — `1024+` everything; `768` drop positional `from` dims; `520` size only, priority ≥4; `<380` overlay off. `@media print` hides the overlay (a doc-sized absolute SVG does not paginate).

### CSS conventions

`.sk` gives the sketch look (`--sk-fill` background, 2px `--sk-ink` border, radius); `.sk--fluid` swaps the border to `--sk-fluid`. `.sk-frame` is the fixed `#736CFF` page border from the logo, and is also the `page` target for `data-dim-from`.

Labels use **`paint-order: stroke`** with a 4px `--sk-bg` stroke — a halo behind the glyphs so numbers stay readable where they cross extension lines. Cheapest, best-looking legibility win available. Axis-aligned lines get `shape-rendering:crispEdges`; leaders and arrowheads get `geometricPrecision`.

**Control dots are drawn by the overlay, not CSS.** Every corner emits a dot at the mathematical box corner; a filleted corner additionally emits its two arc tangent points (3 dots per filleted corner, 1 per sharp corner). Tangent positions are a function of the resolved radius, which `radial-gradient` backgrounds cannot express. `data-dim-dots` = `all` (default) | `corners` | `tangents` | `none`.

## Data layer (`assets/js/lib/json.js`)

```js
const cache = new Map();
export function getJSON(path) {              // promise singleton, no duplicate requests
  if (!cache.has(path)) cache.set(path, fetch(path, { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(`${path} (${r.status})`); return r.json(); }));
  return cache.get(path);
}
```

Failures render a `--sk-warn` message card in place ("Couldn't load team.json — run a local server"), never a blank section.

Every file is a top-level object wrapping a named array (`{ "team": [...] }`), matching the reference site and leaving room for metadata.

| File | Shape |
|---|---|
| `site.json` | nav links, footer socials |
| `sponsors.json` | `{id,name,logo,tier,url}` |
| `team.json` | `{id,name,role,program:"FRC"\|"FTC"\|"V5RC",teamNumber,linkedin,github}` |
| `faq.json` | `{q,a}` |
| `schedule.json` | `{event:{start,durationHours:120}, phases[], lanes[3], blocks[]}` |
| `workshops.json` | `{id,title,host,startHour,room,level,description,prereqs[],materials[]}` |
| `past-events.json` | `{featured[], organized[]}` |
| `components.json` | `{id,name,scope,type,qty,notes}` |

## Pages

Each page renders JSON **before** `Sketch.init()` — annotating first would measure empty containers and flash wrong numbers. `data-dim-*` attributes live on the `<template>` markup so cloned cards inherit their spec for free.

**`index.html` — Landing**
- Sponsor marquee pinned at top: duplicated track, CSS `translateX` keyframes, pauses on hover. **Annotate the clipping viewport, never the moving track** — otherwise the numbers change 60×/sec and the overlay repaints every frame. The wrapper carries the annotation; the track is opted out.
- Hero: wordmark, "120 HOURS · Ri3D + FRC", and two annotated buttons — **Register** and **Apply to Sponsor**.
- Meet the Team, centered: cards from `team.json` — name, role, program badge (FRC/FTC/V5RC + number), LinkedIn and GitHub links.
- FAQ at the bottom: `<details>`/`<summary>` from `faq.json` (keyboard-accessible for free); `Sketch.refresh()` on toggle since the box resizes.
- Footer: socials from `site.json`.

**`schedule.html`**
- Vertical Gantt: CSS grid `[axis | lane | lane | lane]`. Time maps to pixels through one `HOUR_PX` constant; a block is absolutely positioned at `top = startHour * HOUR_PX`, `height = (end - start) * HOUR_PX`. The left axis renders 0h→120h ticks with the **main event phase filled in** as a colored band.
- Blocks carrying a `workshopId` link to `workshop.html?id=…`.
- Workshop list below the chart from `workshops.json`, same links.

**`workshop.html`** — reads `?id=` via `URLSearchParams`, finds the record, renders title/host/time/room/level/description/prereqs/materials. Unknown id → a `--sk-warn` not-found card with a link back.

**`past-events.html`** — featured section for the single private Ri3D event; a separate bottom section listing other events team members have organized.

**`components.html`** — two orthogonal classifications per item:
- `scope`: `event` (one for the whole event) | `per-team` (each team gets one)
- `type`: `machines` | `hand-tools` | `electrical` | `mechanical` | `software`

Rendered as two top-level `scope` groups, each subdivided by `type`, with filter chips on both axes (filter in place, no reload). Quantity renders `×3` for event tools and `1 per team` for per-team tools.

## Build order

1. `tokens.css` + `sketch.css` + **one hand-annotated static HTML page** — validate the visual language against the logo before writing any engine.
2. `primitives.js` + `layout.js` — pure, testable against fixture boxes.
3. `measure.js` + `render.js` + the scheduler — get one element live-updating on resize.
4. `schema.js` + `registry.js` — the declarative layer.
5. Lane allocation + de-overlap, once a real page actually collides.
6. Responsive tiers.
7. `lib/json.js`, data files, then the five pages.

Steps 2–3 are where the iteration will be; the rest is mechanical.

## Verification

- Serve locally (`python3 -m http.server 8000`). ES modules and `fetch` both fail on `file://` — this needs a server, and it goes in the README since there's no build step to hide it.
- Load all five pages: no console errors, every section rendered from JSON.
- **Resize test (the critical one)** — drag the window 1600px → 700px. Blue values must update continuously and stay welded to their elements; black values must not move relative to theirs. No horizontal overflow at any width.
- **Annotation fidelity** — screenshot a button and compare against the logo: extension-line gap and overshoot, arrowheads at both ends, vertical label rotated −90°, radius arrowhead landing *on* the arc, dots at both box corners and arc tangent points. Set a pill button (`radius:9999px`) and confirm the R label matches the rendered corner, proving overlap-scaling works.
- Scroll a long page and confirm doc-layer annotations track their elements and the sticky nav's stay pinned.
- Rename `data/team.json` → landing shows the error card, not a blank section.
- `workshop.html?id=nope` → red not-found card. A Gantt block with a `workshopId` lands on the right workshop.
- Components filter chips on both axes narrow correctly.
- Throttle to a mobile viewport: tiers degrade, nothing overlaps, buttons remain clickable (overlay is `pointer-events:none`).
- Print preview: overlay hidden, content readable.
