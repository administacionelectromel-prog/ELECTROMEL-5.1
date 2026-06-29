/**
 * ELECTROMEL — services/mantenimientos.js
 * Gestión de mantenimientos programados (services periódicos).
 *
 * Un mantenimiento puede vencer por FECHA (cada X meses) o por HORAS de uso.
 * El sistema avisa cuando faltan ≤ DIAS_AVISO días para el vencimiento.
 * Desde un mantenimiento se puede generar una OTE (visita exterior).
 *
 * Store: 'mantenimientos' (keyPath: 'id')
 */

import { dbGetAll, dbPut, dbGet, dbDelete, logEvent } from '../core/db.js';
import { store } from '../core/store.js';

export const DIAS_AVISO = 7;          // avisar 7 días antes del vencimiento

export const MANT_ESTADOS = {
  PROGRAMADO: 'programado',           // a futuro, sin vencer
  POR_VENCER: 'por_vencer',           // dentro de la ventana de aviso
  VENCIDO:    'vencido',              // pasó la fecha
  COORDINADO: 'coordinado',           // ya hablé con el cliente, hay turno
  COMPLETADO: 'completado'            // se hizo el service
};

export const MANT_TIPO = {
  FECHA: 'fecha',                     // vence en una fecha fija
  HORAS: 'horas'                      // vence al alcanzar X horas de uso
};

/* ── ID único ──────────────────────────────────────────── */
function nuevoId() {
  return 'MANT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

/* ── Calcular estado según vencimiento ─────────────────── */
export function calcularEstadoMant(mant, hoy = new Date()) {
  if (mant.estado === MANT_ESTADOS.COMPLETADO) return MANT_ESTADOS.COMPLETADO;
  if (mant.estado === MANT_ESTADOS.COORDINADO) return MANT_ESTADOS.COORDINADO;

  if (mant.tipo === MANT_TIPO.FECHA && mant.proxima_fecha) {
    const fechaVenc = new Date(mant.proxima_fecha + 'T00:00:00');
    const diffDias  = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
    if (diffDias < 0)             return MANT_ESTADOS.VENCIDO;
    if (diffDias <= DIAS_AVISO)   return MANT_ESTADOS.POR_VENCER;
    return MANT_ESTADOS.PROGRAMADO;
  }

  /* Por horas: el aviso es manual (no sabemos las horas reales del equipo),
     pero si tiene proxima_fecha estimada la usamos como referencia. */
  if (mant.tipo === MANT_TIPO.HORAS) {
    if (mant.proxima_fecha) {
      const fechaVenc = new Date(mant.proxima_fecha + 'T00:00:00');
      const diffDias  = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
      if (diffDias < 0)           return MANT_ESTADOS.VENCIDO;
      if (diffDias <= DIAS_AVISO) return MANT_ESTADOS.POR_VENCER;
    }
    return MANT_ESTADOS.PROGRAMADO;
  }

  return MANT_ESTADOS.PROGRAMADO;
}

/* ── Días restantes (negativo = vencido) ───────────────── */
export function diasRestantes(mant, hoy = new Date()) {
  if (!mant.proxima_fecha) return null;
  const fechaVenc = new Date(mant.proxima_fecha + 'T00:00:00');
  return Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
}

/* ── Crear / guardar mantenimiento ─────────────────────── */
export async function guardarMantenimiento(datos) {
  const db = store.get('db');
  if (!db) throw new Error('Base de datos no disponible');

  const mant = {
    id:               datos.id || nuevoId(),
    cliente_nombre:   datos.cliente_nombre || '',
    cliente_cuit:     datos.cliente_cuit || '',
    cliente_telefono: datos.cliente_telefono || '',
    cliente_direccion: datos.cliente_direccion || '',
    cliente_cp:       datos.cliente_cp || '',
    cliente_ciudad:   datos.cliente_ciudad || '',
    cliente_provincia: datos.cliente_provincia || '',
    base:             datos.base || 'SMA',
    zona:             datos.zona || '',
    equipo:           datos.equipo || '',
    tipo:             datos.tipo || MANT_TIPO.FECHA,
    intervalo_meses:  parseInt(datos.intervalo_meses) || 0,
    intervalo_horas:  parseInt(datos.intervalo_horas) || 0,
    proxima_fecha:    datos.proxima_fecha || '',
    notas:            datos.notas || '',
    origen:           datos.origen || 'manual',   // manual | OTT-xxxx | OTE-xxxx
    estado:           datos.estado || MANT_ESTADOS.PROGRAMADO,
    creado_at:        datos.creado_at || new Date().toISOString(),
    actualizado_at:   new Date().toISOString()
  };

  await dbPut(db, 'mantenimientos', mant);
  await logEvent(db, {
    type: 'MANT_CREADO',
    message: `Mantenimiento programado: ${mant.cliente_nombre} (${mant.equipo})`,
    ref: mant.id,
    data: { tipo: mant.tipo, proxima_fecha: mant.proxima_fecha, origen: mant.origen }
  }).catch(() => {});

  return mant;
}

/* ── Listar todos (con estado recalculado) ─────────────── */
export async function listarMantenimientos() {
  const db = store.get('db');
  if (!db) return [];
  const todos = await dbGetAll(db, 'mantenimientos', false).catch(() => []);
  const hoy = new Date();
  return todos
    .map(m => ({ ...m, _estado_calc: calcularEstadoMant(m, hoy), _dias: diasRestantes(m, hoy) }))
    .filter(m => m._estado_calc !== MANT_ESTADOS.COMPLETADO)
    .sort((a, b) => {
      /* vencidos y por vencer primero, luego por fecha */
      const fa = a.proxima_fecha || '9999-12-31';
      const fb = b.proxima_fecha || '9999-12-31';
      return fa.localeCompare(fb);
    });
}

/* ── Los que están por vencer o vencidos (para el aviso) ─ */
export async function mantenimientosPorVencer() {
  const todos = await listarMantenimientos();
  return todos.filter(m =>
    m._estado_calc === MANT_ESTADOS.POR_VENCER ||
    m._estado_calc === MANT_ESTADOS.VENCIDO
  );
}

/* ── Marcar como coordinado / completado ───────────────── */
export async function marcarMantenimiento(id, nuevoEstado) {
  const db = store.get('db');
  if (!db) return;
  const mant = await dbGet(db, 'mantenimientos', id).catch(() => null);
  if (!mant) return;
  mant.estado = nuevoEstado;
  mant.actualizado_at = new Date().toISOString();
  await dbPut(db, 'mantenimientos', mant);
  return mant;
}

/* ── Eliminar mantenimiento ────────────────────────────── */
export async function eliminarMantenimiento(id) {
  const db = store.get('db');
  if (!db) return;
  await dbDelete(db, 'mantenimientos', id).catch(() => {});
  await logEvent(db, { type: 'MANT_ELIMINADO', message: `Mantenimiento eliminado`, ref: id }).catch(() => {});
}

/* ── Calcular próxima fecha desde hoy + intervalo en meses ── */
export function calcularProximaFecha(meses, desde = new Date()) {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + (parseInt(meses) || 0));
  return d.toISOString().slice(0, 10);
}
