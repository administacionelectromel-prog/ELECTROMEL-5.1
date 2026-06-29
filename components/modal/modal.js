/**
 * ELECTROMEL — components/modal/modal.js
 * Componente Modal reutilizable.
 * Crea, abre, cierra y destruye modales fullscreen de forma programática.
 *
 * Uso:
 *   const m = new Modal({ id: 'mi-modal', title: 'Título', bodyHTML: '...' });
 *   m.open();
 *   m.close();
 *   m.destroy();
 */

export class Modal {
  /**
   * @param {Object} opts
   * @param {string}   opts.id        - ID único del modal (se reutiliza si existe)
   * @param {string}   opts.title     - Título en el header
   * @param {string}   [opts.bodyHTML]- HTML del body (alternativa a setBody)
   * @param {string}   [opts.footer]  - HTML del footer con botones
   * @param {boolean}  [opts.closable=true] - mostrar botón ×
   * @param {Function} [opts.onOpen]
   * @param {Function} [opts.onClose]
   */
  constructor(opts = {}) {
    this._opts    = { closable: true, ...opts };
    this._el      = null;
    this._body    = null;
    this._built   = false;
  }

  /* ── Build ─────────────────────────────────────────────── */
  _build() {
    if (this._built) return;
    this._built = true;
    const { id, title, bodyHTML, footer, closable } = this._opts;

    /* Reusar si ya existe */
    let el = id ? document.getElementById(id) : null;
    if (!el) {
      el = document.createElement('div');
      if (id) el.id = id;
      el.className = 'modal';
      document.body.appendChild(el);
    }
    this._el = el;

    el.innerHTML = `
      <div class="modal-header">
        ${closable !== false ? `<button class="modal-close" type="button">×</button>` : ''}
        <div class="modal-title">${title || ''}</div>
      </div>
      <div class="modal-body">${bodyHTML || ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;

    this._body = el.querySelector('.modal-body');

    el.querySelector('.modal-close')?.addEventListener('click', () => this.close());
  }

  /* ── API ─────────────────────────────────────────────── */
  open() {
    this._build();
    this._el.classList.add('active');
    this._opts.onOpen?.();
  }

  close() {
    this._el?.classList.remove('active');
    this._opts.onClose?.();
  }

  destroy() {
    this.close();
    if (this._el && document.body.contains(this._el)) {
      document.body.removeChild(this._el);
    }
    this._el    = null;
    this._body  = null;
    this._built = false;
  }

  /** Reemplaza el contenido del body */
  setBody(htmlOrElement) {
    this._build();
    if (!this._body) return;
    if (typeof htmlOrElement === 'string') {
      this._body.innerHTML = htmlOrElement;
    } else {
      this._body.innerHTML = '';
      this._body.appendChild(htmlOrElement);
    }
  }

  /** Actualiza el título */
  setTitle(title) {
    this._build();
    const el = this._el?.querySelector('.modal-title');
    if (el) el.textContent = title;
  }

  get bodyEl() { this._build(); return this._body; }
  get el()     { this._build(); return this._el; }
  get isOpen() { return this._el?.classList.contains('active') || false; }
}
