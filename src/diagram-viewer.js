import "./diagram-loader.js";

/**
 * <diagram-viewer> — parent custom element that owns state, loads manifest,
 * builds flat slide list, owns navigation history, and wires children.
 *
 * Public API: loadData(data), reset(), loadFromUrl(url), openJsonDialog()
 *
 * Attributes: manifest, base-path, sidebar, zoom, start-at
 *
 * Events emitted:
 *   - slide-change: { detail: { slide, index } } — bubbles but NOT composed,
 *     because it originates from the top-level host and does not need to cross
 *     an additional shadow boundary.
 */

import "./diagram-canvas.js";
import "./diagram-nav-tree.js";
import "./diagram-help-modal.js";

const STORAGE_PREFIX = "diagramViewer.v1";
const PERSIST_DELAY = 250;

/**
 * FNV-1a 32-bit hash → 8-char hex string.
 * @param {string} str
 * @returns {string}
 */
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

import styles from "./diagram-viewer.css";

let _sharedSheet = null;
function getSharedSheet() {
  if (!_sharedSheet && styles) {
    _sharedSheet = new CSSStyleSheet();
    _sharedSheet.replaceSync(styles);
  }
  return _sharedSheet;
}

class DiagramViewer extends HTMLElement {
  static observedAttributes = [
    "manifest",
    "base-path",
    "sidebar",
    "zoom",
    "start-at",
    "bookmarkable",
    "primary",
  ];

  // State
  #instanceId = "";
  #manifest = null;
  #basePath = "";
  #flatSlides = [];
  #currentIndex = 0;
  #zoomLevel = 1.5;
  #navigationHistory = [];
  #forwardHistory = [];
  #abortController = null;
  #initialLoadDone = false;
  #sourceData = null; // last loadData payload for reset()
  #persistTimer = null;
  #hashChangeController = null; // separate abort for hashchange listener

  // Element refs
  #container;
  #canvas;
  #navTree;
  #helpModal;
  #resizeHandle;
  #sidebarToggleBtn;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet()];
  }

  connectedCallback() {
    this.#abortController = new AbortController();

    // Make host focusable so :focus-within works for keyboard scoping
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }

    // Resolve stable per-instance identity
    if (this.id) {
      this.#instanceId = this.id;
    } else {
      const manifest = this.getAttribute("manifest") ?? "";
      const basePath = this.getAttribute("base-path") ?? "";
      if (manifest || basePath) {
        this.#instanceId = fnv1a32(manifest + basePath);
      } else {
        this.#instanceId = crypto.randomUUID();
      }
    }
    this.dataset.instanceId = this.#instanceId;

    this.#render();
    this.#initElements();
    this.#applyInitialAttributes();
    this.#initEventListeners();

    // One-time legacy migration: adopt unnamespaced key only if this is the
    // sole viewer on the page and no namespaced key already exists.
    this.#migrateLegacyStorage();

    // Resolve URL hash ownership based on bookmarkable/primary attributes
    this.#resolveHashOwnership();

    // Try restoring from localStorage first; fall back to manifest fetch
    if (!this.#loadFromStorage()) {
      this.#loadManifest();
    }
  }

  #storageKey() {
    return `${STORAGE_PREFIX}:${this.#instanceId}`;
  }

  /**
   * Returns true if this instance should own the URL hash.
   * Requires the `bookmarkable` attribute. When multiple bookmarkable viewers
   * exist, the one with `primary` wins.
   */
  #ownsHash() {
    if (!this.hasAttribute("bookmarkable")) return false;
    const all = document.querySelectorAll("diagram-viewer[bookmarkable]");
    if (all.length <= 1) return true;
    // Multiple bookmarkable viewers — only the primary one wins
    if (this.hasAttribute("primary")) return true;
    // Check if any has primary
    const hasPrimary = [...all].some((el) => el.hasAttribute("primary"));
    if (!hasPrimary) {
      console.warn(
        '[diagram-viewer] Multiple bookmarkable viewers exist but none has the "primary" attribute. ' +
          "No viewer will own the URL hash. Add primary to one instance.",
      );
    }
    return false;
  }

  /**
   * Re-evaluate hash ownership: register or unregister the hashchange listener.
   */
  #resolveHashOwnership() {
    if (this.#hashChangeController) {
      this.#hashChangeController.abort();
      this.#hashChangeController = null;
    }
    if (this.#ownsHash()) {
      this.#hashChangeController = new AbortController();
      globalThis.addEventListener("hashchange", () => this.#loadFromHash(), {
        signal: this.#hashChangeController.signal,
      });
    }
  }

  /**
   * Migrate legacy unnamespaced storage key to the namespaced one.
   * Only runs when: (1) legacy key exists, (2) this is the only viewer on the
   * page, and (3) no namespaced key already exists for this instance.
   */
  #migrateLegacyStorage() {
    try {
      const legacyKey = STORAGE_PREFIX;
      const namespacedKey = this.#storageKey();
      if (localStorage.getItem(namespacedKey)) return; // already have own data
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) return; // nothing to migrate
      // Only migrate if this is the sole viewer on the page
      if (document.querySelectorAll("diagram-viewer").length > 1) return;
      localStorage.setItem(namespacedKey, legacyRaw);
      localStorage.removeItem(legacyKey);
    } catch {
      /* ignore — private browsing or quota */
    }
  }

  disconnectedCallback() {
    clearTimeout(this.#persistTimer);
    this.#abortController?.abort();
    this.#abortController = null;
    this.#hashChangeController?.abort();
    this.#hashChangeController = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === "base-path") this.#basePath = newValue ?? "";

    if (name === "sidebar" && this.#container) {
      this.#container.classList.toggle(
        "sidebar-collapsed",
        newValue === "false",
      );
    }

    if (name === "zoom" && this.#canvas) {
      const pct = parseInt(newValue, 10);
      if (!isNaN(pct) && pct >= 50 && pct <= 800) {
        this.#zoomLevel = pct / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = pct;
      }
    }

    if (name === "manifest" && this.#container) {
      this.#loadManifest();
    }

    if ((name === "bookmarkable" || name === "primary") && this.#container) {
      this.#resolveHashOwnership();
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  loadData(data) {
    this.#clearManifestError();
    // ── v0 shape validation ──────────────────────────────────────────────
    if (!data || typeof data !== "object" || !Array.isArray(data.layers)) {
      throw new Error(
        'loadData: invalid manifest — expected v0 shape with a "layers" array. ' +
          "Required: { layers: [{ id, title, path, type }] }",
      );
    }
    for (let i = 0; i < data.layers.length; i++) {
      const l = data.layers[i];
      if (
        !l ||
        typeof l.id !== "string" ||
        typeof l.title !== "string" ||
        typeof l.path !== "string" ||
        typeof l.type !== "string"
      ) {
        throw new Error(
          `loadData: layers[${i}] is invalid — each layer must have string id, title, path, and type.`,
        );
      }
    }

    this.#sourceData = data;
    this.#basePath = this.getAttribute("base-path") || "";

    // ── Preserve UI state from existing snapshot if present ───────────────
    let preservedUi = null;
    try {
      const raw = localStorage.getItem(this.#storageKey());
      if (raw) {
        const snapshot = JSON.parse(raw);
        if (snapshot.version === 1 && snapshot.ui) {
          preservedUi = snapshot.ui;
        }
      }
    } catch {
      /* ignore */
    }

    this.#manifest = data;
    this.#navTree.title = data.name ?? "Diagram";
    this.#buildFlatSlideList();
    this.#navTree.buildTree(data, this.#basePath);

    if (preservedUi) {
      // Restore zoom
      if (typeof preservedUi.zoomPercent === "number") {
        this.#zoomLevel = preservedUi.zoomPercent / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = preservedUi.zoomPercent;
      }
      // Restore sidebar
      if (preservedUi.sidebarOpen === false) {
        this.#container.classList.add("sidebar-collapsed");
      } else {
        this.#container.classList.remove("sidebar-collapsed");
      }
      if (
        typeof preservedUi.sidebarWidthPx === "number" &&
        preservedUi.sidebarOpen !== false
      ) {
        this.#container.style.gridTemplateColumns = `${preservedUi.sidebarWidthPx}px auto 1fr`;
      }
      // Resolve slide — check if saved currentSlideId still exists
      const hash = this.#ownsHash() ? location.hash.slice(1) : "";
      let slideId = hash || preservedUi.currentSlideId;
      const slideExists =
        slideId && this.#flatSlides.some((s) => s.id === slideId);
      if (!slideExists) {
        slideId =
          this.getAttribute("start-at") ||
          this.#flatSlides[0]?.id ||
          "overview";
      }
      this.#navigateToId(slideId, "replace");
    } else {
      this.#loadInitialSlide();
    }

    this.#persist();
  }

  /**
   * Load a manifest from a URL. Resolves relative URLs against document.baseURI.
   * Clears localStorage for this instance, derives base-path from the URL,
   * updates attributes, fetches and parses JSON, then calls loadData().
   * @param {string} url
   */
  async loadFromUrl(url) {
    const resolved = new URL(url, document.baseURI).href;

    // Clear persisted state for this instance
    try {
      localStorage.removeItem(this.#storageKey());
    } catch {
      /* noop */
    }

    // Derive base-path: strip trailing path segment (filename) unless URL ends with /
    let basePath;
    if (resolved.endsWith("/")) {
      basePath = resolved;
    } else {
      basePath = resolved.slice(0, resolved.lastIndexOf("/"));
    }

    // Update attributes for reflection
    this.setAttribute("base-path", basePath);
    this.setAttribute("manifest", resolved);
    this.#basePath = basePath;

    try {
      const response = await fetch(resolved);
      if (!response.ok)
        throw new Error(`Failed to fetch manifest: ${response.status}`);
      const data = await response.json();
      this.loadData(data);
    } catch (err) {
      console.error("Failed to load manifest:", err);
      this.#showManifestError(resolved, err);
    }
  }

  /**
   * Open the JSON snapshot dialog programmatically.
   */
  openJsonDialog() {
    const backdrop = this.shadowRoot.querySelector(".json-dialog-backdrop");
    const textarea = backdrop.querySelector("textarea");
    const errorEl = this.shadowRoot.querySelector(".json-dialog-error");
    const copiedEl = this.shadowRoot.querySelector(".json-dialog-copied");
    errorEl.textContent = "";
    copiedEl.textContent = "";
    textarea.value = JSON.stringify(this.#getSnapshot(), null, 2);
    backdrop.classList.add("open");
  }

  reset() {
    // Clear persisted snapshot
    try {
      localStorage.removeItem(this.#storageKey());
    } catch {
      /* noop */
    }

    this.#manifest = null;
    this.#flatSlides = [];
    this.#currentIndex = 0;
    this.#navigationHistory = [];
    this.#forwardHistory = [];

    // Reset zoom to default (from attribute or 1.5)
    const zoomAttr = parseInt(this.getAttribute("zoom"), 10);
    this.#zoomLevel = zoomAttr > 0 && isFinite(zoomAttr) ? zoomAttr / 100 : 1.5;
    this.#canvas.zoomLevel = this.#zoomLevel;
    this.#navTree.zoomPercent = Math.round(this.#zoomLevel * 100);

    // Open sidebar and clear custom width
    this.#container.classList.remove("sidebar-collapsed");
    this.#container.style.gridTemplateColumns = "";

    // Clear URL hash (only if this viewer owns it)
    if (this.#ownsHash()) {
      history.replaceState(null, "", location.pathname + location.search);
    }

    // Re-run original load path
    if (this.#sourceData) {
      this.loadData(this.#sourceData);
    } else {
      this.#loadManifest();
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Attempt to restore state from localStorage snapshot.
   * Returns true if a valid snapshot was restored successfully.
   */
  #loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.#storageKey());
      if (!raw) return false;

      const snapshot = JSON.parse(raw);
      if (snapshot.version !== 1 || !snapshot.manifest) return false;

      this.#sourceData = snapshot.manifest;
      this.#manifest = snapshot.manifest;
      this.#basePath = snapshot.basePath ?? "";

      this.#navTree.title = this.#manifest.name ?? "Diagram";
      this.#buildFlatSlideList();
      this.#navTree.buildTree(this.#manifest, this.#basePath);

      // Restore UI state
      const ui = snapshot.ui ?? {};

      if (typeof ui.zoomPercent === "number") {
        this.#zoomLevel = ui.zoomPercent / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = ui.zoomPercent;
      }

      if (ui.sidebarOpen === false) {
        this.#container.classList.add("sidebar-collapsed");
      } else {
        this.#container.classList.remove("sidebar-collapsed");
      }

      if (typeof ui.sidebarWidthPx === "number" && ui.sidebarOpen !== false) {
        this.#container.style.gridTemplateColumns = `${ui.sidebarWidthPx}px auto 1fr`;
      }

      // Restore slide — URL hash wins on explicit hashchange, but on reload
      // prefer the saved currentSlideId over the hash if they differ
      const hash = this.#ownsHash() ? location.hash.slice(1) : "";
      const slideId =
        hash ||
        ui.currentSlideId ||
        this.getAttribute("start-at") ||
        this.#flatSlides[0]?.id ||
        "overview";
      this.#navigateToId(slideId, "replace");

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Persist current state to localStorage (debounced 250ms).
   */
  #persist() {
    clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => {
      try {
        const sidebarOpen =
          !this.#container.classList.contains("sidebar-collapsed");
        const currentSlide = this.#flatSlides[this.#currentIndex];

        // Compute sidebar width from grid columns
        let sidebarWidthPx = null;
        const cols = this.#container.style.gridTemplateColumns;
        if (cols) {
          const match = cols.match(/^([\d.]+)px/);
          if (match) sidebarWidthPx = parseFloat(match[1]);
        }

        const snapshot = {
          version: 1,
          manifest: this.#manifest,
          basePath: this.#basePath,
          ui: {
            currentSlideId: currentSlide?.id ?? null,
            zoomPercent: Math.round(this.#zoomLevel * 100),
            sidebarOpen,
            sidebarWidthPx,
          },
        };
        localStorage.setItem(this.#storageKey(), JSON.stringify(snapshot));
      } catch {
        /* quota exceeded or private browsing — silently ignore */
      }
    }, PERSIST_DELAY);
  }

  #render() {
    this.shadowRoot.innerHTML = `
      <div class="container">
        <button class="sidebar-toggle" title="Show sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </button>
        <diagram-nav-tree></diagram-nav-tree>
        <div class="resize-handle"></div>
        <diagram-canvas></diagram-canvas>
        <diagram-help-modal></diagram-help-modal>
        <div class="resize-overlay"></div>
        <div class="json-dialog-backdrop">
          <div class="json-dialog">
            <div class="json-dialog-header">
              <h2>Snapshot JSON</h2>
            </div>
            <textarea spellcheck="false"></textarea>
            <div class="json-dialog-footer">
              <button class="json-copy">Copy</button>
              <button class="json-apply primary">Apply</button>
              <button class="json-close">Close</button>
              <span class="json-dialog-error"></span>
              <span class="json-dialog-copied"></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  #initElements() {
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.#container = $(".container");
    this.#canvas = $("diagram-canvas");
    this.#navTree = $("diagram-nav-tree");
    this.#helpModal = $("diagram-help-modal");
    this.#resizeHandle = $(".resize-handle");
    this.#sidebarToggleBtn = $(".sidebar-toggle");
  }

  #applyInitialAttributes() {
    if (this.getAttribute("sidebar") === "false") {
      this.#container.classList.add("sidebar-collapsed");
    }

    const zoomAttr = this.getAttribute("zoom");
    if (zoomAttr) {
      const pct = parseInt(zoomAttr, 10);
      if (!isNaN(pct) && pct >= 50 && pct <= 800) {
        this.#zoomLevel = pct / 100;
      }
    }
    this.#navTree.zoomPercent = Math.round(this.#zoomLevel * 100);
  }

  #initEventListeners() {
    const signal = this.#abortController.signal;

    // Sidebar toggle
    this.#sidebarToggleBtn.addEventListener(
      "click",
      () => {
        this.#container.classList.remove("sidebar-collapsed");
        this.#persist();
      },
      { signal },
    );

    // Nav tree events
    this.#navTree.addEventListener(
      "slide-select",
      (e) => {
        this.#navigationHistory = [];
        this.#forwardHistory = [];
        this.#navigateToId(e.detail.id, "replace");
        this.focus({ preventScroll: true });
      },
      { signal },
    );

    this.#navTree.addEventListener(
      "sidebar-collapse",
      () => {
        this.#container.classList.add("sidebar-collapsed");
        this.#container.style.gridTemplateColumns = "";
        this.#persist();
      },
      { signal },
    );

    this.#navTree.addEventListener("zoom-in", () => this.#zoomIn(), { signal });
    this.#navTree.addEventListener("zoom-out", () => this.#zoomOut(), {
      signal,
    });
    this.#navTree.addEventListener("zoom-reset", () => this.#zoomReset(), {
      signal,
    });
    this.#navTree.addEventListener(
      "help-open",
      () => this.#helpModal.toggle(),
      { signal },
    );

    // Canvas events
    this.#canvas.addEventListener(
      "slide-navigate",
      (e) => {
        this.#navigateToId(e.detail.id, "push");
      },
      { signal },
    );

    this.#canvas.addEventListener(
      "zoom-change",
      (e) => {
        this.#zoomLevel = e.detail.zoomPercent / 100;
        this.#navTree.zoomPercent = e.detail.zoomPercent;
        this.#persist();
      },
      { signal },
    );

    this.#canvas.addEventListener(
      "iframe-keydown",
      (e) => {
        this.#handleKeyDown(e.detail);
      },
      { signal },
    );

    // Resize handle
    this.#initResizeHandle(signal);

    // Keyboard scoped to focus-within (host keydown in capture phase)
    this.addEventListener("keydown", (e) => this.#handleKeyDown(e), {
      signal,
      capture: true,
    });

    this.#initJsonDialog(signal);
  }

  #initJsonDialog(signal) {
    const $ = (s) => this.shadowRoot.querySelector(s);
    const backdrop = $(".json-dialog-backdrop");
    const textarea = backdrop.querySelector("textarea");
    const errorEl = $(".json-dialog-error");
    const copiedEl = $(".json-dialog-copied");

    // Copy
    $(".json-copy").addEventListener(
      "click",
      async () => {
        errorEl.textContent = "";
        try {
          await navigator.clipboard.writeText(textarea.value);
        } catch {
          // fallback
          textarea.select();
          document.execCommand("copy");
        }
        copiedEl.textContent = "Copied";
        setTimeout(() => {
          copiedEl.textContent = "";
        }, 1500);
      },
      { signal },
    );

    // Apply
    $(".json-apply").addEventListener(
      "click",
      () => {
        errorEl.textContent = "";
        copiedEl.textContent = "";
        let parsed;
        try {
          parsed = JSON.parse(textarea.value);
        } catch (e) {
          errorEl.textContent = `Parse error: ${e.message}`;
          return;
        }
        if (parsed.version !== 1) {
          errorEl.textContent = "Invalid snapshot: version must be 1";
          return;
        }
        // Full replace
        try {
          localStorage.setItem(this.#storageKey(), JSON.stringify(parsed));
        } catch {
          /* noop */
        }
        this.#applySnapshot(parsed);
        backdrop.classList.remove("open");
      },
      { signal },
    );

    // Close
    $(".json-close").addEventListener(
      "click",
      () => {
        backdrop.classList.remove("open");
      },
      { signal },
    );

    // Backdrop click closes
    backdrop.addEventListener(
      "click",
      (e) => {
        if (e.target === backdrop) backdrop.classList.remove("open");
      },
      { signal },
    );
  }

  #getSnapshot() {
    const sidebarOpen =
      !this.#container.classList.contains("sidebar-collapsed");
    const currentSlide = this.#flatSlides[this.#currentIndex];
    let sidebarWidthPx = null;
    const cols = this.#container.style.gridTemplateColumns;
    if (cols) {
      const match = cols.match(/^([\d.]+)px/);
      if (match) sidebarWidthPx = parseFloat(match[1]);
    }
    return {
      version: 1,
      manifest: this.#manifest,
      basePath: this.#basePath,
      ui: {
        currentSlideId: currentSlide?.id ?? null,
        zoomPercent: Math.round(this.#zoomLevel * 100),
        sidebarOpen,
        sidebarWidthPx,
      },
    };
  }

  #applySnapshot(snapshot) {
    this.#sourceData = snapshot.manifest;
    this.#manifest = snapshot.manifest;
    this.#basePath = snapshot.basePath ?? "";

    this.#navTree.title = this.#manifest.name ?? "Diagram";
    this.#buildFlatSlideList();
    this.#navTree.buildTree(this.#manifest, this.#basePath);

    const ui = snapshot.ui ?? {};

    if (typeof ui.zoomPercent === "number") {
      this.#zoomLevel = ui.zoomPercent / 100;
      this.#canvas.zoomLevel = this.#zoomLevel;
      this.#navTree.zoomPercent = ui.zoomPercent;
    }

    if (ui.sidebarOpen === false) {
      this.#container.classList.add("sidebar-collapsed");
    } else {
      this.#container.classList.remove("sidebar-collapsed");
    }

    if (typeof ui.sidebarWidthPx === "number" && ui.sidebarOpen !== false) {
      this.#container.style.gridTemplateColumns = `${ui.sidebarWidthPx}px auto 1fr`;
    } else {
      this.#container.style.gridTemplateColumns = "";
    }

    const slideId = ui.currentSlideId || "overview";
    this.#navigateToId(slideId, "replace");
  }

  #initResizeHandle(signal) {
    const remToPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const MIN_WIDTH = 10 * remToPx;
    const MAX_WIDTH = 30 * remToPx;
    let startX = 0;
    let startWidth = 240;
    let dragController = null;

    const onMouseMove = (e) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + delta),
      );
      this.#container.style.gridTemplateColumns = `${newWidth}px auto 1fr`;
    };

    const onMouseUp = () => {
      dragController?.abort();
      dragController = null;
      this.#resizeHandle.classList.remove("active");
      this.#container.classList.remove("resizing");
      this.#canvas.setResizing(false);
      this.#persist();
    };

    this.#resizeHandle.addEventListener(
      "mousedown",
      (e) => {
        startX = e.clientX;
        startWidth = this.#container.offsetWidth - this.#canvas.offsetWidth;
        this.#resizeHandle.classList.add("active");
        this.#container.classList.add("resizing");
        this.#canvas.setResizing(true);
        e.preventDefault();

        // Attach document listeners only for the duration of the drag
        dragController = new AbortController();
        const dragSignal = AbortSignal.any
          ? AbortSignal.any([dragController.signal, signal])
          : dragController.signal;
        document.addEventListener("mousemove", onMouseMove, {
          signal: dragSignal,
        });
        document.addEventListener("mouseup", onMouseUp, { signal: dragSignal });
      },
      { signal },
    );

    // Clean up any active drag if the component is disconnected
    signal.addEventListener("abort", () => {
      dragController?.abort();
      dragController = null;
    });
  }

  async #loadManifest() {
    const manifestPath = this.getAttribute("manifest");
    this.#basePath = this.getAttribute("base-path") ?? "";

    if (!manifestPath) return; // loadData() will be called externally

    try {
      const response = await fetch(manifestPath);
      if (!response.ok)
        throw new Error(`Failed to fetch manifest: ${response.status}`);
      const data = await response.json();
      this.loadData(data);
    } catch (err) {
      console.error("Failed to load manifest:", err);
      this.#showManifestError(manifestPath, err);
    }
  }

  #clearManifestError() {
    this.#container
      .querySelectorAll(":scope > .error")
      .forEach((el) => el.remove());
    if (this.#canvas.style.display === "none") {
      this.#canvas.style.display = "";
    }
    this.#container.classList.remove("sidebar-collapsed");
  }

  #showManifestError(manifestPath, error) {
    this.#clearManifestError();
    this.#container.classList.add("sidebar-collapsed");
    // Insert error into the canvas area
    const errorEl = document.createElement("div");
    errorEl.className = "error";
    errorEl.style.cssText =
      "flex-direction: column; gap: 12px; text-align: center; padding: 24px;";
    errorEl.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-error);">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15" stroke-width="2"/>
      </svg>
      <div style="font-weight: 500;">Failed to load manifest</div>
      <code style="background: #fef2f2; padding: 8px 12px; border-radius: 4px; font-size: 12px; word-break: break-all;">${manifestPath}</code>
      <div style="font-size: 12px; color: var(--color-text-subtle);">${error.message ?? "Check that the file exists and is valid JSON"}</div>
    `;
    this.#canvas.style.display = "none";
    this.#container.appendChild(errorEl);
  }

  #buildFlatSlideList() {
    this.#flatSlides = [];

    const processItem = (item, parentId = null) => {
      this.#flatSlides.push({
        id: item.id,
        title: item.title,
        path: `${this.#basePath}/${item.path}`,
        type: item.type,
        parentId,
        overlay: item.overlay ? `${this.#basePath}/${item.overlay}` : null,
      });

      if (item.type === "steps" && item.steps) {
        for (const step of item.steps) {
          this.#flatSlides.push({
            id: `${item.id}-step-${step.step}`,
            title: `${item.title} - ${step.title}`,
            path: `${this.#basePath}/${step.path}`,
            type: "step",
            parentId: item.id,
          });
        }
      }

      if (item.children) {
        for (const child of item.children) {
          processItem(child, item.id);
        }
      }
    };

    for (const layer of this.#manifest.layers) {
      processItem(layer, null);
    }

    // Pass flat slides to canvas for URL resolution
    this.#canvas.basePath = this.#basePath;
    this.#canvas.flatSlides = this.#flatSlides;
  }

  #loadSlide(index, historyMode = "push") {
    if (index < 0 || index >= this.#flatSlides.length) return;

    const slide = this.#flatSlides[index];

    if (historyMode === "push") {
      this.#navigationHistory.push(this.#currentIndex);
      this.#forwardHistory = [];
    }

    this.#currentIndex = index;
    this.#canvas.loadSlide(slide);

    const newHash = `#${slide.id}`;
    if (this.#ownsHash() && location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }

    this.#navTree.setActive(slide.id);

    this.dispatchEvent(
      new CustomEvent("slide-change", {
        detail: { slide, index },
        bubbles: true,
      }),
    );

    this.#persist();
  }

  #navigateToId(id, historyMode = "push") {
    const index = this.#flatSlides.findIndex((s) => s.id === id);
    if (index !== -1) this.#loadSlide(index, historyMode);
  }

  #loadFromHash() {
    if (!this.#ownsHash()) return;
    const startAttr =
      this.getAttribute("start-at") || this.#flatSlides[0]?.id || "overview";
    const hash = location.hash.slice(1) || startAttr;
    this.#navigateToId(hash, "replace");
  }

  /**
   * Navigate to the initial slide: from hash if bookmarkable, otherwise start-at or first slide.
   */
  #loadInitialSlide() {
    if (this.#ownsHash() && location.hash.length > 1) {
      this.#navigateToId(location.hash.slice(1), "replace");
    } else {
      const slideId =
        this.getAttribute("start-at") || this.#flatSlides[0]?.id || "overview";
      this.#navigateToId(slideId, "replace");
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  #goUp() {
    if (this.#currentIndex > 0) this.#loadSlide(this.#currentIndex - 1, "push");
  }

  #goDown() {
    if (this.#currentIndex < this.#flatSlides.length - 1)
      this.#loadSlide(this.#currentIndex + 1, "push");
  }

  #goBack() {
    if (this.#navigationHistory.length === 0) return;
    this.#forwardHistory.push(this.#currentIndex);
    this.#loadSlide(this.#navigationHistory.pop(), "replace");
  }

  #goForward() {
    if (this.#forwardHistory.length === 0) return;
    this.#navigationHistory.push(this.#currentIndex);
    this.#loadSlide(this.#forwardHistory.pop(), "replace");
  }

  #zoomIn() {
    this.#canvas.zoomIn();
  }

  #zoomOut() {
    this.#canvas.zoomOut();
  }

  #zoomReset() {
    this.#canvas.zoomReset();
  }

  #toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.requestFullscreen();
    }
  }

  #handleKeyDown(e) {
    if (
      e.key !== "Escape" &&
      (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA")
    )
      return;

    if (e.key === "Escape") {
      e.preventDefault?.();
      const backdrop = this.shadowRoot.querySelector(".json-dialog-backdrop");
      if (backdrop.classList.contains("open")) {
        backdrop.classList.remove("open");
        return;
      }
      this.#helpModal.close();
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault?.();
        this.#goUp();
        break;
      case "ArrowDown":
        e.preventDefault?.();
        this.#goDown();
        break;
      case "ArrowLeft":
        e.preventDefault?.();
        this.#goBack();
        break;
      case "ArrowRight":
      case " ":
        e.preventDefault?.();
        this.#goForward();
        break;
      case "Home":
        e.preventDefault?.();
        this.#loadSlide(0, "push");
        break;
      case "End":
        e.preventDefault?.();
        this.#loadSlide(this.#flatSlides.length - 1, "push");
        break;
      case "=":
        e.preventDefault?.();
        this.#zoomIn();
        break;
      case "-":
        e.preventDefault?.();
        this.#zoomOut();
        break;
      case "0":
        e.preventDefault?.();
        this.#zoomReset();
        break;
      case "f":
        this.#toggleFullscreen();
        break;
      case "?":
        e.preventDefault?.();
        this.#helpModal.toggle();
        break;
    }
  }
}

if (!customElements.get("diagram-viewer")) {
  customElements.define("diagram-viewer", DiagramViewer);
} else if (customElements.get("diagram-viewer") !== DiagramViewer) {
  console.warn(
    '[diagram-viewer] A different constructor is already registered under "diagram-viewer". Skipping re-definition.',
  );
}

export { DiagramViewer };
