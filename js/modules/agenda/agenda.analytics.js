/**
 * ELECTROMEL — agenda/agenda.analytics.js
 * Motor de Inteligencia de Agenda (IQ):
 *   - Análisis semanal con memoización
 *   - Generación de sugerencias accionables
 *   - Aplicar/descartar sugerencias
 *   - Semana óptima propuesta
 *
 * Arquitectura preparada para Web Worker futuro:
 * Todas las funciones de cálculo son puras o reciben datos serializables.
 * El futuro /workers/agenda.worker.js puede importar _pureAnalysis() directamente.
 */

import { store }           from '../../core/store.js';
import { dbGet, dbPut, invalidateCache } from '../../core/db.js';
import { showToast }       from '../../core/ui.js';
import { pesos }           from '../../core/utils.js';
import { BUSINESS_CONFIG } from '../../core/config.js';
import { AgendaLogger }    from './agenda.logger.js';
import { scoreEvent, evaluateTripToNQN } from './agenda.logic.js';
import { cargarTurnosSemana, agruparPorDia,
         semanaRangoAgenda, getSugerencias, setSugerencias } from './agenda.store.js';
import { SUGERENCIA_TIPOS, SUGERENCIA_ACCIONES } from './agenda.constants.js';

/* ═══════════════════════════════════════════════════════════
   MEMOIZACIÓN
   cache: { key → { result, ts } }  — TTL 30 segundos
   ═══════════════════════════════════════════════════════════ */
const _memo = new Map();
const MEMO_TTL = 30_000; // ms

function _memoKey(fn, ...args) { return `${fn}:${JSON.stringify(args)}`; }

function _memoGet(key) {
  const entry = _memo.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MEMO_TTL) { _memo.delete(key); return null; }
  return entry.result;
}

function _memoSet(key, result) {
  _memo.set(key, { result, ts: Date.now() });
  return result;
}

/** Invalida el memo cache (llamar al guardar/modificar turnos) */
export function invalidateAnalyticsCache() {
  _memo.clear();
  AgendaLogger.debug('analytics memo cache cleared');
}

/* ═══════════════════════════════════════════════════════════
   ANÁLISIS SEMANAL (con memoización)
   ═══════════════════════════════════════════════════════════ */

/**
 * analyzeWeeklyAgenda(offset) → análisis completo de la semana.
 * Resultado memoizado por 30s para evitar loops redundantes.
 * @param {number} [offset]
 * @returns {Promise<import('./agenda.types.js').AnalisisSemanal|null>}
 */
export async function analyzeWeeklyAgenda(offset = 0) {
  const db = store.get('db');
  if (!db) return null;

  const key    = _memoKey('analyzeWeeklyAgenda', offset);
  const cached = _memoGet(key);
  if (cached) { AgendaLogger.debug('analyzeWeeklyAgenda: cache hit'); return cached; }

  try {
    const rango      = semanaRangoAgenda(offset);
    const turnos     = await cargarTurnosSemana(rango);
    const result     = _pureAnalysis(rango, turnos);
    return _memoSet(key, result);
  } catch(e) {
    AgendaLogger.error('analyzeWeeklyAgenda', e);
    return null;
  }
}

/**
 * _pureAnalysis — función pura, preparada para Web Worker.
 * Recibe datos ya cargados, no accede a DB ni store.
 * @param {import('./agenda.types.js').RangoSemana} rango
 * @param {import('./agenda.types.js').Turno[]} turnos
 * @returns {import('./agenda.types.js').AnalisisSemanal}
 */
export function _pureAnalysis(rango, turnos) {
  const porDia     = agruparPorDia(rango, turnos);
  const turnosDia  = BUSINESS_CONFIG.turnos_dia || 3;

  const totalIngreso  = turnos.reduce((a, t) => a + (parseFloat(t.ingreso_estimado) || 0), 0);
  const diasVacios    = Object.keys(porDia).filter(k => porDia[k].length === 0);
  const diasSaturados = Object.keys(porDia).filter(k => porDia[k].length >= turnosDia);

  const conScore  = turnos.filter(t => typeof t.score === 'number');
  const scoreAvg  = conScore.length
    ? conScore.reduce((a, t) => a + t.score, 0) / conScore.length
    : 0;

  const turnosBajos = turnos.filter(t => (t.score || 50) < 50);
  const evalNQN     = evaluateTripToNQN(turnos);

  return {
    rango, turnos, porDia,
    totalTurnos:      turnos.length,
    totalIngreso,
    promedioPorTurno: turnos.length ? totalIngreso / turnos.length : 0,
    diasVacios, diasSaturados, scoreAvg, turnosBajos, evalNQN
  };
}

/* ═══════════════════════════════════════════════════════════
   SUGERENCIAS ACCIONABLES
   ═══════════════════════════════════════════════════════════ */

/**
 * generateWeeklySuggestions(offset) → Sugerencia[]
 * Cada sugerencia: { id, tipo, titulo, detalle, accion, target?, target_id?, nuevoIngreso? }
 * accion: 'info' | 'subir_precio' | 'reagendar'
 */
export async function generateWeeklySuggestions(offset = 0) {
  const analisis = await analyzeWeeklyAgenda(offset);
  if (!analisis) return [];

  const sug = [];
  let c = 1;

  const minSemanal   = BUSINESS_CONFIG.min_jobs_week  || 4;
  const minPrecioSMA = BUSINESS_CONFIG.precio_min_sma || 0;
  const minPrecioNQN = BUSINESS_CONFIG.precio_min_nqn || 0;

  /* 1. Pocos turnos en la semana */
  if (analisis.totalTurnos < minSemanal) {
    sug.push({
      id: 'sug' + c++, tipo: 'agenda',
      titulo: 'Faltan turnos esta semana',
      detalle: `Cargaste ${analisis.totalTurnos} turno(s). Mínimo recomendado: ${minSemanal}.`,
      accion: 'info'
    });
  }

  /* 2. Viaje NQN no conviene o no llega al objetivo */
  if (analisis.evalNQN.hasTrips && !analisis.evalNQN.isWorth) {
    const travel  = BUSINESS_CONFIG.travel_cost_NQN || 25000;
    const target  = BUSINESS_CONFIG.min_profit_trip  || 80000;
    const ganPorJob = (analisis.promedioPorTurno || 30000) * 0.6;
    const necesarios = ganPorJob > 0 ? Math.ceil((travel + target) / ganPorJob) : '?';
    sug.push({
      id: 'sug' + c++, tipo: 'viaje',
      titulo: '❌ Viaje a NQN en pérdida',
      detalle: `Solo ${analisis.evalNQN.nqnEventCount} turno(s) NQN. Necesitás ~${necesarios} trabajos.`,
      accion: 'info'
    });
  } else if (analisis.evalNQN.hasTrips && !analisis.evalNQN.meetsTarget) {
    sug.push({
      id: 'sug' + c++, tipo: 'viaje',
      titulo: '⚠️ Viaje NQN sin alcanzar objetivo',
      detalle: `Faltan ${pesos(analisis.evalNQN.missing)} de ganancia para el viaje.`,
      accion: 'info'
    });
  }

  /* 3. Turnos con precio bajo el mínimo de su base */
  analisis.turnos.forEach(t => {
    const ingreso = parseFloat(t.ingreso_estimado) || 0;
    if (!ingreso) return;
    const minBase = t.base === 'NQN' ? minPrecioNQN : minPrecioSMA;
    if (minBase > 0 && ingreso < minBase) {
      const sugerido = Math.ceil(minBase / 100) * 100;
      sug.push({
        id: 'sug' + c++, tipo: 'precio',
        titulo: `💰 ${t.numero}: precio bajo el mínimo ${t.base}`,
        detalle: `${t.cliente_nombre || ''} · ${pesos(ingreso)} < mínimo ${pesos(minBase)}`,
        accion: 'subir_precio',
        target: t.numero, target_id: t.id || t.numero, nuevoIngreso: sugerido
      });
    }
  });

  /* 4. Días saturados con el turno de menor score → reagendar */
  analisis.diasSaturados.forEach(iso => {
    const delDia = analisis.porDia[iso] || [];
    const peor   = delDia.slice().sort((a, b) => (a.score || 50) - (b.score || 50))[0];
    if (peor && (peor.score || 50) < 60) {
      sug.push({
        id: 'sug' + c++, tipo: 'agenda',
        titulo: `📅 Día sobrecargado: ${iso}`,
        detalle: `${delDia.length} turnos ese día. Reagendá ${peor.numero || ''} (${peor.cliente_nombre || '—'}) a otro día.`,
        accion: 'reagendar',
        target: peor.numero, target_id: peor.id || peor.numero
      });
    }
  });

  /* 5. Muchos días vacíos con turnos cargados */
  if (analisis.diasVacios.length >= 3 && analisis.totalTurnos > 0) {
    sug.push({
      id: 'sug' + c++, tipo: 'agenda',
      titulo: `📅 ${analisis.diasVacios.length} días sin turnos`,
      detalle: 'Tenés días libres para mover turnos saturados o agregar nuevos.',
      accion: 'info'
    });
  }

  /* 6. Score promedio muy bajo */
  if (analisis.scoreAvg > 0 && analisis.scoreAvg < 50) {
    sug.push({
      id: 'sug' + c++, tipo: 'score',
      titulo: `📉 Score promedio bajo: ${Math.round(analisis.scoreAvg)}/100`,
      detalle: 'La selección de trabajos de esta semana no es óptima. Revisá precios.',
      accion: 'info'
    });
  }

  setSugerencias(sug);
  return sug;
}

/* ═══════════════════════════════════════════════════════════
   APLICAR SUGERENCIA
   ═══════════════════════════════════════════════════════════ */

/**
 * applySuggestion(id) → aplica la acción de la sugerencia.
 * Modifica la DB si corresponde y actualiza las sugerencias activas.
 */
export async function applySuggestion(id) {
  const db  = store.get('db');
  const sug = getSugerencias().find(s => s.id === id);
  if (!sug) { showToast('Sugerencia no encontrada', 'warn'); return; }

  if (sug.accion === 'subir_precio' && sug.target_id && sug.nuevoIngreso) {
    try {
      const turno = await dbGet(db, 'exteriors', sug.target_id);
      if (!turno) { showToast('Turno no encontrado', 'error'); return; }
      turno.ingreso_estimado = sug.nuevoIngreso;
      turno.score            = scoreEvent(turno);
      turno.actualizado_at   = new Date().toISOString();
      await dbPut(db, 'exteriors', turno);
      dismissSuggestion(id);
      invalidateCache();
      showToast(`✓ Precio aplicado: ${pesos(sug.nuevoIngreso)}`, 'success');
      return 'refresh';
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
    return;
  }

  if (sug.accion === 'reagendar' && sug.target_id) {
    try {
      const turno = await dbGet(db, 'exteriors', sug.target_id);
      if (turno) {
        showToast('Cambiá la fecha de este turno', 'info');
        return { openTurno: turno };
      }
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
    return;
  }

  showToast('Solo informativa — sin acción automática', 'info');
}

/**
 * dismissSuggestion(id) → descarta sin aplicar.
 */
export function dismissSuggestion(id) {
  setSugerencias(getSugerencias().filter(s => s.id !== id));
}

/* ═══════════════════════════════════════════════════════════
   SEMANA ÓPTIMA
   ═══════════════════════════════════════════════════════════ */

/**
 * generateOptimalWeek(offset) → propone distribución óptima de turnos.
 * Agrupa NQN en días consecutivos y SMA en el resto.
 * Retorna el texto de la propuesta (no la aplica automáticamente).
 */
export async function generateOptimalWeek(offset = 0) {
  const analisis = await analyzeWeeklyAgenda(offset);
  if (!analisis || !analisis.totalTurnos) return null;

  const turnosDia = BUSINESS_CONFIG.turnos_dia || 3;
  const turnos    = analisis.turnos.slice().sort((a, b) => (b.score || 50) - (a.score || 50));
  const nqn       = turnos.filter(t => t.base === 'NQN');
  const sma       = turnos.filter(t => t.base === 'SMA');
  const propuesta = {};
  analisis.rango.dias.forEach(d => { propuesta[d.iso] = { dia: d, turnos: [], base: null }; });

  /* Asignar NQN a los primeros días (máx 3) */
  const diasNQN = Math.min(3, Math.ceil(nqn.length / turnosDia));
  let dayIdx = 0, tIdx = 0;
  while (tIdx < nqn.length && dayIdx < diasNQN) {
    const iso = analisis.rango.dias[dayIdx].iso;
    if (propuesta[iso].turnos.length < turnosDia) {
      propuesta[iso].turnos.push(nqn[tIdx]); propuesta[iso].base = 'NQN'; tIdx++;
    } else { dayIdx++; }
  }

  /* SMA en los días restantes */
  dayIdx = diasNQN; tIdx = 0;
  while (tIdx < sma.length && dayIdx < 7) {
    const iso = analisis.rango.dias[dayIdx].iso;
    if (propuesta[iso].turnos.length < turnosDia) {
      propuesta[iso].turnos.push(sma[tIdx]); propuesta[iso].base = 'SMA'; tIdx++;
    } else { dayIdx++; }
  }

  /* Construir resumen */
  const lines = ['📈 SEMANA ÓPTIMA PROPUESTA\n'];
  Object.values(propuesta).forEach(p => {
    if (!p.turnos.length) return;
    lines.push(`${p.dia.label} ${p.dia.ddmm} (${p.base || '—'}): ${p.turnos.length} turno(s)`);
    p.turnos.forEach(t => lines.push(`  · ${t.cliente_nombre || '—'} — ${pesos(t.ingreso_estimado || 0)}`));
  });
  if (nqn.length > 0 && diasNQN < 5)
    lines.push(`\nConcentrás NQN en ${diasNQN} día(s) — ahorrás costo de viaje extra.`);
  lines.push(`\nTotal estimado: ${pesos(analisis.totalIngreso)}`);
  lines.push('\n(Esta es una sugerencia — no se aplicó automáticamente)');

  return { texto: lines.join('\n'), propuesta, analisis };
}
