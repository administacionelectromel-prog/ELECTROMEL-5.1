/**
 * ELECTROMEL — services/garantia.js
 * Servicio de garantías post-venta.
 *
 * Responsabilidades:
 *   - Calcular fecha_fin_garantia al entregar una OTT
 *   - Validar si una OTT está dentro del período de garantía
 *   - Vincular un ING de reingreso con la OTT original
 *   - Registrar reingresos en la OTT original
 *   - Convertir una OTT de garantía en OTT normal (con cobro completo)
 */

import { store }             from '../core/store.js';
import { dbGet, dbPut, logEvent } from '../core/db.js';
import { showToast }         from '../core/ui.js';
import { ESTADOS_ENTREGADO } from '../core/estados.js';
import { fmtFechaCorta }     from '../core/utils.js';

/* ═══════════════════════════════════════════════════════════
   CALCULAR FECHA FIN DE GARANTÍA
   ═══════════════════════════════════════════════════════════ */

/**
 * Parsea el campo `garantia` de una OTT y devuelve los días.
 * Acepta: "30 días", "90", "3 meses", "1 año", "sin garantia"
 * @param {string|number} garantia
 * @returns {number} días (0 si no aplica)
 */
export function parsearDiasGarantia(garantia) {
  if (!garantia) return 0;
  const s = String(garantia).toLowerCase().trim();
  if (s.includes('sin') || s.includes('no')) return 0;

  /* Solo número */
  const soloNum = parseFloat(s);
  if (!isNaN(soloNum) && soloNum > 0) return Math.round(soloNum);

  /* "N días" o "N dias" */
  const mDias = s.match(/(\d+)\s*d[ií]as?/);
  if (mDias) return parseInt(mDias[1]);

  /* "N meses" */
  const mMeses = s.match(/(\d+)\s*mes(es)?/);
  if (mMeses) return parseInt(mMeses[1]) * 30;

  /* "N año/años" */
  const mAnio = s.match(/(\d+)\s*a[ñn]o/);
  if (mAnio) return parseInt(mAnio[1]) * 365;

  return 0;
}

/**
 * Calcula la fecha fin de garantía.
 * @param {string} fechaEntrega  ISO "YYYY-MM-DD"
 * @param {string|number} garantia  ej. "90 días"
 * @returns {string|null} ISO "YYYY-MM-DD" o null si no aplica
 */
export function calcularFechaFinGarantia(fechaEntrega, garantia) {
  const dias = parsearDiasGarantia(garantia);
  if (!dias || !fechaEntrega) return null;
  const d = new Date(fechaEntrega + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════
   GUARDAR FECHA DE ENTREGA EN OTT
   ═══════════════════════════════════════════════════════════ */

/**
 * Registra la fecha de entrega y calcula fecha_fin_garantia en la OTT.
 * Llamar cuando el estado cambia a 'entregado' o 'pagado'.
 * @param {Object} db
 * @param {string} numOTT
 * @param {string} [fechaEntrega] ISO date — default: hoy
 */
export async function registrarEntrega(db, numOTT, fechaEntrega) {
  if (!db || !numOTT) return;
  try {
    const ott = await dbGet(db, 'ordenes', numOTT);
    if (!ott) return;
    if (ott.fecha_entrega) return; /* idempotente */

    const hoy = fechaEntrega || new Date().toISOString().slice(0, 10);
    ott.fecha_entrega      = hoy;
    ott.fecha_fin_garantia = calcularFechaFinGarantia(hoy, ott.garantia);

    await dbPut(db, 'ordenes', ott);
    await logEvent(db, {
      type:    'OTT_ENTREGADA',
      message: `${numOTT} entregada. Garantía hasta: ${ott.fecha_fin_garantia || 'sin garantía'}`,
      ref:     numOTT,
      data:    { fecha_entrega: hoy, fecha_fin_garantia: ott.fecha_fin_garantia }
    });
  } catch(e) {
    console.warn('[registrarEntrega]', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   VALIDAR GARANTÍA VIGENTE
   ═══════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} ResultadoValidacionGarantia
 * @property {boolean} valida
 * @property {boolean} entregada       - si la OTT fue entregada
 * @property {string}  [fecha_entrega]
 * @property {string}  [fecha_fin]
 * @property {number}  [dias_restantes]
 * @property {number}  [dias_vencida]
 * @property {string}  mensaje
 * @property {string}  cliente_nombre
 * @property {string}  equipo
 * @property {string}  diagnostico_original
 * @property {string}  ott_numero
 */

/**
 * Valida si una OTT tiene garantía vigente a la fecha de hoy.
 * @param {string} numOTT
 * @returns {Promise<ResultadoValidacionGarantia>}
 */
export async function validarGarantia(numOTT) {
  const db  = store.get('db');
  const err = (msg) => ({
    valida: false, entregada: false, mensaje: msg,
    cliente_nombre: '', equipo: '', diagnostico_original: '', ott_numero: numOTT
  });

  if (!db)     return err('Base de datos no disponible');
  if (!numOTT) return err('Número de OTT no especificado');

  const ott = await dbGet(db, 'ordenes', numOTT).catch(() => null);
  if (!ott)  return err(`OTT ${numOTT} no encontrada`);

  if (!ESTADOS_ENTREGADO.includes(ott.estado)) {
    return {
      ...err(`OTT ${numOTT} aún no fue entregada (estado: ${ott.estado})`),
      cliente_nombre: ott.cliente_nombre || '',
      equipo: [ott.equipo_tipo, ott.equipo_marca, ott.equipo_modelo].filter(Boolean).join(' '),
      diagnostico_original: ott.diagnostico || '',
      ott_numero: numOTT
    };
  }

  const equipo = [ott.equipo_tipo, ott.equipo_marca, ott.equipo_modelo].filter(Boolean).join(' ');
  const base   = {
    valida:               false,
    entregada:            true,
    fecha_entrega:        ott.fecha_entrega || null,
    fecha_fin:            ott.fecha_fin_garantia || null,
    cliente_nombre:       ott.cliente_nombre || '',
    equipo,
    diagnostico_original: ott.diagnostico   || '',
    ott_numero:           numOTT
  };

  /* Sin fecha de entrega registrada */
  if (!ott.fecha_entrega) {
    return { ...base, mensaje: `OTT entregada pero sin fecha de entrega registrada. Igresá la fecha manualmente.` };
  }

  const dias = parsearDiasGarantia(ott.garantia);
  if (!dias) {
    return { ...base, mensaje: `${numOTT} no tiene garantía registrada.` };
  }

  const hoy     = new Date(); hoy.setHours(0, 0, 0, 0);
  const finGar  = new Date((ott.fecha_fin_garantia || calcularFechaFinGarantia(ott.fecha_entrega, ott.garantia)) + 'T12:00:00');
  const diffMs  = finGar - hoy;
  const diffDias = Math.ceil(diffMs / 86400000);

  if (diffDias >= 0) {
    return {
      ...base,
      valida:         true,
      dias_restantes: diffDias,
      mensaje:        `✅ Garantía VIGENTE — ${diffDias} día(s) restante(s) (vence ${fmtFechaCorta(ott.fecha_fin_garantia || '')})`
    };
  } else {
    return {
      ...base,
      valida:       false,
      dias_vencida: Math.abs(diffDias),
      mensaje:      `❌ Garantía VENCIDA hace ${Math.abs(diffDias)} día(s) (venció ${fmtFechaCorta(ott.fecha_fin_garantia || '')})`
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   VINCULAR REINGRESO
   ═══════════════════════════════════════════════════════════ */

/**
 * Registra un ING de reingreso por garantía en la OTT original.
 * Agrega el número al array `reingresos` de la OTT origen.
 * @param {string} numOTT   - OTT original
 * @param {string} numING   - ING del reingreso
 */
export async function vincularReingreso(numOTT, numING) {
  const db = store.get('db');
  if (!db || !numOTT || !numING) return;
  try {
    const ott = await dbGet(db, 'ordenes', numOTT);
    if (!ott) return;
    if (!Array.isArray(ott.reingresos)) ott.reingresos = [];
    if (!ott.reingresos.includes(numING)) {
      ott.reingresos.push(numING);
      await dbPut(db, 'ordenes', ott);
      await logEvent(db, {
        type:    'GARANTIA_REINGRESO',
        message: `Reingreso ${numING} vinculado a garantía de ${numOTT}`,
        ref:     numOTT,
        data:    { ing: numING, ott: numOTT }
      });
    }
  } catch(e) {
    console.warn('[vincularReingreso]', e);
  }
}

/**
 * Vincula también la OTT de garantía generada a la OTT original.
 * @param {string} numOTTOrigen    - OTT original
 * @param {string} numOTTGarantia  - OTT nueva de garantía
 */
export async function vincularOTTGarantia(numOTTOrigen, numOTTGarantia) {
  const db = store.get('db');
  if (!db || !numOTTOrigen || !numOTTGarantia) return;
  try {
    const ott = await dbGet(db, 'ordenes', numOTTOrigen);
    if (!ott) return;
    if (!Array.isArray(ott.reingresos)) ott.reingresos = [];
    if (!ott.reingresos.includes(numOTTGarantia)) {
      ott.reingresos.push(numOTTGarantia);
      await dbPut(db, 'ordenes', ott);
    }
  } catch(e) {
    console.warn('[vincularOTTGarantia]', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   CONVERTIR GARANTÍA A OTT NORMAL
   ═══════════════════════════════════════════════════════════ */

/**
 * Convierte una OTT de garantía en OTT normal (cobro completo).
 * Limpia los flags de garantía y marca la conversión.
 * @param {string} numOTT
 * @param {number} nuevoTotal
 * @returns {Promise<boolean>}
 */
export async function convertirGarantiaANormal(numOTT, nuevoTotal) {
  const db = store.get('db');
  if (!db || !numOTT) return false;
  try {
    const ott = await dbGet(db, 'ordenes', numOTT);
    if (!ott || !ott.es_garantia) {
      showToast('No es una OTT de garantía', 'warn');
      return false;
    }

    ott.es_garantia_convertida   = true;   /* historial */
    ott.ott_garantia_origen_prev = ott.ott_garantia_origen;
    ott.es_garantia              = false;
    ott.total                    = nuevoTotal || ott.total;
    ott.convertida_at            = new Date().toISOString();

    await dbPut(db, 'ordenes', ott);
    await logEvent(db, {
      type:    'GARANTIA_CONVERTIDA',
      message: `${numOTT} convertida de garantía a OTT normal. Total: ${nuevoTotal}`,
      ref:     numOTT
    });
    showToast(`✓ ${numOTT} convertida a OTT normal`, 'success');
    return true;
  } catch(e) {
    console.warn('[convertirGarantiaANormal]', e);
    showToast('Error al convertir: ' + e.message, 'error');
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   RESUMEN DE REINGRESOS DE UNA OTT
   ═══════════════════════════════════════════════════════════ */

/**
 * Carga los datos completos de todos los reingresos de una OTT.
 * @param {string} numOTT
 * @returns {Promise<Array>}
 */
export async function cargarReingresos(numOTT) {
  const db = store.get('db');
  if (!db || !numOTT) return [];
  try {
    const ott = await dbGet(db, 'ordenes', numOTT);
    if (!ott?.reingresos?.length) return [];

    const resultados = await Promise.all(
      ott.reingresos.map(async num => {
        if (num.startsWith('ING-')) {
          const ing = await dbGet(db, 'ingresos', num).catch(() => null);
          return ing ? { tipo: 'ING', numero: num, fecha: ing.fecha, cliente: ing.cliente_nombre, data: ing } : null;
        }
        if (num.startsWith('OTT-')) {
          const o = await dbGet(db, 'ordenes', num).catch(() => null);
          return o ? { tipo: 'OTT', numero: num, fecha: o.fecha, cliente: o.cliente_nombre,
                       es_garantia: o.es_garantia, total: o.total, estado: o.estado, data: o } : null;
        }
        return null;
      })
    );
    return resultados.filter(Boolean);
  } catch(e) {
    console.warn('[cargarReingresos]', e);
    return [];
  }
}

/* ── Garantías por vencer (para el aviso al abrir) ──────────
   Devuelve las OTT cuya garantía vence en los próximos `dias` días. */
export async function garantiasPorVencer(dias = 15) {
  const { dbGetAll } = await import('../core/db.js');
  const { store } = await import('../core/store.js');
  const db = store.get('db');
  if (!db) return [];
  const ordenes = await dbGetAll(db, 'ordenes', false).catch(() => []);
  const hoy = new Date();
  const limite = new Date(hoy.getTime() + dias * 86400000);
  const resultado = [];
  for (const o of ordenes) {
    if (!o.fecha_fin_garantia) continue;
    const fin = new Date(o.fecha_fin_garantia + 'T12:00:00');
    if (fin >= hoy && fin <= limite) {
      const diasRest = Math.ceil((fin - hoy) / 86400000);
      resultado.push({ numero: o.numero, cliente: o.cliente_nombre, fin: o.fecha_fin_garantia, dias: diasRest });
    }
  }
  return resultado.sort((a, b) => a.dias - b.dias);
}
