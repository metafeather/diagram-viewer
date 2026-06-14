/**
 * <diagram-loader> — companion control bar for <diagram-viewer>.
 * Provides URL input + Load/JSON/Reset buttons that delegate to the viewer.
 *
 * Attributes: for, placeholder, value
 */

import styles from './diagram-loader.css';

let _sharedSheet = null;
function getSharedSheet() {
  if (!_sharedSheet && styles) {
    _sharedSheet = new CSSStyleSheet();
    _sharedSheet.replaceSync(styles);
  }
  return _sharedSheet;
}

class DiagramLoader extends HTMLElement {
  static get observedAttributes() {
    return ['for', 'placeholder', 'value'];
  }

  #input;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    shadow.adoptedStyleSheets = [getSharedSheet()];

    shadow.innerHTML = `
      <div class="row">
        <input type="text" class="path" placeholder="path/to/manifest.json">
        <button class="load">Load</button>
        <button class="json">JSON</button>
        <button class="reset">Reset</button>
      </div>
    `;

    this.#input = shadow.querySelector('.path');

    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.#handleLoad();
    });
    shadow.querySelector('.load').addEventListener('click', () => this.#handleLoad());
    shadow.querySelector('.json').addEventListener('click', () => this.#handleJson());
    shadow.querySelector('.reset').addEventListener('click', () => this.#handleReset());
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'placeholder' && this.#input) {
      this.#input.placeholder = val || 'path/to/manifest.json';
    }
    if (name === 'value' && this.#input) {
      this.#input.value = val || '';
    }
  }

  #getTarget() {
    const sel = this.getAttribute('for');
    if (!sel) { console.warn('[diagram-loader] No "for" attribute set.'); return null; }
    const el = document.querySelector(sel);
    if (!el) { console.warn(`[diagram-loader] Target not found: ${sel}`); return null; }
    return el;
  }

  #handleLoad() {
    const value = this.#input.value.trim();
    if (!value) {
      this.#input.classList.add('error');
      setTimeout(() => this.#input.classList.remove('error'), 1000);
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
      this.#input.value = '';
    }
  }
}

if (!customElements.get('diagram-loader')) {
  customElements.define('diagram-loader', DiagramLoader);
} else if (customElements.get('diagram-loader') !== DiagramLoader) {
  console.warn('[diagram-loader] A different constructor is already registered under "diagram-loader". Skipping re-definition.');
}

export { DiagramLoader };
