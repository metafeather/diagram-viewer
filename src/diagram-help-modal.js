/**
 * <diagram-help-modal> — native <dialog> with keyboard shortcut reference.
 * Public API: open(), close()
 */

import styles from './diagram-help-modal.css';

let _sharedSheet = null;
function getSharedSheet() {
  if (!_sharedSheet && styles) {
    _sharedSheet = new CSSStyleSheet();
    _sharedSheet.replaceSync(styles);
  }
  return _sharedSheet;
}

class DiagramHelpModal extends HTMLElement {
  #backdrop;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [getSharedSheet()];
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
              <span class="help-modal-keys"><kbd>↑</kbd> <kbd>↓</kbd></span>
              <span class="help-modal-desc">Navigate sequentially through slides</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>←</kbd> <kbd>→</kbd></span>
              <span class="help-modal-desc">Navigate through click history (back/forward)</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Space</kbd></span>
              <span class="help-modal-desc">Same as → (forward in history)</span>
            </div>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>Home</kbd> <kbd>End</kbd></span>
              <span class="help-modal-desc">Jump to first/last slide</span>
            </div>
          </div>
          <div class="help-modal-section">
            <h3>Zoom</h3>
            <div class="help-modal-row">
              <span class="help-modal-keys"><kbd>+</kbd> <kbd>−</kbd></span>
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

    this.#backdrop = this.shadowRoot.querySelector('.help-modal-backdrop');

    this.shadowRoot.querySelector('.help-modal-close').addEventListener('click', () => this.close());
    this.#backdrop.addEventListener('click', (e) => {
      if (e.target === this.#backdrop) this.close();
    });
  }

  get isOpen() {
    return this.#backdrop?.classList.contains('open') ?? false;
  }

  open() {
    this.#backdrop?.classList.add('open');
  }

  close() {
    this.#backdrop?.classList.remove('open');
  }

  toggle() {
    this.#backdrop?.classList.toggle('open');
  }
}

if (!customElements.get('diagram-help-modal')) {
  customElements.define('diagram-help-modal', DiagramHelpModal);
} else if (customElements.get('diagram-help-modal') !== DiagramHelpModal) {
  console.warn('[diagram-help-modal] A different constructor is already registered under "diagram-help-modal". Skipping re-definition.');
}

export { DiagramHelpModal };
