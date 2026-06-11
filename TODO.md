# TODO — Add `<diagram-loader>` sibling webcomponent

## Goal

Introduce a new `<diagram-loader>` webcomponent that lives as a sibling of `<diagram-viewer>`, owns a manifest-path input, and hosts the JSON + Reset buttons (which are removed from the sidebar footer of `<diagram-nav-tree>`).

## Failing → Passing criteria

A new Playwright test `tests/diagram_loader_test.go` that:

1. Loads an HTML page containing one `<diagram-viewer id="v1">` and one `<diagram-loader for="#v1">`.
2. Asserts the sidebar footer in `<diagram-nav-tree>` no longer renders `JSON` or `Reset` buttons.
3. Types `examples/kubernetes/manifest.json` into the loader's input, clicks **Load**, and asserts the viewer renders the kubernetes manifest (sidebar nav contains expected items).
4. Clicks the loader's **JSON** button and asserts the JSON dialog inside the viewer's shadow DOM opens.
5. Clicks the loader's **Reset** button and asserts viewer state is cleared (localStorage entry for that instance removed; UI returns to initial slide).
6. In a multi-instance fixture, only the targeted viewer (`for="#left"`) reacts to its loader; the other viewer is unaffected.

Pre-implementation these tests fail (component does not exist). Post-implementation they all pass.

## Design decisions (locked from user input)

| # | Decision |
| - | -------- |
| 1 | New tag name: `<diagram-loader>` |
| 2 | Targets its viewer via a `for` attribute whose value is a CSS selector (`for="#id-2"`); resolved with `document.querySelector(value)`. |
| 3 | UI is a text `<input>` accepting a full URL or a path that resolves relative to the current page, plus a `Load` button, plus the relocated `JSON` and `Reset` buttons. |
| 4 | `JSON` and `Reset` buttons are **removed entirely** from `<diagram-nav-tree>` — they only exist in `<diagram-loader>`. |
| 5 | Load action is a **complete reload and replacement**: clears that viewer's localStorage snapshot, derives `base-path` from the manifest URL (strip trailing filename), fetches, calls `loadData()`. No UI state is preserved across a load. |

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section                                              | Sudocode entity |
| --------------------------------------------------------- | --------------- |
| Spec — overall feature                                    | spec `s-5flv`   |
| Implementation rollup (epic)                              | issue `i-81oe`  |
| Task 1 — Public API additions on `<diagram-viewer>`       | issue `i-47na`  |
| Task 2 — Implement `<diagram-loader>` webcomponent        | issue `i-34cx`  |
| Task 3 — Wire loader into the build pipeline              | issue `i-2wk6`  |
| Task 4 — Remove JSON + Reset from `<diagram-nav-tree>`    | issue `i-67oy`  |
| Task 5 — Update demo HTML                                 | issue `i-6li9`  |
| Task 6 — Playwright Go tests                              | issue `i-1cw2`  |
| Task 7 — Documentation update                             | issue `i-6wel`  |

Linear `blocks` chain: `i-47na` → `i-34cx` → `i-2wk6` → `i-67oy` → `i-6li9` → `i-1cw2` → `i-6wel` → `i-81oe`. Run `sudocode ready` to find the next unblocked task. Task 7 (`i-6wel`) provides summary implementation feedback to `s-5flv` once closed.

## Tasks

### 1. Public API additions on `<diagram-viewer>`

- [x] Add `loadFromUrl(url)` public method that:
  - Resolves `url` against `document.baseURI` (so a relative path works);
  - Clears `localStorage[storageKey]` for this instance;
  - Derives a new `base-path` by stripping the trailing path segment from the resolved URL;
  - Updates `base-path` attribute and `manifest` attribute (for reflection);
  - Fetches the URL, parses JSON, calls `loadData(data)`;
  - On fetch/parse error, surfaces the existing `#showManifestError` UI.
- [x] Add `openJsonDialog()` public method that opens the existing JSON snapshot dialog (extracted from the current `json-open` listener body so both the loader and any internal trigger can call it).
- [x] Refactor the existing internal `json-open` listener to call `openJsonDialog()` so behaviour is preserved.
- [x] Keep the existing `reset()` public method unchanged — the loader will call it directly.

### 2. New component `<diagram-loader>`

- [x] Create `src/diagram-loader.js` defining `class DiagramLoader extends HTMLElement` registered as `diagram-loader`.
- [x] Observed attributes: `for`, `placeholder`, `value`.
- [x] Shadow DOM with adopted stylesheet; render a single row containing:
  - `<input type="text" class="path">` (default placeholder: `path/to/manifest.json`);
  - `<button class="load">Load</button>`;
  - `<button class="json">JSON</button>`;
  - `<button class="reset">Reset</button>`.
- [x] Resolve target viewer lazily (per click) via `document.querySelector(this.getAttribute('for'))`. On no match: log a warning to console and no-op.
- [x] **Load** click handler: read `input.value`, call `target.loadFromUrl(value)`. Empty input is a no-op with a brief inline error hint.
- [x] **JSON** click handler: call `target.openJsonDialog()`.
- [x] **Reset** click handler: call `target.reset()` and clear the input.
- [x] Pressing `Enter` inside the input triggers Load.
- [x] Style the buttons to match existing footer-text-btn / zoom-btn aesthetic from `src/styles.css` (small text buttons, rounded, neutral border) so the loader looks of-a-piece with the viewer.
- [x] Export `DiagramLoader` and self-register via `customElements.define` with the same "skip if already registered" guard pattern used in `diagram-viewer.js`.

### 3. Wire the loader into the build

- [x] Add `import './diagram-loader.js';` at the top of `src/diagram-viewer.js` so the existing single-bundle output (`dist/diagram-viewer.js`) auto-registers both elements.
- [x] Confirm `task build` produces a working `dist/diagram-viewer.js` and no new entry is needed.

### 4. Remove JSON + Reset from `<diagram-nav-tree>`

- [x] In `src/diagram-nav-tree.js`, delete the `<button class="footer-text-btn json-btn">` and `<button class="footer-text-btn reset-btn">` markup from the `.sidebar-footer` template.
- [x] Delete the click listeners that dispatched `json-open` and `reset` CustomEvents from this component.
- [x] In `src/diagram-viewer.js`, delete the `this.#navTree.addEventListener('json-open', …)` and `this.#navTree.addEventListener('reset', …)` listeners (now unused).
- [x] Update the JSDoc "Events emitted" comment in `diagram-nav-tree.js` to drop `json-open` and `reset`.
- [x] Leave all CSS for `.footer-text-btn` if other things use it; otherwise remove it. Verify with a grep.

### 5. Update demo HTML

- [x] In `index.html`, add `<diagram-loader for="#viewer">` (give the viewer an `id="viewer"`) above the existing viewer; verify both render side-by-side as siblings.
- [x] In `examples/multi.html`, add one `<diagram-loader>` per viewer (`for="#left"`, `for="#right"`), positioned above each panel's viewer.
- [x] Keep the existing inline `<script type="module">` that does the initial `fetch` + `loadData` for backward compatibility in `index.html`; the loader is for *changing* the manifest after initial load.

### 6. Playwright Go tests

- [x] Create `tests/diagram_loader_test.go` with the scenarios listed under "Failing → Passing criteria" above.
  - `TestLoader_RendersAlongsideViewer`
  - `TestLoader_LoadButtonReplacesManifest`
  - `TestLoader_JsonButtonOpensDialog`
  - `TestLoader_ResetClearsState`
  - `TestLoader_ForSelectorTargetsCorrectViewer` (multi-instance)
  - `TestLoader_NoMatchingTargetIsNoOp` (negative path)
- [x] Update `tests/diagram_nav_tree_test.go` to assert the sidebar footer no longer contains `JSON` or `Reset` buttons (replace any existing positive assertion).
- [x] Update `tests/diagram_viewer_test.go` to remove or migrate any test that relied on the now-removed sidebar `JSON` / `Reset` buttons. Keep coverage of the dialog itself by exercising it via `openJsonDialog()` or via the loader.
- [x] Run `task test` and confirm all four existing files plus the new `diagram_loader_test.go` pass.

### 7. Documentation

- [x] Update `README.md` to document `<diagram-loader>`: the `for` attribute, the input/Load/JSON/Reset buttons, and that JSON/Reset have moved out of the sidebar.
- [x] Add a short note in the multi-instance section that each viewer can have its own loader.

## Notes

- `base-path` derivation rule: `loadFromUrl('examples/kubernetes/manifest.json')` → `base-path = 'examples/kubernetes'`. URLs ending with `/` keep the full path. Fully-qualified `https://…` URLs are honoured.
- The loader does **not** observe the input value as an attribute live-update; the user has to press Load (or Enter). Setting the `value` attribute pre-fills the input on connect.
- Cross-shadow-DOM safety: the loader calls public methods on the viewer rather than dispatching CustomEvents, so there is no event-bubbling subtlety across hosts.
- Existing closed issue `i-8g8k` placed JSON/Reset in the sidebar footer; this work reverses that placement. New spec explicitly notes the reversal and references `i-8g8k` as `discovered-from`.
- No keyboard shortcut changes — the existing `?`, `0`, `+`, `-`, arrow keys all stay scoped to the viewer host. Loader keys (Enter in input) stay inside the loader.
- Out of scope: file upload, drag-and-drop, manifest validation beyond the existing v0-shape check in `loadData`, persisting the loader's input value in localStorage.

## Discovered Tasks

_(none yet)_
