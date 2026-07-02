/**
 * ELECTROMEL — components/tabs/tabs.js
 * Componente Tabs reutilizable para paneles internos.
 */

export class Tabs {
  /**
   * @param {HTMLElement} container
   * @param {Array<{id, label, render: async () => HTMLElement}>} tabs
   */
  constructor(container, tabs) {
    this._container = container;
    this._tabs      = tabs;
    this._activeId  = tabs[0]?.id;
    this._built     = false;
  }

  build() {
    if (this._built) return;
    this._built = true;

    const tabBar = document.createElement('div');
    tabBar.className = 'tabs-inner';

    const content = document.createElement('div');
    content.className = 'tabs-content';
    this._content = content;

    this._tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'tab-inner' + (tab.id === this._activeId ? ' active' : '');
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.activate(tab.id));
      tabBar.appendChild(btn);
    });

    this._container.appendChild(tabBar);
    this._container.appendChild(content);
    this._renderActive();
  }

  async activate(id) {
    this._activeId = id;
    this._container.querySelectorAll('.tab-inner').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === id);
    });
    await this._renderActive();
  }

  async _renderActive() {
    const tab = this._tabs.find(t => t.id === this._activeId);
    if (!tab || !this._content) return;
    this._content.innerHTML = '';
    if (tab.render) {
      const el = await tab.render();
      if (el) this._content.appendChild(el);
    }
  }
}
