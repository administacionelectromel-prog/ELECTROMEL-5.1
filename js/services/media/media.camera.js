/**
 * ELECTROMEL — services/media/media.camera.js
 * Servicio de captura de fotos para los formularios del ERP.
 * Integra Camera component + media.compress + media.store.
 *
 * Uso:
 *   await capturePhoto({ ref: 'OTT-0042', tipo: 'OTT', categoria: 'equipo' });
 */

import { Camera }     from '../../../components/camera/camera.js';
import { compressAll, formatSize } from './media.compress.js';
import { savePhoto }  from './media.store.js';
import { showToast }  from '../../core/ui.js';
import { getMediaConfig } from './media.utils.js';

/**
 * Abre la cámara y guarda la foto capturada en IndexedDB.
 * @param {Object} opts
 * @param {string} opts.ref        - número de la orden
 * @param {string} opts.tipo       - 'ING'|'OTT'|'OTE'|'PRE'
 * @param {string} [opts.categoria='otro']
 * @param {string} [opts.caption]
 * @param {Function} [opts.onSaved]  - (photoView) => void
 * @param {Function} [opts.onError]
 */
export async function capturePhoto(opts) {
  const cfg = getMediaConfig();

  const cam = new Camera({
    facing: 'environment',
    onCapture: async (blob, previewUrl) => {
      try {
        showToast('📷 Procesando foto...', 'info', 1500);

        /* Comprimir */
        const compressed = await compressAll(blob, {
          quality: cfg.quality || 0.82
        });

        /* Guardar en IndexedDB */
        const id = await savePhoto({
          ref:       opts.ref,
          tipo:      opts.tipo,
          categoria: opts.categoria || 'otro',
          caption:   opts.caption   || '',
        }, compressed);

        URL.revokeObjectURL(previewUrl);
        showToast(`✅ Foto guardada (${formatSize(compressed.preview.size)})`, 'success');

        /* Notificar */
        opts.onSaved?.({ id, thumb: URL.createObjectURL(compressed.thumb) });

      } catch(e) {
        console.error('[media.camera] capturePhoto:', e);
        showToast('❌ Error al guardar: ' + e.message, 'error');
        opts.onError?.(e);
      } finally {
        cam.destroy();
      }
    }
  });

  await cam.open();
}

/**
 * Selecciona una imagen desde la galería del dispositivo (sin captura).
 * @param {Object} opts - igual que capturePhoto
 */
export async function selectPhoto(opts) {
  const cfg  = getMediaConfig();
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.multiple = false;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    document.body.removeChild(input);
    if (!file) return;

    try {
      showToast('📷 Procesando imagen...', 'info', 1500);
      const compressed = await compressAll(file, { quality: cfg.quality || 0.82 });
      const id = await savePhoto({
        ref:       opts.ref,
        tipo:      opts.tipo,
        categoria: opts.categoria || 'otro',
        caption:   opts.caption   || file.name
      }, compressed);

      showToast(`✅ Imagen guardada (${formatSize(compressed.preview.size)})`, 'success');
      opts.onSaved?.({ id, thumb: URL.createObjectURL(compressed.thumb) });
    } catch(e) {
      console.error('[media.camera] selectPhoto:', e);
      showToast('❌ Error: ' + e.message, 'error');
      opts.onError?.(e);
    }
  });

  input.click();
}
