/**
 * <diagram-loader> — companion control bar for <diagram-viewer>.
 * Provides URL input + Load/JSON/Reset buttons that delegate to the viewer.
 *
 * Attributes: for, placeholder, value
 */

const styles = `
:host {
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.row {
  align-items: center;
  display: flex;
  gap: 0.375rem;
}

.path {
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 0.25rem;
  color: var(--color-text, #2e3346);
  flex: 1;
  font-family: inherit;
  font-size: 0.75rem;
  height: 1.5rem;
  padding: 0 0.5rem;
  transition: border-color 150ms;
}

.path:focus {
  border-color: var(--color-primary, #6366f1);
  outline: none;
}

.path.error {
  border-color: var(--color-error, #ef4444);
}

button {
  align-items: center;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 0.25rem;
  color: var(--color-text-light, #6b7280);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  height: 1.5rem;
  justify-content: center;
  line-height: 1;
  padding: 0.125rem 0.5rem;
  transition: all 150ms;
}

button:hover {
  background: var(--color-bg-hover, #f3f4f6);
  border-color: #d1d5db;
  color: var(--color-text, #2e3346);
}
`;

class DiagramLoader extends HTMLElement {
  static get observedAttributes() {
    return ['for', 'placeholder', 'value'];
  }

  #input;
  #sheet;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    this.#sheet = new CSSStyleSheet();
    this.#sheet.replaceSync(styles);
    shadow.adoptedStyleSheets = [this.#sheet];

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
