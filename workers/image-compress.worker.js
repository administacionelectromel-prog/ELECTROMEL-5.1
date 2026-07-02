/**
 * ELECTROMEL — workers/image-compress.worker.js
 * Web Worker para compresión de imágenes en background.
 *
 * ⚠️  ARQUITECTURA PREPARADA — NO ACTIVO TODAVÍA.
 *
 * Activación futura:
 *   1. Cambiar ImageCompressWorkerInterface.compress() en media.utils.js
 *      para usar new Worker('./workers/image-compress.worker.js') en lugar
 *      del fallback al hilo principal.
 *   2. Asegurarse de servir desde HTTPS (requerido para Workers en PWA).
 *
 * Protocolo de mensajes:
 *
 * App → Worker:
 *   { type: 'COMPRESS', id: string, payload: { buffer: ArrayBuffer, opts: Object } }
 *   { type: 'RESIZE',   id: string, payload: { buffer: ArrayBuffer, maxW, maxH } }
 *
 * Worker → App:
 *   { type: 'COMPRESS_DONE', id: string, result: { thumb, preview, full } }
 *   { type: 'ERROR',         id: string, error: string }
 *   { type: 'PROGRESS',      id: string, pct: number }
 */

/* ── Importar OffscreenCanvas API si está disponible ─── */
const HAS_OFFSCREEN = typeof OffscreenCanvas !== 'undefined';

self.addEventListener('message', async (e) => {
  const { type, id, payload } = e.data || {};

  if (type === 'COMPRESS') {
    try {
      self.postMessage({ type: 'PROGRESS', id, pct: 10 });
      const result = await _compressInWorker(payload.buffer, payload.opts || {});
      self.postMessage({ type: 'COMPRESS_DONE', id, result }, _getTransferables(result));
    } catch(err) {
      self.postMessage({ type: 'ERROR', id, error: err.message });
    }
    return;
  }

  if (type === 'RESIZE') {
    try {
      const resized = await _resizeInWorker(payload.buffer, payload.maxW, payload.maxH);
      self.postMessage({ type: 'RESIZE_DONE', id, result: resized }, [resized]);
    } catch(err) {
      self.postMessage({ type: 'ERROR', id, error: err.message });
    }
    return;
  }

  if (type === 'PING') {
    self.postMessage({ type: 'PONG', id, hasOffscreen: HAS_OFFSCREEN });
  }
});

/* ── Compresión en Worker ─────────────────────────────── */
async function _compressInWorker(buffer, opts) {
  if (!HAS_OFFSCREEN) {
    /* Sin OffscreenCanvas no podemos comprimir en el worker */
    throw new Error('OffscreenCanvas no disponible en este dispositivo');
  }

  const blob = new Blob([buffer]);
  const bmp  = await createImageBitmap(blob);

  const SIZES = {
    thumb:   { maxW: opts.thumbW   || 200,  maxH: opts.thumbH   || 200,  q: 0.70 },
    preview: { maxW: opts.previewW || 800,  maxH: opts.previewH || 800,  q: 0.82 },
    full:    { maxW: opts.fullW    || 1920, maxH: opts.fullH    || 1920, q: 0.85 }
  };

  const results = {};
  for (const [key, cfg] of Object.entries(SIZES)) {
    results[key] = await _bitmapToBuffer(bmp, cfg.maxW, cfg.maxH, cfg.q);
  }
  bmp.close();
  return results;
}

async function _resizeInWorker(buffer, maxW, maxH) {
  if (!HAS_OFFSCREEN) throw new Error('OffscreenCanvas no disponible');
  const blob = new Blob([buffer]);
  const bmp  = await createImageBitmap(blob);
  const buf  = await _bitmapToBuffer(bmp, maxW, maxH, 0.85);
  bmp.close();
  return buf;
}

async function _bitmapToBuffer(bmp, maxW, maxH, quality) {
  const ratio  = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
  const w      = Math.round(bmp.width  * ratio);
  const h      = Math.round(bmp.height * ratio);
  const canvas = new OffscreenCanvas(w, h);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);

  /* Intentar WebP, fallback a JPEG */
  let blob;
  try { blob = await canvas.convertToBlob({ type: 'image/webp', quality }); }
  catch(e) { blob = await canvas.convertToBlob({ type: 'image/jpeg', quality }); }

  return blob.arrayBuffer();
}

function _getTransferables(result) {
  /* Transferir buffers sin copiarlos */
  return Object.values(result).filter(v => v instanceof ArrayBuffer);
}
