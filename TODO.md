# TODO

## Goal

Bundle the diagram-viewer into a single ESM `dist/diagram-viewer.js` (no separate CSS file) using the exact pattern from sibling `story-mapper`: each component's shadow CSS lives in a `.css` file, imported as text via esbuild `--loader:.css=text`, wrapped once per component in a module-scoped lazy shared `CSSStyleSheet`, and adopted into each instance's shadow root via `adoptedStyleSheets`. Page-level styles (current `src/styles.css`) move out of the library and into the example pages where they belong. Consumers can then load the viewer with one `<script type="module" src="...jsdelivr/gh/...">` tag.

## Tasks

### 1. Externalise per-component shadow CSS

- [x] `src/diagram-canvas.js` — move the `const styles = \`...\`` template literal into `src/diagram-canvas.css` and replace it with `import styles from "./diagram-canvas.css";`.
- [x] `src/diagram-help-modal.js` — same treatment → `src/diagram-help-modal.css`.
- [x] `src/diagram-loader.js` — same treatment → `src/diagram-loader.css`.
- [x] `src/diagram-nav-tree.js` — same treatment → `src/diagram-nav-tree.css`.
- [x] `src/diagram-viewer.js` — same treatment → `src/diagram-viewer.css` (this is the component's own shadow CSS, not the page-level `styles.css`).

### 2. Adopt story-mapper's lazy shared-sheet pattern

- [x] In each component module, replace the per-instance `#sheet = new CSSStyleSheet()` field with a module-scoped `let _sharedSheet = null;` plus a `getSharedSheet()` helper that lazily constructs the sheet once and calls `replaceSync(styles)`. Mirror story-mapper/src/story-map.js (lines 14–21) verbatim in shape.
- [x] In each component's `constructor` (after `attachShadow`), set `this.shadowRoot.adoptedStyleSheets = [getSharedSheet()];` — one shared sheet reference shared across all instances of that component.
- [x] Apply to all five components: `diagram-canvas`, `diagram-help-modal`, `diagram-loader`, `diagram-nav-tree`, `diagram-viewer`. (`diagram-viewer` already uses a `static #styles` shared sheet — convert to the module-scoped lazy `getSharedSheet()` form for consistency with the others.)
- [x] Confirm no component mutates its sheet at runtime; if any does, keep a per-instance sheet there and add a code comment explaining why.

### 3. Remove page-level `src/styles.css` from the library

- [x] Confirm `src/diagram-viewer.js` does not import `./styles.css` (it currently doesn't).
- [x] Delete `src/styles.css`.

### 4. Update the build pipeline

- [x] Replace both `Taskfile.yaml` `build` commands with one: `go tool esbuild src/diagram-viewer.js --bundle --format=esm --target=es2022 --loader:.css=text --outfile=dist/diagram-viewer.js`.
- [x] Replace both `dev` watch commands with the same single command plus `--watch`.
- [x] Leave `task clean` unchanged (`rm -rf dist/`).

### 5. Move page-level styles into example pages

- [x] In `index.html`, drop `<link rel="stylesheet" href="dist/diagram-viewer.css">` and add an inline `<style>` block with the rules from the deleted `src/styles.css` (`*, *::before, *::after { box-sizing: border-box }`, `html, body { height:100%; margin:0; padding:0 }`, `body { font-family: system-ui, ... }`, `diagram-viewer { display:block; height:100vh; width:100% }`).
- [x] In `examples/multi.html`, drop `<link rel="stylesheet" href="../dist/diagram-viewer.css">` and add the equivalent inline `<style>` block (adjusted for any layout-specific overrides multi.html needs).

### 6. Update tests

- [x] Inspect `tests/diagram_viewer_multi_test.go` (lines 500, 569 reference `dist/diagram-viewer.js`); confirm no `dist/diagram-viewer.css` references remain and remove any that do.
- [x] Run `task test` — all Playwright tests must pass with the bundled module providing every shadow style and the example pages providing page-level layout.

### 7. Verify end-to-end

- [x] `task build` produces only `dist/diagram-viewer.js` (no `.css`).
- [x] `task serve` and visual check: `index.html` and `examples/multi.html` render identically to before.
- [x] Multi-instance check via `examples/multi.html`: both viewers render with full styling, hash sync still works, and a `document.querySelectorAll('diagram-canvas').length`-style spot check confirms each component's shadow root references the same `CSSStyleSheet` object (lazy shared-sheet pattern proven).

### 8. Document CDN usage

- [x] Add a "Use via CDN (jsdelivr)" section to `README.md` showing a one-liner: `<script type="module" src="https://cdn.jsdelivr.net/gh/metafeather-org/diagram-viewer@<tag>/dist/diagram-viewer.js"></script>` plus minimal `<diagram-viewer>` / `<diagram-loader>` markup.
- [x] State that no CSS link is required — all component styles are bundled and adopted into shadow roots.
- [x] Recommend pinning to a tag (e.g. `@v0.1.0`) over `@main` for production.
- [x] Note that the consumer owns page-level layout (e.g. giving `<diagram-viewer>` a height); link to the inline `<style>` block in `index.html` as a copy-paste starter.

## Notes

- **Pattern parity with story-mapper** — `--loader:.css=text`, `import styles from "./*.css"`, module-scoped lazy `getSharedSheet()`, and `adoptedStyleSheets = [sheet]` per shadow root. One sheet object per component class, shared across all instances of that component.
- **`replaceSync` requires the import to be a string** — esbuild's `text` loader provides exactly that, identical to story-mapper.
- **Library no longer ships page styles** — small breaking change for any downstream that relied on `dist/diagram-viewer.css`. Documented in README.
- **No `package.json`** — per decision, jsdelivr GitHub URLs (`cdn.jsdelivr.net/gh/owner/repo@tag/...`) are sufficient.
