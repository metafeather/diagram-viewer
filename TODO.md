# TODO — Keyboard regression: restore keyboard after sidebar click

## Goal

Fix the regression where `<diagram-viewer>` stops responding to keyboard shortcuts after the user clicks a slide link in the sidebar. Keep the visual fix from issue `i-a68b` (no persistent `:focus-visible` blue outline on the clicked nav-item) without sacrificing keyboard navigation.

## Failing → Passing criterion

A new Playwright test that:
1. Loads `index.html` (single instance).
2. Clicks the `etcd` link in the sidebar.
3. Presses `ArrowDown`.
4. Asserts the active slide advanced.

Pre-fix this test FAILS — `link.blur()` returns focus to `<body>`, the host's `keydown` listener never fires. Post-fix it PASSES — focus moves to the host element, the listener fires, and the clicked nav item still shows no `:focus-visible` outline.

## Root cause (verified)

`src/diagram-nav-tree.js:467` calls `link.blur()` after dispatching `slide-select`. Originally added in issue `i-a68b` to prevent a `:focus-visible` blue outline appearing on the clicked link when the user subsequently presses an arrow key (browsers promote mouse-`:focus` → `:focus-visible` on the next keypress). The blur returns focus to `<body>` — outside the viewer's host element — so the host-scoped capture-phase `keydown` listener added in spec `s-7ubt` Task 4 never fires for any subsequent key.

The right fix is to *move* focus to the `<diagram-viewer>` host (already `tabindex="-1"` with no `:focus-visible` outline), not to *remove* focus. This re-arms the keyboard listener AND prevents the link from being focusable enough for `:focus-visible` to apply.

Auto-focus on page load is explicitly NOT in scope — keyboard activation requires a click inside the viewer first (single- or multi-instance).

## Sudocode mapping

This plan is recorded in sudocode. Implementation status of record lives there.

| TODO section                                         | Sudocode entity                  |
| ---------------------------------------------------- | -------------------------------- |
| Overall keyboard regression fix                      | spec `s-79cq`                    |
| Implementation rollup (epic)                         | issue `i-216o`                   |
| Task 1 — Replace `link.blur()` with host-focus shift | issue `i-57mv`                   |
| Task 2 — Regression tests (leaf)                     | issue `i-4uiq`                   |

Linear `blocks` chain: `i-57mv` → `i-4uiq` → `i-216o`. Run `sudocode ready` to find the next unblocked task. Task 2 (`i-4uiq`) provides summary implementation feedback to `s-79cq` once closed (feedback anchor already attached).

## Tasks

### 1. Replace `link.blur()` with host-focus shift

- [x] In `src/diagram-nav-tree.js` `#createNavItem`, remove the `link.blur();` call after the `slide-select` dispatch.
- [x] In `src/diagram-viewer.js` `#initEventListeners`, add `this.focus({ preventScroll: true });` at the end of the existing `slide-select` listener (after `this.#navigateToId(...)`). This shifts focus from the clicked link to the viewer host, which:
  - has `tabindex="-1"` so `.focus()` works
  - has no `:focus-visible` outline rule, so it is visually invisible
  - is in the keydown event path, so subsequent key presses fire `#handleKeyDown`
- [x] Verify on the Kubernetes fixture: click `etcd` in the sidebar — no blue outline anywhere on `etcd`; press `ArrowDown` — slide advances to the next item; press `ArrowUp` — returns to `etcd`. Confirm the active highlight (`.active` background) on the current slide is the only visual indicator of "where you are".
- [x] Verify the iframe-keydown re-dispatch path in `<diagram-canvas>` is unaffected — clicking inside the iframe content still gives the iframe focus and forwards keys via the existing `iframe-keydown` CustomEvent.
- [x] Verify multi-instance isolation is preserved — clicking `etcd` in left viewer focuses the LEFT host; pressing `ArrowDown` advances ONLY the left viewer; right viewer's slide and zoom remain unchanged.

### 2. Regression tests

- [x] In `tests/diagram_viewer_test.go` (or a new file `tests/diagram_viewer_keyboard_test.go`), add `TestViewer_KeyboardWorksAfterSidebarClick`:
  - load `index.html`, clear localStorage, load the Kubernetes fixture
  - click the `etcd` nav link via shadow-DOM piercing JS
  - read the current active slide id; assert it is `etcd`
  - call `page.Keyboard().Press("ArrowDown")`
  - read the new active slide id; assert it differs from `etcd` (slide advanced)
- [x] Add `TestViewer_NoFocusVisibleOnClickedNavAfterArrow` (or extend the existing `TestCanvas_NavClickThenArrowDownNoFocusVisible`) to confirm the previously-clicked link does NOT match `:focus-visible` after the ArrowDown — guards the original `i-a68b` visual fix.
- [x] In `tests/diagram_viewer_multi_test.go`, add `TestMulti_KeyboardWorksAfterSidebarClickInOneInstance`:
  - load `examples/multi.html`
  - click a nav link in the left viewer (no explicit `.focus()` JS call — the click alone must arm the keyboard)
  - press `ArrowDown`
  - assert left viewer's active slide changed and right viewer's did NOT
- [x] Run `task test` and confirm all four test files (canvas, nav-tree, viewer, multi) still pass; the new tests pass on the post-fix code and FAIL on the pre-fix code (verify the failure mode pre-fix as part of recording so the red→green is provable).

## Notes

- Auto-focus on page load is intentionally OUT OF SCOPE per user direction — keyboard requires an in-viewer click first. Single- and multi-instance behave the same.
- Sidebar non-link buttons (zoom `+`/`−`/`⊡`, JSON, Reset, help `?`) already keep focus on themselves on click and therefore already keep keyboard alive — no change needed for those.
- Iframe content clicks already focus the iframe document, and the existing `iframe-keydown` re-dispatch handler in `<diagram-canvas>` already forwards keys to the host — no change needed there.
- The `:host(:focus-within)` outline rule on the viewer remains as-is. Focus on the host itself shows no outline, which is the desired silent re-armament behaviour.
- This is a regression fix for `s-7ubt` Task 4 + `i-a68b` Task 8 interaction. New spec follows the `s-448f` → `s-8sat` precedent of "regression discovered after parent spec closed".

## Discovered Tasks

_(none yet)_
