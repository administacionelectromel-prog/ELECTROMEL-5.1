/**
 * ELECTROMEL — services/migracion.js
 * Migración de datos para el modelo de base única (v6).
 *
 * Convierte registros con base 'NQN' → base 'SMA' + zona 'Neuquén'.
 * Agrega el campo 'anio' (del creado_at/fecha) para filtros e índices por año.
 *
 * Es idempotente: se puede correr varias veces sin duplicar ni dañar datos.
 * Marca en config 'migracion_v14_hecha' para no repetir en cada arranque.
 */

import { dbGetAll, dbPut, getCfg, setCfg, logEvent } from '../core/db.js';
import { store } from '../core/store.js';

const FLAG = 'migracion_v14_hecha';
const STORES = ['ingresos', 'ordenes', 'exteriors', 'presupuestos'];

/* Extraer el año de un registro (de creado_at o fecha) */
function anioDe(r) {
  const fuente = r.creado_at || r.fecha || r.fecha_conversion || '';
  const m = String(fuente).match(/(\d{4})/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

/* ── Migración principal ───────────────────────────────── */
export async function migrarBaseAZona() {
  const db = store.get('db');
  if (!db) return { ok: false, motivo: 'DB no disponible' };

  /* ¿Ya se hizo? */
  const yaHecha = await getCfg(db, FLAG, false).catch(() => false);
  if (yaHecha) return { ok: true, yaHecha: true };

  let convertidos = 0, anioAgregado = 0, revisados = 0;

  for (const st of STORES) {
    let registros = [];
    try { registros = await dbGetAll(db, st, false); } catch (e) { continue; }

    for (const r of registros) {
      let cambiado = false;
      revisados++;

      /* NQN → SMA + zona Neuquén */
      if (r.base === 'NQN') {
        r.base = 'SMA';
        if (!r.zona) r.zona = 'Neuquén';
        convertidos++;
        cambiado = true;
      }
      /* Registros SMA sin zona → zona por defecto SMA */
      else if (r.base === 'SMA' && !r.zona) {
        r.zona = 'San Martín de los Andes';
        cambiado = true;
      }

      /* Agregar año si falta */
      if (r.anio == null) {
        r.anio = anioDe(r);
        anioAgregado++;
        cambiado = true;
      }

      if (cambiado) {
        try { await dbPut(db, st, r); } catch (e) { /* seguir */ }
      }
    }
  }

  await setCfg(db, FLAG, true).catch(() => {});
  await logEvent(db, {
    type: 'MIGRACION_V14',
    message: `Migración base→zona: ${convertidos} convertidos, ${anioAgregado} con año, ${revisados} revisados`
  }).catch(() => {});

  return { ok: true, convertidos, anioAgregado, revisados };
}

/* ── Forzar de nuevo (para debugging/manual) ───────────── */
export async function resetMigracionFlag() {
  const db = store.get('db');
  if (!db) return;
  await setCfg(db, FLAG, false).catch(() => {});
}
