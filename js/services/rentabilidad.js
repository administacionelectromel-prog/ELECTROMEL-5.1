/**
 * ELECTROMEL — rentabilidad.js
 * Servicio de rentabilidad: ciclo completo de medición estimado→real,
 * autoajuste de promedios por servicio, rankings y precisión del sistema.
 */

import { store }              from '../core/store.js';
import { dbGet, dbPut, dbGetAll, getCfg, setCfg, logEvent } from '../core/db.js';
import { pesos }              from '../core/utils.js';
import { BUSINESS_CONFIG }    from '../core/config.js';

/* ── registrarEstimado(data) ────────────────────────────── */
/**
 * Crea un registro en rentabilidad_records al crear una orden.
 * Idempotente: si ya existe para ese número, no hace nada.
 */
export async function registrarEstimado(data) {
  const db = store.get('db');
  if (!db || !data?.numero) return;

  try {
    const existente = await dbGet(db, 'rentabilidad_records', data.numero);
    if (existente) return; /* idempotente */

    const tipo = data.numero.split('-')[0];
    let estimadoIngreso = 0;
    let estimadoCosto   = 0;
    let horas           = 0;

    if (tipo === 'OTT' || tipo === 'PRE') {
      estimadoIngreso = parseFloat(data.total) || 0;
      if (Array.isArray(data.materiales_items) && data.materiales_items.length) {
        estimadoCosto = data.materiales_items.reduce((a, m) => a + (parseFloat(m.subtotal) || 0), 0);
      } else {
        estimadoCosto = estimadoIngreso * 0.4;
      }
      horas = parseFloat(data.tiempo_estimado_horas) || 0;
    } else if (tipo === 'OTE') {
      estimadoIngreso = parseFloat(data.total) || 0;
      estimadoCosto   = (parseFloat(data.sub_materiales)  || 0) +
                        (parseFloat(data.gasto_vianda)     || 0) +
                        (parseFloat(data.gasto_movilidad)  || 0) +
                        (parseFloat(data.gasto_otros)      || 0);
      horas = parseFloat(data.horas_estimadas) || 0;
    } else if (tipo === 'ING') {
      estimadoCosto = parseFloat(data.encomienda_costo) || 0;
    }

    const rec = {
      numero:             data.numero,
      tipo,
      cliente:            data.cliente_nombre   || '',
      servicio:           data.equipo_tipo       || data.tipo_servicio || '',
      base:               data.base              || 'SMA',
      ciudad:             data.cliente_ciudad    || '',
      estimado_ingreso:   estimadoIngreso,
      estimado_costo:     estimadoCosto,
      estimado_ganancia:  estimadoIngreso - estimadoCosto,
      estimado_horas:     horas,
      real_ingreso:       null,
      real_costo:         null,
      real_ganancia:      null,
      real_horas:         null,
      fecha_inicio:       data.fecha || data.creado_at || new Date().toISOString().slice(0, 10),
      fecha_cierre:       null,
      decision:           data.decision || null,
      score:              data.score    || null,
      cerrado:            false,
      es_mala_decision:   false,
      diferencia_pct:     null
    };

    await dbPut(db, 'rentabilidad_records', rec);
  } catch(err) {
    console.warn('[registrarEstimado]', err);
  }
}

/* ── cerrarRegistroReal(numero, datos) ──────────────────── */
/**
 * Cierra el ciclo de rentabilidad con los datos reales.
 * datos: { ingreso, costo, horas }
 * Calcula diferencia vs estimado, detecta malas decisiones,
 * y autoajusta los promedios del servicio.
 */
export async function cerrarRegistroReal(numero, datos = {}) {
  const db = store.get('db');
  if (!db || !numero) return;

  try {
    const rec = await dbGet(db, 'rentabilidad_records', numero);
    if (!rec || rec.cerrado) return;

    const realIngreso  = parseFloat(datos.ingreso) || 0;
    const realCosto    = parseFloat(datos.costo)   || 0;
    const realGanancia = realIngreso - realCosto;
    const realHoras    = parseFloat(datos.horas)   || rec.estimado_horas || 0;

    rec.real_ingreso  = realIngreso;
    rec.real_costo    = realCosto;
    rec.real_ganancia = realGanancia;
    rec.real_horas    = realHoras;
    rec.fecha_cierre  = new Date().toISOString();
    rec.cerrado       = true;

    /* Precisión de la estimación */
    if (rec.estimado_ingreso > 0) {
      const diff = Math.abs(realIngreso - rec.estimado_ingreso);
      rec.diferencia_pct = (diff / rec.estimado_ingreso) * 100;
    }

    /* ¿Fue mala decisión? */
    const minTrabajo = BUSINESS_CONFIG.min_ganancia_trabajo || 5000;
    const ganHora    = realHoras > 0 ? realGanancia / realHoras : realGanancia;
    rec.es_mala_decision = realGanancia < minTrabajo;

    await dbPut(db, 'rentabilidad_records', rec);
    await _autoajustarEstimaciones(db, rec);

    await logEvent(db, {
      type:    'RENTAB_CERRADO',
      message: `Rentabilidad cerrada: ${numero} · est.${pesos(rec.estimado_ganancia)} vs real ${pesos(realGanancia)}`,
      ref:     numero,
      data:    {
        estimado_ing: rec.estimado_ingreso,
        real_ing:     realIngreso,
        real_gan:     realGanancia,
        es_mala:      rec.es_mala_decision
      }
    });
  } catch(err) {
    console.warn('[cerrarRegistroReal]', err);
  }
}

/* ── _autoajustarEstimaciones ───────────────────────────── */
async function _autoajustarEstimaciones(db, rec) {
  if (!rec?.servicio) return;
  try {
    const key   = 'serviceStats';
    let stats   = await getCfg(db, key, null);
    if (!stats || typeof stats !== 'object') stats = {};

    const claveServicio = `${rec.servicio || '—'}::${rec.base || 'SMA'}`;
    const actual = stats[claveServicio] || {
      n: 0, avg_ingreso: 0, avg_costo: 0, avg_ganancia: 0, avg_horas: 0, ultima_actualizacion: null
    };

    /* Weighted moving average */
    const n = actual.n + 1;
    actual.avg_ingreso  = (actual.avg_ingreso  * actual.n + (rec.real_ingreso  || 0)) / n;
    actual.avg_costo    = (actual.avg_costo    * actual.n + (rec.real_costo    || 0)) / n;
    actual.avg_ganancia = (actual.avg_ganancia * actual.n + (rec.real_ganancia || 0)) / n;
    actual.avg_horas    = (actual.avg_horas    * actual.n + (rec.real_horas    || 0)) / n;
    actual.n = n;
    actual.ultima_actualizacion = new Date().toISOString();

    stats[claveServicio] = actual;
    await setCfg(db, key, stats);
  } catch(err) {
    console.warn('[_autoajustarEstimaciones]', err);
  }
}

/* ── getServiceEstimates(servicio, base) ────────────────── */
/**
 * Lee los promedios históricos para precargar estimaciones.
 * Si no hay datos para la base pedida, intenta con la otra (cruzada).
 */
export async function getServiceEstimates(servicio, base = 'SMA') {
  const db = store.get('db');
  if (!db || !servicio) return { ingreso: 0, costo: 0, ganancia: 0, horas: 0, n: 0 };

  try {
    const stats = await getCfg(db, 'serviceStats', null);
    if (!stats) return { ingreso: 0, costo: 0, ganancia: 0, horas: 0, n: 0 };

    const s = stats[`${servicio}::${base}`];
    if (s) return { ingreso: s.avg_ingreso || 0, costo: s.avg_costo || 0, ganancia: s.avg_ganancia || 0, horas: s.avg_horas || 0, n: s.n || 0 };

    /* Fallback cruzado */
    const otraBase = base === 'NQN' ? 'SMA' : 'NQN';
    const s2 = stats[`${servicio}::${otraBase}`];
    if (s2) return { ingreso: s2.avg_ingreso || 0, costo: s2.avg_costo || 0, ganancia: s2.avg_ganancia || 0, horas: s2.avg_horas || 0, n: 0, cruzada: true };

    return { ingreso: 0, costo: 0, ganancia: 0, horas: 0, n: 0 };
  } catch(err) {
    console.warn('[getServiceEstimates]', err);
    return { ingreso: 0, costo: 0, ganancia: 0, horas: 0, n: 0 };
  }
}

/* ── calcularPrecisionSistema() ─────────────────────────── */
export async function calcularPrecisionSistema() {
  const db = store.get('db');
  if (!db) return { precision_pct: 0, cerrados: 0, total: 0 };

  try {
    const todos    = await dbGetAll(db, 'rentabilidad_records');
    const cerrados = todos.filter(r => r.cerrado && r.diferencia_pct !== null);
    if (!cerrados.length) return { precision_pct: 0, cerrados: 0, total: todos.length };

    const errorProm = cerrados.reduce((a, r) => a + (r.diferencia_pct || 0), 0) / cerrados.length;
    return {
      precision_pct: Math.max(0, 100 - errorProm),
      cerrados:      cerrados.length,
      total:         todos.length
    };
  } catch(err) {
    console.warn('[calcularPrecisionSistema]', err);
    return { precision_pct: 0, cerrados: 0, total: 0 };
  }
}

/* ── calcularRankings() ─────────────────────────────────── */
/**
 * Top servicios, clientes y ciudades por ganancia real.
 */
export async function calcularRankings() {
  const db = store.get('db');
  if (!db) return { servicios: [], clientes: [], ciudades: [] };

  try {
    const todos = (await dbGetAll(db, 'rentabilidad_records')).filter(r => r.cerrado);

    function _agrupar(key) {
      const m = {};
      todos.forEach(r => {
        const k = r[key] || '—';
        if (!m[k]) m[k] = { nombre: k, ganancia: 0, n: 0 };
        m[k].ganancia += r.real_ganancia || 0;
        m[k].n++;
      });
      return Object.values(m).sort((a, b) => b.ganancia - a.ganancia).slice(0, 5);
    }

    return {
      servicios: _agrupar('servicio'),
      clientes:  _agrupar('cliente'),
      ciudades:  _agrupar('ciudad')
    };
  } catch(err) {
    console.warn('[calcularRankings]', err);
    return { servicios: [], clientes: [], ciudades: [] };
  }
}

/* ── generarReporteSemanal(rango) ───────────────────────── */
/**
 * Resumen de rentabilidad para una semana dada.
 */
export async function generarReporteSemanal(rango) {
  const db = store.get('db');
  if (!db || !rango) return null;

  try {
    const todos = await dbGetAll(db, 'rentabilidad_records');
    const enRango = todos.filter(r =>
      r.fecha_inicio >= rango.from &&
      r.fecha_inicio <= rango.to
    );
    const cerrados = enRango.filter(r => r.cerrado);

    /* La diferencia est./real debe compararse SOLO sobre los trabajos cerrados
       (mismos trabajos: lo que estimé vs lo que realmente pasó). Antes se
       sumaba el estimado de TODOS (incluidos presupuestos sin cerrar de
       millones) contra el real de solo los cerrados → daba diferencias
       absurdas tipo -$14M. Ahora ambos lados son los mismos registros. */
    const totalEstimado     = enRango.reduce((a, r) => a + (r.estimado_ganancia || 0), 0);
    const totalReal         = cerrados.reduce((a, r) => a + (r.real_ganancia || 0), 0);
    const estimadoCerrados  = cerrados.reduce((a, r) => a + (r.estimado_ganancia || 0), 0);
    const malosDecisiones   = cerrados.filter(r => r.es_mala_decision).length;

    return {
      n_total:           enRango.length,
      n_cerrados:        cerrados.length,
      ganancia_estimada: totalEstimado,
      ganancia_real:     totalReal,
      /* diferencia comparable: estimado vs real, solo de los cerrados */
      diferencia:        totalReal - estimadoCerrados,
      malas_decisiones:  malosDecisiones
    };
  } catch(err) {
    console.warn('[generarReporteSemanal]', err);
    return null;
  }
}
