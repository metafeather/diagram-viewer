# TODO

## Goal

Harden slide-path construction in `<diagram-viewer>` so paths are resolved through the browser's `URL` parser instead of string concatenation, eliminating double-encoding (`%2520`) when the component is served by static site generators (e.g. Hugo) that produce non-trivial `document.baseURI` values. Manifest paths remain raw (unencoded) by schema; resolved slide paths become fully qualified absolute URL strings.

## Tasks

### 1. Validate manifest paths are raw

- [x] In `src/diagram-viewer.js` `loadData()` (around line 218–236), extend the per-layer validation loop to reject any `path` or `overlay` string containing a `%xx` percent-encoded sequence (regex `/%[0-9A-Fa-f]{2}/`). Throw with a message that names the offending field and item id, and states "manifest paths must be raw/unencoded — use a literal space, not %20".
- [x] Apply the same check recursively to `item.children[*].path` and `item.steps[*].path` and `item.overlay` (mirroring the recursion in `#buildFlatSlideList`).

### 2. Resolve slide paths via `URL` constructor

- [x] In `src/diagram-viewer.js` `#buildFlatSlideList()` (lines 769–803), replace every `` `${this.#basePath}/${item.path}` `` and `` `${this.#basePath}/${item.overlay}` `` and `` `${this.#basePath}/${step.path}` `` with a single helper `#resolveSlideUrl(relativePath)` that returns `new URL(relativePath, this.#resolvedBase()).href`.
- [x] Implement `#resolvedBase()` returning a URL string with a guaranteed trailing slash, computed once per `loadData()` call: if `this.#basePath` is empty, use `document.baseURI`; otherwise use `new URL(this.#basePath.endsWith('/') ? this.#basePath : this.#basePath + '/', document.baseURI).href`.
- [x] Cache the resolved base on the instance (e.g. `this.#resolvedBaseUrl`) and reset it whenever `loadData()` or `loadFromUrl()` runs or `base-path` changes.

### 3. Update canvas URL → slide matching

- [x] In `src/diagram-canvas.js` `#resolveUrlToSlide()` (lines 158–170), replace the `decodeURIComponent(url.pathname)` + `indexOf(basePath)` substring logic with a direct comparison: each `slide.path` is now an absolute URL (from task 2), so resolve `href` via `new URL(href, baseUrl).href` and find the slide whose `path` equals that resolved URL. Drop `this.#basePath` from the matching code path entirely.
- [x] Keep the `try/catch` wrapper and `return null` fallback for malformed URLs.
- [x] Remove the now-unused `basePath` setter on `diagram-canvas` if no other code reads it; otherwise leave as a no-op with a comment.

### 4. Audit other path concatenations

- [x] Search `src/` for any remaining `` `${...}/${...}` `` patterns that build URLs (overlay handling in `diagram-canvas.js`, any nav-tree icon paths, etc.) and convert to `new URL()` resolution where the result is used as a network URL. Document any deliberate exceptions in a code comment.
- [x] Confirm `diagram-loader.js` `loadFromUrl()` already uses `new URL(url, document.baseURI).href` (it does — keep as is).

### 5. Add Playwright test for spaces in paths

- [x] Create `tests/fixtures/spaced/` with: a minimal `manifest.json` referencing a slide at `Control Plane/diagram.svg`, the directory `Control Plane/` containing a tiny valid `diagram.svg`, and a host `index.html` that mounts `<diagram-viewer manifest="manifest.json" sidebar bookmarkable>`.
- [x] Add `tests/diagram_spaced_paths_test.go` that:
  - serves the fixture via the existing test server harness (see `main_test.go` for pattern),
  - loads the page in Playwright,
  - clicks the sidebar entry for the spaced-path slide,
  - captures the network request for the SVG via `page.WaitForRequest` (or equivalent in the project's Playwright Go binding),
  - asserts the request URL contains exactly one occurrence of `%20` and zero occurrences of `%2520`.
- [x] Add a second assertion: after navigation, `location.hash` matches the slide id (proves bookmarkable round-trip still works with the new absolute-URL `slide.path`).
- [x] Run `task test` and confirm all existing tests still pass alongside the new one.

### 6. Update documentation

- [x] In `README.md`, add a short "Manifest path rules" subsection stating: paths must be raw/unencoded relative paths (e.g. `"Control Plane/x.svg"`, never `"Control%20Plane/x.svg"`); the component resolves them against `base-path` (or the manifest URL's directory) using the browser's URL parser.
- [x] Note the rationale: avoids double-encoding when served by static site generators that already percent-encode URLs in the surrounding HTML.

## Notes

- **Why the bug surfaces with Hugo** — Hugo can emit a `<base>` tag or canonicalised URLs whose `document.baseURI` already contains `%20`. When `iframe.src = "Control Plane/..."` is set as a relative string, the browser resolves it against that base and in some configurations the `%` in the base survives while the new space is encoded, producing `%2520`. Routing through `new URL(path, base)` ourselves makes resolution deterministic regardless of host environment.
- **Breaking change risk** — `slide.path` shape changes from relative to absolute URL string. Any external consumer of the `slide-change` event detail that parses `slide.path` as a relative path will need to update. Worth a one-line note in README's changelog section if one exists.
- **Schema strictness over tolerance** — per decision, `%xx` in manifest paths is now an error, not silently normalised. This catches author mistakes early.
