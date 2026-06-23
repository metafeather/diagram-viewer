# TODO

## Goal

Harden the diagram-viewer webcomponent and its bundled hosting so that, when embedded in any third-party HTML page, it cannot be coerced (by a malicious manifest URL, pasted JSON, or SVG file) into loading scripts, leaking the host origin, or violating the host's Content Security Policy — and consumers have clear, copy-paste guidance for serving the artifact safely.

## Tasks

### 1. Establish a failing security baseline ✅ recorded as i-6vrt

- [x] Add `tests/security_test.go` with Playwright cases that **must fail against `main`** for each issue we fix:
  1. `loadFromUrl("https://evil.example/manifest.json")` — assert it is rejected before `fetch()` because it is not same-origin / same-base-path as the document.
  2. Manifest with `path: "javascript:alert(1)"` — assert no navigation occurs and an error is surfaced.
  3. Manifest with `path: "https://other.example/x.svg"` — assert it is rejected as cross-origin to the manifest base-path.
  4. Manifest fetch where the response `Content-Type` is `text/html` — assert it is rejected.
  5. Iframe element after slide load — assert it carries `sandbox="allow-same-origin"` (no `allow-scripts`) and `referrerpolicy="no-referrer"`.
- [x] Record each test as red, then green after the corresponding task lands. Capture the run output in the PR description as the "failing → passing" evidence.

### 2. Validate manifest paths against the manifest base-path origin ✅ recorded as i-3qid

- [x] In `src/diagram-viewer.js#loadData`, extend the existing per-layer validation loop to also reject any `path` / `overlay` / `steps[].path` whose **resolved URL** has a different `origin + path-prefix` than the manifest's base-path. Use `new URL(path, base)` and compare `origin` plus `pathname.startsWith(basePathname)`.
- [x] Reject paths whose **scheme is not `http:` or `https:`** after resolution (blocks `javascript:`, `data:`, `blob:`, `file:`, `vbscript:`).
- [x] Throw a `TypeError` from `loadData` with a message identifying the offending field, matching the existing percent-encoding error style.
- [x] Add the same checks to the JSON-paste dialog handler (`src/diagram-viewer.js` ~line 727) so pasted manifests run through the same gate.
- [x] Document the rule in `README.md` under a new "Manifest portability & security" subsection: "manifest.json and all referenced SVGs must live under the same base-path; absolute URLs to other origins are rejected."

### 3. Harden `loadFromUrl` against off-origin manifests ✅ recorded as i-3cw5

- [x] In `src/diagram-viewer.js#loadFromUrl`, after resolving the URL, reject if `resolved.origin !== document.location.origin`. Surface the error via `#showManifestError`.
- [x] When fetching, set `fetch(resolved, { credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } })` so cross-origin redirects and credential leaks are impossible.
- [x] After the fetch, validate `response.headers.get("content-type")` starts with `application/json` (strip parameters); reject otherwise with a clear error.
- [x] Apply an `AbortController` with a 10-second timeout to prevent hangs.
- [x] Apply the same `credentials`/`redirect`/`Accept`/timeout treatment to the `manifest=` attribute fetch path in `#loadManifest` (~line 889).

### 4. Sandbox the iframe ✅ recorded as i-75le

- [x] In `src/diagram-canvas.js#connectedCallback`, set the iframe's attributes at creation:
  - `sandbox="allow-same-origin"` — same origin so the existing `contentDocument` access for SVG measurement and link/keyboard interception keeps working, but **no `allow-scripts`**, blocking any `<script>` smuggled into a malicious SVG.
  - `referrerpolicy="no-referrer"` — host page URL is not leaked when the iframe fetches the SVG.
  - `loading="lazy"` — defensive, no security impact, but standard hygiene.
- [x] Verify D2 sequence-step animations still work: each "step" is a separate SVG file, transitions happen via `iframe.src = step.path`, and the SVGs themselves rely only on inline `<style>` (confirmed in `examples/kubernetes/`). Add a comment in the code citing this assumption so future contributors don't add SMIL/JS-driven animations without revisiting sandbox flags.
- [x] Add a Playwright test that injects a manifest pointing at a fixture SVG containing `<script>alert("pwn")</script>` and asserts the alert never fires (no `dialog` event).

### 5. Stop reaching into iframe DOM with `innerHTML` for raster fallback ✅ recorded as i-5zyd

- [x] In `src/diagram-canvas.js#renderImage` (~line 396), replace the `iframeDoc.body.innerHTML = ""` + `createElement("img")` flow with a fully programmatic build (no `innerHTML` write) so the function is robust under sandbox and against future CSP `unsafe-inline` removal in the host page. The current `createElement` part is fine; only the `innerHTML = ""` clear needs replacing with `replaceChildren()`.
- [x] Audit the remaining `innerHTML` usages in `src/*.js` (loader, help-modal, nav-tree, viewer): keep them only where the right-hand side is a **static template literal with no interpolated user data**. Add a `// safe: static template` comment on each retained occurrence. Replace any interpolating one with `textContent` / DOM construction.

### 6. Ship a hardened sample Caddyfile and document required headers ✅ recorded as i-98ix

- [x] Replace the dev `Caddyfile` with a two-block config: a `dev` snippet (current behaviour) and a commented `# production` block that sets:
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'` — note: `'unsafe-inline'` for `style-src` is required because the component injects `<style>` into shadow roots and into the iframe's document; document this trade-off.
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Permissions-Policy: interest-cohort=(), browsing-topics=()`
  - Drop the wildcard `Access-Control-Allow-Origin: *` — manifests and SVGs are designed to be served from the same origin as the host page (per the same-base-path rule from task 2), so CORS is not needed.
- [x] Add a new `docs/HOSTING.md` (or a section in `README.md`) titled "Hosting requirements" that lists the headers above as a checklist, explains the rationale per header, and shows snippets for: Caddy, nginx, Apache, S3 + CloudFront response-headers policy, and GitHub Pages (note the limitation that GH Pages cannot set custom headers and recommend a CDN in front).

### 7. Document and provide SRI for the CDN script ✅ recorded as s-7yvv (sub-spec of s-8f0w)

- [x] Update `README.md`'s "Use via CDN (jsdelivr)" section to show the `<script>` tag with `integrity="sha384-…"` and `crossorigin="anonymous"`, with a placeholder hash and instructions: "Replace with the hash printed by `task release-hashes` for the version you pinned."
- [x] Add a `release-hashes` task to `Taskfile.yaml` that runs after the esbuild step and computes `sha384` and `sha256` SRI digests of `dist/diagram-viewer.js`, printing them in the form `sha384-<base64>` ready to paste.
- [x] Update the GitHub release workflow (or document the manual release process if no workflow exists yet) so each release's notes include the SRI hash for that tagged build. If no release workflow exists, add a `RELEASE.md` describing the manual steps including the SRI publish step.
- [x] Add a verification step to `release-hashes` that re-fetches `https://cdn.jsdelivr.net/gh/metafeather/diagram-viewer@<tag>/dist/diagram-viewer.js` and confirms the served file matches the local SRI before printing — fail loudly if not, since a mismatch means consumers using the documented hash would be blocked by the browser.

### 8. Add a `<meta>` CSP to the bundled example pages ✅ recorded as i-5yw9

- [x] Add a `<meta http-equiv="Content-Security-Policy" content="…">` tag to `index.html` and `examples/multi.html` mirroring the production Caddyfile policy from task 6 (minus the response-only directives that cannot be expressed in `<meta>`, e.g. `frame-ancestors`).
- [x] Verify both example pages still load and function (manual smoke test plus the existing Playwright suite).
- [x] Document in `README.md` that `<meta>` CSP is a **fallback** for static hosts that cannot set headers; real headers are strongly preferred.

### 9. Add a security section to README ✅ recorded as i-2oe7

- [x] Add a "Security" section to `README.md` that summarises the threat model (host page = trusted, end-user-pasted URL/JSON = untrusted, manifest+SVGs = single artifact under one base-path), the guarantees the component makes (sandboxed iframe, same-origin path enforcement, no script execution from SVG content, no credential leak across origins), and the host-page author's responsibilities (set the documented response headers, pin the CDN script with SRI, host manifests + SVGs together).

### 10. Run the full test suite & smoke-test ✅ recorded as i-8y7w

- [x] `task test` passes including the new security tests from tasks 1, 2, 3, 4.
- [x] Manual smoke test on `index.html` and `examples/multi.html`: load, navigate, use loader, paste JSON, reset — all behave identically to before. Confirm no new console errors.
- [x] Manual smoke test of the production Caddyfile: serve `index.html` with the production block enabled, open DevTools, verify zero CSP violation reports for normal usage.

## Notes

- **Why `sandbox="allow-same-origin"` (and not `sandbox=""`):** the canvas reads `iframe.contentDocument` to (a) measure the SVG's intrinsic size, (b) intercept link clicks for slide navigation, (c) intercept keyboard events. All three require same-origin DOM access. With same-origin only (no `allow-scripts`), inline `<script>` and event-handler attributes inside any SVG are inert.
- **Why omit `allow-scripts`:** D2 SVG output uses only inline `<style>` and `<a>` links (verified in `examples/kubernetes/`). Sequence-step animations are achieved by navigating between separate SVG files, not via SMIL or JS. Future SVG sources that need scripts would have to opt back in explicitly.
- **Why same-base-path enforcement:** per the user's portability requirement, a manifest plus its SVGs are a single artifact. Allowing manifest paths to escape the base-path enables off-origin exfiltration (e.g. `<img src>`-style trackers in SVGs) and breaks the portability invariant.
- **Why drop wildcard CORS in production:** the same-base-path rule means every fetch the component makes is same-origin. Wildcard CORS only enables an attacker on a different origin to read the manifest/SVGs, which is unnecessary and weakens defence-in-depth.
- **`style-src 'unsafe-inline'` trade-off:** the component injects `<style>` elements into shadow roots and into the iframe document for SVG/image normalisation. Eliminating `'unsafe-inline'` would require a CSP nonce wired through the component's host page integration — out of scope here. Documented as a known limitation.
- **Out of scope:** Subresource Integrity for the manifest JSON / SVG files (no standard way to attach SRI to dynamic fetches in the browser); CSP nonces for injected styles; signing manifests; locking down the manifest schema with JSON Schema validation (separate enhancement).

## Discovered Tasks

(none yet)
