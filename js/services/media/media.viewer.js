/**
 * ELECTROMEL — services/media/media.viewer.js
 * Servicio de visualización fullscreen de fotos de un registro.
 * Lazy-carga el ImageViewer component cuando se necesita.
 */

import { getPhotosByRef } from './media.store.js';
import { showToast }      from '../../core/ui.js';

let _viewer = null;

/**
 * Abre el visor fullscreen con las fotos de un registro.
 * @param {string} ref   - número de la orden
 * @param {number} [startIndex=0]
 */
export async function openViewer(ref, startIndex = 0) {
  try {
    const photos = await getPhotosByRef(ref);
    if (!photos.length) { showToast('Sin fotos para este registro', 'info'); return; }

    if (!_viewer) {
      const { ImageViewer } = await import('../../../components/image-viewer/image-viewer.js');
      _viewer = new ImageViewer();
    }

    _viewer.open(
      photos.map(p => ({ url: p.url, thumb: p.thumb, caption: p.caption })),
      startIndex
    );
  } catch(e) {
    console.error('[media.viewer] openViewer:', e);
    showToast('Error al abrir el visor', 'error');
  }
}

/**
 * Cierra el visor si está abierto.
 */
export function closeViewer() {
  _viewer?.close();
}
