/**
 * ELECTROMEL — services/media/media.gallery.js
 * Integración de la galería de fotos en los formularios del ERP.
 * Monta el widget completo (galería + botones + visor) en un contenedor.
 */

import { Gallery }        from '../../../components/gallery/gallery.js';
import { ImageViewer }    from '../../../components/image-viewer/image-viewer.js';
import { getPhotosByRef, deletePhoto } from './media.store.js';
import { capturePhoto, selectPhoto }   from './media.camera.js';
import { showToast }      from '../../core/ui.js';

/* Cache de instancias viewer (una sola por sesión) */
let _viewer = null;
function _getViewer() {
  if (!_viewer) _viewer = new ImageViewer();
  return _viewer;
}

/**
 * Monta el widget de fotos completo en un contenedor.
 * @param {HTMLElement} container
 * @param {string} ref   - número de la orden
 * @param {string} tipo  - 'ING'|'OTT'|'OTE'|'PRE'
 * @returns {{ refresh: Function, destroy: Function }}
 */
export function mountPhotoWidget(container, ref, tipo) {
  if (!container) return { refresh: () => {}, destroy: () => {} };

  /* ── Crear UI ─────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'photo-widget';

  const header = document.createElement('div');
  header.className = 'photo-widget-header';
  header.innerHTML =
    '<span class="photo-widget-title">📷 Fotos</span>' +
    '<span class="photo-widget-count dim txt-sm">0 fotos</span>';

  const galleryEl = document.createElement('div');
  galleryEl.className = 'gallery-strip-wrap';

  const actions = document.createElement('div');
  actions.className = 'photo-widget-actions';

  const btnCamera = document.createElement('button');
  btnCamera.type      = 'button';
  btnCamera.className = 'btn btn-ghost btn-sm';
  btnCamera.textContent = '📷 Tomar foto';

  const btnGallery = document.createElement('button');
  btnGallery.type      = 'button';
  btnGallery.className = 'btn btn-ghost btn-sm';
  btnGallery.textContent = '🖼️ Galería';

  actions.appendChild(btnCamera);
  actions.appendChild(btnGallery);
  wrap.appendChild(header);
  wrap.appendChild(galleryEl);
  wrap.appendChild(actions);
  container.appendChild(wrap);

  /* ── Instanciar Gallery ───────────────────────────────── */
  const gallery = new Gallery(galleryEl, {
    maxPhotos: 7,
    onDelete: async (id) => {
      try {
        await deletePhoto(id);
        await refresh();
        showToast('Foto eliminada', 'info');
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    },
    onView: (index) => {
      const photos = gallery.photos;
      _getViewer().open(photos.map(p => ({ url: p.url, thumb: p.thumb, caption: p.caption })), index);
    }
  });

  /* ── Cargar fotos ─────────────────────────────────────── */
  async function refresh() {
    try {
      const photos = await getPhotosByRef(ref);
      gallery.updatePhotos(photos);
      const countEl = wrap.querySelector('.photo-widget-count');
      if (countEl) countEl.textContent = photos.length + ' foto' + (photos.length !== 1 ? 's' : '');
    } catch(e) { console.warn('[media.gallery] refresh:', e); }
  }

  /* ── Handlers ─────────────────────────────────────────── */
  btnCamera.addEventListener('click', () => {
    capturePhoto({ ref, tipo, onSaved: () => refresh() });
  });

  btnGallery.addEventListener('click', () => {
    selectPhoto({ ref, tipo, onSaved: () => refresh() });
  });

  /* Carga inicial */
  refresh();

  return {
    refresh,
    destroy: () => {
      gallery.destroy();
      container.innerHTML = '';
    }
  };
}
