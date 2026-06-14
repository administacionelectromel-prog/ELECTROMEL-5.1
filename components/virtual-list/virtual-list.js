/**
 * ELECTROMEL — components/virtual-list/virtual-list.js
 * Virtual scroll reutilizable para listas grandes en Android.
 * Renderiza solo los items visibles → mínimo DOM → mínimo RAM.
 *
 * Uso:
 *   const vl = new VirtualList(containerEl, {
 *     items:      myArray,
 *     itemHeight: 80,
 *     renderItem: (item, index) => element,
 *     overscan:   3
 *   });
 *   vl.setItems(newItems);
 *   vl.scrollTo(index);
 *   vl.destroy();
 */

export class VirtualList {
  /**
   * @param {HTMLElement} container
   * @param {Object} opts
   * @param {Array}    opts.items        - datos a mostrar
   * @param {number}   opts.itemHeight   - altura fija de cada item (px)
   * @param {Function} opts.renderItem   - (item, index) => HTMLElement
   * @param {number}   [opts.overscan=3] - items extra a renderizar fuera del viewport
   */
  constructor(container, opts) {
    this._container  = container;
    this._opts       = { overscan: 3, ...opts };
    this._items      = opts.items || [];
    this._rendered   = new Map(); /* index → element */
    this._scrollTop  = 0;
    this._frameId    = null;
    this._built      = false;
    this._init();
  }

  _init() {
    if (this._built) return;
    this._built = true;

    /* Wrapper con altura total virtual */
    this._container.style.cssText += 'overflow-y:auto;position:relative;';

    this._spacer = document.createElement('div');
    this._spacer.style.cssText = 'position:absolute;width:1px;pointer-events:none;';
    this._container.appendChild(this._spacer);

    this._viewport = document.createElement('div');
    this._viewport.style.cssText = 'position:relative;';
    this._container.appendChild(this._viewport);

    this._container.addEventListener('scroll', () => this._onScroll(), { passive: true });
    this._updateSpacer();
    this._render();
  }

  /* ── API ──────────────────────────────────────────────── */

  setItems(items) {
    this._items = items || [];
    this._rendered.clear();
    this._viewport.innerHTML = '';
    this._updateSpacer();
    this._render();
  }

  scrollTo(index) {
    const top = index * this._opts.itemHeight;
    this._container.scrollTop = top;
  }

  scrollToTop() { this._container.scrollTop = 0; }

  destroy() {
    this._container.removeEventListener('scroll', this._onScroll);
    if (this._frameId) cancelAnimationFrame(this._frameId);
    this._rendered.clear();
    this._viewport.innerHTML = '';
    this._spacer.remove();
    this._built = false;
  }

  get visibleCount() {
    return Math.ceil(this._container.clientHeight / this._opts.itemHeight);
  }

  /* ── Internos ─────────────────────────────────────────── */

  _onScroll() {
    this._scrollTop = this._container.scrollTop;
    if (this._frameId) return; /* ya hay un frame pendiente */
    this._frameId = requestAnimationFrame(() => {
      this._frameId = null;
      this._render();
    });
  }

  _updateSpacer() {
    const totalH = this._items.length * this._opts.itemHeight;
    this._spacer.style.height = totalH + 'px';
    this._viewport.style.height = totalH + 'px';
  }

  _render() {
    const { itemHeight, overscan } = this._opts;
    const viewH    = this._container.clientHeight || 600;
    const scrollTop = this._scrollTop;

    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx   = Math.min(this._items.length - 1,
                              Math.ceil((scrollTop + viewH) / itemHeight) + overscan);

    /* Eliminar items fuera del rango visible */
    for (const [idx, el] of this._rendered) {
      if (idx < startIdx || idx > endIdx) {
        el.remove();
        this._rendered.delete(idx);
      }
    }

    /* Agregar items faltantes en el rango */
    const frag = document.createDocumentFragment();
    for (let i = startIdx; i <= endIdx; i++) {
      if (this._rendered.has(i)) continue;
      const item = this._items[i];
      if (!item) continue;

      const el = this._opts.renderItem(item, i);
      el.style.cssText += `position:absolute;top:${i * itemHeight}px;width:100%;height:${itemHeight}px;`;
      this._rendered.set(i, el);
      frag.appendChild(el);
    }
    this._viewport.appendChild(frag);
  }
}
