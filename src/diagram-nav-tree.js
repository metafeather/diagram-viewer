/**
 * <diagram-nav-tree> — sidebar with header, collapse/expand, attribution,
 * recursive nav tree, step bullets, active highlighting.
 *
 * Properties (set by parent):
 *   - manifest: full manifest object
 *   - basePath: string
 *   - activeSlideId: string
 *   - title: string
 *   - zoomPercent: number
 *
 * Events emitted (all use `bubbles: true, composed: true` so they cross shadow
 * DOM boundaries and reach the parent <diagram-viewer> host):
 *   - slide-select: { detail: { id } } when a nav item is clicked
 *   - sidebar-collapse: when collapse button clicked
 *   - zoom-in / zoom-out / zoom-reset: zoom button clicks
 *   - help-open: when ? button clicked
 *   - json-open: when JSON button clicked
 *   - reset: when Reset button clicked
 */

const styles = `
:host {
  display: contents;
}

.sidebar-header {
  align-items: center;
  background: var(--color-bg, #fff);
  border-block-end: 1px solid var(--color-border, #e5e5e5);
  border-inline-end: 1px solid var(--color-border, #e5e5e5);
  display: flex;
  gap: 0.625rem;
  grid-area: sidebar-header;
  height: 3rem;
  padding: 0.75rem 1rem;
}

.sidebar-header svg {
  color: var(--color-primary, #6366f1);
  flex-shrink: 0;
  height: 1.25rem;
  width: 1.25rem;
}

.sidebar-header h1 {
  color: var(--color-text, #2e3346);
  flex: 1;
  font-size: 0.875rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-collapse-btn {
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

.sidebar-collapse-btn:hover {
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-light, #6b7280);
}

.sidebar-collapse-btn svg {
  color: inherit;
  height: 0.875rem;
  width: 0.875rem;
}

.nav-tree {
  background: var(--color-bg, #fff);
  border-inline-end: 1px solid var(--color-border, #e5e5e5);
  grid-area: sidebar-nav;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.nav-group { margin: 0; }

.nav-row {
  align-items: center;
  display: flex;
  gap: 0;
}

.nav-toggle {
  align-items: center;
  background: transparent;
  border: none;
  color: var(--color-text-subtle, #9ca3af);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  height: 1.5rem;
  justify-content: center;
  padding: 0;
  width: 1.25rem;
}

.nav-toggle:hover { color: var(--color-text-light, #6b7280); }

.nav-toggle svg {
  height: 0.625rem;
  transition: transform 150ms;
  width: 0.625rem;
}

.nav-toggle.collapsed svg { transform: rotate(-90deg); }
.nav-toggle.no-children { visibility: hidden; }

.step-bullet {
  align-items: center;
  background: transparent;
  border: none;
  color: transparent;
  display: flex;
  flex-shrink: 0;
  font-size: 0.375rem;
  height: 1.5rem;
  justify-content: center;
  padding: 0;
  width: 1.25rem;
}

.step-bullet.active { color: var(--color-primary, #6366f1); }

.nav-item {
  align-items: center;
  border-radius: 0.25rem;
  color: var(--color-text-muted, #5c5f77);
  cursor: pointer;
  display: flex;
  flex: 1;
  font-size: 0.8125rem;
  gap: 0.375rem;
  min-width: 0;
  padding: 0.375rem 0.5rem;
  text-decoration: none;
}

.nav-item:focus {
  outline: none;
}
.nav-item:focus-visible {
  outline: 2px solid var(--color-primary, #6366f1);
  outline-offset: -2px;
}
.nav-item:hover {
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text, #2e3346);
}

.nav-item.active {
  background: var(--color-bg-active, #eff0fe);
  color: var(--color-primary, #6366f1);
}

.nav-item.step.active { background: transparent; }

.nav-item .label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-children {
  border-inline-start: 1px solid var(--color-border, #e5e5e5);
  margin-inline-start: 0.625rem;
  overflow: hidden;
  padding-inline-start: 0.625rem;
}

.nav-children.collapsed { display: none; }

.step-badge {
  color: var(--color-text-subtle, #9ca3af);
  flex-shrink: 0;
  font-size: 0.625rem;
  margin-inline-start: auto;
}

.sidebar-footer {
  align-items: center;
  background: var(--color-bg, #fff);
  border-block-start: 1px solid var(--color-border, #e5e5e5);
  border-inline-end: 1px solid var(--color-border, #e5e5e5);
  display: flex;
  gap: 0.5rem;
  grid-area: sidebar-footer;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.zoom-controls {
  align-items: center;
  display: flex;
  gap: 0.125rem;
}

.zoom-btn {
  align-items: center;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 0.25rem;
  color: var(--color-text-light, #6b7280);
  cursor: pointer;
  display: flex;
  font-size: 0.875rem;
  height: 1.5rem;
  justify-content: center;
  transition: all 150ms;
  width: 1.5rem;
}

.zoom-btn:hover {
  background: var(--color-bg-hover, #f3f4f6);
  border-color: #d1d5db;
  color: var(--color-text, #2e3346);
}

.zoom-level {
  color: var(--color-text-light, #6b7280);
  font-size: 0.6875rem;
  min-width: 2.5rem;
  padding-inline: 0.375rem;
  text-align: center;
}

.attribution {
  color: var(--color-text-subtle, #9ca3af);
  font-size: 0.6875rem;
}

.attribution a {
  color: var(--color-text-subtle, #9ca3af);
  text-decoration: none;
}

.attribution a:hover { color: var(--color-primary, #6366f1); }

.help-btn {
  align-items: center;
  background: transparent;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 50%;
  color: var(--color-text-subtle, #9ca3af);
  cursor: pointer;
  display: flex;
  font-size: 0.625rem;
  font-weight: 600;
  height: 1rem;
  justify-content: center;
  margin-inline-start: 0.25rem;
  transition: all 150ms;
  width: 1rem;
}

.help-btn:hover {
  background: var(--color-bg-hover, #f3f4f6);
  border-color: var(--color-primary, #6366f1);
  color: var(--color-primary, #6366f1);
}

.footer-text-btn {
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

.footer-text-btn:hover {
  background: var(--color-bg-hover, #f3f4f6);
  border-color: #d1d5db;
  color: var(--color-text, #2e3346);
}
`;

class DiagramNavTree extends HTMLElement {
  #manifest = null;
  #basePath = '';
  #activeSlideId = null;
  #navTreeEl;
  #titleEl;
  #zoomLevelEl;
  #sheet = new CSSStyleSheet();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.#sheet.replaceSync(styles);
    this.shadowRoot.adoptedStyleSheets = [this.#sheet];
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
        <button class="footer-text-btn json-btn" title="Import/Export JSON">JSON</button>
        <button class="footer-text-btn reset-btn" title="Reset to defaults">Reset</button>
        <span class="attribution">
          <a href="https://d2lang.com" target="_blank" rel="noopener">D2</a>
        </span>
        <div class="zoom-controls">
          <button class="zoom-btn zoom-out" title="Zoom out (−)">−</button>
          <span class="zoom-level">150%</span>
          <button class="zoom-btn zoom-in" title="Zoom in (+)">+</button>
          <button class="zoom-btn zoom-fit" title="Fit to view (0)">⊡</button>
          <button class="help-btn" title="Keyboard shortcuts (?)">?</button>
        </div>
      </div>
    `;

    this.#navTreeEl = this.shadowRoot.querySelector('.nav-tree');
    this.#titleEl = this.shadowRoot.querySelector('.title');
    this.#zoomLevelEl = this.shadowRoot.querySelector('.zoom-level');

    // Event listeners
    this.shadowRoot.querySelector('.sidebar-collapse-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('sidebar-collapse', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.zoom-in').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('zoom-in', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.zoom-out').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('zoom-out', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.zoom-fit').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('zoom-reset', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.help-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('help-open', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.json-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('json-open', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('.reset-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('reset', { bubbles: true, composed: true }));
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  set title(val) {
    if (this.#titleEl) this.#titleEl.textContent = val ?? 'Diagram';
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
    this.#navTreeEl.innerHTML = '';

    for (const layer of this.#manifest.layers) {
      this.#createNavItem(layer, this.#navTreeEl);
    }
  }

  #createNavItem(item, parent) {
    const group = document.createElement('div');
    group.className = 'nav-group';

    const row = document.createElement('div');
    row.className = 'nav-row';

    const hasChildren = item.children?.length > 0 || (item.type === 'steps' && item.steps?.length > 0);

    if (item.type === 'step') {
      const bullet = document.createElement('span');
      bullet.className = 'step-bullet';
      bullet.textContent = '●';
      bullet.dataset.id = item.id;
      row.appendChild(bullet);
    } else {
      const toggle = document.createElement('button');
      toggle.className = `nav-toggle${hasChildren ? '' : ' no-children'}`;
      toggle.innerHTML = '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M2 3l3 3.5L8 3z"/></svg>';
      toggle.setAttribute('aria-label', 'Toggle');
      row.appendChild(toggle);

      if (hasChildren) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          toggle.classList.toggle('collapsed');
          const childContainer = row.parentElement?.querySelector('.nav-children');
          childContainer?.classList.toggle('collapsed');
        });
      }
    }

    const link = document.createElement('a');
    link.className = `nav-item${item.type === 'step' ? ' step' : ''}`;
    link.href = `#${item.id}`;
    link.dataset.id = item.id;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.title;
    link.appendChild(label);

    if (item.type === 'steps' && item.steps) {
      const badge = document.createElement('span');
      badge.className = 'step-badge';
      badge.textContent = item.steps.length;
      link.appendChild(badge);
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('slide-select', {
        detail: { id: item.id },
        bubbles: true, composed: true,
      }));
      link.blur();
    });

    row.appendChild(link);
    group.appendChild(row);

    if (hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = 'nav-children';

      if (item.children) {
        for (const child of item.children) {
          this.#createNavItem(child, childContainer);
        }
      }

      if (item.type === 'steps' && item.steps) {
        for (const step of item.steps) {
          this.#createNavItem({
            id: `${item.id}-step-${step.step}`,
            title: step.title,
            path: step.path,
            type: 'step',
          }, childContainer);
        }
      }

      group.appendChild(childContainer);
    }

    parent.appendChild(group);
  }

  #updateActiveHighlight() {
    if (!this.#navTreeEl) return;

    for (const item of this.shadowRoot.querySelectorAll('.nav-item')) {
      item.classList.toggle('active', item.dataset.id === this.#activeSlideId);
    }

    for (const bullet of this.shadowRoot.querySelectorAll('.step-bullet')) {
      bullet.classList.toggle('active', bullet.dataset.id === this.#activeSlideId);
    }
  }
}

if (!customElements.get('diagram-nav-tree')) {
  customElements.define('diagram-nav-tree', DiagramNavTree);
} else if (customElements.get('diagram-nav-tree') !== DiagramNavTree) {
  console.warn('[diagram-nav-tree] A different constructor is already registered under "diagram-nav-tree". Skipping re-definition.');
}

export { DiagramNavTree };
