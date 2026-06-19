/**
 * <diagram-canvas> — encapsulates iframe, zoom, SVG/image dimension detection,
 * PNG-with-SVG-overlay handling, mouse-wheel zoom, iframe link interception.
 *
 * Properties (set by parent):
 *   - slide: { path, overlay } object
 *   - zoomLevel: number (default 1.0)
 *
 * Events emitted (all use `bubbles: true, composed: true` so they cross shadow
 * DOM boundaries and reach the parent <diagram-viewer> host):
 *   - slide-navigate: { detail: { id, index } } when an iframe link is clicked
 *   - zoom-change: { detail: { zoomPercent } } after any zoom adjustment
 *   - iframe-keydown: { detail: { key, ctrlKey, … } } keyboard from iframe
 *
 * Public API:
 *   - zoomIn(), zoomOut(), zoomReset()
 *   - get zoomPercent
 *   - loadSlide(slide)
 */

const ZOOM_STEP = 0.5;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|ico)(\?.*)?$/i;

const iframeStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: flex; align-items: flex-start; justify-content: flex-start; }
  img { display: block; max-width: none; }
`;

import styles from './diagram-canvas.css';

let _sharedSheet = null;
function getSharedSheet() {
  if (!_sharedSheet && styles) {
    _sharedSheet = new CSSStyleSheet();
    _sharedSheet.replaceSync(styles);
  }
  return _sharedSheet;
}

class DiagramCanvas extends HTMLElement {
  #iframe;
  #iframeContainer;
  #zoomLevel = 1.0;
  #zoomExplicitlySet = false;
  #initialLoadDone = false;
  #contentWidth = 0;
  #contentHeight = 0;
  #resizeObserver = null;
  #resizeRaf = 0;

  #flatSlides = [];
  #currentSlide = null;

  // Iframe event handlers
  #iframeKeyboardHandler = null;
  #iframeLinkClickHandler = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet()];
  }

  connectedCallback() {
    // Ensure the host element is focusable so this.focus() works
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '-1');
    }

    this.shadowRoot.innerHTML = `
      <div class="resize-overlay"></div>
      <div class="iframe-container">
        <iframe title="Diagram"></iframe>
      </div>
    `;
    this.#iframe = this.shadowRoot.querySelector('iframe');
    this.#iframeContainer = this.shadowRoot.querySelector('.iframe-container');

    this.#iframe.addEventListener('load', () => {
      this.#handleIframeLoad();
      this.#handleIframeNavigation();
    });

    // Mouse wheel zoom
    this.addEventListener('wheel', (e) => this.#handleWheelZoom(e), { passive: false });

    // Re-fit on viewer resize
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
    if (typeof val === 'number' && val >= ZOOM_MIN && val <= ZOOM_MAX) {
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
    this.#iframe.style.backgroundImage = '';
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
    this.classList.toggle('resizing', active);
  }

  /** Forward keyboard event from parent/iframe */
  handleKeyDown(e) {
    // Proxy — parent calls this for nav keys caught in iframe
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  #dispatchZoomChange() {
    this.dispatchEvent(new CustomEvent('zoom-change', {
      detail: { zoomPercent: this.zoomPercent },
      bubbles: true, composed: true,
    }));
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
    return locationHref && !locationHref.startsWith('about:')
      ? locationHref
      : this.#iframe.src;
  }

  #handleIframeNavigation() {
    try {
      const result = this.#resolveUrlToSlide(this.#getIframeSrc());
      if (result && result.slide.id !== this.#currentSlide?.id) {
        // Iframe navigated to a different slide internally
        this.dispatchEvent(new CustomEvent('slide-navigate', {
          detail: { id: result.slide.id, index: result.index },
          bubbles: true, composed: true,
        }));
      }
      this.#setupIframeEventHandlers();
    } catch {
      this.#setupIframeEventHandlers();
    }
  }

  #setupIframeEventHandlers() {
    try {
      const iframeDoc = this.#iframe.contentDocument ?? this.#iframe.contentWindow?.document;
      if (!iframeDoc) return;

      if (this.#iframeKeyboardHandler) {
        iframeDoc.removeEventListener('keydown', this.#iframeKeyboardHandler);
      }
      if (this.#iframeLinkClickHandler) {
        iframeDoc.removeEventListener('click', this.#iframeLinkClickHandler);
      }

      const navKeys = new Set([
        'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
        ' ', 'Home', 'End', 'f', '=', '-', '0', '?', 'Escape',
      ]);

      this.#iframeKeyboardHandler = (e) => {
        if (navKeys.has(e.key)) {
          e.preventDefault();
          // Re-dispatch to parent
          this.dispatchEvent(new CustomEvent('iframe-keydown', {
            detail: { key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey },
            bubbles: true, composed: true,
          }));
        }
      };

      this.#iframeLinkClickHandler = (e) => {
        const link = e.target.closest('a');
        if (!link) {
        this.focus({ preventScroll: true });
      return;
    }
    const href = link.getAttribute('href') || link.getAttributeNS(XLINK_NS, 'href');
    if (!href) return;

    const result = this.#resolveUrlToSlide(href, this.#iframe.contentWindow?.location?.href);
    if (result) {
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('slide-navigate', {
        detail: { id: result.slide.id, index: result.index },
        bubbles: true, composed: true,
      }));
      return;
    }
    this.focus({ preventScroll: true });
      };

      iframeDoc.addEventListener('keydown', this.#iframeKeyboardHandler);
      iframeDoc.addEventListener('click', this.#iframeLinkClickHandler);
    } catch {
      // Cross-origin
    }
  }

  #handleIframeLoad() {
    try {
      const iframeDoc = this.#iframe.contentDocument;
      const iframeSrc = this.#iframe.src;

      const svg = iframeDoc?.querySelector('svg');
      if (svg) {
        this.#handleSvgDimensions(svg);
        return;
      }

      if (IMAGE_EXTENSIONS.test(iframeSrc)) {
        this.#handleImageInIframe(iframeSrc);
        return;
      }

      const existingImg = iframeDoc?.querySelector('img');
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
    // When a browser loads an SVG file directly, documentElement is the <svg>
    // itself — there is no HTML wrapper, so <head> and <body> are null. The
    // body-margin reset is unnecessary in that case, so we safely skip injection.
    if (iframeDoc?.head && !iframeDoc.head.querySelector('style[data-viewer]')) {
      const styleEl = iframeDoc.createElement('style');
      styleEl.setAttribute('data-viewer', 'true');
      styleEl.textContent = 'html, body { margin: 0; padding: 0; } svg { display: block; }';
      iframeDoc.head.appendChild(styleEl);
    }
    const { width, height } = this.#measureSvg(svg);
    this.#setDimensionsAndScale(width, height);
  }

  #measureSvg(svg) {
    // 1. Explicit width/height attrs — only if both are concrete (no %)
    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    if (wAttr && hAttr && !wAttr.includes("%") && !hAttr.includes("%")) {
      const w = parseFloat(wAttr);
      const h = parseFloat(hAttr);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    // 2. viewBox baseVal
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { width: vb.width, height: vb.height };
    }
    // 3. getBBox (rendered content bounds)
    try {
      const bb = svg.getBBox();
      if (bb.width > 0 && bb.height > 0) return { width: bb.width, height: bb.height };
    } catch { /* detached or unsupported */ }
    // 4. getBoundingClientRect (last resort)
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
    // 5. Hard fallback
    return { width: 800, height: 600 };
  }

  #handleImageInIframe(imageSrc) {
    const overlayPath = this.#currentSlide?.overlay;
    if (overlayPath) {
      this.#iframe.style.backgroundImage = `url('${imageSrc}')`;
      this.#iframe.style.backgroundSize = 'contain';
      this.#iframe.style.backgroundRepeat = 'no-repeat';
      this.#iframe.style.backgroundPosition = 'top left';
      this.#iframe.src = overlayPath;
    } else {
      this.#renderImage(imageSrc);
    }
  }

  #renderImage(imageSrc) {
    const iframeDoc = this.#iframe.contentDocument;
    iframeDoc.body.innerHTML = '';
    if (!iframeDoc.head.querySelector('style[data-viewer]')) {
      const styleEl = iframeDoc.createElement('style');
      styleEl.setAttribute('data-viewer', 'true');
      styleEl.textContent = iframeStyles;
      iframeDoc.head.appendChild(styleEl);
    }
    const img = iframeDoc.createElement('img');
    img.src = imageSrc;
    img.alt = 'Diagram';
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
    this.#setDimensionsAndScale(img.naturalWidth || 800, img.naturalHeight || 600);
  }

  #setDimensionsAndScale(width, height) {
    const viewerW = this.clientWidth;
    const viewerH = this.clientHeight;
    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const padding = 2 * remToPx;

    const scaleX = (viewerW - padding) / width;
    const scaleY = (viewerH - padding) / height;
    // Cover fit: scale so the shortest side of the content fully matches the
    // corresponding viewport side. The longer side overflows and is reachable
    // via the existing scroll container. Equivalent to CSS `object-fit: cover`.
    const fitScale = Math.max(scaleX, scaleY);

    this.#iframe.style.width = `${width}px`;
    this.#iframe.style.height = `${height}px`;
    this.#iframe.dataset.fitScale = fitScale;
    this.#iframe.dataset.baseWidth = width;
    this.#iframe.dataset.baseHeight = height;

    if (!this.#initialLoadDone) {
      if (!this.hasAttribute('zoom') && !this.#zoomExplicitlySet) {
        this.#zoomLevel = 1.0;
      }
      this.#initialLoadDone = true;
    }
    this.#applyZoom();
    this.#contentWidth = width;
    this.#contentHeight = height;
  }

  #setDefaultDimensions() {
    this.#iframe.style.width = '100%';
    this.#iframe.style.height = '100%';
    this.#iframe.dataset.fitScale = '1';
    this.#applyZoom();
  }

  #applyZoom() {
    const fitScale = parseFloat(this.#iframe.dataset.fitScale) || 1;
    const baseW = parseFloat(this.#iframe.dataset.baseWidth) || 800;
    const baseH = parseFloat(this.#iframe.dataset.baseHeight) || 600;
    const scale = fitScale * this.#zoomLevel;
    const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const padding = 2 * remToPx;

    this.#iframe.style.transform = `scale(${scale})`;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;
    const containerW = Math.max(scaledW + padding, this.clientWidth);
    const containerH = Math.max(scaledH + padding, this.clientHeight);
    this.#iframeContainer.style.width = `${containerW}px`;
    this.#iframeContainer.style.height = `${containerH}px`;

    requestAnimationFrame(() => {
      this.scrollLeft = (this.scrollWidth - this.clientWidth) / 2;
      this.scrollTop = (this.scrollHeight - this.clientHeight) / 2;
    });

    this.#dispatchZoomChange();
  }

  #handleWheelZoom(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      this.#zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.#zoomLevel + delta));
      this.#applyZoom();
    }
  }
}

if (!customElements.get('diagram-canvas')) {
  customElements.define('diagram-canvas', DiagramCanvas);
} else if (customElements.get('diagram-canvas') !== DiagramCanvas) {
  console.warn('[diagram-canvas] A different constructor is already registered under "diagram-canvas". Skipping re-definition.');
}

export { DiagramCanvas };
