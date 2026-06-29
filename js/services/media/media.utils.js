/**
 * ELECTROMEL — services/media/media.utils.js
 * Utilidades del sistema multimedia:
 *   - Configuración de calidad/tamaños
 *   - Helpers de formato
 *   - Hooks preparados para IA futura (OCR, clasificación, etc.)
 */

import { store }   from '../../core/store.js';
import { getCfg }  from '../../core/db.js';

/* ── Configuración por defecto ────────────────────────── */
const DEFAULT_CONFIG = {
  quality:       0.82,    /* 0-1 calidad JPEG/WebP */
  maxWidthFull:  1920,
  maxWidthPreview: 800,
  maxWidthThumb: 200,
  maxPhotosPerRef: 7,
  autoCompress:  true,
  autoCleanupMB: 200     /* cleanup cuando supera X MB */
};

/**
 * Lee la config de media desde IndexedDB (fusionada con defaults).
 * @returns {Object}
 */
export function getMediaConfig() {
  /* Leer desde store en memoria si está disponible */
  const cached = store.get('media.config');
  if (cached) return { ...DEFAULT_CONFIG, ...cached };
  return { ...DEFAULT_CONFIG };
}

export async function loadMediaConfig() {
  const db = store.get('db');
  if (!db) return DEFAULT_CONFIG;
  const v = await getCfg(db, 'media_config', null);
  const cfg = { ...DEFAULT_CONFIG, ...(v || {}) };
  store.set('media.config', cfg);
  return cfg;
}

/* ── Categorías de fotos ──────────────────────────────── */
export const FOTO_CATEGORIAS = [
  { id: 'equipo',   label: 'Equipo completo',    icon: '🔧' },
  { id: 'daño',     label: 'Daño / falla',       icon: '⚠️' },
  { id: 'placa',    label: 'Placa electrónica',   icon: '🔌' },
  { id: 'serial',   label: 'Serial / modelo',    icon: '🏷️' },
  { id: 'trabajo',  label: 'Trabajo realizado',  icon: '✅' },
  { id: 'antes',    label: 'Antes',               icon: '📷' },
  { id: 'despues',  label: 'Después',             icon: '📸' },
  { id: 'otro',     label: 'Otro',                icon: '📎' }
];

export function getCategoriaLabel(id) {
  return FOTO_CATEGORIAS.find(c => c.id === id)?.label || id || 'Foto';
}

/* ── Helpers de formato ───────────────────────────────── */
export function formatBytes(bytes) {
  if (bytes < 1024)          return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function generatePhotoId() {
  return 'ph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ═══════════════════════════════════════════════════════════
   HOOKS PARA IA FUTURA
   ═══════════════════════════════════════════════════════════
   Estas funciones son stubs preparados para futura integración
   con modelos de visión (OCR, clasificación, detección de fallas).
   NO implementadas todavía — solo la interfaz está definida.
   ═══════════════════════════════════════════════════════════ */

/**
 * [FUTURO] OCR sobre una foto de placa o serial.
 * Cuando se implemente, usará un modelo on-device (TensorFlow.js o similar).
 * @param {Blob} imageBlob
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function extractTextFromImage(imageBlob) {
  console.info('[media.utils] extractTextFromImage: not implemented yet');
  return { text: '', confidence: 0, notImplemented: true };
}

/**
 * [FUTURO] Clasificación automática de categoría de foto.
 * Usará un modelo ligero de visión on-device.
 * @param {Blob} imageBlob
 * @returns {Promise<{ categoria: string, confidence: number }>}
 */
export async function classifyPhoto(imageBlob) {
  console.info('[media.utils] classifyPhoto: not implemented yet');
  return { categoria: 'otro', confidence: 0, notImplemented: true };
}

/**
 * [FUTURO] Comparación visual antes/después.
 * @param {Blob} antes
 * @param {Blob} despues
 * @returns {Promise<{ similarity: number, differences: Array }>}
 */
export async function compareImages(antes, despues) {
  console.info('[media.utils] compareImages: not implemented yet');
  return { similarity: 0, differences: [], notImplemented: true };
}

/**
 * [FUTURO] Detección de fallas visuales en placa electrónica.
 * @param {Blob} imageBlob
 * @returns {Promise<{ fallas: Array, confianza: number }>}
 */
export async function detectFallas(imageBlob) {
  console.info('[media.utils] detectFallas: not implemented yet');
  return { fallas: [], confianza: 0, notImplemented: true };
}

/* ── Preparación para Web Worker ─────────────────────── */

/**
 * Interface del futuro worker de compresión.
 * Cuando se implemente, este wrapper enviará el trabajo al worker
 * en lugar de procesarlo en el hilo principal.
 *
 * /workers/image-compress.worker.js recibirá:
 *   { type: 'COMPRESS', payload: { buffer, opts } }
 * y responderá:
 *   { type: 'COMPRESS_DONE', payload: { thumb, preview, full } }
 */
export const ImageCompressWorkerInterface = {
  isSupported: () => typeof Worker !== 'undefined',
  workerPath:  './workers/image-compress.worker.js',

  /**
   * [FUTURO] Comprimir via Worker para no bloquear el hilo principal.
   * Por ahora cae en media.compress.js en el hilo principal.
   */
  async compress(blob, opts) {
    const { compressAll } = await import('./media.compress.js');
    return compressAll(blob, opts);
  }
};
