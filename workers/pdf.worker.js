/**
 * ELECTROMEL — workers/pdf.worker.js
 * Web Worker para generación de PDFs en background.
 *
 * ⚠️  ARQUITECTURA PREPARADA — NO ACTIVO TODAVÍA.
 *
 * El PDF pesado (jsPDF) actualmente bloquea el hilo principal
 * en dispositivos Android lentos durante ~500ms-2s.
 * Este worker permitirá generarlo sin freezar la UI.
 *
 * Activación futura:
 *   1. Importar jsPDF como módulo ESM dentro del worker.
 *   2. Llamar desde services/pdf/ usando PostMessage en lugar de new jsPDF().
 *   3. Recibir el Blob del PDF generado y disparar la descarga.
 *
 * Protocolo:
 *
 * App → Worker:
 *   { type: 'GENERATE_PDF', id, payload: { template, data, cfg } }
 *
 * Worker → App:
 *   { type: 'PDF_DONE',     id, result: { blob: ArrayBuffer } }
 *   { type: 'PDF_PROGRESS', id, pct: number }
 *   { type: 'ERROR',        id, error: string }
 */

self.addEventListener('message', (e) => {
  const { type, id } = e.data || {};

  if (type === 'PING') {
    self.postMessage({ type: 'PONG', id, status: 'pdf-worker-ready' });
    return;
  }

  if (type === 'GENERATE_PDF') {
    /* TODO: importar jsPDF UMD en el worker context cuando se active */
    self.postMessage({
      type: 'ERROR', id,
      error: 'pdf.worker.js no implementado todavía. Usar servicios PDF del hilo principal.'
    });
  }
});
