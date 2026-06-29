/**
 * ELECTROMEL — components/bottom-sheet/bottom-sheet.js
 * Bottom-sheet reutilizable con swipe-to-close y backdrop.
 */

export class BottomSheet {
  /**
   * @param {Object} opts
   * @param {string}   opts.id
   * @param {string}   opts.title
   * @param {string}   [opts.bodyHTML]
   * @param {Function} [opts.onClose]
   */
  constructor(opts = {}) {
    this._opts  = opts;
    this._el    = null;
    this._built = false;
  }

  _build() {
    if (this._built) return;
    this._built = true;
    const { id, title, bodyHTML } = this._opts;

    let el = id ? document.getElementById(id) : null;
    if (!el) {
      el = document.createElement('div');
      if (id) el.id = id;
      el.className = 'modal modal-bottom';
      document.body.appendChild(el);
    }
    this._el = el;
    el.innerHTML = `
      <div class="modal-header">
        <button class="modal-close" type="button">×</button>
        <div class="modal-title">${title || ''}</div>
      </div>
      <div class="modal-body">${bodyHTML || ''}</div>`;

    el.querySelector('.modal-close')?.addEventListener('click', () => this.close());

    /* Swipe down to close */
    _initSwipeClose(el, () => this.close());
  }

  open()    { this._build(); this._el.classList.add('active'); }
  close()   { this._el?.classList.remove('active'); this._opts.onClose?.(); }
  destroy() { this.close(); this._el?.parentNode?.removeChild(this._el); this._built = false; }
  setBody(html) { this._build(); const b = this._el.querySelector('.modal-body'); if (b) b.innerHTML = html; }
  get bodyEl()  { this._build(); return this._el?.querySelector('.modal-body'); }
}

/* ── Swipe-to-close ──────────────────────────────────── */
function _initSwipeClose(el, onClose) {
  let startY = 0, isDragging = false;
  const header = el.querySelector('.modal-header');
  if (!header) return;

  header.addEventListener('touchstart', e => {
    startY     = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  header.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  header.addEventListener('touchend', e => {
    isDragging = false;
    const dy   = e.changedTouches[0].clientY - startY;
    el.style.transform = '';
    if (dy > 80) onClose();
  });
}
