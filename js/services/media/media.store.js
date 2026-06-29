/**
 * ELECTROMEL — services/media/media.store.js
 * Persistencia de fotos en IndexedDB.
 * Store separado 'media' — no interfiere con el resto de la DB.
 *
 * Modelo:
 * {
 *   id:          string  (uuid generado)
 *   ref:         string  (numero de la orden, ej "OTT-0042")
 *   tipo:        string  ('ING'|'OTT'|'OTE'|'PRE')
 *   categoria:   string  ('equipo'|'daño'|'placa'|'serial'|'trabajo'|'antes'|'despues'|'otro')
 *   caption:     string
 *   created_at:  ISO string
 *   size_thumb:  number  bytes
 *   size_preview:number
 *   size_full:   number
 *   thumb:       string  (base64 o blob URL — solo en memoria)
 *   preview:     string
 *   full:        string
 * }
 *
 * Las imágenes se guardan como ArrayBuffer para no saturar la memoria.
 */

const MEDIA_DB_NAME    = 'electromelMediaDB';
const MEDIA_DB_VERSION = 1;
const STORE_NAME       = 'photos';
const MAX_PHOTOS_PER_REF = 7;
const MAX_TOTAL_MB     = 200; /* límite total en MB */

/* ── Abrir DB de media ────────────────────────────────── */
let _mediaDB = null;

export async function openMediaDB() {
  if (_mediaDB) return _mediaDB;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    req.onerror   = () => reject(req.error);
    req.onsuccess = () => { _mediaDB = req.result; resolve(_mediaDB); };
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('ref',        'ref',        { unique: false });
        store.createIndex('tipo',       'tipo',       { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

/* ── CRUD ─────────────────────────────────────────────── */

/**
 * Guarda una foto (thumb, preview, full como Blob).
 * @param {Object} meta  - datos sin los blobs
 * @param {Object} blobs - { thumb: Blob, preview: Blob, full: Blob }
 * @returns {Promise<string>} id
 */
export async function savePhoto(meta, blobs) {
  const db = await openMediaDB();

  /* Verificar límite por registro */
  const existing = await getPhotosByRef(meta.ref);
  if (existing.length >= MAX_PHOTOS_PER_REF) {
    throw new Error(`Límite de ${MAX_PHOTOS_PER_REF} fotos por registro alcanzado`);
  }

  /* Convertir Blobs a ArrayBuffer para IndexedDB */
  const [thumbBuf, previewBuf, fullBuf] = await Promise.all([
    blobs.thumb   ? blobs.thumb.arrayBuffer()   : null,
    blobs.preview ? blobs.preview.arrayBuffer() : null,
    blobs.full    ? blobs.full.arrayBuffer()    : null
  ]);

  const record = {
    ...meta,
    id:            meta.id || _uuid(),
    created_at:    meta.created_at || new Date().toISOString(),
    thumb_buf:     thumbBuf,
    preview_buf:   previewBuf,
    full_buf:      fullBuf,
    size_thumb:    blobs.thumb?.size    || 0,
    size_preview:  blobs.preview?.size  || 0,
    size_full:     blobs.full?.size     || 0,
    mime:          blobs.full?.type     || 'image/jpeg'
  };

  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve(record.id);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Lee las fotos de un registro, devuelve URLs de objeto (Blob URL).
 * Liberar con revocarURLs() cuando ya no se necesiten.
 * @param {string} ref
 * @returns {Promise<Array>}
 */
export async function getPhotosByRef(ref) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('ref');
    const req   = index.getAll(ref);
    req.onsuccess = () => {
      const records = req.result.sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''));
      resolve(records.map(_recordToView));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Elimina una foto por ID.
 * @param {string} id
 */
export async function deletePhoto(id) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Elimina todas las fotos de un registro.
 * @param {string} ref
 */
export async function deletePhotosByRef(ref) {
  const photos = await getPhotosByRef(ref);
  await Promise.all(photos.map(p => deletePhoto(p.id)));
}

/* ── LRU Cleanup ─────────────────────────────────────── */

/**
 * Limpieza automática: elimina fotos más antiguas si se supera MAX_TOTAL_MB.
 * Estrategia LRU: los registros más viejos se eliminan primero.
 */
export async function cleanupOldPhotos() {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const idx = tx.objectStore(STORE_NAME).index('created_at');
    const req = idx.getAll();
    req.onsuccess = async () => {
      const all = req.result;

      /* Calcular tamaño total */
      const totalBytes = all.reduce((a, r) =>
        a + (r.size_thumb || 0) + (r.size_preview || 0) + (r.size_full || 0), 0);
      const totalMB = totalBytes / (1024 * 1024);

      if (totalMB <= MAX_TOTAL_MB) { resolve({ cleaned: 0, totalMB }); return; }

      /* Ordenar por fecha (más viejos primero) */
      const sorted = all.slice().sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''));

      let cleaned = 0, freed = 0;
      const toDelete = [];
      let running = totalBytes;
      for (const r of sorted) {
        if (running <= MAX_TOTAL_MB * 1024 * 1024 * 0.8) break; /* 80% del límite */
        const size = (r.size_thumb || 0) + (r.size_preview || 0) + (r.size_full || 0);
        toDelete.push(r.id);
        running -= size;
        freed   += size;
        cleaned++;
      }

      await Promise.all(toDelete.map(id => deletePhoto(id)));
      console.info(`[media.store] LRU cleanup: ${cleaned} fotos eliminadas (${(freed/1024/1024).toFixed(1)} MB)`);
      resolve({ cleaned, freedMB: freed / (1024 * 1024), totalMB });
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Stats del almacenamiento de medios.
 * @returns {Promise<{count, totalMB, byRef}>}
 */
export async function getMediaStats() {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = req.result;
      const totalBytes = all.reduce((a, r) =>
        a + (r.size_thumb || 0) + (r.size_preview || 0) + (r.size_full || 0), 0);
      const byRef = {};
      all.forEach(r => { byRef[r.ref] = (byRef[r.ref] || 0) + 1; });
      resolve({ count: all.length, totalMB: totalBytes / (1024 * 1024), byRef });
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── Helpers ──────────────────────────────────────────── */

function _recordToView(r) {
  return {
    id:         r.id,
    ref:        r.ref,
    tipo:       r.tipo,
    categoria:  r.categoria,
    caption:    r.caption,
    created_at: r.created_at,
    size_thumb:   r.size_thumb,
    size_preview: r.size_preview,
    size_full:    r.size_full,
    /* Convertir ArrayBuffer → Blob → URL solo cuando se necesita */
    get thumb()   { return r.thumb_buf   ? _bufToUrl(r.thumb_buf,   r.mime) : null; },
    get url()     { return r.preview_buf ? _bufToUrl(r.preview_buf, r.mime) : null; },
    get fullUrl() { return r.full_buf    ? _bufToUrl(r.full_buf,    r.mime) : null; }
  };
}

const _urlCache = new Map();
const URL_CACHE_MAX = 40; /* max URLs en memoria */

function _bufToUrl(buf, mime) {
  const key = buf.byteLength + ':' + buf.byteLength.toString(36);
  if (_urlCache.has(key)) return _urlCache.get(key);

  /* LRU: si supera el límite, revocar la más vieja */
  if (_urlCache.size >= URL_CACHE_MAX) {
    const firstKey = _urlCache.keys().next().value;
    const oldUrl   = _urlCache.get(firstKey);
    try { URL.revokeObjectURL(oldUrl); } catch(e) {}
    _urlCache.delete(firstKey);
  }

  const blob = new Blob([buf], { type: mime || 'image/jpeg' });
  const url  = URL.createObjectURL(blob);
  _urlCache.set(key, url);
  return url;
}

/** Libera todos los Blob URLs en memoria. Llamar al cerrar sesión o limpiar. */
export function revokeAllBlobURLs() {
  _urlCache.forEach(url => { try { URL.revokeObjectURL(url); } catch(e) {} });
  _urlCache.clear();
}

function _uuid() {
  return 'ph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
