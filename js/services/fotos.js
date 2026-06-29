/**
 * ELECTROMEL — services/fotos.js
 * Fotos de trabajos, guardadas localmente (offline) en IndexedDB.
 * Preparado para subir a Google Drive más adelante (campo subida_drive).
 *
 * Store: 'fotos' (keyPath: 'id')
 *   { id, orden_numero, dataUrl, nombre, tamano, creado_at, subida_drive, drive_id }
 */

import { dbGetAll, dbPut, dbGet, dbDelete, logEvent } from '../core/db.js';
import { store } from '../core/store.js';

const MAX_LADO = 1280;      // redimensionar fotos grandes
const JPEG_Q   = 0.7;       // calidad de compresión

function nuevoId() {
  return 'FOTO-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

/* ── Comprimir/redimensionar imagen antes de guardar ───── */
function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_LADO || height > MAX_LADO) {
          if (width >= height) { height = Math.round(height * MAX_LADO / width); width = MAX_LADO; }
          else                 { width = Math.round(width * MAX_LADO / height); height = MAX_LADO; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_Q));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Guardar una foto asociada a una orden ─────────────── */
export async function guardarFoto(ordenNumero, file) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  const dataUrl = await comprimirImagen(file);
  const foto = {
    id:            nuevoId(),
    orden_numero:  ordenNumero || '',
    dataUrl,
    nombre:        file.name || 'foto.jpg',
    tamano:        dataUrl.length,
    creado_at:     new Date().toISOString(),
    subida_drive:  false,
    drive_id:      null
  };
  await dbPut(db, 'fotos', foto);
  await logEvent(db, { type: 'FOTO_GUARDADA', message: `Foto guardada para ${ordenNumero}`, ref: ordenNumero }).catch(() => {});
  return foto;
}

/* ── Listar fotos de una orden ─────────────────────────── */
export async function fotosDeOrden(ordenNumero) {
  const db = store.get('db');
  if (!db) return [];
  const todas = await dbGetAll(db, 'fotos', false).catch(() => []);
  return todas.filter(f => f.orden_numero === ordenNumero);
}

/* ── Eliminar foto ─────────────────────────────────────── */
export async function eliminarFoto(id) {
  const db = store.get('db');
  if (!db) return;
  await dbDelete(db, 'fotos', id).catch(() => {});
}

/* ── Marcar como subida a Drive (para el futuro) ───────── */
export async function marcarSubida(id, driveId) {
  const db = store.get('db');
  if (!db) return;
  const foto = await dbGet(db, 'fotos', id).catch(() => null);
  if (!foto) return;
  foto.subida_drive = true;
  foto.drive_id = driveId || null;
  await dbPut(db, 'fotos', foto);
}

/* ── Fotos pendientes de subir (para el futuro Drive sync) ─ */
export async function fotosPendientesDrive() {
  const db = store.get('db');
  if (!db) return [];
  const todas = await dbGetAll(db, 'fotos', false).catch(() => []);
  return todas.filter(f => !f.subida_drive);
}
