# Layout Sketch 1

Site for **Layout Sketch 1**, a 120-hour Ri3D + FRC competition hackathon.

Pure HTML/CSS/JS — no framework, no build step. Content that changes lives in
`data/*.json` and is rendered client-side.

## Running it

`fetch()` and ES modules are both blocked on `file://`, so the folder has to be
served over HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Editing content

Everything editable is JSON. No code changes needed to update the site.

| File | Drives |
| --- | --- |
| `data/site.json` | Nav links, footer socials, site name |
| `data/sponsors.json` | Scrolling sponsor banner |
| `data/team.json` | Meet the team cards |
| `data/faq.json` | FAQ accordion |
| `data/schedule.json` | Gantt phases, lanes, and blocks |
| `data/workshops.json` | Workshop list and detail pages |
| `data/past-events.json` | Featured event and the organized-by list |
| `data/components.json` | Components, scopes, and types |

A schedule block linked to a workshop just needs a `workshopId` matching an id
in `workshops.json`; the link to `workshop.html?id=…` is generated.

## The annotation engine

The site is drawn as a CAD sketch: every button, card, and image carries
dimension arrows for its width, height, corner radius, and position. This is a
runtime system in `assets/js/sketch/`, not static decoration.

- **Black** `#000000` — fixed geometry.
- **Undefined blue** `#736CFF` — geometry that changes with the viewport. These
  values are measured live and update as the window resizes.

Annotate an element by adding `data-dim` plus whichever attributes apply:

```html
<a class="sk-btn" href="#register"
   data-dim
   data-dim-mode="fluid"                  <!-- fluid | fixed (required) -->
   data-dim-size="w,h"                    <!-- w | h | w,h | none -->
   data-dim-side="w:bottom h:right"       <!-- which edge each dimension sits on -->
   data-dim-radius="auto"                 <!-- auto | none | all | tl,tr,br,bl -->
   data-dim-from="left:page; top:#hero"   <!-- gaps to walls or other elements -->
   data-dim-dots="all"                    <!-- all | corners | tangents | none -->
   data-dim-vw="1024+"                    <!-- viewport range to render in -->
   data-dim-priority="4">Register</a>     <!-- 1–5, higher survives collisions -->
```

`data-dim-mode` is declared, never inferred — there is no browser API that
reports whether an element's size depends on the viewport, and guessing would
be wrong in both directions.

For repeated grids, put `data-dim-repeat="first"` on the container and
`data-dim-child` on the items: only the first item is dimensioned, which is
both standard CAD practice and the only readable option.

After injecting content into the DOM, call `Sketch.rescan()`. Pages render
their JSON before calling `Sketch.init()` so annotations never measure empty
containers.

## Structure

```
index.html  schedule.html  workshop.html  past-events.html  components.html  404.html
assets/css/     tokens, base, sketch (overlay + surfaces), pages
assets/js/sketch/   the annotation engine
assets/js/lib/      json fetching, shared nav/footer
assets/js/pages/    one module per page
data/               all editable content
```
