# TODO — Diagram Viewer v1 bug fixes (post-rebuild)

## Goal

Fix six post-rebuild bugs in `<diagram-viewer>`: nested-heading highlight bleeds to the parent, sticky `:focus` outline after click + keyboard nav, PNG/SVG-overlay misalignment, JSON dialog centred to viewport instead of host, JSON button in the wrong toolbar, and Reset button having no visible effect. Move both JSON and Reset to the sidebar footer and remove the top toolbar entirely.

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section          | Sudocode entity                                  |
| --------------------- | ------------------------------------------------ |
| Overall fix bundle    | `s-448f` (new independent bug-fix spec)              |
| Implementation rollup | `i-63vt` (parent epic, blocked by `i-926o`)      |
| Task 1                | `i-25pi`                                         |
| Task 2                | `i-1ulm`                                         |
| Task 3                | `i-6br3`                                         |
| Task 4 (toolbar move) | `i-8g8k`                                         |
| Task 5 (JSON centre)  | `i-8y3f`                                         |
| Task 6 (reset)        | `i-71kw`                                         |
| Task 7 (tests, leaf)  | `i-926o`                                         |

Linear `blocks` chain: `i-25pi` → `i-1ulm` → `i-6br3` → `i-8g8k` → `i-8y3f` → `i-71kw` → `i-926o` → `i-63vt`. Run `sudocode ready` to find the next unblocked task. Task 7 (`i-926o`) provides summary implementation feedback to `s-448f` once closed (feedback anchor already attached).

## Tasks

### 1. Nav-tree: stop highlighting the parent of an active step (bug 1)

- [x] In `src/diagram-nav-tree.js` `#updateActiveHighlight`, drop the `parentId`-based branch from the `.nav-item` loop so only the item whose `dataset.id === activeSlideId` gets `.active`
- [x] Keep the existing `step-bullet` parent-aware highlight as-is — the active step bullet under the parent is the only contextual indicator
- [x] Remove the now-unused `parentId` argument from `setActive(slideId, parentId)` (keep the signature back-compatible by ignoring extra args) and update the call site in `src/diagram-viewer.js#loadSlide` to pass only `slide.id`
- [x] Verify with a manual smoke check on the Kubernetes fixture: navigate to `pod-lifecycle-step-1`; the parent (`Pod Lifecycle`) must NOT have a background; only the step bullet shows the active dot

> Recorded as sudocode issue `i-25pi`.

### 2. Nav-tree: kill sticky blue outline after click (bug 2)

- [x] In `src/diagram-nav-tree.js` styles, add `.nav-item:focus { outline: none; }` and `.nav-item:focus-visible { outline: 2px solid var(--color-primary, #6366f1); outline-offset: -2px; }`
- [x] Verify: click a heading (no outline, just the active background); then keyboard-nav with ↓/↑ — no stranded blue outline on the previously-clicked heading; `Tab`-keyboard focus still shows a visible ring (accessibility)

> Recorded as sudocode issue `i-1ulm`.

### 3. Canvas: align SVG overlay with PNG background (bug 3)

- [x] In `src/diagram-canvas.js`, after `#handleImageInIframe` switches `iframe.src` to the overlay SVG, inject a `<style>` element into the iframe document on its next `load` that zeroes out the body margin/padding: `html, body { margin: 0; padding: 0; } svg { display: block; }`
- [x] Apply the same zero-margin injection in `#handleSvgDimensions` (the non-overlay SVG path) so a stand-alone SVG also lays out flush with the iframe's top-left — consistent behaviour across slide types
- [x] Guard the injection with the existing `data-viewer` style element check pattern (re-used from `#renderImage`) so styles are inserted at most once per iframe document
- [x] Verify on the Kubernetes fixture: open `cloud-controller-manager` (PNG-with-SVG-overlay) and confirm at zoom 50 %, 150 %, 300 % that the red overlay rectangles sit exactly on top of their PNG counterparts; also confirm a plain SVG slide (e.g. `etcd`) still renders correctly

> Recorded as sudocode issue `i-6br3`.

### 4. Move JSON + Reset into the sidebar footer; remove the top toolbar (bug 5)

- [x] In `src/diagram-nav-tree.js`, add two text buttons to the `.sidebar-footer` — one labelled `JSON` and one labelled `Reset` — placed in a left-side group next to the existing attribution; the right side keeps the existing zoom controls + help button untouched
- [x] Style the new buttons to match the existing `.zoom-btn` visual weight: `font-size: 0.6875rem; padding: 0.125rem 0.5rem; height: 1.5rem; border-radius: 0.25rem` with hover state
- [x] Add click handlers that dispatch `json-open` and `reset` `CustomEvent`s with `bubbles: true, composed: true`
- [x] In `src/diagram-viewer.js`, remove the entire `<div class="toolbar">…</div>` block from `#render`, drop the `.toolbar` and `.toolbar button` CSS rules, and drop the `toolbar` row from `grid-template-areas` / `grid-template-rows`
- [x] In `#initEventListeners`, replace the toolbar-button click bindings with `this.#navTree.addEventListener('json-open', …)` and `this.#navTree.addEventListener('reset', …)`
- [x] Keep `#initToolbar` (renamed to `#initJsonDialog` for clarity) wiring the dialog's `Copy` / `Apply` / `Close` buttons; only the entry-point button moves
- [x] Verify: top toolbar is gone; sidebar footer shows the order `JSON · Reset · attribution · zoom controls · help`; both buttons fire correctly

> Recorded as sudocode issue `i-8g8k`.

### 5. JSON dialog: centre within the host, not the viewport (bug 4)

- [x] In `src/diagram-viewer.js`, replace the native `<dialog>`/`showModal()` pattern with a backdrop+modal pattern matching `<diagram-help-modal>`: a `<div class="json-dialog-backdrop">` containing the existing `.json-dialog` content; `position: absolute; inset: 0;` over the `.container` (which already has `position: relative`)
- [x] Centre the modal with `display: flex; align-items: center; justify-content: center` on the backdrop; the modal panel keeps its existing `max-width: 40rem; max-height: 80vh; width: 90%;`
- [x] Add `.json-dialog-backdrop.open { display: flex; }` and default `display: none`; toggle the `open` class instead of calling `showModal()` / `close()`
- [x] Add a Close-on-backdrop-click handler (clicking outside the modal panel closes it), matching the help modal
- [x] Add `Esc` close: reuse the existing top-level keydown handler (`#handleKeyDown`) — when the JSON dialog is open, `Escape` closes it before the help-modal close path runs; track open state via the backdrop's class
- [x] Verify: JSON button opens the dialog perfectly centred over the `<diagram-viewer>` host even when the host is smaller than the viewport (e.g. shrink the browser or place the viewer in a column); backdrop click and `Esc` both close it

> Recorded as sudocode issue `i-8y3f`.

### 6. Reset actually resets everything (bug 6)

- [x] In `src/diagram-viewer.js#reset`, before re-running the load path, reset all UI state explicitly:
  - [x] Restore `#zoomLevel` to the original default — `parseInt(this.getAttribute('zoom'), 10) / 100` if the `zoom` attribute is present and valid, otherwise `1.5`
  - [x] Open the sidebar: `this.#container.classList.remove('sidebar-collapsed')`
  - [x] Clear the inline grid-template-columns override: `this.#container.style.gridTemplateColumns = ''`
  - [x] Clear the URL hash: `history.replaceState(null, '', location.pathname + location.search)`
  - [x] Push the reset zoom into the canvas (`this.#canvas.zoomLevel = this.#zoomLevel`) and the nav-tree (`this.#navTree.zoomPercent = Math.round(this.#zoomLevel * 100)`)
- [x] After resetting, the existing `loadData(this.#sourceData)` call now sees no localStorage snapshot (just cleared) and no URL hash (just cleared), so it walks the no-snapshot path and navigates to `start-at` (default `overview`) — no further changes needed in `loadData`
- [x] Verify: navigate to `cloud-controller-manager`, zoom to 300 %, collapse the sidebar; click Reset → land on `overview`, sidebar open at default width, zoom back to default 150 %, URL hash cleared

> Recorded as sudocode issue `i-71kw`.

### 7. Tests

- [x] Update `tests/diagram_nav_tree_test.go`: replace any selector that targeted the top `.toolbar` `JSON` / `Reset` buttons with sidebar-footer selectors; add a regression test that an active step's parent does NOT carry the `active` class
- [x] Update `tests/diagram_viewer_test.go`: switch from `dialog.open` checks to backdrop-class checks (`.json-dialog-backdrop.open`); add a regression test for Reset clearing zoom + sidebar + hash + slide
- [x] Update `tests/diagram_canvas_test.go`: add a regression test that loads `cloud-controller-manager` and asserts the iframe document body has zero margin (proxy for overlay alignment)
- [x] Run `task test` and make all four test files pass

> Recorded as sudocode issue `i-926o` (leaf — provides implementation feedback to `s-448f` on close; feedback anchor already attached).

## Notes

- All six bugs are tightly localised to the three component files plus their shadow-DOM CSS — no manifest, persistence, or build-system changes required.
- Bug 1 and bug 2 are pure CSS / class-management fixes inside `<diagram-nav-tree>`.
- Bug 3 is fixed by injecting zero-margin styles into the iframe document, mirroring the `#renderImage` pattern that already does this for plain image rendering.
- Bug 4 abandons the native `<dialog>` top-layer in favour of an absolutely-positioned backdrop, identical to how the help modal is already implemented — same pattern, same UX, now centred on the host.
- Bug 5 consolidates all chrome controls into the sidebar footer and removes the top toolbar grid row entirely.
- Bug 6 fixes the reset by also clearing zoom / sidebar / URL state; without those resets, `loadData` re-applies the same UI state and the user sees no change.
- The JSON dialog continues to do a full-replace of the snapshot on Apply, with `version !== 1` rejected — unchanged from the spec.
