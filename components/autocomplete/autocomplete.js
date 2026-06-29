/**
 * ELECTROMEL — components/autocomplete/autocomplete.js
 * Dropdown de autocompletado genérico.
 * Usado por clientes, plantillas y futuras integraciones.
 *
 * Uso:
 *   const ac = new Autocomplete(inputEl, {
 *     search: async (q) => [...items],
 *     onSelect: (item) => { ... },
 *     renderItem: (item) => element
 *   });
 *   ac.destroy(); // limpieza
 */

export class Autocomplete {
  /**
   * @param {HTMLInputElement} input
   * @param {Object} opts
   * @param {Function} opts.search     - async (query: string) => Array
   * @param {Function} opts.onSelect   - (item) => void
   * @param {Function} [opts.renderItem] - (item) => HTMLElement
   * @param {number}   [opts.minChars=2]
   * @param {number}   [opts.debounce=150]
   * @param {number}   [opts.maxItems=8]
   */
  constructor(input, opts) {
    this._input     = input;
    this._opts      = { minChars: 2, debounce: 150, maxItems: 8, ...opts };
    this._dropdown  = null;
    this._timer     = null;
    this._listeners = [];
    this._init();
  }

  _init() {
    if (!this._input || this._input._acInit) return;
    this._input._acInit = true;

    /* Crear dropdown */
    const dd = document.createElement('div');
    dd.className = 'autocomplete-dropdown hide';
    this._input.parentNode.style.position = 'relative';
    this._input.parentNode.appendChild(dd);
    this._dropdown = dd;

    this._on(this._input, 'input', () => {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._search(), this._opts.debounce);
    });

    this._on(this._input, 'blur', () => {
      setTimeout(() => this._hide(), 200);
    });
  }

  async _search() {
    const q = this._input.value.trim();
    if (q.length < this._opts.minChars) { this._hide(); return; }

    const results = await this._opts.search(q);
    if (!results?.length) { this._hide(); return; }

    const items = results.slice(0, this._opts.maxItems);
    this._dropdown.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach(item => {
      const el = this._opts.renderItem
        ? this._opts.renderItem(item)
        : this._defaultRender(item);
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        this._opts.onSelect(item);
        this._hide();
      });
      frag.appendChild(el);
    });
    this._dropdown.appendChild(frag);
    this._dropdown.classList.remove('hide');
  }

  _defaultRender(item) {
    const el = document.createElement('div');
    el.className   = 'autocomplete-item';
    el.textContent = typeof item === 'string' ? item : (item.label || item.nombre || JSON.stringify(item));
    return el;
  }

  _hide()  { this._dropdown.classList.add('hide'); }
  _on(el, type, fn) {
    el.addEventListener(type, fn);
    this._listeners.push({ el, type, fn });
  }

  destroy() {
    this._listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
    this._listeners = [];
    this._dropdown?.parentNode?.removeChild(this._dropdown);
    if (this._input) this._input._acInit = false;
  }
}
