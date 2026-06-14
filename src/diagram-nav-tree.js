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
 */

import styles from './diagram-nav-tree.css';


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
