# TODO

## Goal

Always re-fetch `manifest.json` on viewer load when a `manifest` attribute is present, instead of restoring a stale manifest from localStorage. Merge only UI state (zoom, sidebar, current slide id) from localStorage, discarding any conflicting state. Errors fetching the manifest must surface as today — no silent fallback to a cached manifest.

## Tasks

### 1. Always fetch manifest when `manifest` attribute is set

- [x] In `src/diagram-viewer.js` `connectedCallback()` (around line 124–127), change the load order: if `this.hasAttribute("manifest")` is true, call `this.#loadManifest()` unconditionally; only fall back to `this.#loadFromStorage()` (and then `#loadManifest()`) when no `manifest` attribute is present.
- [x] Do not catch fetch errors and silently restore from storage — `#loadManifest()` continues to call `#showManifestError()` on failure. Verify this path is unchanged.

### 2. Restrict localStorage merge to UI state only

- [x] In `src/diagram-viewer.js` `loadData()` (around line 296–308), confirm the existing snapshot read only consumes `snapshot.ui` and ignores `snapshot.manifest` and `snapshot.basePath`. Add a code comment stating "only UI state is merged from storage when a manifest is fetched; manifest and basePath are ignored to avoid stale state".
- [x] Confirm `loadData()` discards `preservedUi.currentSlideId` when the id is not found in the freshly built `#flatSlides` (already handled around line 337–344 — verify and add a brief comment "discard local currentSlideId on conflict").
- [x] Leave `#loadFromStorage()` behavior untouched for the no-`manifest`-attribute case (JSON-paste / programmatic `loadData()`), since it is the only recovery path on reload.

### 3. Persist on every successful fetch

- [x] Verify `loadData()` calls `this.#persist()` at the end (line 350) so the freshly-fetched manifest replaces any stale one in localStorage. No code change expected — just a confirming check.

### 4. Add Playwright test for stale-manifest bug

- [x] Create fixture `tests/fixtures/manifest_refresh/` with two manifest files: `manifest.v1.json` (one slide, e.g. `id: "a"`) and `manifest.v2.json` (different slide set, e.g. `id: "b"` only — no `id: "a"`), plus `index.html` mounting `<diagram-viewer manifest="manifest.json" sidebar bookmarkable>`.
- [x] Add `tests/diagram_manifest_refresh_test.go` that:
  - serves the fixture; symlinks/copies `manifest.v1.json` → `manifest.json`,
  - loads the page, navigates to slide `a`, adjusts zoom (e.g. to 200%) so UI state is non-default,
  - waits for localStorage write,
  - swaps `manifest.json` to point at `manifest.v2.json` content,
  - reloads the page,
  - asserts the nav tree contains slide `b` (proof v2 was fetched) and does **not** contain `a`,
  - asserts zoom level is still 200% (proof UI state was merged from storage),
  - asserts the displayed slide is `b` (not the discarded `a` from storage).

### 5. Add Playwright test for fetch-failure surfacing

- [x] Add `tests/diagram_manifest_fetch_error_test.go` that:
  - serves a fixture that successfully loads `manifest.json` once (writing localStorage),
  - reloads the page with the server returning 500 (or an unreachable URL) for `manifest.json`,
  - asserts the manifest-error UI is visible and that the cached manifest from storage is **not** rendered (nav tree empty / error shown).

### 6. Update documentation

- [x] In `README.md`, add a short "Persistence" subsection (or extend an existing one) stating: when a `manifest` attribute is set, the file is fetched on every load; only UI state (zoom, sidebar open/width, current slide) is restored from localStorage; conflicting state (e.g. a current slide that no longer exists) is discarded; manifest and base-path are never restored from storage.

## Notes

- **Why this is the bug** — `connectedCallback()` calls `#loadFromStorage()` first and short-circuits the fetch. Edits to `manifest.json` are invisible to any browser that has previously loaded the viewer until the user clicks Reset or clears storage.
- **Conflict policy** — local state always loses on conflict with the freshly fetched manifest. Currently the only field that can conflict is `currentSlideId` (an id may have been removed). Zoom, sidebar open/width are scalar UI prefs with no conflict semantics.
- **No-manifest-attribute path preserved** — when the viewer is populated via JSON paste or programmatic `loadData()`, there is no source to re-fetch from, so `#loadFromStorage()` remains the sole recovery path on reload. This keeps the existing UX for that case.
- **No silent fallback** — fetch failures continue to render the existing manifest-error UI; we deliberately do not fall back to a cached manifest, per the user's "don't silently hide errors" decision.
