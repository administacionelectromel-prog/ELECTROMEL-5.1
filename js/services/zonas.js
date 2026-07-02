/**
 * ELECTROMEL — services/zonas.js
 * Zonas de influencia por base, costos de viaje por ciudad y cálculo de conveniencia.
 *
 * Modelo:
 *  - Cada base (SMA, NQN) tiene: dirección, radio_km
 *  - Cada ciudad cargada pertenece a una base y tiene un costo de viaje desglosado:
 *      pasaje, combustible, vianda, hospedaje (en $) + tiempo_viaje_hs (horas)
 *  - El costo total del viaje a una ciudad = suma de los $ del desglose.
 *  - Si la ciudad está en la zona de la base ACTIVA → es "local" (viaje a escala).
 *
 * Persistencia: clave 'zonas_v1' en el store config (vía getCfg/setCfg).
 */

import { getCfg, setCfg } from '../core/db.js';
import { store } from '../core/store.js';

const CFG_KEY = 'zonas_v1';

/* Estructura por defecto */
function estructuraVacia() {
  return {
    bases: {
      SMA: { direccion: '', radio_km: 200 },
      NQN: { direccion: '', radio_km: 200 }
    },
    /* ciudades: { "cipolletti": { nombre, base, pasaje, combustible, vianda, hospedaje, tiempo_hs } } */
    ciudades: {}
  };
}

/* Normalizar nombre de ciudad para usar como clave */
export function normCiudad(nombre) {
  return (nombre || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');  // sin acentos
}

/* ── Cargar / guardar config de zonas ──────────────────── */
export async function cargarZonas() {
  const db = store.get('db');
  if (!db) return estructuraVacia();
  try {
    const data = await getCfg(db, CFG_KEY, null);
    if (!data) return estructuraVacia();
    /* Merge defensivo por si faltan campos */
    return {
      bases: {
        SMA: { direccion: '', radio_km: 200, ...(data.bases?.SMA || {}) },
        NQN: { direccion: '', radio_km: 200, ...(data.bases?.NQN || {}) }
      },
      ciudades: data.ciudades || {}
    };
  } catch (e) {
    return estructuraVacia();
  }
}

export async function guardarZonas(data) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  await setCfg(db, CFG_KEY, data);
  /* Cachear en memoria para acceso síncrono del motor */
  store.set('zonas', data);
  return data;
}

/* ── Acceso síncrono (cache) ───────────────────────────── */
export function zonasCache() {
  return store.get('zonas') || estructuraVacia();
}

/* Precargar el cache al iniciar */
export async function initZonas() {
  const data = await cargarZonas();
  store.set('zonas', data);
  return data;
}

/* ── A qué base pertenece una ciudad ───────────────────── */
export function baseDeCiudad(nombreCiudad) {
  const z = zonasCache();
  const key = normCiudad(nombreCiudad);
  const c = z.ciudades[key];
  return c ? c.base : null;
}

/* ── Costo total de viaje a una ciudad ($) ─────────────── */
export function costoViajeCiudad(nombreCiudad) {
  const z = zonasCache();
  const key = normCiudad(nombreCiudad);
  const c = z.ciudades[key];
  if (!c) return { total: 0, tiempo_hs: 0, encontrada: false };
  const total = (parseFloat(c.pasaje) || 0)
              + (parseFloat(c.combustible) || 0)
              + (parseFloat(c.vianda) || 0)
              + (parseFloat(c.hospedaje) || 0);
  return {
    total,
    tiempo_hs: parseFloat(c.tiempo_hs) || 0,
    encontrada: true,
    desglose: {
      pasaje:      parseFloat(c.pasaje) || 0,
      combustible: parseFloat(c.combustible) || 0,
      vianda:      parseFloat(c.vianda) || 0,
      hospedaje:   parseFloat(c.hospedaje) || 0
    }
  };
}

/* ── ¿La ciudad es local respecto a la base activa? ────── */
export function esLocal(nombreCiudad, baseActiva) {
  const baseCiudad = baseDeCiudad(nombreCiudad);
  if (!baseCiudad) return null;          // ciudad desconocida
  return baseCiudad === baseActiva;
}

/* ── Conveniencia de un trabajo ────────────────────────────
   conveniencia = ingreso − costoViaje − costoTrabajo
   Devuelve también si es local respecto a la base activa. */
export function calcularConveniencia({ ingreso = 0, ciudad = '', baseActiva = 'SMA', costoTrabajo = 0 }) {
  const viaje = costoViajeCiudad(ciudad);
  const local = esLocal(ciudad, baseActiva);
  const ingresoNum = parseFloat(ingreso) || 0;
  const neto = ingresoNum - viaje.total - (parseFloat(costoTrabajo) || 0);

  return {
    ingreso:       ingresoNum,
    costo_viaje:   viaje.total,
    tiempo_viaje:  viaje.tiempo_hs,
    costo_trabajo: parseFloat(costoTrabajo) || 0,
    neto,
    es_local:      local,
    ciudad_conocida: viaje.encontrada,
    base_ciudad:   baseDeCiudad(ciudad)
  };
}

/* ── Agregar/editar una ciudad ─────────────────────────── */
export async function guardarCiudad(ciudad) {
  const data = await cargarZonas();
  const key = normCiudad(ciudad.nombre);
  if (!key) throw new Error('Falta el nombre de la ciudad');
  data.ciudades[key] = {
    nombre:      ciudad.nombre.trim(),
    base:        ciudad.base || 'SMA',
    pasaje:      parseFloat(ciudad.pasaje) || 0,
    combustible: parseFloat(ciudad.combustible) || 0,
    vianda:      parseFloat(ciudad.vianda) || 0,
    hospedaje:   parseFloat(ciudad.hospedaje) || 0,
    tiempo_hs:   parseFloat(ciudad.tiempo_hs) || 0
  };
  return guardarZonas(data);
}

export async function eliminarCiudad(nombreCiudad) {
  const data = await cargarZonas();
  delete data.ciudades[normCiudad(nombreCiudad)];
  return guardarZonas(data);
}

/* ── Guardar dirección/radio de una base ───────────────── */
export async function guardarBaseInfo(base, info) {
  const data = await cargarZonas();
  if (!data.bases[base]) data.bases[base] = {};
  if (info.direccion != null) data.bases[base].direccion = info.direccion;
  if (info.radio_km != null)  data.bases[base].radio_km = parseFloat(info.radio_km) || 0;
  return guardarZonas(data);
}

/* ── Viaje activo para una fecha ────────────────────────────
   Busca en basePeriodos el viaje cuyo rango incluye la fecha dada. */
export async function viajeEnFecha(fechaStr) {
  const db = store.get('db');
  if (!db) return null;
  try {
    const { dbGetAll } = await import('../core/db.js');
    const viajes = await dbGetAll(db, 'basePeriodos', false);
    const d = new Date((fechaStr || new Date().toISOString().slice(0,10)) + 'T12:00:00');
    return viajes.find(v => {
      if (!v.from || !v.to) return false;
      const desde = new Date(v.from + 'T00:00:00');
      const hasta = new Date(v.to + 'T23:59:59');
      return d >= desde && d <= hasta;
    }) || null;
  } catch (e) { return null; }
}

/* ── Bolsa total de gastos de un viaje ──────────────────────
   bolsa = costo_dia × días + pasaje.  días = (to - from) + 1. */
export function bolsaDeViaje(viaje) {
  if (!viaje) return { dias: 0, total: 0 };
  const desde = new Date(viaje.from + 'T00:00:00');
  const hasta = new Date(viaje.to + 'T00:00:00');
  const dias = Math.max(1, Math.round((hasta - desde) / (1000*60*60*24)) + 1);
  const costoDia = parseFloat(viaje.costo_dia) || 0;
  const pasaje   = parseFloat(viaje.pasaje) || 0;
  return { dias, total: costoDia * dias + pasaje, costo_dia: costoDia, pasaje };
}
