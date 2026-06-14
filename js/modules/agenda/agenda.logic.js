/**
 * ELECTROMEL — agenda/agenda.logic.js
 * Lógica de negocio pura de la agenda:
 *   - Motor de score (síncrono y asíncrono con historial)
 *   - Motor de decisión (ACEPTAR / REVISAR / RECHAZAR / REAGENDAR)
 *   - Motor de rentabilidad de viaje NQN
 *   - Guardar turno (nuevo y edición)
 *   - Feedback de turno realizado
 */

import { store }             from '../../core/store.js';
import { dbGet, dbPut, dbGetAll, getNextNumber, logEvent, invalidateCache, getBaseForDate } from '../../core/db.js';
import { showToast }         from '../../core/ui.js';
import { pesos }             from '../../core/utils.js';
import { BUSINESS_CONFIG }   from '../../core/config.js';
import { upsertCliente }     from '../../services/clientes.js';
import { registrarEstimado, cerrarRegistroReal } from '../../services/rentabilidad.js';
import { onOrderDelivered, onOrderExpense }      from '../../services/finance.js';
import { getEditandoId, setEditandoId, getFeedbackId, setFeedbackId } from './agenda.store.js';
import { calcularConveniencia, costoViajeCiudad } from '../../services/zonas.js';

/* ═══════════════════════════════════════════════════════════
   SCORE ENGINE
   ═══════════════════════════════════════════════════════════ */

/**
 * scoreEvent(turno) → 0-100
 * Heurística rápida sincrónica, sin acceso a DB.
 * Componentes: precio (40pts) + ganancia (30pts) + $/hora (30pts)
 */
export function scoreEvent(turno) {
  if (!turno) return 50;
  const ingresoBruto = parseFloat(turno.ingreso_estimado) || 0;
  const horas   = parseFloat(turno.horas_estimadas)  || 1;
  if (ingresoBruto === 0) return 50;

  /* Restar el costo de viaje a la ciudad del turno (si está configurada).
     El ingreso "neto de viaje" es lo que realmente queda para evaluar. */
  let costoViaje = 0, tiempoViaje = 0;
  try {
    const ciudad = turno.cliente_ciudad || turno.ciudad || '';
    if (ciudad) {
      const v = costoViajeCiudad(ciudad);
      costoViaje  = v.total || 0;
      tiempoViaje = v.tiempo_hs || 0;
    }
  } catch (e) { /* zonas no disponible: seguir sin costo */ }

  const ingreso    = Math.max(0, ingresoBruto - costoViaje);
  const horasTotal = horas + tiempoViaje;   // el viaje también consume tiempo

  const minPrecio     = (turno.base === 'NQN'
    ? (BUSINESS_CONFIG.precio_min_nqn || 0)
    : (BUSINESS_CONFIG.precio_min_sma || 0)) || 1000;
  const minPorTrabajo = BUSINESS_CONFIG.min_profit_per_job  || 5000;
  const minPorHora    = BUSINESS_CONFIG.min_profit_per_hour || 1500;

  /* p1: precio relativo al mínimo (40 pts) */
  const p1 = ingreso >= minPrecio * 2
    ? 40
    : ingreso >= minPrecio
      ? 25 + (ingreso - minPrecio) / minPrecio * 15
      : Math.max(0, ingreso / minPrecio * 20);

  /* p2: ganancia estimada ~60% del ingreso neto (30 pts) */
  const ganancia = ingreso * 0.6;
  const p2 = ganancia >= minPorTrabajo * 2
    ? 30
    : ganancia >= minPorTrabajo
      ? 20 + (ganancia - minPorTrabajo) / minPorTrabajo * 10
      : Math.max(0, ganancia / minPorTrabajo * 15);

  /* p3: ingreso por hora, contando el tiempo de viaje (30 pts) */
  const porHora = horasTotal > 0 ? ingreso / horasTotal : 0;
  const p3 = porHora >= minPorHora * 2
    ? 30
    : porHora >= minPorHora
      ? 20 + (porHora - minPorHora) / minPorHora * 10
      : Math.max(0, porHora / minPorHora * 15);

  return Math.max(0, Math.min(100, Math.round(p1 + p2 + p3)));
}

/**
 * scoreEventAsync(turno) → { score, breakdown }
 * Versión enriquecida con historial real de serviceStats.
 * Usa costo promedio histórico en lugar de heurística 40%.
 */
export async function scoreEventAsync(turno) {
  if (!turno) return { score: 50, breakdown: { fuente: 'neutral' } };
  const ingreso = parseFloat(turno.ingreso_estimado) || 0;
  if (ingreso === 0) return { score: 50, breakdown: { fuente: 'sin_datos' } };

  try {
    const { getServiceEstimates } = await import('../../services/rentabilidad.js');
    const stats = await getServiceEstimates(turno.tipo_servicio || '', turno.base || 'SMA');

    if (stats.n >= 2) {
      const avgCosto    = stats.costo || ingreso * 0.4;
      const gananciaEst = ingreso - avgCosto;
      const horas       = parseFloat(turno.horas_estimadas) || stats.horas || 1;
      const minPorTrabajo = BUSINESS_CONFIG.min_profit_per_job  || 5000;
      const minPorHora    = BUSINESS_CONFIG.min_profit_per_hour || 1500;
      const minPrecio     = (turno.base === 'NQN'
        ? (BUSINESS_CONFIG.precio_min_nqn || 0)
        : (BUSINESS_CONFIG.precio_min_sma || 0)) || 1000;

      const p1 = ingreso >= minPrecio * 2 ? 40 : Math.max(0, (ingreso / (minPrecio * 2)) * 40);
      const p2 = gananciaEst >= minPorTrabajo ? 30 : Math.max(0, (gananciaEst / minPorTrabajo) * 25);
      const porHora = horas > 0 ? gananciaEst / horas : 0;
      const p3 = porHora >= minPorHora ? 30 : Math.max(0, (porHora / minPorHora) * 25);
      const score = Math.max(0, Math.min(100, Math.round(p1 + p2 + p3)));
      return { score, breakdown: { p1, p2, p3, fuente: 'historial', sample_n: stats.n } };
    }

    if (stats.n === 1) {
      return { score: scoreEvent(turno), breakdown: { fuente: 'cruzada', sample_n: 1 } };
    }
  } catch(e) { /* sin historial — caer a heurística */ }

  return { score: scoreEvent(turno), breakdown: { fuente: 'heuristica' } };
}

/* ═══════════════════════════════════════════════════════════
   MOTOR DE DECISIÓN
   ═══════════════════════════════════════════════════════════ */

/**
 * evaluarTurno(turno, eventosDelDia) → { decision, razon }
 * decision: 'ACEPTAR' | 'REVISAR' | 'RECHAZAR' | 'REAGENDAR'
 */
export async function evaluarTurno(turno, eventosDelDia) {
  if (!turno) return { decision: 'REVISAR', razon: 'Sin datos' };

  const ingreso   = parseFloat(turno.ingreso_estimado) || 0;
  const score     = scoreEvent(turno);
  const turnosDia = BUSINESS_CONFIG.turnos_dia || 3;
  const minPrecio = (turno.base === 'NQN'
    ? (BUSINESS_CONFIG.precio_min_nqn || 0)
    : (BUSINESS_CONFIG.precio_min_sma || 0)) || 0;

  if (Array.isArray(eventosDelDia) && eventosDelDia.length >= turnosDia)
    return { decision: 'REAGENDAR', razon: `Día saturado (${eventosDelDia.length} turnos)` };

  if (minPrecio > 0 && ingreso > 0 && ingreso < minPrecio)
    return { decision: 'RECHAZAR', razon: `Precio bajo el mínimo (${pesos(minPrecio)} para ${turno.base})` };

  if (score >= 70) return { decision: 'ACEPTAR',  razon: `Buen score: ${score}/100` };
  if (score >= 50) return { decision: 'REVISAR',  razon: `Score regular: ${score}/100` };
  return             { decision: 'RECHAZAR', razon: `Score bajo: ${score}/100` };
}

/* ═══════════════════════════════════════════════════════════
   MOTOR DE VIAJE NQN
   ═══════════════════════════════════════════════════════════ */

/**
 * evaluateTripToNQN(turnos) → análisis de rentabilidad del viaje.
 * Considera costo fijo de viaje y ganancia mínima objetivo.
 */
export function evaluateTripToNQN(turnos) {
  const nqn = (turnos || []).filter(t => t.base === 'NQN');
  if (!nqn.length) return { hasTrips: false };

  const total_income = nqn.reduce((a, t) => a + (parseFloat(t.ingreso_estimado) || 0), 0);
  const total_cost   = total_income * 0.4;
  const travel_cost  = BUSINESS_CONFIG.travel_cost_NQN || 25000;
  const min_profit   = BUSINESS_CONFIG.min_profit_trip  || 80000;
  const trip_profit  = total_income - total_cost - travel_cost;
  const isWorth      = trip_profit > 0;
  const meetsTarget  = trip_profit >= min_profit;
  const missing      = Math.max(0, min_profit - trip_profit);

  const tipo   = isWorth ? (meetsTarget ? 'ok' : 'revisar') : 'no';
  const alerta = isWorth
    ? (meetsTarget
        ? `✅ Viaje a NQN rentable: ganancia estimada ${pesos(trip_profit)}`
        : `⚠️ Faltan ${pesos(missing)} para alcanzar el objetivo de viaje`)
    : `❌ No conviene viajar a NQN con solo ${nqn.length} turno(s)`;

  return {
    hasTrips: true, nqnEventCount: nqn.length,
    total_income, total_cost, travel_cost,
    trip_profit, isWorth, meetsTarget, missing, alerta, tipo
  };
}

/* ═══════════════════════════════════════════════════════════
   LEER FORMULARIO
   ═══════════════════════════════════════════════════════════ */
export function readTurno() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const nombre   = v('turno-cliente-nombre');
  if (!nombre)   { showToast('Falta el nombre del cliente', 'warn'); return null; }
  const servicio = v('turno-servicio');
  if (!servicio) { showToast('Elegí un tipo de servicio', 'warn');   return null; }
  const fecha    = v('turno-fecha');
  if (!fecha)    { showToast('Falta la fecha', 'warn');               return null; }

  const data = {
    cliente_nombre:    nombre,
    cliente_cuit:      v('turno-cliente-cuit'),
    cliente_telefono:  v('turno-cliente-tel'),
    cliente_direccion: v('turno-cliente-dir'),
    cliente_cp:        v('turno-cliente-cp'),
    cliente_ciudad:    v('turno-cliente-ciudad'),
    cliente_provincia: v('turno-cliente-provincia'),
    tipo_servicio:     servicio,
    base:              v('turno-base')   || 'SMA',
    fecha,
    hora:              v('turno-hora'),
    notas:             v('turno-notas'),
    horas_estimadas:   parseFloat(document.getElementById('turno-horas')?.value)   || 1,
    ingreso_estimado:  parseFloat(document.getElementById('turno-ingreso')?.value) || 0,
    estado_turno:      v('turno-estado') || 'pendiente',
    es_turno:          true
  };
  data.score = scoreEvent(data);
  return data;
}

/* ═══════════════════════════════════════════════════════════
   GUARDAR TURNO
   ═══════════════════════════════════════════════════════════ */
export async function guardarTurno() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  const data = readTurno();
  if (!data) return;

  try {
    const editandoId = getEditandoId();
    let numero;

    if (editandoId) {
      numero       = editandoId;
      data.numero  = numero;
      data.id      = numero;
      const previo = await dbGet(db, 'exteriors', numero);
      if (previo) data.creado_at = previo.creado_at;
    } else {
      numero         = await getNextNumber(db, 'OTE');
      data.numero    = numero;
      data.id        = numero;
      data.creado_at = new Date().toISOString();
    }
    data.actualizado_at = new Date().toISOString();

    await dbPut(db, 'exteriors', data);

    upsertCliente({
      nombre:    data.cliente_nombre,
      cuit:      data.cliente_cuit,
      telefono:  data.cliente_telefono,
      direccion: data.cliente_direccion,
      cp:        data.cliente_cp,
      ciudad:    data.cliente_ciudad,
      provincia: data.cliente_provincia
    }, numero).catch(e => console.warn('[guardarTurno] upsertCliente:', e));

    if (!editandoId) registrarEstimado(data).catch(() => {});

    await logEvent(db, {
      type:    'TURNO_' + (editandoId ? 'UPDATED' : 'CREATED'),
      message: `Turno ${numero} (${data.base} ${data.fecha})`,
      ref:     numero,
      data:    { cliente: data.cliente_nombre, score: data.score }
    });

    invalidateCache();
    return { numero, data };

  } catch(err) {
    console.error('[guardarTurno]', err);
    throw err;
  }
}

/* ═══════════════════════════════════════════════════════════
   FEEDBACK DE TURNO REALIZADO
   ═══════════════════════════════════════════════════════════ */
export async function confirmarFeedbackTurno() {
  const db         = store.get('db');
  const feedbackId = getFeedbackId();
  if (!feedbackId) return;

  const ingresoReal = parseFloat(document.getElementById('feedback-ingreso')?.value) || 0;
  const costoReal   = parseFloat(document.getElementById('feedback-costo')?.value)   || 0;
  const nota        = (document.getElementById('feedback-nota')?.value || '').trim();

  if (ingresoReal <= 0) { showToast('Cargá un ingreso real > 0', 'warn'); return; }

  try {
    const turno = await dbGet(db, 'exteriors', feedbackId);
    if (!turno) { showToast('Turno no encontrado', 'error'); return; }

    turno.ingreso_real  = ingresoReal;
    turno.costo_real    = costoReal;
    turno.ganancia_real = ingresoReal - costoReal;
    turno.feedback_nota = nota;
    turno.realizado_at  = new Date().toISOString();
    turno.estado        = 'pagado';
    turno.total         = ingresoReal;

    await dbPut(db, 'exteriors', turno);

    onOrderDelivered(turno)
      .catch(e => { if (!String(e).includes('ya está')) console.warn('[feedback] income:', e); });

    if (costoReal > 0) {
      onOrderExpense(turno, {
        amount:      costoReal,
        category:    'componente',
        description: `Costo real turno ${turno.numero}`,
        date:        turno.fecha
      }).catch(e => console.warn('[feedback] expense:', e));
    }

    cerrarRegistroReal(turno.numero, {
      ingreso: ingresoReal, costo: costoReal, horas: turno.horas_estimadas
    }).catch(e => console.warn('[feedback] cerrarRegistroReal:', e));

    await logEvent(db, {
      type:    'TURNO_REALIZADO',
      message: `Turno ${turno.numero} realizado: ${pesos(ingresoReal)}`,
      ref:     turno.numero,
      data:    { ingreso: ingresoReal, costo: costoReal, ganancia: ingresoReal - costoReal }
    });

    invalidateCache();
    setFeedbackId(null);
    return turno;

  } catch(err) {
    console.error('[confirmarFeedbackTurno]', err);
    throw err;
  }
}
