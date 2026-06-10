# TODO

## Goal

Rebuild the v0 D2 Diagram Viewer as `<diagram-viewer>` — a multi-file Web Component, bundled with `go tool esbuild`, served by Caddy, persisted in localStorage with JSON import/export, and verified by a full Playwright-go end-to-end suite — mirroring the story-mapper sibling project's structure.

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section          | Sudocode entity                                |
| --------------------- | ---------------------------------------------- |
| Overall feature       | `s-9gls` (spec)                                |
| Implementation rollup | `i-6vkn` (parent epic, blocked by `i-7yvf`)    |
| Phase 1               | `i-62we`                                       |
| Phase 2               | `i-60gq`                                       |
| Phase 3               | `i-2en4`                                       |
| Phase 4               | `i-locv`                                       |
| Phase 5               | `i-9m73`                                       |
| Phase 6               | `i-7yvf`                                       |

Linear `blocks` chain: `i-62we` → `i-60gq` → `i-2en4` → `i-locv` → `i-9m73` → `i-7yvf` → `i-6vkn`. Run `sudocode ready` to find the next unblocked phase. Phase 6 (`i-7yvf`) provides implementation feedback summarising Playwright-go test results on `s-9gls` once closed.

## Tasks

### 1. Project scaffolding

- [x] Create `go.mod` with `module github.com/metafeather-org/diagram-viewer`, Go 1.26+, and `tool` directives for `github.com/evanw/esbuild/cmd/esbuild` and `github.com/caddyserver/caddy/v2/cmd/caddy`
- [x] Add `github.com/playwright-community/playwright-go` as a non-tool require for tests
- [x] Run `go mod tidy` to populate `go.sum`
- [x] Create `Taskfile.yaml` with tasks: `default` (list-all), `env`, `build`, `dev`, `test`, `serve`, `clean` — modelled exactly on story-mapper's Taskfile but bundling `src/diagram-viewer.js` → `dist/diagram-viewer.js` and `src/styles.css` → `dist/diagram-viewer.css`
- [x] Create `Caddyfile` serving project root on `:8080` with permissive CORS headers (matches story-mapper)
- [x] Create `index.html` at project root: `<diagram-viewer></diagram-viewer>`, links `dist/diagram-viewer.css`, imports `dist/diagram-viewer.js`, and contains an inline module script that fetches `examples/kubernetes/manifest.json` and calls `document.querySelector("diagram-viewer").loadData(data)` — pattern lifted from story-mapper's `index.html`
- [x] Add `.gitignore` covering `dist/`, `node_modules/`, and Playwright artefacts
- [x] Copy v0 `viewer/example/` and `viewer/manifest.json` into `examples/kubernetes/` as a known-good fixture for both manual use and tests

> Recorded as sudocode issue `i-62we`.

### 2. Decompose monolith into parent + sub-components

- [x] Create `src/diagram-viewer.js` as the parent custom element registered as `diagram-viewer`; it owns state, loads the manifest, builds the flat slide list, owns navigation history (back/forward stacks), wires children, and exposes the `loadData(data)` and `reset()` public API
- [x] Create `src/diagram-canvas.js` registered as `diagram-canvas`: encapsulates the iframe, its load handler, SVG/image dimension detection, overlay handling for PNG-with-SVG-links, zoom level + zoom in/out/reset, mouse-wheel zoom, intercepting iframe link clicks and forwarding navigation to the parent via a `slide-navigate` CustomEvent
- [x] Create `src/diagram-nav-tree.js` registered as `diagram-nav-tree`: sidebar header, collapse/expand button, attribution footer, recursive nav tree rendering of `layers/children/steps`, step bullets, active-item highlighting, click-to-navigate dispatching a `slide-select` CustomEvent
- [x] Create `src/diagram-help-modal.js` registered as `diagram-help-modal`: native `<dialog>` element, keyboard shortcut reference content, `open()` / `close()` methods (matches story-mapper's preference for native `<dialog>`)
- [x] Move all CSS out of the JS template-string into `src/styles.css` so esbuild bundles a single `dist/diagram-viewer.css`; sub-component shadow-DOM styles stay inside their component files (story-mapper pattern)
- [x] Parent reacts to child events: `slide-select` (sidebar click) → reset history, navigate; `slide-navigate` (iframe click) → push history, navigate; sub-components receive state via attributes/properties
- [x] Preserve every v0 user-facing behaviour: keyboard nav (Up/Down/Left/Right/Space/Home/End/=/-/0/f/?/Esc), URL-hash sync, attribute-driven initial state (`manifest`, `base-path`, `sidebar`, `zoom`, `start-at`), sidebar resize handle, fullscreen toggle, error states for missing/invalid manifest
- [x] `task build` must produce `dist/diagram-viewer.js` and `dist/diagram-viewer.css`, and `task serve` must render the Kubernetes example with all v0 features working — verify with a manual smoke check before moving on

> Recorded as sudocode issue `i-60gq`.

### 3. localStorage persistence (UI state + manifest)

- [x] Define a single versioned snapshot under storage key `diagramViewer.v1` with fields: `version: 1`, `manifest` (full v0-shape object or null when loaded by URL only), `basePath`, `ui: { currentSlideId, zoomPercent, sidebarOpen, sidebarWidthPx }`
- [x] Add `_loadFromStorage()` and `_persist()` (debounced 250 ms, identical pattern to story-mapper) to `<diagram-viewer>`
- [x] On `connectedCallback`: try snapshot first; if a snapshot exists, restore manifest + UI state and skip the manifest fetch; if no snapshot, fall back to the `manifest` attribute fetch
- [x] Persist on every state change: slide change, zoom change, sidebar toggle, sidebar resize end (not during drag)
- [x] On reload, restore current slide via the saved `currentSlideId` instead of the URL hash if both are present and differ — URL hash still wins on explicit hashchange events
- [x] Add a `reset()` method that clears `localStorage.diagramViewer.v1`, drops the in-memory snapshot, and re-runs the original load path (re-fetch the `manifest` attribute or re-apply the last `loadData` payload)

> Recorded as sudocode issue `i-2en4`.

### 4. JSON import/export dialog

- [x] Add a top-right `JSON` toolbar button inside `<diagram-viewer>` that opens a native `<dialog>` containing a single `<textarea>`, plus `Copy`, `Apply`, and `Close` buttons and an inline error region (story-mapper pattern)
- [x] On open, populate the textarea with `JSON.stringify(this._snapshot, null, 2)`
- [x] `Copy` writes the textarea contents to the clipboard via `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback and a transient "Copied" indicator
- [x] `Apply` parses the textarea; on parse error or `version !== 1`, show an inline error and do **not** mutate state; on valid parse, replace `this._snapshot` wholesale, persist, close the dialog, and re-render — full-replace, not merge
- [x] Add a `Reset` toolbar button that calls the new `reset()` method
- [x] Both toolbar buttons live in a thin toolbar above the existing sidebar/canvas grid so they stay visible without competing with the sidebar collapse button

> Recorded as sudocode issue `i-locv`.

### 5. Public API: `loadData(data)`

- [x] Implement `loadData(data)` on `<diagram-viewer>` that accepts the v0 manifest shape only — `{ name?, title?, version?, generated?, description?, layers: [{ id, title, path, type, children?, steps?, overlay? }] }`; reject anything else with a clear error
- [x] If `loadData` is called and a snapshot already exists in localStorage, treat the new data as the source-of-truth manifest, refresh the manifest field of the snapshot, but preserve the user's UI state (current slide if still present, zoom, sidebar) — orphaned `currentSlideId` falls back to `start-at` or `overview`
- [x] Keep the source data in `_sourceData` so `reset()` can re-apply it without a refetch (matches story-mapper)

> Recorded as sudocode issue `i-9m73`.

### 6. Playwright-go end-to-end test suite (one file per component)

- [x] Create `tests/main_test.go` with shared setup: `TestMain` mirroring story-mapper (install playwright, launch headless Chromium, serve the project root via `httptest.NewServer`, share the browser across tests), plus shared helpers `newPage(t)`, `navigateToIndex(t, page)` (waits for `diagram-viewer` to attach), `clearLocalStorage(t, page)`, `loadFixture(t, page, path)`
- [x] Create `tests/diagram_viewer_test.go` covering the parent component: `loadData()` accepts v0 shape and renders, `loadData()` rejects non-v0 shapes with a clear error, JSON dialog export round-trips the snapshot, JSON dialog import full-replaces the snapshot and re-renders, JSON dialog import error keeps the existing snapshot intact, Reset button clears localStorage and re-applies source data, localStorage persistence across reload (current slide + zoom + sidebar state restored)
- [x] Create `tests/diagram_canvas_test.go` covering the canvas component: zoom keys (`=` / `-` / `0`) update the zoom % readout, mouse-wheel + Ctrl zooms, iframe loads SVG and sets dimensions, iframe loads PNG-with-overlay (PNG as background, overlay SVG as iframe `src`), iframe link click is intercepted and dispatches `slide-navigate`, ArrowLeft (back) returns to the previous slide after an iframe-link click pushes history
- [x] Create `tests/diagram_nav_tree_test.go` covering the sidebar component: clicking a nav item updates the iframe `src` and URL hash and moves the active class, expand/collapse toggles a sub-tree without navigating, sidebar collapse + toggle button round-trip, sidebar resize handle changes width and the new width persists, keyboard nav (ArrowDown / ArrowUp / Home / End) advances through the flat slide list and updates the active sidebar item
- [x] Create `tests/diagram_help_modal_test.go` covering the help modal: pressing `?` opens the `<dialog>`, pressing `Esc` closes it, clicking the close button closes it, the modal lists every documented keyboard shortcut

> Recorded as sudocode issue `i-7yvf` (leaf — provides implementation feedback to `s-9gls` on close).

### 7. Record in sudocode

- [x] Decide spec-vs-issue granularity per the rule (one parent spec + one parent epic issue + one child issue per phase 1–6)
- [x] Create the parent spec `Diagram Viewer v1 Rebuild` → `s-9gls`
- [x] Create the parent epic issue with `implements` to that spec → `i-6vkn`
- [x] Create six child issues (one per phase 1–6), each `--parent` of the epic, with plain-text spec references in the body → `i-62we`, `i-60gq`, `i-2en4`, `i-locv`, `i-9m73`, `i-7yvf`
- [x] Add `blocks` edges chaining child 1 → 2 → 3 → 4 → 5 → 6 so `sudocode ready` walks the work in order
- [x] Add a `blocks` edge from child 6 (leaf) back to the parent epic so the epic stays out of `ready` until all phases are done
- [x] Update this TODO.md with a `Sudocode mapping` table containing the resulting IDs
- [x] Verify the workflow recipe: single `implements` edge per spec, parent epic blocked, only child 1 in `ready`
- [x] Mark on the leaf issue (phase 6) that summary implementation feedback is expected on the parent spec once it is closed

## Notes

- **Architecture mirrors story-mapper exactly.** Same Go 1.26 `tool` directive, same Taskfile structure, same Caddyfile, same `dist/<name>.{js,css}` bundle layout, same `loadData()` + reset + JSON-dialog public surface, same Playwright-go test scaffold. The diagram-specific concerns (iframe rendering, manifest hierarchy, zoom) are isolated inside sub-components.
- **Manifest format is preserved verbatim from v0** (`{ name, layers: [{ id, title, path, type, children?, steps? }] }`) because it already drives the click-through hierarchy and step navigation efficiently. `loadData()` accepts this shape only; the alternative `{ images: [...] }` wrapper from the README is explicitly out of scope for v1.
- **localStorage stores both UI state and the full manifest** so users can paste a manifest into the JSON dialog without serving any files, and so a reload restores the exact view including the manifest itself.
- **No behaviour regression from v0.** All keyboard shortcuts, attribute-driven configuration, iframe link interception, SVG-overlay-on-PNG rendering, sidebar resize, fullscreen, and help modal must survive the decomposition. Phase 2 ends with a manual smoke check against the Kubernetes fixture before any new feature work begins.
- **Native `<dialog>`** for both JSON import/export and the help modal — matches story-mapper's "no library, no overlay re-implementation" stance.
- **Full-replace import**, not merge, for the JSON dialog. Predictable round-trip; no partial-import edge cases.
- **One test file per component**, all sharing a single `TestMain` and helper set in `tests/main_test.go`. Each test file targets the user-visible surface of its component, exercised through the real DOM (clicks, keys, dialogs) rather than private methods.
- **Reset semantics**: clears `localStorage.diagramViewer.v1` and re-applies the original source (last `loadData` call or original `manifest` attribute fetch) — same shape as story-mapper's `reset()`.
