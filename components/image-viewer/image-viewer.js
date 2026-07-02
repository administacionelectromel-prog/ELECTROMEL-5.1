/**
 * ELECTROMEL — components/image-viewer/image-viewer.js
 * Visor fullscreen de imágenes con swipe y zoom.
 * Diseñado para Android con touch events.
 *
 * Uso:
 *   const viewer = new ImageViewer();
 *   viewer.open(photos, startIndex);
 *   viewer.destroy();
 */

export class ImageViewer {
  constructor() {
    this._el        = null;
    this._photos    = [];
    this._current   = 0;
    this._built     = false;
    this._listeners = [];
  }

  /* ── Build ─────────────────────────────────────────────── */
  _build() {
    if (this._built) return;
    this._built = true;

    const el = document.createElement('div');
    el.id        = 'image-viewer-fullscreen';
    el.className = 'image-viewer-overlay hide';
    el.innerHTML = `
      <div class="image-viewer-header">
        <button class="image-viewer-close" type="button">×</button>
        <span class="image-viewer-counter">1 / 1</span>
      </div>
      <div class="image-viewer-stage">
        <button class="image-viewer-prev" type="button">‹</button>
        <div class="image-viewer-img-wrap">
          <img class="image-viewer-img" src="" alt="" draggable="false">
          <div class="image-viewer-skeleton hide"></div>
        </div>
        <button class="image-viewer-next" type="button">›</button>
      </div>
      <div class="image-viewer-thumbs"></div>`;

    document.body.appendChild(el);
    this._el = el;

    const img    = el.querySelector('.image-viewer-img');
    const skel   = el.querySelector('.image-viewer-skeleton');
    this._img    = img;
    this._skel   = skel;
    this._thumbs = el.querySelector('.image-viewer-thumbs');
    this._counter = el.querySelector('.image-viewer-counter');

    /* Botones */
    el.querySelector('.image-viewer-close').addEventListener('click', () => this.close());
    el.querySelector('.image-viewer-prev').addEventListener('click',  () => this.prev());
    el.querySelector('.image-viewer-next').addEventListener('click',  () => this.next());

    /* Swipe */
    _initSwipe(el.querySelector('.image-viewer-stage'), {
      onSwipeLeft:  () => this.next(),
      onSwipeRight: () => this.prev()
    });

    /* Doble tap zoom (básico) */
    let lastTap = 0;
    img.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 300) img.classList.toggle('image-viewer-zoomed');
      lastTap = now;
    });

    /* Cerrar con Escape */
    this._keyHandler = e => { if (e.key === 'Escape') this.close(); };
    this._on(document, 'keydown', this._keyHandler);
  }

  /* ── API ─────────────────────────────────────────────── */

  /**
   * @param {Array<{url:string, caption?:string}>} photos
   * @param {number} [startIndex=0]
   */
  open(photos, startIndex = 0) {
    this._build();
    this._photos  = photos || [];
    this._current = Math.max(0, Math.min(startIndex, this._photos.length - 1));
    this._renderThumbs();
    this._showCurrent();
    this._el.classList.remove('hide');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this._el?.classList.add('hide');
    document.body.style.overflow = '';
    if (this._img) { this._img.classList.remove('image-viewer-zoomed'); this._img.src = ''; }
  }

  next() {
    if (this._photos.length <= 1) return;
    this._current = (this._current + 1) % this._photos.length;
    this._showCurrent();
  }

  prev() {
    if (this._photos.length <= 1) return;
    this._current = (this._current - 1 + this._photos.length) % this._photos.length;
    this._showCurrent();
  }

  destroy() {
    this.close();
    this._listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
    this._listeners = [];
    this._el?.parentNode?.removeChild(this._el);
    this._built = false;
  }

  /* ── Internos ─────────────────────────────────────────── */
  _showCurrent() {
    const photo = this._photos[this._current];
    if (!photo) return;

    /* Skeleton mientras carga */
    this._skel?.classList.remove('hide');
    this._img.style.opacity = '0';
    this._img.classList.remove('image-viewer-zoomed');

    this._img.onload = () => {
      this._skel?.classList.add('hide');
      this._img.style.opacity = '1';
    };
    this._img.onerror = () => {
      this._skel?.classList.add('hide');
      this._img.style.opacity = '0.3';
    };
    this._img.src = photo.url || photo;

    /* Counter */
    if (this._counter) {
      this._counter.textContent = `${this._current + 1} / ${this._photos.length}`;
    }

    /* Thumbs activo */
    this._thumbs.querySelectorAll('.ivt').forEach((t, i) => {
      t.classList.toggle('ivt-active', i === this._current);
    });
  }

  _renderThumbs() {
    if (!this._thumbs) return;
    this._thumbs.innerHTML = '';
    if (this._photos.length <= 1) return;
    const frag = document.createDocumentFragment();
    this._photos.forEach((p, i) => {
      const t = document.createElement('button');
      t.type      = 'button';
      t.className = 'ivt' + (i === this._current ? ' ivt-active' : '');
      t.style.cssText = `background-image:url(${p.thumb || p.url || p});background-size:cover;background-position:center;`;
      t.addEventListener('click', () => { this._current = i; this._showCurrent(); });
      frag.appendChild(t);
    });
    this._thumbs.appendChild(frag);
  }

  _on(el, type, fn) {
    el.addEventListener(type, fn);
    this._listeners.push({ el, type, fn });
  }
}

/* ── Swipe helper ─────────────────────────────────────── */
function _initSwipe(el, { onSwipeLeft, onSwipeRight }) {
  if (!el) return;
  let startX = 0, startY = 0;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) onSwipeLeft?.();
    else         onSwipeRight?.();
  }, { passive: true });
}
