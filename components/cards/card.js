/**
 * ELECTROMEL — components/cards/card.js
 * Card builder genérico para el sistema de detalle.
 */

export class Card {
  constructor(title, opts = {}) {
    this._title  = title;
    this._opts   = opts;
    this._el     = null;
  }

  build() {
    const el = document.createElement('div');
    el.className = 'card' + (this._opts.className ? ' ' + this._opts.className : '');
    if (this._opts.style) el.style.cssText = this._opts.style;
    if (this._title) {
      const h = document.createElement('div');
      h.className   = 'card-title';
      h.textContent = this._title;
      el.appendChild(h);
    }
    this._el = el;
    return el;
  }

  addRow(label, value) {
    if (!this._el) this.build();
    if (!value && value !== 0) return this;
    const row = document.createElement('div');
    row.className = 'detalle-row';
    row.innerHTML =
      `<span class="detalle-label">${label}</span>` +
      `<span class="detalle-value">${String(value)}</span>`;
    this._el.appendChild(row);
    return this;
  }

  addEl(el) {
    if (!this._el) this.build();
    this._el.appendChild(el);
    return this;
  }

  get el() { return this._el || this.build(); }

  static fromRows(title, rows, opts) {
    const c = new Card(title, opts);
    c.build();
    rows.forEach(([label, value]) => c.addRow(label, value));
    return c.el;
  }
}
