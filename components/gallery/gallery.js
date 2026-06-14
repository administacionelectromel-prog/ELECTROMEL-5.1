/**
 * ELECTROMEL — components/gallery/gallery.js
 * Galería horizontal de fotos con lazy loading y thumbnails.
 * Optimizada para Android con poca RAM.
 *
 * Uso:
 *   const g = new Gallery(containerEl, {
 *     photos: [{id, url, thumb, caption}],
 *     onDelete: async (id) => { ... },
 *     onView: (index) => { ... }
 *   });
 *   g.render();
 *   g.addPhoto(photo);
 *   g.removePhoto(id);
 */

export class Gallery {
  /**
   * @param {HTMLElement} container
   * @param {Object} opts
   * @param {Array}    opts.photos
   * @param {Function} [opts.onDelete]
   * @param {Function} [opts.onView]
   * @param {number}   [opts.maxPhotos=7]
   */
  constructor(container, opts = {}) {
    this._container = container;
    this._opts      = { maxPhotos: 7, ...opts };
    this._photos    = [...(opts.photos || [])];
    this._observer  = null;
  }

  /* ── Render ─────────────────────────────────────────── */
  render() {
    if (!this._container) return;
    this._container.innerHTML = '';
    this._container.className = 'gallery-strip';

    if (!this._photos.length) {
      this._container.innerHTML =
        '<div class="gallery-empty">Sin fotos. Tocá 📷 para agregar.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    /* Límite de fotos */
    const visible = this._photos.slice(0, this._opts.maxPhotos);
    const hidden  = this._photos.length - visible.length;

    visible.forEach((p, i) => {
      frag.appendChild(this._buildThumb(p, i));
    });

    if (hidden > 0) {
      const more = document.createElement('div');
      more.className   = 'gallery-more';
      more.textContent = `+${hidden}`;
      frag.appendChild(more);
    }

    this._container.appendChild(frag);
    this._initLazyLoad();
  }

  _buildThumb(photo, index) {
    const wrap = document.createElement('div');
    wrap.className       = 'gallery-thumb';
    wrap.dataset.photoId = photo.id;

    /* Skeleton visible mientras carga */
    const skel = document.createElement('div');
    skel.className = 'gallery-skeleton';
    wrap.appendChild(skel);

    /* Imagen con lazy load */
    const img = document.createElement('img');
    img.className  = 'gallery-img';
    img.alt        = photo.caption || 'Foto ' + (index + 1);
    img.dataset.src = photo.thumb || photo.url; /* lazy */
    img.loading    = 'lazy';
    img.addEventListener('load', () => skel.remove());
    img.addEventListener('error', () => { skel.remove(); img.style.opacity = '0.3'; });
    wrap.appendChild(img);

    /* Botón eliminar */
    if (this._opts.onDelete) {
      const del = document.createElement('button');
      del.type      = 'button';
      del.className = 'gallery-del';
      del.textContent = '×';
      del.addEventListener('click', e => {
        e.stopPropagation();
        this._opts.onDelete(photo.id);
      });
      wrap.appendChild(del);
    }

    /* Ver en fullscreen */
    wrap.addEventListener('click', () => {
      this._opts.onView?.(index);
    });

    return wrap;
  }

  /* ── IntersectionObserver lazy load ──────────────────── */
  _initLazyLoad() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }

    if (!('IntersectionObserver' in window)) {
      /* Fallback: cargar todo */
      this._container.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src; delete img.dataset.src;
      });
      return;
    }

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
        this._observer.unobserve(img);
      });
    }, { rootMargin: '50px' });

    this._container.querySelectorAll('img[data-src]').forEach(img => {
      this._observer.observe(img);
    });
  }

  /* ── Mutaciones ────────────────────────────────────── */
  addPhoto(photo) {
    if (this._photos.length >= this._opts.maxPhotos) return false;
    this._photos.push(photo);
    this.render();
    return true;
  }

  removePhoto(id) {
    this._photos = this._photos.filter(p => p.id !== id);
    this.render();
  }

  updatePhotos(photos) {
    this._photos = [...photos];
    this.render();
  }

  destroy() {
    this._observer?.disconnect();
    this._container.innerHTML = '';
  }

  get count() { return this._photos.length; }
  get photos() { return [...this._photos]; }
}
