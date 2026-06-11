# TODO — Multi-instance encapsulation for `<diagram-viewer>`

## Goal

Allow more than one `<diagram-viewer>` on the same page, each loadable, navigable, zoomable, and resettable independently — with no shared localStorage state, no URL-hash collisions, no document-level keyboard cross-talk, and no leaked styles or globals.

## Failing → Passing criterion

A new `examples/multi.html` page with two viewers (same manifest, different `start-at`) and a new Playwright suite that exercises independence. Before the fix the suite must FAIL on at least: shared localStorage, hash collisions, keyboard cross-talk. After the fix every test passes.

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section                                         | Sudocode entity                  |
| ---------------------------------------------------- | -------------------------------- |
| Overall multi-instance encapsulation                 | spec `s-7ubt`                    |
| Implementation rollup (epic)                         | issue `i-9tby`                   |
| Task 1 — Per-instance identity                       | issue `i-20ih`                   |
| Task 2 — Namespaced localStorage + reset isolation   | issue `i-139y`                   |
| Task 3 — Opt-in `bookmarkable` URL hash              | issue `i-5zjh`                   |
| Task 4 — Scope keyboard to `:focus-within`           | issue `i-6r8b`                   |
| Task 5 — Eliminate residual global escapes           | issue `i-7is1`                   |
| Task 6 — Multi-instance demo (`examples/multi.html`) | issue `i-6xqh`                   |
| Task 7 — Multi-instance Playwright tests (leaf)      | issue `i-2ess`                   |

Linear `blocks` chain: `i-20ih` → `i-139y` → `i-5zjh` → `i-6r8b` → `i-7is1` → `i-6xqh` → `i-2ess` → `i-9tby`. Run `sudocode ready` to find the next unblocked task. Task 7 (`i-2ess`) provides summary implementation feedback to `s-7ubt` once closed (feedback anchor already attached).

## Tasks

### 1. Per-instance identity (`#instanceId`)

- [x] In `src/diagram-viewer.js`, add a private `#instanceId` resolved once during `connectedCallback` BEFORE `#loadFromStorage`:
  - if `this.id` (the HTML `id` attribute) is non-empty → use it verbatim
  - else → derive a stable string from `manifest` attribute + `base-path` attribute via a small synchronous FNV-1a 32-bit hash returned as 8-char hex
  - else (no manifest, no base-path) → `crypto.randomUUID()` (non-persistent fallback)
- [x] Expose the resolved id on the host as a read-only attribute `data-instance-id` for debuggability.
- [x] All subsequent code that today references the module-level `STORAGE_KEY` constant must read `this.#storageKey()` which returns `` `diagramViewer.v1:${this.#instanceId}` ``.

### 2. Namespaced localStorage + reset isolation

- [x] Replace the module-level constant `STORAGE_KEY = 'diagramViewer.v1'` with a private `#storageKey()` method on the class that returns `` `diagramViewer.v1:${this.#instanceId}` ``.
- [x] Update every read/write site to call `#storageKey()` instead: `#loadFromStorage`, `#persist`, `loadData` (the "preserve UI state" fetch), and `reset` (the `removeItem`).
- [x] `reset()` removes ONLY this instance's key — never `localStorage.clear()` and never any other viewer's key.
- [x] On startup, if a legacy unnamespaced key (`diagramViewer.v1`) is present AND this is the only instance on the page AND no namespaced key for this instance exists, migrate it once: read it, write it back under the namespaced key, delete the legacy key. (Single-instance back-compat — skip migration when more than one viewer is present so a stale legacy key never gets adopted by an arbitrary viewer.)

### 3. Opt-in URL hash via `bookmarkable` (+ `primary` for tie-break)

- [x] Add two new boolean attributes: `bookmarkable` (default OFF) and `primary` (default OFF, only meaningful when `bookmarkable`).
- [x] Add a private `#ownsHash()` helper that returns `true` only when this instance is `bookmarkable` AND (no other `bookmarkable` viewer exists in the document, OR this is the one with `primary`). Resolve once on connect; re-resolve when the attribute changes.
- [x] Gate every hash interaction on `#ownsHash()`:
  - the `globalThis.addEventListener('hashchange', …)` registration in `#initEventListeners`
  - the `history.replaceState(null, '', newHash)` write in `#loadSlide`
  - the `history.replaceState(null, '', location.pathname + location.search)` write in `reset()`
  - the `location.hash.slice(1)` reads in `#loadFromHash`, `#loadFromStorage`, `loadData` — when the instance does not own the hash, fall back to storage or `start-at` only
- [x] Add an `aria-live`-free console.warn when more than one `bookmarkable` viewer is present and none has `primary`, to flag the configuration error to the developer.
- [x] When `start-at` is unset and no snapshot exists and the viewer doesn't own the hash, default to the first slide in the flat list (`overview` may not exist in the user's manifest).

### 4. Scope keyboard to `:focus-within` (replace hover)

- [x] Remove the `mouseenter` / `mouseleave` listeners on `#container` and the `#enableKeyboardHandling` / `#disableKeyboardHandling` methods that add/remove a listener on `document`.
- [x] Replace with a single per-instance `keydown` listener attached to the host element (`this`) in capture phase via the existing `AbortController` signal — the host's shadow root focusable controls (the JSON dialog textarea, sidebar buttons, nav-tree links) will all bubble into the host's keydown.
- [x] Make the host focusable: set `tabindex="-1"` programmatically on connect so it can receive focus when the user clicks an iframe link or anywhere inside; add a `:host(:focus-within)` outline rule (or none) for visual parity.
- [x] Re-route the `iframe-keydown` `CustomEvent` from `<diagram-canvas>` through the same handler — the canvas already dispatches a composed event, so ensure `#handleKeyDown` is the single entry point.
- [x] Verify that pressing arrow keys with focus inside instance A only navigates A; pressing the same keys after Tab-ing into instance B only navigates B; pressing them with focus elsewhere navigates neither.

### 5. Eliminate residual global escapes

- [x] In `src/diagram-canvas.js`, replace both `globalThis.focus()` calls in `#setupIframeEventHandlers` with `this.focus({ preventScroll: true })` (the canvas element itself, which lives in this instance's shadow). Falls back to a no-op if not focusable.
- [x] In `src/diagram-viewer.js`, change the `document.addEventListener('mousemove'/'mouseup', …)` listeners in `#initResizeHandle` to attach only when a drag starts (in `mousedown`) and detach in `mouseup` / on `AbortController` abort — avoids N persistent document listeners for N instances even when no one is dragging.
- [x] Audit `dispatchEvent(new CustomEvent(..., { bubbles: true, composed: true }))` calls — confirm `composed: true` is intentional for events the host owner may want to listen to, and document this in the file header. (No code change unless an event should not be composed.)
- [x] Guard every `customElements.define(name, ctor)` call (in `diagram-viewer.js`, `diagram-canvas.js`, `diagram-nav-tree.js`, `diagram-help-modal.js`) with `if (!customElements.get(name)) customElements.define(name, ctor);` — loading the bundle twice (e.g. as both an ES module and a `<script>` tag, or via two host pages in a microfrontend) must NOT throw `NotSupportedError`. If a different constructor is already registered under the same name, log a single `console.warn` naming the conflict and skip re-defining (do not throw).
- [x] Confirm the `static #styles` `CSSStyleSheet` shared via `adoptedStyleSheets` is read-only at runtime (it is — only mutated once in the static initialiser). Add a brief code comment so future changes don't introduce per-instance mutation of the shared sheet.

### 6. Multi-instance demo (`examples/multi.html`)

- [x] Create `examples/multi.html` that mounts two instances side-by-side in a CSS grid:
  - left: `<diagram-viewer id="left" base-path="examples/kubernetes" start-at="overview">` — no `bookmarkable`
  - right: `<diagram-viewer id="right" base-path="examples/kubernetes" start-at="kube-controller-manager" bookmarkable primary>` — owns the hash
  - bootstrap script fetches `examples/kubernetes/manifest.json` once and calls `loadData(data)` on both
- [x] Add a small caption above each viewer naming the instance and noting whether it owns the hash, so the demo is self-documenting.
- [x] Add a link from `index.html` to `examples/multi.html` (a thin "See multi-instance demo" footer line), and a one-line entry in `README.md` under a new `## Multi-instance` section.

### 7. Multi-instance Playwright tests

- [x] Add `tests/diagram_viewer_multi_test.go` with helpers analogous to `main_test.go`'s `navigateToIndex` but pointing at `/examples/multi.html`, and per-instance accessors keyed by `id`.
- [x] Test cases (each must FAIL on the pre-fix codebase and PASS after):
  - [x] **storage isolation** — zoom left to 300 %, zoom right to 50 %, reload page, assert each retains its own zoom (pre-fix: last-writer wins)
  - [x] **slide isolation** — navigate left to `etcd`, navigate right to `kube-scheduler`, assert both DOM states show distinct active items in their nav-trees (pre-fix: hashchange cross-talk forces both to the same slide)
  - [x] **hash ownership** — only the `primary bookmarkable` instance updates `location.hash` when navigating; the other never does
  - [x] **reset scope** — call `reset()` on left, assert right's zoom / slide / sidebar state is unchanged and right's `localStorage` key still exists
  - [x] **keyboard scope** — focus left, press `ArrowDown`, assert only left advanced; tab to right, press `ArrowDown`, assert only right advanced
  - [x] **CSS leak** — assert `getComputedStyle(document.body).fontFamily` is the page default (not the viewer's `system-ui` chain), and that there are no `<style>` elements injected into the light DOM by either viewer
  - [x] **double-define safety** — re-evaluate the bundle a second time in the same page (`page.AddScriptTag` with the built `dist/diagram-viewer.js`) and assert it does NOT throw; assert `customElements.get('diagram-viewer')` still returns the original constructor; assert pre-existing instances still respond to `loadData` and navigation
  - [x] **define-conflict warning** — register a stub element under the name `diagram-viewer` BEFORE loading the bundle (in a fresh page) and assert the bundle logs a single `console.warn` containing the element name and does not throw
- [x] Update `Taskfile.yaml` if needed so `task test` picks up the new file (it should — `go test ./tests/...` already globs).
- [x] Verify all existing single-instance tests still pass unchanged.

## Notes

- Identity precedence is `id` attribute → FNV-1a hash of `(manifest, base-path)` → `crypto.randomUUID()`. The hash path means two instances with identical configuration share storage by default — this is the desired "two windows of the same viewer" semantic; users who want them to diverge must give each an `id`.
- `bookmarkable` is OFF by default. Existing single-instance users who rely on the URL-hash → slide behaviour must add `bookmarkable` to keep it. This is a documented breaking change for v1; called out in `README.md`.
- The `primary` attribute is only meaningful when more than one `bookmarkable` viewer is on the page; with a single bookmarkable viewer it is ignored. With multiple bookmarkable viewers and zero `primary`, none owns the hash and a console warning fires.
- `customElements.define(name, …)` is guarded with `customElements.get(name)` in every component file. Loading the bundle twice is a no-op on the second load; if a DIFFERENT constructor is already registered under the same name, the second load logs `console.warn` and skips redefinition — never throws. This protects users who embed the bundle in microfrontends, hot-reload setups, or pages that import it from more than one URL.
- Fullscreen (`f` key) is a single-document state by browser design — only one element can be fullscreen at a time. Behaviour unchanged: pressing `f` in the focused instance fullscreens that one, exits any other.
- Shadow DOM + `adoptedStyleSheets` already isolate the viewer's CSS from the page; the CSS-leak test in Task 7 is a regression guard, not a fix.

## Discovered Tasks

_(none yet)_

