// src/diagram-loader.css
var diagram_loader_default =
  ":host {\n  display: block;\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n}\n\n.row {\n  align-items: center;\n  display: flex;\n  gap: 0.375rem;\n}\n\n.path {\n  border: 1px solid var(--color-border, #e5e5e5);\n  border-radius: 0.25rem;\n  color: var(--color-text, #2e3346);\n  flex: 1;\n  font-family: inherit;\n  font-size: 0.75rem;\n  height: 1.5rem;\n  padding: 0 0.5rem;\n  transition: border-color 150ms;\n}\n\n.path:focus {\n  border-color: var(--color-primary, #6366f1);\n  outline: none;\n}\n\n.path.error {\n  border-color: var(--color-error, #ef4444);\n}\n\nbutton {\n  align-items: center;\n  background: var(--color-bg, #fff);\n  border: 1px solid var(--color-border, #e5e5e5);\n  border-radius: 0.25rem;\n  color: var(--color-text-light, #6b7280);\n  cursor: pointer;\n  display: flex;\n  font-family: inherit;\n  font-size: 0.6875rem;\n  font-weight: 500;\n  height: 1.5rem;\n  justify-content: center;\n  line-height: 1;\n  padding: 0.125rem 0.5rem;\n  transition: all 150ms;\n}\n\nbutton:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  border-color: #d1d5db;\n  color: var(--color-text, #2e3346);\n}\n";

// src/diagram-loader.js
var _sharedSheet = null;
function getSharedSheet() {
  if (!_sharedSheet && diagram_loader_default) {
    _sharedSheet = new CSSStyleSheet();
    _sharedSheet.replaceSync(diagram_loader_default);
  }
  return _sharedSheet;
}
var DiagramLoader = class extends HTMLElement {
  static get observedAttributes() {
    return ["for", "placeholder", "value"];
  }
  #input;
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [getSharedSheet()];
    shadow.innerHTML = `
      <div class="row">
        <input type="text" class="path" placeholder="path/to/manifest.json">
        <button class="load">Load</button>
        <button class="json">JSON</button>
        <button class="reset">Reset</button>
      </div>
    `;
    this.#input = shadow.querySelector(".path");
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#handleLoad();
    });
    shadow
      .querySelector(".load")
      .addEventListener("click", () => this.#handleLoad());
    shadow
      .querySelector(".json")
      .addEventListener("click", () => this.#handleJson());
    shadow
      .querySelector(".reset")
      .addEventListener("click", () => this.#handleReset());
  }
  attributeChangedCallback(name, _old, val) {
    if (name === "placeholder" && this.#input) {
      this.#input.placeholder = val || "path/to/manifest.json";
    }
    if (name === "value" && this.#input) {
      this.#input.value = val || "";
    }
  }
  #getTarget() {
    const sel = this.getAttribute("for");
    if (!sel) {
      console.warn('[diagram-loader] No "for" attribute set.');
      return null;
    }
    const el = document.querySelector(sel);
    if (!el) {
      console.warn(`[diagram-loader] Target not found: ${sel}`);
      return null;
    }
    return el;
  }
  #handleLoad() {
    const value = this.#input.value.trim();
    if (!value) {
      this.#input.classList.add("error");
      setTimeout(() => this.#input.classList.remove("error"), 1e3);
      return;
    }
    const target = this.#getTarget();
    if (target) target.loadFromUrl(value);
  }
  #handleJson() {
    const target = this.#getTarget();
    if (target) target.openJsonDialog();
  }
  #handleReset() {
    const target = this.#getTarget();
    if (target) {
      target.reset();
      this.#input.value = "";
    }
  }
};
if (!customElements.get("diagram-loader")) {
  customElements.define("diagram-loader", DiagramLoader);
} else if (customElements.get("diagram-loader") !== DiagramLoader) {
  console.warn(
    '[diagram-loader] A different constructor is already registered under "diagram-loader". Skipping re-definition.',
  );
}

// src/diagram-canvas.css
var diagram_canvas_default =
  ":host {\n  contain: strict;\n  display: block;\n  grid-area: viewer;\n  overflow: auto;\n  padding: 0.25rem;\n  position: relative;\n  background: var(--color-bg, #fff);\n}\n\n.iframe-container {\n  display: inline-block;\n  padding: 1rem;\n}\n\niframe {\n  background: transparent;\n  border: none;\n  display: block;\n  transform-origin: top left;\n}\n\n.resize-overlay {\n  cursor: col-resize;\n  display: none;\n  inset: 0;\n  position: absolute;\n  z-index: 1000;\n}\n\n:host(.resizing) .resize-overlay {\n  display: block;\n}\n";

// src/diagram-canvas.js
var ZOOM_STEP = 0.05;
var ZOOM_MIN = 0.5;
var ZOOM_MAX = 8;
var XLINK_NS = "http://www.w3.org/1999/xlink";
var IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|ico)(\?.*)?$/i;
var iframeStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: flex; align-items: flex-start; justify-content: flex-start; }
  img { display: block; max-width: none; }
`;
var _sharedSheet2 = null;
function getSharedSheet2() {
  if (!_sharedSheet2 && diagram_canvas_default) {
    _sharedSheet2 = new CSSStyleSheet();
    _sharedSheet2.replaceSync(diagram_canvas_default);
  }
  return _sharedSheet2;
}
var DiagramCanvas = class extends HTMLElement {
  #iframe;
  #iframeContainer;
  #zoomLevel = 1;
  #zoomExplicitlySet = false;
  #initialLoadDone = false;
  #contentWidth = 0;
  #contentHeight = 0;
  #resizeObserver = null;
  #resizeRaf = 0;
  #flatSlides = [];
  #currentSlide = null;
  #anchorOnLoad = false;
  // Iframe event handlers
  #iframeKeyboardHandler = null;
  #iframeLinkClickHandler = null;
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet2()];
  }
  connectedCallback() {
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }
    this.shadowRoot.innerHTML = `
      <div class="resize-overlay"></div>
      <div class="iframe-container">
        <iframe title="Diagram"></iframe>
      </div>
    `;
    this.#iframe = this.shadowRoot.querySelector("iframe");
    this.#iframeContainer = this.shadowRoot.querySelector(".iframe-container");
    this.#iframe.addEventListener("load", () => {
      this.#handleIframeLoad();
      this.#handleIframeNavigation();
    });
    this.addEventListener("wheel", (e) => this.#handleWheelZoom(e), {
      passive: false,
    });
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#contentWidth || !this.#contentHeight) return;
      if (this.#resizeRaf) cancelAnimationFrame(this.#resizeRaf);
      this.#resizeRaf = requestAnimationFrame(() => {
        this.#resizeRaf = 0;
        this.#setDimensionsAndScale(this.#contentWidth, this.#contentHeight);
      });
    });
    this.#resizeObserver.observe(this);
  }
  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (this.#resizeRaf) cancelAnimationFrame(this.#resizeRaf);
  }
  // ─── Public API ───────────────────────────────────────────────────────────
  get zoomPercent() {
    return Math.round(this.#zoomLevel * 100);
  }
  set zoomLevel(val) {
    if (typeof val === "number" && val >= ZOOM_MIN && val <= ZOOM_MAX) {
      this.#zoomLevel = val;
      this.#zoomExplicitlySet = true;
      this.#applyZoom();
    }
  }
  get zoomLevel() {
    return this.#zoomLevel;
  }
  // No-op: basePath is retained for API compat with diagram-viewer but no
  // longer used internally — slide.path is now an absolute URL.
  set basePath(_val) {}
  set flatSlides(val) {
    this.#flatSlides = val ?? [];
  }
  loadSlide(slide) {
    this.#currentSlide = slide;
    this.#anchorOnLoad = true;
    this.#iframe.style.backgroundImage = "";
    this.#iframe.src = slide.path;
  }
  zoomIn() {
    this.#zoomLevel = Math.min(ZOOM_MAX, this.#zoomLevel + ZOOM_STEP);
    this.#applyZoom();
    this.#dispatchZoomChange();
  }
  zoomOut() {
    this.#zoomLevel = Math.max(ZOOM_MIN, this.#zoomLevel - ZOOM_STEP);
    this.#applyZoom();
    this.#dispatchZoomChange();
  }
  zoomReset() {
    this.#zoomLevel = 1;
    this.#applyZoom();
    this.#dispatchZoomChange();
  }
  /** Enable resizing overlay (called by parent during resize drag) */
  setResizing(active) {
    this.classList.toggle("resizing", active);
  }
  /** Forward keyboard event from parent/iframe */
  handleKeyDown(e) {}
  // ─── Private ──────────────────────────────────────────────────────────────
  #dispatchZoomChange() {
    this.dispatchEvent(
      new CustomEvent("zoom-change", {
        detail: { zoomPercent: this.zoomPercent },
        bubbles: true,
        composed: true,
      }),
    );
  }
  #resolveUrlToSlide(href, baseUrl = globalThis.location.href) {
    try {
      const resolved = new URL(href, baseUrl).href;
      const index = this.#flatSlides.findIndex((s) => s.path === resolved);
      return index !== -1 ? { slide: this.#flatSlides[index], index } : null;
    } catch {
      return null;
    }
  }
  #getIframeSrc() {
    const locationHref = this.#iframe.contentWindow?.location?.href;
    return locationHref && !locationHref.startsWith("about:")
      ? locationHref
      : this.#iframe.src;
  }
  #handleIframeNavigation() {
    try {
      const result = this.#resolveUrlToSlide(this.#getIframeSrc());
      if (result && result.slide.id !== this.#currentSlide?.id) {
        this.dispatchEvent(
          new CustomEvent("slide-navigate", {
            detail: { id: result.slide.id, index: result.index },
            bubbles: true,
            composed: true,
          }),
        );
      }
      this.#setupIframeEventHandlers();
    } catch {
      this.#setupIframeEventHandlers();
    }
  }
  #setupIframeEventHandlers() {
    try {
      const iframeDoc =
        this.#iframe.contentDocument ?? this.#iframe.contentWindow?.document;
      if (!iframeDoc) return;
      if (this.#iframeKeyboardHandler) {
        iframeDoc.removeEventListener("keydown", this.#iframeKeyboardHandler);
      }
      if (this.#iframeLinkClickHandler) {
        iframeDoc.removeEventListener("click", this.#iframeLinkClickHandler);
      }
      const navKeys = /* @__PURE__ */ new Set([
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        " ",
        "Home",
        "End",
        "f",
        "=",
        "-",
        "0",
        "?",
        "Escape",
      ]);
      this.#iframeKeyboardHandler = (e) => {
        if (navKeys.has(e.key)) {
          e.preventDefault();
          this.dispatchEvent(
            new CustomEvent("iframe-keydown", {
              detail: {
                key: e.key,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
              },
              bubbles: true,
              composed: true,
            }),
          );
        }
      };
      this.#iframeLinkClickHandler = (e) => {
        const link = e.target.closest("a");
        if (!link) {
          this.focus({ preventScroll: true });
          return;
        }
        const href =
          link.getAttribute("href") || link.getAttributeNS(XLINK_NS, "href");
        if (!href) return;
        const result = this.#resolveUrlToSlide(
          href,
          this.#iframe.contentWindow?.location?.href,
        );
        if (result) {
          e.preventDefault();
          e.stopPropagation();
          this.dispatchEvent(
            new CustomEvent("slide-navigate", {
              detail: { id: result.slide.id, index: result.index },
              bubbles: true,
              composed: true,
            }),
          );
          return;
        }
        this.focus({ preventScroll: true });
      };
      iframeDoc.addEventListener("keydown", this.#iframeKeyboardHandler);
      iframeDoc.addEventListener("click", this.#iframeLinkClickHandler);
    } catch {}
  }
  #handleIframeLoad() {
    try {
      const iframeDoc = this.#iframe.contentDocument;
      const iframeSrc = this.#iframe.src;
      const svg = iframeDoc?.querySelector("svg");
      if (svg) {
        this.#handleSvgDimensions(svg);
        return;
      }
      if (IMAGE_EXTENSIONS.test(iframeSrc)) {
        this.#handleImageInIframe(iframeSrc);
        return;
      }
      const existingImg = iframeDoc?.querySelector("img");
      if (existingImg) {
        this.#waitForImageAndSetDimensions(existingImg);
        return;
      }
      this.#setDefaultDimensions();
    } catch {
      this.#setDefaultDimensions();
    }
  }
  #handleSvgDimensions(svg) {
    const iframeDoc = svg.ownerDocument;
    if (
      iframeDoc?.head &&
      !iframeDoc.head.querySelector("style[data-viewer]")
    ) {
      const styleEl = iframeDoc.createElement("style");
      styleEl.setAttribute("data-viewer", "true");
      styleEl.textContent =
        "html, body { margin: 0; padding: 0; } svg { display: block; }";
      iframeDoc.head.appendChild(styleEl);
    }
    const { width, height } = this.#measureSvg(svg);
    this.#setDimensionsAndScale(width, height);
  }
  #measureSvg(svg) {
    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    if (wAttr && hAttr && !wAttr.includes("%") && !hAttr.includes("%")) {
      const w = parseFloat(wAttr);
      const h = parseFloat(hAttr);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { width: vb.width, height: vb.height };
    }
    try {
      const bb = svg.getBBox();
      if (bb.width > 0 && bb.height > 0)
        return { width: bb.width, height: bb.height };
    } catch {}
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0)
      return { width: rect.width, height: rect.height };
    return { width: 800, height: 600 };
  }
  #handleImageInIframe(imageSrc) {
    const overlayPath = this.#currentSlide?.overlay;
    if (overlayPath) {
      this.#iframe.style.backgroundImage = `url('${imageSrc}')`;
      this.#iframe.style.backgroundSize = "contain";
      this.#iframe.style.backgroundRepeat = "no-repeat";
      this.#iframe.style.backgroundPosition = "top left";
      this.#iframe.src = overlayPath;
    } else {
      this.#renderImage(imageSrc);
    }
  }
  #renderImage(imageSrc) {
    const iframeDoc = this.#iframe.contentDocument;
    iframeDoc.body.innerHTML = "";
    if (!iframeDoc.head.querySelector("style[data-viewer]")) {
      const styleEl = iframeDoc.createElement("style");
      styleEl.setAttribute("data-viewer", "true");
      styleEl.textContent = iframeStyles;
      iframeDoc.head.appendChild(styleEl);
    }
    const img = iframeDoc.createElement("img");
    img.src = imageSrc;
    img.alt = "Diagram";
    iframeDoc.body.appendChild(img);
    this.#waitForImageAndSetDimensions(img);
  }
  #waitForImageAndSetDimensions(img) {
    if (img.complete && img.naturalWidth > 0) {
      this.#handleImageDimensions(img);
    } else {
      img.onload = () => this.#handleImageDimensions(img);
      img.onerror = () => this.#setDefaultDimensions();
    }
  }
  #handleImageDimensions(img) {
    this.#setDimensionsAndScale(
      img.naturalWidth || 800,
      img.naturalHeight || 600,
    );
  }
  #setDimensionsAndScale(width, height) {
    const viewerW = this.clientWidth;
    const viewerH = this.clientHeight;
    const remToPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const padding = 2 * remToPx;
    const scaleX = (viewerW - padding) / width;
    const scaleY = (viewerH - padding) / height;
    const fitScale = Math.max(scaleX, scaleY);
    this.#iframe.style.width = `${width}px`;
    this.#iframe.style.height = `${height}px`;
    this.#iframe.dataset.fitScale = fitScale;
    this.#iframe.dataset.baseWidth = width;
    this.#iframe.dataset.baseHeight = height;
    if (!this.#initialLoadDone) {
      if (!this.hasAttribute("zoom") && !this.#zoomExplicitlySet) {
        this.#zoomLevel = 1;
      }
      this.#initialLoadDone = true;
    }
    this.#applyZoom();
    this.#contentWidth = width;
    this.#contentHeight = height;
  }
  #setDefaultDimensions() {
    this.#iframe.style.width = "100%";
    this.#iframe.style.height = "100%";
    this.#iframe.dataset.fitScale = "1";
    this.#applyZoom();
  }
  #applyZoom() {
    const fitScale = parseFloat(this.#iframe.dataset.fitScale) || 1;
    const baseW = parseFloat(this.#iframe.dataset.baseWidth) || 800;
    const baseH = parseFloat(this.#iframe.dataset.baseHeight) || 600;
    const scale = fitScale * this.#zoomLevel;
    const remToPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const padding = 2 * remToPx;
    this.#iframe.style.transform = `scale(${scale})`;
    const scaledW = baseW * scale;
    const scaledH = baseH * scale;
    const containerW = Math.max(scaledW + padding, this.clientWidth);
    const containerH = Math.max(scaledH + padding, this.clientHeight);
    this.#iframeContainer.style.width = `${containerW}px`;
    this.#iframeContainer.style.height = `${containerH}px`;
    requestAnimationFrame(() => {
      if (this.#anchorOnLoad) {
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.#anchorOnLoad = false;
      }
    });
    this.#dispatchZoomChange();
  }
  #handleWheelZoom(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      this.#zoomLevel = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, this.#zoomLevel + delta),
      );
      this.#applyZoom();
    }
  }
};
if (!customElements.get("diagram-canvas")) {
  customElements.define("diagram-canvas", DiagramCanvas);
} else if (customElements.get("diagram-canvas") !== DiagramCanvas) {
  console.warn(
    '[diagram-canvas] A different constructor is already registered under "diagram-canvas". Skipping re-definition.',
  );
}

// src/diagram-nav-tree.css
var diagram_nav_tree_default =
  ":host {\n  display: contents;\n}\n\n.sidebar-header {\n  align-items: center;\n  background: var(--color-bg, #fff);\n  border-block-end: 1px solid var(--color-border, #e5e5e5);\n  border-inline-end: 1px solid var(--color-border, #e5e5e5);\n  display: flex;\n  gap: 0.625rem;\n  grid-area: sidebar-header;\n  height: 3rem;\n  padding: 0.75rem 1rem;\n}\n\n.sidebar-header svg {\n  color: var(--color-primary, #6366f1);\n  flex-shrink: 0;\n  height: 1.25rem;\n  width: 1.25rem;\n}\n\n.sidebar-header h1 {\n  color: var(--color-text, #2e3346);\n  flex: 1;\n  font-size: 0.875rem;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.sidebar-collapse-btn {\n  align-items: center;\n  background: transparent;\n  border: none;\n  border-radius: 0.25rem;\n  color: var(--color-text-subtle, #9ca3af);\n  cursor: pointer;\n  display: flex;\n  height: 1.5rem;\n  justify-content: center;\n  transition: all 150ms;\n  width: 1.5rem;\n}\n\n.sidebar-collapse-btn:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  color: var(--color-text-light, #6b7280);\n}\n\n.sidebar-collapse-btn svg {\n  color: inherit;\n  height: 0.875rem;\n  width: 0.875rem;\n}\n\n.nav-tree {\n  background: var(--color-bg, #fff);\n  border-inline-end: 1px solid var(--color-border, #e5e5e5);\n  grid-area: sidebar-nav;\n  overflow-y: auto;\n  padding: 0.25rem 0.5rem;\n}\n\n.nav-group { margin: 0; }\n\n.nav-row {\n  align-items: center;\n  display: flex;\n  gap: 0;\n}\n\n.nav-toggle {\n  align-items: center;\n  background: transparent;\n  border: none;\n  color: var(--color-text-subtle, #9ca3af);\n  cursor: pointer;\n  display: flex;\n  flex-shrink: 0;\n  height: 1.5rem;\n  justify-content: center;\n  padding: 0;\n  width: 1.25rem;\n}\n\n.nav-toggle:hover { color: var(--color-text-light, #6b7280); }\n\n.nav-toggle svg {\n  height: 0.625rem;\n  transition: transform 150ms;\n  width: 0.625rem;\n}\n\n.nav-toggle.collapsed svg { transform: rotate(-90deg); }\n.nav-toggle.no-children { visibility: hidden; }\n\n.step-bullet {\n  align-items: center;\n  background: transparent;\n  border: none;\n  color: transparent;\n  display: flex;\n  flex-shrink: 0;\n  font-size: 0.375rem;\n  height: 1.5rem;\n  justify-content: center;\n  padding: 0;\n  width: 1.25rem;\n}\n\n.step-bullet.active { color: var(--color-primary, #6366f1); }\n\n.nav-item {\n  align-items: center;\n  border-radius: 0.25rem;\n  color: var(--color-text-muted, #5c5f77);\n  cursor: pointer;\n  display: flex;\n  flex: 1;\n  font-size: 0.8125rem;\n  gap: 0.375rem;\n  min-width: 0;\n  padding: 0.375rem 0.5rem;\n  text-decoration: none;\n}\n\n.nav-item:focus {\n  outline: none;\n}\n.nav-item:focus-visible {\n  outline: 2px solid var(--color-primary, #6366f1);\n  outline-offset: -2px;\n}\n.nav-item:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  color: var(--color-text, #2e3346);\n}\n\n.nav-item.active {\n  background: var(--color-bg-active, #eff0fe);\n  color: var(--color-primary, #6366f1);\n}\n\n.nav-item.step.active { background: transparent; }\n\n.nav-item .label {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.nav-children {\n  border-inline-start: 1px solid var(--color-border, #e5e5e5);\n  margin-inline-start: 0.625rem;\n  overflow: hidden;\n  padding-inline-start: 0.625rem;\n}\n\n.nav-children.collapsed { display: none; }\n\n.step-badge {\n  color: var(--color-text-subtle, #9ca3af);\n  flex-shrink: 0;\n  font-size: 0.625rem;\n  margin-inline-start: auto;\n}\n\n.sidebar-footer {\n  align-items: center;\n  background: var(--color-bg, #fff);\n  border-block-start: 1px solid var(--color-border, #e5e5e5);\n  border-inline-end: 1px solid var(--color-border, #e5e5e5);\n  display: flex;\n  gap: 0.5rem;\n  grid-area: sidebar-footer;\n  justify-content: space-between;\n  padding: 0.75rem 1rem;\n}\n\n.zoom-controls {\n  align-items: center;\n  display: flex;\n  gap: 0.125rem;\n}\n\n.zoom-btn {\n  align-items: center;\n  background: var(--color-bg, #fff);\n  border: 1px solid var(--color-border, #e5e5e5);\n  border-radius: 0.25rem;\n  color: var(--color-text-light, #6b7280);\n  cursor: pointer;\n  display: flex;\n  font-size: 0.875rem;\n  height: 1.5rem;\n  justify-content: center;\n  transition: all 150ms;\n  width: 1.5rem;\n}\n\n.zoom-btn:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  border-color: #d1d5db;\n  color: var(--color-text, #2e3346);\n}\n\n.zoom-level {\n  color: var(--color-text-light, #6b7280);\n  font-size: 0.6875rem;\n  min-width: 2.5rem;\n  padding-inline: 0.375rem;\n  text-align: center;\n}\n\n.attribution {\n  color: var(--color-text-subtle, #9ca3af);\n  font-size: 0.6875rem;\n}\n\n.attribution a {\n  color: var(--color-text-subtle, #9ca3af);\n  text-decoration: none;\n}\n\n.attribution a:hover { color: var(--color-primary, #6366f1); }\n\n.help-btn {\n  align-items: center;\n  background: transparent;\n  border: 1px solid var(--color-border, #e5e5e5);\n  border-radius: 50%;\n  color: var(--color-text-subtle, #9ca3af);\n  cursor: pointer;\n  display: flex;\n  font-size: 0.625rem;\n  font-weight: 600;\n  height: 1rem;\n  justify-content: center;\n  margin-inline-start: 0.25rem;\n  transition: all 150ms;\n  width: 1rem;\n}\n\n.help-btn:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  border-color: var(--color-primary, #6366f1);\n  color: var(--color-primary, #6366f1);\n}\n";

// src/diagram-nav-tree.js
var _sharedSheet3 = null;
function getSharedSheet3() {
  if (!_sharedSheet3 && diagram_nav_tree_default) {
    _sharedSheet3 = new CSSStyleSheet();
    _sharedSheet3.replaceSync(diagram_nav_tree_default);
  }
  return _sharedSheet3;
}
var DiagramNavTree = class extends HTMLElement {
  #manifest = null;
  #basePath = "";
  #activeSlideId = null;
  #navTreeEl;
  #titleEl;
  #zoomLevelEl;
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet3()];
  }
  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <div class="sidebar-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <h1 class="title">Diagram</h1>
        <button class="sidebar-collapse-btn" title="Hide sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7"/>
          </svg>
        </button>
      </div>
      <nav class="nav-tree"></nav>
      <div class="sidebar-footer">
        <span class="attribution">
          <a href="https://d2lang.com" target="_blank" rel="noopener">D2</a>
        </span>
        <div class="zoom-controls">
          <button class="zoom-btn zoom-out" title="Zoom out (\u2212)">\u2212</button>
          <span class="zoom-level">150%</span>
          <button class="zoom-btn zoom-in" title="Zoom in (+)">+</button>
          <button class="zoom-btn zoom-fit" title="Fit to view (0)">\u22A1</button>
          <button class="help-btn" title="Keyboard shortcuts (?)">?</button>
        </div>
      </div>
    `;
    this.#navTreeEl = this.shadowRoot.querySelector(".nav-tree");
    this.#titleEl = this.shadowRoot.querySelector(".title");
    this.#zoomLevelEl = this.shadowRoot.querySelector(".zoom-level");
    this.shadowRoot
      .querySelector(".sidebar-collapse-btn")
      .addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("sidebar-collapse", {
            bubbles: true,
            composed: true,
          }),
        );
      });
    this.shadowRoot.querySelector(".zoom-in").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("zoom-in", { bubbles: true, composed: true }),
      );
    });
    this.shadowRoot.querySelector(".zoom-out").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("zoom-out", { bubbles: true, composed: true }),
      );
    });
    this.shadowRoot.querySelector(".zoom-fit").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("zoom-reset", { bubbles: true, composed: true }),
      );
    });
    this.shadowRoot.querySelector(".help-btn").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("help-open", { bubbles: true, composed: true }),
      );
    });
  }
  // ─── Public API ─────────────────────────────────────────────────────────
  set title(val) {
    if (this.#titleEl) this.#titleEl.textContent = val ?? "Diagram";
  }
  set zoomPercent(val) {
    if (this.#zoomLevelEl) this.#zoomLevelEl.textContent = `${val}%`;
  }
  set activeSlideId(id) {
    this.#activeSlideId = id;
    this.#updateActiveHighlight();
  }
  /** Set active slide for highlighting */
  setActive(slideId) {
    this.#activeSlideId = slideId;
    this.#updateActiveHighlight();
  }
  buildTree(manifest, basePath) {
    this.#manifest = manifest;
    this.#basePath = basePath;
    this.#renderTree();
  }
  // ─── Private ────────────────────────────────────────────────────────────
  #renderTree() {
    if (!this.#navTreeEl || !this.#manifest) return;
    this.#navTreeEl.innerHTML = "";
    for (const layer of this.#manifest.layers) {
      this.#createNavItem(layer, this.#navTreeEl);
    }
  }
  #createNavItem(item, parent) {
    const group = document.createElement("div");
    group.className = "nav-group";
    const row = document.createElement("div");
    row.className = "nav-row";
    const hasChildren =
      item.children?.length > 0 ||
      (item.type === "steps" && item.steps?.length > 0);
    if (item.type === "step") {
      const bullet = document.createElement("span");
      bullet.className = "step-bullet";
      bullet.textContent = "\u25CF";
      bullet.dataset.id = item.id;
      row.appendChild(bullet);
    } else {
      const toggle = document.createElement("button");
      toggle.className = `nav-toggle${hasChildren ? "" : " no-children"}`;
      toggle.innerHTML =
        '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M2 3l3 3.5L8 3z"/></svg>';
      toggle.setAttribute("aria-label", "Toggle");
      row.appendChild(toggle);
      if (hasChildren) {
        toggle.addEventListener("click", (e) => {
          e.stopPropagation();
          toggle.classList.toggle("collapsed");
          const childContainer =
            row.parentElement?.querySelector(".nav-children");
          childContainer?.classList.toggle("collapsed");
        });
      }
    }
    const link = document.createElement("a");
    link.className = `nav-item${item.type === "step" ? " step" : ""}`;
    link.href = `#${item.id}`;
    link.dataset.id = item.id;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.title;
    link.appendChild(label);
    if (item.type === "steps" && item.steps) {
      const badge = document.createElement("span");
      badge.className = "step-badge";
      badge.textContent = item.steps.length;
      link.appendChild(badge);
    }
    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent("slide-select", {
          detail: { id: item.id },
          bubbles: true,
          composed: true,
        }),
      );
    });
    row.appendChild(link);
    group.appendChild(row);
    if (hasChildren) {
      const childContainer = document.createElement("div");
      childContainer.className = "nav-children";
      if (item.children) {
        for (const child of item.children) {
          this.#createNavItem(child, childContainer);
        }
      }
      if (item.type === "steps" && item.steps) {
        for (const step of item.steps) {
          this.#createNavItem(
            {
              id: `${item.id}-step-${step.step}`,
              title: step.title,
              path: step.path,
              type: "step",
            },
            childContainer,
          );
        }
      }
      group.appendChild(childContainer);
    }
    parent.appendChild(group);
  }
  #updateActiveHighlight() {
    if (!this.#navTreeEl) return;
    for (const item of this.shadowRoot.querySelectorAll(".nav-item")) {
      item.classList.toggle("active", item.dataset.id === this.#activeSlideId);
    }
    for (const bullet of this.shadowRoot.querySelectorAll(".step-bullet")) {
      bullet.classList.toggle(
        "active",
        bullet.dataset.id === this.#activeSlideId,
      );
    }
  }
};
if (!customElements.get("diagram-nav-tree")) {
  customElements.define("diagram-nav-tree", DiagramNavTree);
} else if (customElements.get("diagram-nav-tree") !== DiagramNavTree) {
  console.warn(
    '[diagram-nav-tree] A different constructor is already registered under "diagram-nav-tree". Skipping re-definition.',
  );
}

// src/diagram-help-modal.css
var diagram_help_modal_default =
  ":host {\n  display: contents;\n}\n\n.help-modal-backdrop {\n  align-items: center;\n  background: rgb(0 0 0 / 50%);\n  display: none;\n  inset: 0;\n  justify-content: center;\n  position: absolute;\n  z-index: 2000;\n}\n\n.help-modal-backdrop.open {\n  display: flex;\n}\n\n.help-modal {\n  background: var(--color-bg, #fff);\n  border-radius: 0.5rem;\n  box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 20%);\n  max-height: 90%;\n  max-width: 28rem;\n  overflow: auto;\n  padding: 1.5rem;\n  width: 90%;\n}\n\n.help-modal-header {\n  align-items: center;\n  display: flex;\n  justify-content: space-between;\n  margin-block-end: 1rem;\n}\n\n.help-modal-header h2 {\n  color: var(--color-text, #2e3346);\n  font-size: 1rem;\n  font-weight: 600;\n  margin: 0;\n}\n\n.help-modal-close {\n  align-items: center;\n  background: transparent;\n  border: none;\n  border-radius: 0.25rem;\n  color: var(--color-text-subtle, #9ca3af);\n  cursor: pointer;\n  display: flex;\n  height: 1.5rem;\n  justify-content: center;\n  transition: all 150ms;\n  width: 1.5rem;\n}\n\n.help-modal-close:hover {\n  background: var(--color-bg-hover, #f3f4f6);\n  color: var(--color-text, #2e3346);\n}\n\n.help-modal-section {\n  margin-block-end: 1rem;\n}\n\n.help-modal-section:last-child {\n  margin-block-end: 0;\n}\n\n.help-modal-section h3 {\n  color: var(--color-text-muted, #5c5f77);\n  font-size: 0.6875rem;\n  font-weight: 600;\n  letter-spacing: 0.05em;\n  margin-block-end: 0.5rem;\n  text-transform: uppercase;\n}\n\n.help-modal-row {\n  align-items: center;\n  display: flex;\n  gap: 0.75rem;\n  padding: 0.375rem 0;\n}\n\n.help-modal-keys {\n  display: flex;\n  flex-shrink: 0;\n  gap: 0.25rem;\n  min-width: 5rem;\n}\n\nkbd {\n  background: var(--color-bg-hover, #f3f4f6);\n  border: 1px solid var(--color-border, #e5e5e5);\n  border-radius: 0.25rem;\n  color: var(--color-text, #2e3346);\n  font-family: inherit;\n  font-size: 0.6875rem;\n  padding: 0.125rem 0.375rem;\n}\n\n.help-modal-desc {\n  color: var(--color-text-muted, #5c5f77);\n  font-size: 0.8125rem;\n}\n";

// src/diagram-help-modal.js
var _sharedSheet4 = null;
function getSharedSheet4() {
  if (!_sharedSheet4 && diagram_help_modal_default) {
    _sharedSheet4 = new CSSStyleSheet();
    _sharedSheet4.replaceSync(diagram_help_modal_default);
  }
  return _sharedSheet4;
}
var DiagramHelpModal = class extends HTMLElement {
  #backdrop;
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet4()];
  }
  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <div class="help-modal-backdrop">
        <div class="help-modal">
          <div class="help-modal-header">
            <h2>Keyboard Shortcuts</h2>
            <button class="help-modal-close" title="Close (Esc)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="help-modal-section">
            <h3>Navigation</h3>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>\u2191</kbd> <kbd>\u2193</kbd></span>
              <span class="help-modal-desc">Navigate sequentially through slides</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>\u2190</kbd> <kbd>\u2192</kbd></span>
              <span class="help-modal-desc">Navigate through click history (back/forward)</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Space</kbd></span>
              <span class="help-modal-desc">Same as \u2192 (forward in history)</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Home</kbd> <kbd>End</kbd></span>
              <span class="help-modal-desc">Jump to first/last slide</span>
            </div>
          </div>
          <div class="help-modal-section">
            <h3>Zoom</h3>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>+</kbd> <kbd>\u2212</kbd></span>
              <span class="help-modal-desc">Zoom in/out</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>0</kbd></span>
              <span class="help-modal-desc">Reset zoom to fit</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Ctrl</kbd> <kbd>Scroll</kbd></span>
              <span class="help-modal-desc">Zoom with mouse wheel</span>
            </div>
          </div>
          <div class="help-modal-section">
            <h3>Other</h3>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>F</kbd></span>
              <span class="help-modal-desc">Toggle fullscreen</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>?</kbd></span>
              <span class="help-modal-desc">Show/hide this help</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Esc</kbd></span>
              <span class="help-modal-desc">Close this help</span>
            </div>
          </div>
        </div>
      </div>
    `;
    this.#backdrop = this.shadowRoot.querySelector(".help-modal-backdrop");
    this.shadowRoot
      .querySelector(".help-modal-close")
      .addEventListener("click", () => this.close());
    this.#backdrop.addEventListener("click", (e) => {
      if (e.target === this.#backdrop) this.close();
    });
  }
  get isOpen() {
    return this.#backdrop?.classList.contains("open") ?? false;
  }
  open() {
    this.#backdrop?.classList.add("open");
  }
  close() {
    this.#backdrop?.classList.remove("open");
  }
  toggle() {
    this.#backdrop?.classList.toggle("open");
  }
};
if (!customElements.get("diagram-help-modal")) {
  customElements.define("diagram-help-modal", DiagramHelpModal);
} else if (customElements.get("diagram-help-modal") !== DiagramHelpModal) {
  console.warn(
    '[diagram-help-modal] A different constructor is already registered under "diagram-help-modal". Skipping re-definition.',
  );
}

// src/diagram-viewer.css
var diagram_viewer_default = `:host {
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
  outline: none;
  width: 100%;
}

:host(:focus-within) {
  outline: none;
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

/* \u2500\u2500\u2500 JSON Dialog \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.json-dialog-backdrop {
  align-items: center;
  background: rgb(0 0 0 / 40%);
  display: none;
  inset: 0;
  justify-content: center;
  position: absolute;
  z-index: 1000;
}

.json-dialog-backdrop.open {
  display: flex;
}

.json-dialog {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 20%);
  font-family: inherit;
  max-height: 80vh;
  max-width: 40rem;
  padding: 1rem;
  width: 90%;
}

.json-dialog-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-block-end: 0.5rem;
}

.json-dialog-header h2 {
  font-size: 0.875rem;
  font-weight: 600;
}

.json-dialog textarea {
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  height: 50vh;
  padding: 0.5rem;
  resize: vertical;
  width: 100%;
}

.json-dialog-footer {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  margin-block-start: 0.5rem;
}

.json-dialog-footer button {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.375rem 0.75rem;
}

.json-dialog-footer button:hover {
  background: var(--color-bg-hover);
}

.json-dialog-footer button.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.json-dialog-footer button.primary:hover {
  opacity: 0.9;
}

.json-dialog-error {
  color: var(--color-error);
  font-size: 0.75rem;
  margin-inline-start: auto;
}

.json-dialog-copied {
  color: var(--color-primary);
  font-size: 0.75rem;
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

// src/diagram-viewer.js
var STORAGE_PREFIX = "diagramViewer.v1";
var PERSIST_DELAY = 250;
function fnv1a32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
var _sharedSheet5 = null;
function getSharedSheet5() {
  if (!_sharedSheet5 && diagram_viewer_default) {
    _sharedSheet5 = new CSSStyleSheet();
    _sharedSheet5.replaceSync(diagram_viewer_default);
  }
  return _sharedSheet5;
}
var DiagramViewer = class extends HTMLElement {
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
  #resolvedBaseUrl = null;
  #flatSlides = [];
  #currentIndex = 0;
  #zoomLevel = 1;
  #navigationHistory = [];
  #forwardHistory = [];
  #abortController = null;
  #initialLoadDone = false;
  #sourceData = null;
  // last loadData payload for reset()
  #persistTimer = null;
  #hashChangeController = null;
  // separate abort for hashchange listener
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
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet5()];
  }
  connectedCallback() {
    this.#abortController = new AbortController();
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }
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
    this.#migrateLegacyStorage();
    this.#resolveHashOwnership();
    if (this.hasAttribute("manifest")) {
      this.#loadManifest();
    } else if (!this.#loadFromStorage()) {
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
    if (this.hasAttribute("primary")) return true;
    const hasPrimary = [...all].some((el) => el.hasAttribute("primary"));
    if (!hasPrimary) {
      console.warn(
        '[diagram-viewer] Multiple bookmarkable viewers exist but none has the "primary" attribute. No viewer will own the URL hash. Add primary to one instance.',
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
      if (localStorage.getItem(namespacedKey)) return;
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) return;
      if (document.querySelectorAll("diagram-viewer").length > 1) return;
      localStorage.setItem(namespacedKey, legacyRaw);
      localStorage.removeItem(legacyKey);
    } catch {}
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
    if (name === "base-path") {
      this.#basePath = newValue ?? "";
      this.#resolvedBaseUrl = null;
    }
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
    if (!data || typeof data !== "object" || !Array.isArray(data.layers)) {
      throw new Error(
        'loadData: invalid manifest \u2014 expected v0 shape with a "layers" array. Required: { layers: [{ id, title, path, type }] }',
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
          `loadData: layers[${i}] is invalid \u2014 each layer must have string id, title, path, and type.`,
        );
      }
    }
    const pctRe = /%[0-9A-Fa-f]{2}/;
    const validateNoPct = (items, breadcrumb) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = `${breadcrumb}[${i}] (id="${item.id}")`;
        if (pctRe.test(item.path)) {
          throw new Error(
            `loadData: ${label}.path contains percent-encoding \u2014 manifest paths must be raw/unencoded \u2014 use a literal space, not %20`,
          );
        }
        if (item.overlay && pctRe.test(item.overlay)) {
          throw new Error(
            `loadData: ${label}.overlay contains percent-encoding \u2014 manifest paths must be raw/unencoded \u2014 use a literal space, not %20`,
          );
        }
        if (item.steps) {
          for (let s = 0; s < item.steps.length; s++) {
            if (pctRe.test(item.steps[s].path)) {
              throw new Error(
                `loadData: ${label}.steps[${s}].path contains percent-encoding \u2014 manifest paths must be raw/unencoded \u2014 use a literal space, not %20`,
              );
            }
          }
        }
        if (item.children) {
          validateNoPct(item.children, `${label}.children`);
        }
      }
    };
    validateNoPct(data.layers, "layers");
    this.#sourceData = data;
    this.#basePath = this.getAttribute("base-path") || "";
    this.#resolvedBaseUrl = null;
    let preservedUi = null;
    try {
      const raw = localStorage.getItem(this.#storageKey());
      if (raw) {
        const snapshot = JSON.parse(raw);
        if (snapshot.version === 1 && snapshot.ui) {
          preservedUi = snapshot.ui;
        }
      }
    } catch {}
    this.#manifest = data;
    this.#navTree.title = data.name ?? "Diagram";
    this.#buildFlatSlideList();
    this.#navTree.buildTree(data, this.#basePath);
    if (preservedUi) {
      if (typeof preservedUi.zoomPercent === "number") {
        this.#zoomLevel = preservedUi.zoomPercent / 100;
        this.#canvas.zoomLevel = this.#zoomLevel;
        this.#navTree.zoomPercent = preservedUi.zoomPercent;
      }
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
    try {
      localStorage.removeItem(this.#storageKey());
    } catch {}
    let basePath;
    if (resolved.endsWith("/")) {
      basePath = resolved;
    } else {
      basePath = resolved.slice(0, resolved.lastIndexOf("/"));
    }
    this.setAttribute("base-path", basePath);
    this.setAttribute("manifest", resolved);
    this.#basePath = basePath;
    this.#resolvedBaseUrl = null;
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
    try {
      localStorage.removeItem(this.#storageKey());
    } catch {}
    this.#manifest = null;
    this.#flatSlides = [];
    this.#currentIndex = 0;
    this.#navigationHistory = [];
    this.#forwardHistory = [];
    const zoomAttr = parseInt(this.getAttribute("zoom"), 10);
    this.#zoomLevel = zoomAttr > 0 && isFinite(zoomAttr) ? zoomAttr / 100 : 1;
    this.#canvas.zoomLevel = this.#zoomLevel;
    this.#navTree.zoomPercent = Math.round(this.#zoomLevel * 100);
    this.#container.classList.remove("sidebar-collapsed");
    this.#container.style.gridTemplateColumns = "";
    if (this.#ownsHash()) {
      history.replaceState(null, "", location.pathname + location.search);
    }
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
      this.#resolvedBaseUrl = null;
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
      }
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
      } catch {}
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
    this.#sidebarToggleBtn.addEventListener(
      "click",
      () => {
        this.#container.classList.remove("sidebar-collapsed");
        this.#persist();
      },
      { signal },
    );
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
    this.#initResizeHandle(signal);
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
    $(".json-copy").addEventListener(
      "click",
      async () => {
        errorEl.textContent = "";
        try {
          await navigator.clipboard.writeText(textarea.value);
        } catch {
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
        try {
          localStorage.setItem(this.#storageKey(), JSON.stringify(parsed));
        } catch {}
        this.#applySnapshot(parsed);
        backdrop.classList.remove("open");
      },
      { signal },
    );
    $(".json-close").addEventListener(
      "click",
      () => {
        backdrop.classList.remove("open");
      },
      { signal },
    );
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
    this.#resolvedBaseUrl = null;
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
    signal.addEventListener("abort", () => {
      dragController?.abort();
      dragController = null;
    });
  }
  async #loadManifest() {
    const manifestPath = this.getAttribute("manifest");
    this.#basePath = this.getAttribute("base-path") ?? "";
    this.#resolvedBaseUrl = null;
    if (!manifestPath) return;
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
  #resolvedBase() {
    if (!this.#resolvedBaseUrl) {
      if (!this.#basePath) {
        this.#resolvedBaseUrl = document.baseURI;
      } else {
        const base = this.#basePath.endsWith("/")
          ? this.#basePath
          : this.#basePath + "/";
        this.#resolvedBaseUrl = new URL(base, document.baseURI).href;
      }
    }
    return this.#resolvedBaseUrl;
  }
  #resolveSlideUrl(relativePath) {
    return new URL(relativePath, this.#resolvedBase()).href;
  }
  #buildFlatSlideList() {
    this.#flatSlides = [];
    const processItem = (item, parentId = null) => {
      this.#flatSlides.push({
        id: item.id,
        title: item.title,
        path: this.#resolveSlideUrl(item.path),
        type: item.type,
        parentId,
        overlay: item.overlay ? this.#resolveSlideUrl(item.overlay) : null,
      });
      if (item.type === "steps" && item.steps) {
        for (const step of item.steps) {
          this.#flatSlides.push({
            id: `${item.id}-step-${step.step}`,
            title: `${item.title} - ${step.title}`,
            path: this.#resolveSlideUrl(step.path),
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
};
if (!customElements.get("diagram-viewer")) {
  customElements.define("diagram-viewer", DiagramViewer);
} else if (customElements.get("diagram-viewer") !== DiagramViewer) {
  console.warn(
    '[diagram-viewer] A different constructor is already registered under "diagram-viewer". Skipping re-definition.',
  );
}
export { DiagramViewer };
