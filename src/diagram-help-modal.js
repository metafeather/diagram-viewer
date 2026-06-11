/**
 * <diagram-help-modal> — native <dialog> with keyboard shortcut reference.
 * Public API: open(), close()
 */

const styles = `
:host {
  display: contents;
}

.help-modal-backdrop {
  align-items: center;
  background: rgb(0 0 0 / 50%);
  display: none;
  inset: 0;
  justify-content: center;
  position: absolute;
  z-index: 2000;
}

.help-modal-backdrop.open {
  display: flex;
}

.help-modal {
  background: var(--color-bg, #fff);
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 20%);
  max-height: 90%;
  max-width: 28rem;
  overflow: auto;
  padding: 1.5rem;
  width: 90%;
}

.help-modal-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-block-end: 1rem;
}

.help-modal-header h2 {
  color: var(--color-text, #2e3346);
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.help-modal-close {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: var(--color-text-subtle, #9ca3af);
  cursor: pointer;
  display: flex;
  height: 1.5rem;
  justify-content: center;
  transition: all 150ms;
  width: 1.5rem;
}

.help-modal-close:hover {
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text, #2e3346);
}

.help-modal-section {
  margin-block-end: 1rem;
}

.help-modal-section:last-child {
  margin-block-end: 0;
}

.help-modal-section h3 {
  color: var(--color-text-muted, #5c5f77);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-block-end: 0.5rem;
  text-transform: uppercase;
}

.help-modal-row {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  padding: 0.375rem 0;
}

.help-modal-keys {
  display: flex;
  flex-shrink: 0;
  gap: 0.25rem;
  min-width: 5rem;
}

kbd {
  background: var(--color-bg-hover, #f3f4f6);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 0.25rem;
  color: var(--color-text, #2e3346);
  font-family: inherit;
  font-size: 0.6875rem;
  padding: 0.125rem 0.375rem;
}

.help-modal-desc {
  color: var(--color-text-muted, #5c5f77);
  font-size: 0.8125rem;
}
`;

class DiagramHelpModal extends HTMLElement {
  #backdrop;
  #sheet = new CSSStyleSheet();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.#sheet.replaceSync(styles);
    this.shadowRoot.adoptedStyleSheets = [this.#sheet];
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
