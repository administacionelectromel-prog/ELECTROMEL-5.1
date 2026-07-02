/**
 * ELECTROMEL — services/analisis.zonas.js
 * Análisis de rentabilidad por ZONA de trabajo (modelo de base única v6).
 *
 * Reemplaza el análisis "por base" (SMA/NQN) por análisis "por zona".
 * Para los trabajos hechos durante un viaje, reparte la bolsa de gastos
 * del viaje proporcional al ingreso de cada trabajo.
 */

import { dbGetAll } from '../core/db.js';
import { store } from '../core/store.js';
import { viajeEnFecha, bolsaDeViaje, costoViajeCiudad, normCiudad } from './zonas.js';

/* ── Agrupar trabajos por zona y calcular rentabilidad ──── */
export async function analisisPorZona({ anio = null } = {}) {
  const db = store.get('db');
  if (!db) return [];

  /* Reunir trabajos con ingreso: órdenes (OTT), exteriors (OTE) */
  let ordenes = [], exteriors = [];
  try { ordenes   = await dbGetAll(db, 'ordenes', false); } catch (e) {}
  try { exteriors = await dbGetAll(db, 'exteriors', false); } catch (e) {}

  let trabajos = [...ordenes, ...exteriors];

  /* Filtrar por año si se pide */
  if (anio) trabajos = trabajos.filter(t => (t.anio || _anioDe(t)) === anio);

  /* Agrupar por zona */
  const porZona = {};
  for (const t of trabajos) {
    const zona = t.zona || t.cliente_ciudad || 'San Martín de los Andes';
    const key = normCiudad(zona);
    if (!porZona[key]) porZona[key] = { zona, trabajos: [], ingresos: 0, costoViaje: 0 };
    const ingreso = parseFloat(t.total || t.ingreso_estimado || 0) || 0;
    porZona[key].trabajos.push(t);
    porZona[key].ingresos += ingreso;
  }

  /* Calcular costo de viaje por zona:
     - Si hay viaje en la fecha del trabajo → repartir la bolsa (se hace abajo)
     - Si no → usar el costo por ciudad configurado */
  const viajesCache = {};
  for (const key of Object.keys(porZona)) {
    const grupo = porZona[key];
    let costoViajeTotal = 0;

    /* Agrupar por viaje (período) para repartir bolsa */
    const porViaje = {};
    const sinViaje = [];
    for (const t of grupo.trabajos) {
      const fecha = t.fecha || (t.creado_at || '').slice(0, 10);
      const cacheKey = fecha;
      if (viajesCache[cacheKey] === undefined) {
        viajesCache[cacheKey] = await viajeEnFecha(fecha);
      }
      const viaje = viajesCache[cacheKey];
      if (viaje && viaje.id != null) {
        if (!porViaje[viaje.id]) porViaje[viaje.id] = { viaje, trabajos: [] };
        porViaje[viaje.id].trabajos.push(t);
      } else {
        sinViaje.push(t);
      }
    }

    /* Repartir la bolsa de cada viaje proporcional al ingreso */
    for (const vid of Object.keys(porViaje)) {
      const { viaje, trabajos: tbs } = porViaje[vid];
      const bolsa = bolsaDeViaje(viaje);
      costoViajeTotal += bolsa.total;
    }

    /* Trabajos sin viaje: usar costo por ciudad configurado */
    for (const t of sinViaje) {
      const ciudad = t.zona || t.cliente_ciudad || '';
      if (ciudad) costoViajeTotal += (costoViajeCiudad(ciudad).total || 0);
    }

    grupo.costoViaje = costoViajeTotal;
    grupo.neto = grupo.ingresos - costoViajeTotal;
    grupo.cantidad = grupo.trabajos.length;
  }

  /* Devolver ordenado por neto descendente */
  return Object.values(porZona)
    .map(g => ({
      zona: g.zona,
      cantidad: g.cantidad,
      ingresos: g.ingresos,
      costo_viaje: g.costoViaje,
      neto: g.neto
    }))
    .sort((a, b) => b.neto - a.neto);
}

function _anioDe(t) {
  const m = String(t.creado_at || t.fecha || '').match(/(\d{4})/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}
