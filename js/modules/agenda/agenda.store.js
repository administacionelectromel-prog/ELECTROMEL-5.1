/**
 * ELECTROMEL — agenda/agenda.store.js
 * Estado del módulo agenda, helpers de rango de fechas
 * y suscripciones reactivas ligeras.
 */

import { store }      from '../../core/store.js';
import { dbGetAll }   from '../../core/db.js';
import { semanaRango } from '../../core/utils.js';
import { AgendaLogger } from '../../core/logger.js';

/* ═══════════════════════════════════════════════════════════
   ESTADO — claves en core/store.js
   ═══════════════════════════════════════════════════════════ */

/* ── Getters ────────────────────────────────────────────── */
export const getOffset      = () => store.get('agenda.semanaOffset') || 0;
export const getFiltroBase  = () => store.get('agenda.filtroBase')   || 'TODOS';
export const getEditandoId  = () => store.get('agenda.editandoId');
export const getFeedbackId  = () => store.get('agenda.feedbackId');
export const getSugerencias = () => store.get('agenda.sugerencias')  || [];
export const isIQVisible    = () => !!store.get('agenda.iqVisible');

/* ── Setters ─────────────────────────────────────────────── */
export function setOffset(v) {
  const prev = getOffset();
  store.set('agenda.semanaOffset', v);
  if (v !== prev) _notify('offset', v, prev);
}
export function setFiltroBase(v) {
  const prev = getFiltroBase();
  store.set('agenda.filtroBase', v);
  if (v !== prev) _notify('filtroBase', v, prev);
}
export const setEditandoId  = v => store.set('agenda.editandoId', v);
export const setFeedbackId  = v => store.set('agenda.feedbackId', v);
export const setSugerencias = v => store.set('agenda.sugerencias', v);
export const setIQVisible   = v => store.set('agenda.iqVisible', v);

/* ═══════════════════════════════════════════════════════════
   SUSCRIPCIONES REACTIVAS LIGERAS
   ═══════════════════════════════════════════════════════════ */

/** @type {Map<string, Set<Function>>} */
const _subs = new Map();

/**
 * Suscribirse a cambios de una clave del store de agenda.
 * @param {'offset'|'filtroBase'} key
 * @param {import('./agenda.types.js').StoreSubscriber<*>} fn
 * @returns {Function} unsubscribe
 */
export function agendaSubscribe(key, fn) {
  if (!_subs.has(key)) _subs.set(key, new Set());
  _subs.get(key).add(fn);
  AgendaLogger.debug(`agendaSubscribe: ${key} (${_subs.get(key).size} subs)`);
  return () => {
    _subs.get(key)?.delete(fn);
    AgendaLogger.debug(`agendaUnsubscribe: ${key}`);
  };
}

function _notify(key, newVal, oldVal) {
  const fns = _subs.get(key);
  if (!fns?.size) return;
  fns.forEach(fn => { try { fn(newVal, oldVal); } catch(e) { AgendaLogger.warn('subscriber error', e); } });
}

/** Limpia todas las suscripciones — llamar en destroy() */
export function clearSubscriptions() {
  _subs.clear();
  AgendaLogger.debug('agendaStore: all subscriptions cleared');
}

/* ═══════════════════════════════════════════════════════════
   HELPERS DE RANGO
   ═══════════════════════════════════════════════════════════ */

/**
 * semanaRangoAgenda(offset) → rango enriquecido con metadatos por día.
 * Cada día: { iso, esHoy, label (Lun/Mar/...), ddmm }
 */
export function semanaRangoAgenda(offset = 0) {
  const rango  = semanaRango(offset);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const DIAS   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  rango.dias = rango.dias.map(iso => {
    const d   = new Date(iso + 'T12:00:00');
    const dow = d.getDay(); // 0=Dom ... 6=Sáb
    return {
      iso,
      esHoy: iso === hoyISO,
      label: DIAS[dow === 0 ? 6 : dow - 1],
      ddmm:  iso.slice(8) + '/' + iso.slice(5, 7)
    };
  });
  return rango;
}

/**
 * periodoRango(period) → { from, to }
 * period: 'week' | 'month' | 'year'
 */
export function periodoRango(period) {
  const hoy = new Date();
  if (period === 'week') {
    const r = semanaRangoAgenda(0);
    return { from: r.from, to: r.to };
  }
  if (period === 'month') {
    return {
      from: new Date(hoy.getFullYear(), hoy.getMonth(),     1).toISOString().slice(0, 10),
      to:   new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)
    };
  }
  return {
    from: hoy.getFullYear() + '-01-01',
    to:   hoy.getFullYear() + '-12-31'
  };
}

export function periodoAnteriorRango(period) {
  const hoy = new Date();
  if (period === 'week')  return { from: semanaRangoAgenda(-1).from, to: semanaRangoAgenda(-1).to };
  if (period === 'month') return {
    from: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10),
    to:   new Date(hoy.getFullYear(), hoy.getMonth(),     0).toISOString().slice(0, 10)
  };
  return { from: (hoy.getFullYear() - 1) + '-01-01', to: (hoy.getFullYear() - 1) + '-12-31' };
}

/* ═══════════════════════════════════════════════════════════
   CARGA DE DATOS
   ═══════════════════════════════════════════════════════════ */

/**
 * cargarTurnosSemana(rango) → Promise<Turno[]>
 * Lee los turnos (es_turno=true) del store exteriors filtrados por semana.
 */
export async function cargarTurnosSemana(rango) {
  const db = store.get('db');
  if (!db) return [];
  const todos = await dbGetAll(db, 'exteriors');
  return todos.filter(t =>
    t.es_turno &&
    t.fecha &&
    t.fecha >= rango.from &&
    t.fecha <= rango.to
  );
}

/**
 * agruparPorDia(rango, turnos) → { [iso]: Turno[] }
 * Crea el mapa de días y agrupa + ordena los turnos.
 */
export function agruparPorDia(rango, turnos) {
  const porDia = {};
  rango.dias.forEach(d => { porDia[d.iso] = []; });
  turnos.forEach(t => {
    if (porDia[t.fecha]) porDia[t.fecha].push(t);
  });
  Object.keys(porDia).forEach(k =>
    porDia[k].sort((a, b) => (a.hora || '00:00').localeCompare(b.hora || '00:00'))
  );
  return porDia;
}
