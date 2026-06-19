# TODO

## Goal

Fix `<diagram-canvas>` so that SVGs (especially viewBox-only ones produced by D2) are measured by their intrinsic content size and rendered at fit-along-shortest-side ("cover") on initial load, with zoom controls and viewer resizes honouring the corrected fit.

## Tasks

### 1. Capture current behaviour with a failing test

- [x] Add a Playwright test fixture: a small SVG with **only `viewBox="0 0 1200 400"`** (no `width`/`height`), under `tests/fixtures/` and a matching minimal `manifest.json`.
- [x] Add `tests/diagram_canvas_fit_test.go` that loads that fixture in `<diagram-viewer>`, then via `evaluate` reads the iframe's `dataset.baseWidth` / `dataset.baseHeight` and asserts they equal `1200` / `400` (the viewBox dims, not the iframe viewport size). This test must fail against `main`.
- [x] In the same test, after load, assert the computed `transform: scale(...)` matches `Math.max((viewerW - 32) / 1200, (viewerH - 32) / 400)` (cover fit at zoomLevel 1.0). Must also fail against `main`.

### 2. Fix SVG dimension detection (spec-correct order)

- [x] In `src/diagram-canvas.js#handleSvgDimensions`, replace the `parseInt(getAttribute) ?? getBoundingClientRect()` logic with a helper `#measureSvg(svg)` that returns `{width, height}` using SVG2 / CSS intrinsic-sizing order:
  1. `width`/`height` attributes — only if both parse as a positive number with no `%` unit (use `parseFloat` and reject values containing `%`).
  2. `svg.viewBox.baseVal` (when `width > 0 && height > 0`).
  3. `svg.getBBox()` (rendered content bounds; wrap in try/catch as it can throw on detached nodes).
  4. `svg.getBoundingClientRect()` as last resort.
  5. Hard fallback `800 × 600` only if all of the above yield 0 / NaN.
- [x] Use `parseFloat` (not `parseInt`) and never silently coerce `"100%"` → `100`.
- [x] Unit-style assertions: extend the test from task 1 with a second fixture having `width="100%" height="100%" viewBox="0 0 600 800"` to confirm percentage attrs are skipped in favour of viewBox.

### 3. Switch initial fit to "cover" along the shortest side

- [x] In `#setDimensionsAndScale`, change `fitScale` from `Math.min(scaleX, scaleY)` to `Math.max(scaleX, scaleY)`. This makes the SVG fill the viewport along its shortest dimension; the longer dimension overflows and is reachable via the existing scroll container.
- [x] Document the change in a comment block above the calculation, naming it explicitly as cover-fit.

### 4. Change default zoom level to 1.0

- [x] In `#setDimensionsAndScale`, change the default `this.#zoomLevel = 1.5` (line 351) to `1.0` so the diagram loads at exactly fit-scale.
- [x] Update the existing `#zoomLevel = 1.5` initializer (class field, line 47) to `1.0` so the value is consistent before first load.
- [x] Update `tests/diagram_viewer_test.go:232-233` which currently asserts the default zoom shows as `"150%"` — change the expectation to `"100%"`.
- [x] Update `README.md` and any inline JSDoc that mentions the 1.5 default (search the repo for `1.5` / `150%`).

### 5. Recompute fit on viewer resize

- [x] Cache the last-known intrinsic SVG dimensions on the canvas instance (e.g. `#contentWidth` / `#contentHeight`) at the end of `#setDimensionsAndScale`.
- [x] In `connectedCallback`, attach a `ResizeObserver` to `this` that, when fired, re-runs the fit-scale calculation against the cached intrinsic dimensions and calls `#applyZoom()`. Skip if no slide has been loaded yet.
- [x] Disconnect the observer in `disconnectedCallback` to avoid leaks across multi-instance teardown.
- [x] Guard against feedback loops: the observer must not fire from its own scroll-position adjustments inside `#applyZoom` (use a debounce via `requestAnimationFrame` and a `#resizing` flag).
- [x] Add a Playwright test that resizes the page, then asserts the iframe's `transform: scale(...)` value has changed and still equals the cover-fit formula for the new viewport.

### 6. Update the raster-image path to match

- [x] `#handleImageDimensions` already passes `naturalWidth`/`naturalHeight` to `#setDimensionsAndScale`, so the cover-fit and resize fixes will apply automatically. Verify with a manual smoke test against an `examples/.../*.png` slide. No code change expected; record the verification in the PR description.

### 7. Run the full test suite & smoke-test

- [x] `task test` (or the project's test runner) must pass.
- [x] Manual smoke test: load `examples/kubernetes/` in the dev server, confirm:
  - On first load each diagram fills the viewport along its shortest side at 100% zoom.
  - `+` / `-` / `0` keyboard controls, mouse-wheel zoom, and the sidebar zoom buttons all behave correctly relative to the new fit-scale.
  - Resizing the browser window re-fits without requiring a slide reload.
  - Tall diagrams (e.g. `Nodes/index.svg` with viewBox `0 0 1202 2468`) now render at correct content size, not letterboxed inside the iframe viewport.

## Notes

- **Why cover, not contain.** User wants "fit along the shortest side" — the SVG's shortest dimension matches the viewport's corresponding side. The longer dimension overflows and is scrollable. This is the CSS `object-fit: cover` semantic, implemented as `Math.max(scaleX, scaleY)`.
- **Why default zoom 1.0.** With the broken fit-scale, `1.5` compensated for letterboxing, so diagrams looked roughly "right". With accurate fit-scale, `1.0` *is* fit-to-viewport; `1.5` would now genuinely overflow on initial load, which the user does not want.
- **Spec order for dimensions.** Per SVG 2 §8 / CSS intrinsic sizing: explicit `width`/`height` attrs win when both are concrete (non-percentage) lengths; otherwise the viewBox provides the intrinsic size and aspect ratio. Percentages on the root SVG resolve against the containing block (the iframe) and are therefore useless to us as content size signals.
- **Why the current code under-measures.** D2 emits `viewBox`-only SVGs. `svg.getAttribute('width')` returns `null`, so the code falls through to `getBoundingClientRect()`, which returns the iframe's viewport (e.g. 1000×800). With `preserveAspectRatio="xMidYMid meet"`, the actual content is letterboxed inside that rect, so the *measured* size has nothing to do with the *content* size — and the eventual scaled iframe is mostly empty bands.
- **Risk: existing persisted zoom.** `localStorage` retains user-set zoom levels. After this change, a stored `1.5` will mean genuine 150% overflow rather than the previous "looks fine" letterbox-compensation. Acceptable per scope; users can press `0` to reset.
- **Out of scope.** Configurable contain/cover toggle attribute (separate future enhancement); fit recomputation on iframe content navigation other than load (already covered by the load handler).
