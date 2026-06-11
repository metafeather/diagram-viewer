# TODO — Fix sticky manifest-error UI on recovery

## Goal

When `<diagram-viewer>` shows the "Failed to load manifest" overlay (after a bad path), a subsequent successful `loadFromUrl()` (or `loadData()`) call must clear the error, show the canvas, and reopen the sidebar — currently the error stays painted, the canvas remains `display:none`, and the sidebar stays collapsed.

## Failing → Passing criterion

A new Playwright test `TestLoader_RecoversFromBadPath` (added to `tests/diagram_loader_test.go`) that:

1. Loads `index.html`, clears localStorage.
2. Types `examples/kubernetes/manifest.json2` (deliberately broken) into the loader, clicks **Load**.
3. Asserts the viewer's shadow DOM contains a `.error` div with text "Failed to load manifest".
4. Types `examples/kubernetes/manifest.json` (correct path), clicks **Load**.
5. Asserts: no `.error` div remains in the viewer; `<diagram-canvas>` is visible (no `display:none`); the sidebar is open (no `sidebar-collapsed` class); the nav tree contains expected kubernetes items.

Pre-fix this test FAILS at step 5 — error overlay persists, canvas stays hidden, sidebar stays collapsed. Post-fix it PASSES.

## Root cause (verified)

In `src/diagram-viewer.js`:

- `#showManifestError()` (line ~990) **appends** a new `<div class="error">` to `this.#container` with no de-duplication; sets `this.#canvas.style.display = 'none'`; and adds `sidebar-collapsed` to `this.#container`.
- Neither `loadFromUrl()` nor `loadData()` undoes any of those mutations on a subsequent successful load.
- `loadFromUrl()` clears localStorage before fetching, so when `loadData()` runs on the recovery path it has no preserved UI snapshot — and `loadData()`'s sidebar-restore branch only fires when `preservedUi` is truthy, leaving the sidebar collapsed.

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section                                          | Sudocode entity |
| ----------------------------------------------------- | --------------- |
| Spec — bugfix                                         | spec `s-6em7`   |
| Implementation rollup (epic)                          | issue `i-9zhy`  |
| Task 1 — `#clearManifestError()` helper + call sites  | issue `i-9ugh`  |
| Task 2 — Regression test (leaf, feedback to spec)     | issue `i-6j1p`  |

Linear `blocks` chain: `i-9ugh` → `i-6j1p` → `i-9zhy`. Run `sudocode ready` to find the next unblocked task. Task 2 (`i-6j1p`) provides summary implementation feedback to `s-6em7` once closed.

## Tasks

### 1. Add `#clearManifestError()` and wire call sites

- [x] In `src/diagram-viewer.js`, add a new private method `#clearManifestError()` that:
  - Removes every `.error` element appended to `this.#container` (use `this.#container.querySelectorAll(':scope > .error')` and remove each — scope to direct children to avoid collateral damage if `.error` is ever used elsewhere inside subcomponents).
  - Restores `this.#canvas.style.display = ''` (only if it is currently `'none'`).
  - Removes the `sidebar-collapsed` class from `this.#container` so the recovered UI is fully usable per user direction.
- [x] Call `this.#clearManifestError()` at the start of `loadData(data)`, BEFORE any other mutation. This is the single recovery checkpoint — both `loadFromUrl()` (which calls `loadData()` on success) and direct external `loadData(data)` calls benefit.
- [x] Call `this.#clearManifestError()` at the top of `#showManifestError()` BEFORE appending the new error node, so consecutive failures do not stack overlay nodes (idempotency).
- [x] Verify by hand on `index.html`:
  - bad path → error appears;
  - bad path again → only ONE error node in shadow DOM (not two);
  - good path → error gone, canvas visible, sidebar open, kubernetes nav tree populated.

### 2. Regression test

- [x] Add `TestLoader_RecoversFromBadPath` to `tests/diagram_loader_test.go` per the Failing → Passing criterion above.
- [x] Add `TestLoader_RepeatedFailuresDoNotStack` to the same file:
  - Type bad path, click Load — count `.error` direct-child divs in `#container` shadow DOM === 1.
  - Type another bad path, click Load — count is still === 1.
- [x] Run `task test` and confirm the entire suite passes. Verify pre-fix the new tests FAIL on the current code (red) and post-fix PASS (green) — record the red run in the issue's closing feedback.

## Notes

- Restoring sidebar-open on recovery is per user direction (option 1 from the clarifying question). The error UI's *initial* sidebar collapse stays as-is — only the recovery clears it.
- `#clearManifestError()` does not touch localStorage — `loadFromUrl()` already clears that explicitly before fetching, and `loadData()` rebuilds state from the `data` argument.
- No public API change. `loadFromUrl()`, `loadData()`, `reset()`, `openJsonDialog()` signatures all unchanged.
- This bug existed before the loader work but was masked because pre-loader the only failure path was the initial attribute-driven `#loadManifest()` which had no recovery vector. The loader makes recovery a first-class flow, exposing the bug.

## Discovered Tasks

### Stale prior-workflow issue statuses

While verifying the new bug-fix workflow, the prior `s-5flv` workflow's issues are mostly still `open`/`blocked` even though the user has confirmed *"the spec has been implemented"* (and commits `df02979` … `1cf46e4` cover all 8 entities). Only `i-6wel` was actually closed. Current state:

| Issue   | Status     | Should be |
| ------- | ---------- | --------- |
| i-47na  | open       | closed    |
| i-34cx  | blocked    | closed    |
| i-2wk6  | blocked    | closed    |
| i-67oy  | blocked    | closed    |
| i-6li9  | blocked    | closed    |
| i-1cw2  | blocked    | closed    |
| i-6wel  | closed     | (already) |
| i-81oe  | blocked    | closed    |

Effect: `sudocode ready` returns `i-47na` alongside this bug-fix's foundation `i-9ugh`, which would confuse a workflow runner. Also the spec `s-5flv` has no closing feedback.

Recommended cleanup (purely sudocode bookkeeping, no code touched):
- [ ] Close `i-47na`, `i-34cx`, `i-2wk6`, `i-67oy`, `i-6li9`, `i-1cw2`, `i-81oe` with a brief reason citing the implementation commits.
- [ ] Add summary feedback to `s-5flv` documenting what shipped (the `<diagram-loader>` component, public APIs, sidebar-button removal, demos, tests, README updates).

This is sudocode bookkeeping only and is *not* the bug-fix work — flagged here per the workflow rules. Awaiting approval before acting on it.
