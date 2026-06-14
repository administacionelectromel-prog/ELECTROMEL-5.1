/**
 * ELECTROMEL — services/media/media.compress.js
 * Compresión y redimensionado de imágenes offline.
 * Usa Canvas API — sin dependencias externas.
 *
 * Arquitectura preparada para Web Worker futuro:
 * Las funciones puras (compressCanvas, resizeCanvas) son serializables
 * y migrarán a /workers/image-compress.worker.js cuando sea necesario.
 */

/* ── Tamaños estándar ─────────────────────────────────── */
export const IMAGE_SIZES = {
  thumb:   { maxWidth: 200,  maxHeight: 200,  quality: 0.70, format: 'webp' },
  preview: { maxWidth: 800,  maxHeight: 800,  quality: 0.82, format: 'webp' },
  full:    { maxWidth: 1920, maxHeight: 1920, quality: 0.85, format: 'jpeg' }
};

/* ── Configuración por defecto ────────────────────────── */
const DEFAULTS = {
  maxWidth:  1280,
  maxHeight: 1280,
  quality:   0.82,
  format:    'webp'  /* 'webp' | 'jpeg' */
};

/* ═══════════════════════════════════════════════════════════
   compressBlob — punto de entrada principal
   ═══════════════════════════════════════════════════════════ */

/**
 * Comprime un Blob/File de imagen.
 * Genera automáticamente thumb, preview y full.
 *
 * @param {Blob|File} input
 * @param {Object} [opts]
 * @returns {Promise<{ thumb: Blob, preview: Blob, full: Blob, originalSize: number }>}
 */
export async function compressAll(input, opts = {}) {
  const img = await _loadImage(input);
  const [thumb, preview, full] = await Promise.all([
    _compress(img, { ...IMAGE_SIZES.thumb,   ...opts }),
    _compress(img, { ...IMAGE_SIZES.preview, ...opts }),
    _compress(img, { ...IMAGE_SIZES.full,    ...opts })
  ]);
  return {
    thumb,
    preview,
    full,
    originalSize: input.size
  };
}

/**
 * Comprime a un único tamaño.
 * @param {Blob|File} input
 * @param {Object} opts
 * @returns {Promise<Blob>}
 */
export async function compressBlob(input, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const img  = await _loadImage(input);
  return _compress(img, cfg);
}

/**
 * Comprime desde un canvas ya pintado.
 * Preparado para Web Worker (canvas puede ser OffscreenCanvas).
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {Object} opts
 * @returns {Promise<Blob>}
 */
export async function compressCanvas(canvas, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  /* Redimensionar si excede los límites */
  const resized = _resizeCanvas(canvas, cfg.maxWidth, cfg.maxHeight);
  return _canvasToBlob(resized, cfg.format, cfg.quality);
}

/* ═══════════════════════════════════════════════════════════
   FUNCIONES PURAS — preparadas para Web Worker
   ═══════════════════════════════════════════════════════════ */

/**
 * Redimensiona un canvas manteniendo aspect ratio.
 * PURO: sin acceso a DOM externo.
 * @param {HTMLCanvasElement} src
 * @param {number} maxW
 * @param {number} maxH
 * @returns {HTMLCanvasElement}
 */
export function resizeCanvas(src, maxW, maxH) {
  return _resizeCanvas(src, maxW, maxH);
}

function _resizeCanvas(src, maxW, maxH) {
  const sw = src.width, sh = src.height;
  if (sw <= maxW && sh <= maxH) return src;

  const ratio  = Math.min(maxW / sw, maxH / sh);
  const tw     = Math.round(sw * ratio);
  const th     = Math.round(sh * ratio);
  const canvas = document.createElement('canvas');
  canvas.width  = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = 'high';
  ctx.drawImage(src, 0, 0, tw, th);
  return canvas;
}

/* ── Helpers privados ─────────────────────────────────── */

async function _compress(img, cfg) {
  const canvas = document.createElement('canvas');
  const ratio  = Math.min(
    cfg.maxWidth  / img.naturalWidth,
    cfg.maxHeight / img.naturalHeight,
    1
  );
  canvas.width  = Math.round(img.naturalWidth  * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return _canvasToBlob(canvas, cfg.format, cfg.quality);
}

function _canvasToBlob(canvas, format, quality) {
  const mime = format === 'webp' ? 'image/webp' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else {
        /* Fallback a JPEG si WebP no soportado */
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
      }
    }, mime, quality);
  });
}

function _loadImage(input) {
  return new Promise((resolve, reject) => {
    const url = input instanceof Blob ? URL.createObjectURL(input) : String(input);
    const img  = new Image();
    img.onload  = () => { if (input instanceof Blob) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

/* ── Calcular tamaño legible ──────────────────────────── */
export function formatSize(bytes) {
  if (bytes < 1024)           return bytes + ' B';
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Verifica si WebP está soportado en el dispositivo.
 * @returns {Promise<boolean>}
 */
export function supportsWebP() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAkA4JZACdAEO/gHOAAA=';
  });
}
