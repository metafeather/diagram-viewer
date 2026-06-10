/**
 * <diagram-viewer> — parent custom element that owns state, loads manifest,
 * builds flat slide list, owns navigation history, and wires children.
 *
 * Public API: loadData(data), reset()
 *
 * Attributes: manifest, base-path, sidebar, zoom, start-at
 */

import './diagram-canvas.js';
import './diagram-nav-tree.js';
import './diagram-help-modal.js';

const STORAGE_KEY = 'diagramViewer.v1';
const PERSIST_DELAY = 250;

const styles = `
:host {
  --color-bg: #fff;
  --color-bg-active: #eff0fe;
  --color-bg-hover: #f3f4f6;
  --color-border: #e5e5e5;
  --color-error: #ef4444;
  --color-primary: #6366f1;
  --color-text: #2e3346;
  --color-text-light: #6b7280;
  --color-text-muted: #5c5f77;
  --color-text-subtle: #9ca3af;
  --sidebar-width: 15rem;
  display: block;
  height: 100%;
  width: 100%;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.container {
  all: initial;
  border: 1px solid var(--color-border);
  box-sizing: border-box;
  contain: layout style;
  display: grid;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 1rem;
  grid-template-areas:
    "sidebar-header resize-handle viewer"
    "sidebar-nav    resize-handle viewer"
    "sidebar-footer resize-handle viewer";
  grid-template-columns: var(--sidebar-width) auto 1fr;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  line-height: 1.5;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.container.sidebar-collapsed {
  grid-template-columns: 0 0 1fr;
}

.container.sidebar-collapsed diagram-nav-tree,
.container.sidebar-collapsed .resize-handle {
  display: none;
}

.sidebar-toggle {
  align-items: center;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  box-shadow: 0 0.125rem 0.25rem rgb(0 0 0 / 10%);
  color: var(--color-text-light);
  cursor: pointer;
  display: none;
  height: 2rem;
  inset-block-start: 0.75rem;
  inset-inline-start: 0.75rem;
  justify-content: center;
  position: absolute;
  transition: all 150ms;
  width: 2rem;
  z-index: 100;
}

.sidebar-toggle:hover {
  background: var(--color-bg-hover);
  border-color: #d1d5db;
  color: var(--color-text);
}

.sidebar-toggle svg {
  color: var(--color-primary);
  height: 1rem;
  width: 1rem;
}

.container.sidebar-collapsed .sidebar-toggle {
  display: flex;
}

.resize-handle {
  background: transparent;
  cursor: col-resize;
  grid-area: resize-handle;
  width: 0.5rem;
}

.resize-handle:hover,
.resize-handle.active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-inline-start: 1px solid var(--color-primary);
}

.error {
  align-items: center;
  color: var(--color-error);
  display: flex;
  font-size: 0.875rem;
  height: 100%;
  justify-content: center;
  grid-area: viewer;
}

.resize-overlay {
  cursor: col-resize;
  display: none;
  inset: 0;
  position: absolute;
  z-index: 1000;
}

.container.resizing .resize-overlay {
  display: block;
}

.container.resizing,
.container.resizing * {
  cursor: col-resize !important;
  user-select: none;
}

diagram-nav-tree {
  display: contents;
}

diagram-canvas {
  grid-area: viewer;
}

diagram-help-modal {
  display: contents;
}

@media (width <= 48rem) {
  .container {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    grid-template-areas: "viewer";
  }

  .container diagram-nav-tree,
  .container .resize-handle,
  .container .sidebar-toggle {
    display: none !important;
  }
}
`;

class DiagramViewer extends HTMLElement {
  static observedAttributes = ['manifest', 'base-path', 'sidebar', 'zoom', 'start-at'];

  static #styles = new CSSStyleSheet();
  static { this.#styles.replaceSync(styles); }

  // State
  #manifest = null;
  #basePath = '';
  #flatSlides = [];
  #currentIndex = 0;
  #zoomLevel = 1.5;
  #navigationHistory = [];
  #forwardHistory = [];
  #abortController = null;
  #initialLoadDone = false;
  #sourceData = null; // last loadData payload for reset()
  #persistTimer = null;

  // Element refs
  #container;
  #canvas;
  #navTree;
  #helpModal;
  #resizeHandle;
  #sidebarToggleBtn;
  #keyboardHandler = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [DiagramViewer.#styles];
  }

  connectedCallback() {
    this.#abortController = new AbortController();
    this.#render();
    this.#initElements();
    this.#applyInitialAttributes();
    this.#initEventListeners();

    // Try restoring from localStorage first; fall back to manifest fetch
    if (!this.#loadFromStorage()) {
      this.#loadManifest();
    }
  }

  disconnectedCallback() {
    this.#disableKeyboardHandling();
    clearTimeout(this.#persistTimer);
    this.#abortController?.abort();
    this.#abortController = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'base-path') this.#basePath = newValue ?? '';

    if (name === 'sidebar' && this.#container) {
      this.#container.classList.toggle('sidebar-collapsed', newValue === 'false');
    }

    if (name === 'zoom' && this.#canvas) {
      const pct = parseInt(newValue, 10);
      if (!isNaN(pct) && pct >= 50 && pct <= 800) {
        this.#zoomLevel = pct / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = pct;
      }
    }

    if (name === 'manifest' && this.#container) {
      this.#loadManifest();
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  loadData(data) {
    this.#sourceData = data;
    this.#manifest = data;
    this.#basePath = this.getAttribute('base-path') || '';

    this.#navTree.title = data.name ?? 'Diagram';
    this.#buildFlatSlideList();
    this.#navTree.buildTree(data, this.#basePath);
    this.#loadFromHash();
  }

  reset() {
    // Clear persisted snapshot
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }

    this.#manifest = null;
    this.#flatSlides = [];
    this.#currentIndex = 0;
    this.#navigationHistory = [];
    this.#forwardHistory = [];

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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const snapshot = JSON.parse(raw);
      if (snapshot.version !== 1 || !snapshot.manifest) return false;

      this.#sourceData = snapshot.manifest;
      this.#manifest = snapshot.manifest;
      this.#basePath = snapshot.basePath ?? '';

      this.#navTree.title = this.#manifest.name ?? 'Diagram';
      this.#buildFlatSlideList();
      this.#navTree.buildTree(this.#manifest, this.#basePath);

      // Restore UI state
      const ui = snapshot.ui ?? {};

      if (typeof ui.zoomPercent === 'number') {
        this.#zoomLevel = ui.zoomPercent / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = ui.zoomPercent;
      }

      if (ui.sidebarOpen === false) {
        this.#container.classList.add('sidebar-collapsed');
      } else {
        this.#container.classList.remove('sidebar-collapsed');
      }

      if (typeof ui.sidebarWidthPx === 'number' && ui.sidebarOpen !== false) {
        this.#container.style.gridTemplateColumns = `${ui.sidebarWidthPx}px auto 1fr`;
      }

      // Restore slide — URL hash wins on explicit hashchange, but on reload
      // prefer the saved currentSlideId over the hash if they differ
      const hash = location.hash.slice(1);
      const slideId = hash || ui.currentSlideId || this.getAttribute('start-at') || 'overview';
      this.#navigateToId(slideId, 'replace');

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
        const sidebarOpen = !this.#container.classList.contains('sidebar-collapsed');
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch { /* quota exceeded or private browsing — silently ignore */ }
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
      </div>
    `;
  }

  #initElements() {
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.#container = $('.container');
    this.#canvas = $('diagram-canvas');
    this.#navTree = $('diagram-nav-tree');
    this.#helpModal = $('diagram-help-modal');
    this.#resizeHandle = $('.resize-handle');
    this.#sidebarToggleBtn = $('.sidebar-toggle');
  }

  #applyInitialAttributes() {
    if (this.getAttribute('sidebar') === 'false') {
      this.#container.classList.add('sidebar-collapsed');
    }

    const zoomAttr = this.getAttribute('zoom');
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
    this.#sidebarToggleBtn.addEventListener('click', () => {
      this.#container.classList.remove('sidebar-collapsed');
      this.#persist();
    }, { signal });

    // Nav tree events
    this.#navTree.addEventListener('slide-select', (e) => {
      this.#navigationHistory = [];
      this.#forwardHistory = [];
      this.#navigateToId(e.detail.id, 'replace');
    }, { signal });

    this.#navTree.addEventListener('sidebar-collapse', () => {
      this.#container.classList.add('sidebar-collapsed');
      this.#container.style.gridTemplateColumns = '';
      this.#persist();
    }, { signal });

    this.#navTree.addEventListener('zoom-in', () => this.#zoomIn(), { signal });
    this.#navTree.addEventListener('zoom-out', () => this.#zoomOut(), { signal });
    this.#navTree.addEventListener('zoom-reset', () => this.#zoomReset(), { signal });
    this.#navTree.addEventListener('help-open', () => this.#helpModal.toggle(), { signal });

    // Canvas events
    this.#canvas.addEventListener('slide-navigate', (e) => {
      this.#navigateToId(e.detail.id, 'push');
    }, { signal });

    this.#canvas.addEventListener('zoom-change', (e) => {
      this.#zoomLevel = e.detail.zoomPercent / 100;
      this.#navTree.zoomPercent = e.detail.zoomPercent;
      this.#persist();
    }, { signal });

    this.#canvas.addEventListener('iframe-keydown', (e) => {
      this.#handleKeyDown(e.detail);
    }, { signal });

    // Resize handle
    this.#initResizeHandle(signal);

    // Hash change
    globalThis.addEventListener('hashchange', () => this.#loadFromHash(), { signal });

    // Keyboard scoped to mouse hover
    this.#keyboardHandler = (e) => this.#handleKeyDown(e);
    this.#container.addEventListener('mouseenter', () => this.#enableKeyboardHandling(), { signal });
    this.#container.addEventListener('mouseleave', () => this.#disableKeyboardHandling(), { signal });
  }

  #initResizeHandle(signal) {
    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const MIN_WIDTH = 10 * remToPx;
    const MAX_WIDTH = 30 * remToPx;
    let isResizing = false;
    let startX = 0;
    let startWidth = 240;

    this.#resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.#container.offsetWidth - this.#canvas.offsetWidth;
      this.#resizeHandle.classList.add('active');
      this.#container.classList.add('resizing');
      this.#canvas.setResizing(true);
      e.preventDefault();
    }, { signal });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = e.clientX - startX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      this.#container.style.gridTemplateColumns = `${newWidth}px auto 1fr`;
    }, { signal });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        this.#resizeHandle.classList.remove('active');
        this.#container.classList.remove('resizing');
        this.#canvas.setResizing(false);
        this.#persist();
      }
    }, { signal });
  }

  async #loadManifest() {
    const manifestPath = this.getAttribute('manifest');
    this.#basePath = this.getAttribute('base-path') ?? '';

    if (!manifestPath) return; // loadData() will be called externally

    try {
      const response = await fetch(manifestPath);
      if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.status}`);
      const data = await response.json();
      this.loadData(data);
    } catch (err) {
      console.error('Failed to load manifest:', err);
      this.#showManifestError(manifestPath, err);
    }
  }

  #showManifestError(manifestPath, error) {
    this.#container.classList.add('sidebar-collapsed');
    // Insert error into the canvas area
    const errorEl = document.createElement('div');
    errorEl.className = 'error';
    errorEl.style.cssText = 'flex-direction: column; gap: 12px; text-align: center; padding: 24px;';
    errorEl.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-error);">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15" stroke-width="2"/>
      </svg>
      <div style="font-weight: 500;">Failed to load manifest</div>
      <code style="background: #fef2f2; padding: 8px 12px; border-radius: 4px; font-size: 12px; word-break: break-all;">${manifestPath}</code>
      <div style="font-size: 12px; color: var(--color-text-subtle);">${error.message ?? 'Check that the file exists and is valid JSON'}</div>
    `;
    this.#canvas.style.display = 'none';
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

      if (item.type === 'steps' && item.steps) {
        for (const step of item.steps) {
          this.#flatSlides.push({
            id: `${item.id}-step-${step.step}`,
            title: `${item.title} - ${step.title}`,
            path: `${this.#basePath}/${step.path}`,
            type: 'step',
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

  #loadSlide(index, historyMode = 'push') {
    if (index < 0 || index >= this.#flatSlides.length) return;

    const slide = this.#flatSlides[index];

    if (historyMode === 'push') {
      this.#navigationHistory.push(this.#currentIndex);
      this.#forwardHistory = [];
    }

    this.#currentIndex = index;
    this.#canvas.loadSlide(slide);

    const newHash = `#${slide.id}`;
    if (location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }

    this.#navTree.setActive(slide.id, slide.parentId);

    this.dispatchEvent(new CustomEvent('slide-change', {
      detail: { slide, index },
      bubbles: true,
    }));

    this.#persist();
  }

  #navigateToId(id, historyMode = 'push') {
    const index = this.#flatSlides.findIndex((s) => s.id === id);
    if (index !== -1) this.#loadSlide(index, historyMode);
  }

  #loadFromHash() {
    const startAttr = this.getAttribute('start-at') || 'overview';
    const hash = location.hash.slice(1) || startAttr;
    this.#navigateToId(hash, 'replace');
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  #goUp() {
    if (this.#currentIndex > 0) this.#loadSlide(this.#currentIndex - 1, 'push');
  }

  #goDown() {
    if (this.#currentIndex < this.#flatSlides.length - 1) this.#loadSlide(this.#currentIndex + 1, 'push');
  }

  #goBack() {
    if (this.#navigationHistory.length === 0) return;
    this.#forwardHistory.push(this.#currentIndex);
    this.#loadSlide(this.#navigationHistory.pop(), 'replace');
  }

  #goForward() {
    if (this.#forwardHistory.length === 0) return;
    this.#navigationHistory.push(this.#currentIndex);
    this.#loadSlide(this.#forwardHistory.pop(), 'replace');
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

  #enableKeyboardHandling() {
    document.addEventListener('keydown', this.#keyboardHandler);
  }

  #disableKeyboardHandling() {
    document.removeEventListener('keydown', this.#keyboardHandler);
  }

  #handleKeyDown(e) {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      e.preventDefault?.();
      this.#helpModal.close();
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;

    switch (e.key) {
      case 'ArrowUp': e.preventDefault?.(); this.#goUp(); break;
      case 'ArrowDown': e.preventDefault?.(); this.#goDown(); break;
      case 'ArrowLeft': e.preventDefault?.(); this.#goBack(); break;
      case 'ArrowRight':
      case ' ': e.preventDefault?.(); this.#goForward(); break;
      case 'Home': e.preventDefault?.(); this.#loadSlide(0, 'push'); break;
      case 'End': e.preventDefault?.(); this.#loadSlide(this.#flatSlides.length - 1, 'push'); break;
      case '=': e.preventDefault?.(); this.#zoomIn(); break;
      case '-': e.preventDefault?.(); this.#zoomOut(); break;
      case '0': e.preventDefault?.(); this.#zoomReset(); break;
      case 'f': this.#toggleFullscreen(); break;
      case '?': e.preventDefault?.(); this.#helpModal.toggle(); break;
    }
  }
}

customElements.define('diagram-viewer', DiagramViewer);

export { DiagramViewer };
