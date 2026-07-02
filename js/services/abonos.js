/**
 * ELECTROMEL — services/abonos.js
 * Sistema de abono / suscripción de mantenimiento.
 *
 * Un abono = un cliente que paga una cuota fija periódica (use o no la visita).
 * Cada abono lleva su historial de pagos por período (ej: "2026-06" pagado).
 *
 * Estructura de un abono:
 * {
 *   id, cliente_nombre, cliente_telefono, equipo, zona,
 *   cuota,                // monto de la cuota
 *   periodicidad,         // 'mensual' | 'trimestral' | 'anual'
 *   incluye,              // texto: qué cubre el abono
 *   dia_cobro,            // día del mes sugerido para cobrar (1-31)
 *   desde,                // fecha de alta (ISO)
 *   estado,              // 'activo' | 'pausado' | 'baja'
 *   pagos: { '2026-06': {fecha, monto}, ... }   // períodos pagados
 *   notas
 * }
 */

import { dbGetAll, dbGet, dbPut, dbDelete, logEvent } from '../core/db.js';
import { store } from '../core/store.js';

const STORE = 'abonos';

/* Meses que abarca cada periodicidad */
const MESES_PERIODO = { mensual: 1, trimestral: 3, anual: 12 };

/* ── Clave de período (YYYY-MM) ────────────────────────── */
export function periodoActual(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/* ── Listar todos los abonos ───────────────────────────── */
export async function listarAbonos() {
  const db = store.get('db');
  if (!db) return [];
  try { return await dbGetAll(db, STORE, false); } catch (e) { return []; }
}

/* ── Guardar (alta o edición) ──────────────────────────── */
export async function guardarAbono(data) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');

  const rec = {
    cliente_nombre:   (data.cliente_nombre || '').trim(),
    cliente_cuit:     data.cliente_cuit || '',
    cliente_telefono: data.cliente_telefono || '',
    cliente_direccion: data.cliente_direccion || '',
    cliente_cp:       data.cliente_cp || '',
    cliente_ciudad:   data.cliente_ciudad || '',
    cliente_provincia: data.cliente_provincia || '',
    equipo:           data.equipo || '',
    zona:             data.zona || '',
    cuota:            parseFloat(data.cuota) || 0,
    periodicidad:     data.periodicidad || 'mensual',
    incluye:          data.incluye || '',
    dia_cobro:        parseInt(data.dia_cobro) || 1,
    desde:            data.desde || new Date().toISOString().slice(0, 10),
    estado:           data.estado || 'activo',
    pagos:            data.pagos || {},
    ultima_visita:    data.ultima_visita || null,
    notas:            data.notas || ''
  };
  if (data.id != null) rec.id = data.id;

  if (!rec.cliente_nombre) throw new Error('Falta el nombre del cliente');
  if (rec.cuota <= 0) throw new Error('La cuota debe ser mayor a 0');

  const id = await dbPut(db, STORE, rec);
  await logEvent(db, { type: 'ABONO_GUARDADO', message: 'Abono: ' + rec.cliente_nombre }).catch(()=>{});
  return id;
}

/* ── Registrar un pago de un período ───────────────────── */
export async function registrarPagoAbono(id, periodo, monto) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  const abono = await dbGet(db, STORE, id);
  if (!abono) throw new Error('Abono no encontrado');

  abono.pagos = abono.pagos || {};
  abono.pagos[periodo] = {
    fecha: new Date().toISOString(),
    monto: parseFloat(monto) || abono.cuota
  };
  await dbPut(db, STORE, abono);
  await logEvent(db, { type: 'ABONO_PAGO', message: `Pago abono ${abono.cliente_nombre} (${periodo})` }).catch(()=>{});
  return abono;
}

/* ── Eliminar abono ────────────────────────────────────── */
export async function borrarAbono(id) {
  const db = store.get('db');
  if (!db) return;
  await dbDelete(db, STORE, id);
  await logEvent(db, { type: 'ABONO_BORRADO', message: 'Abono eliminado #' + id }).catch(()=>{});
}

/* ── Estado de cuenta de un abono ──────────────────────────
   Calcula los períodos que debería haber pagado desde "desde"
   hasta hoy y cuáles faltan. */
export function estadoDeCuenta(abono, hoy = new Date()) {
  const pasoMeses = MESES_PERIODO[abono.periodicidad] || 1;
  const pagos = abono.pagos || {};
  const desde = new Date((abono.desde || hoy.toISOString().slice(0, 10)) + 'T12:00:00');

  /* Generar los períodos esperados desde el alta hasta hoy */
  const esperados = [];
  let cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
  const limite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  while (cursor <= limite) {
    esperados.push(periodoActual(cursor));
    cursor.setMonth(cursor.getMonth() + pasoMeses);
  }

  const adeudados = esperados.filter(p => !pagos[p]);
  const deuda = adeudados.length * (abono.cuota || 0);
  const periodoHoy = periodoActual(hoy);
  const pagadoEsteMes = !!pagos[periodoHoy];

  let estado = 'aldia';
  if (adeudados.length > 0) estado = 'debe';
  else if (!pagadoEsteMes && esperados.includes(periodoHoy)) estado = 'porvencer';

  return {
    esperados, adeudados,
    deuda,
    meses_debe: adeudados.length,
    estado,
    pagado_este_mes: pagadoEsteMes
  };
}

/* ── Resumen general (para los KPIs) ───────────────────── */
export function resumenAbonos(abonos, hoy = new Date()) {
  let totalMes = 0, adeudado = 0, activos = 0;
  for (const a of abonos) {
    if (a.estado !== 'activo') continue;
    activos++;
    totalMes += a.cuota || 0;
    adeudado += estadoDeCuenta(a, hoy).deuda;
  }
  return { activos, totalMes, adeudado };
}

/* ── Abonos que deben o están por vencer (para el aviso) ─── */
export async function abonosPorCobrar() {
  const abonos = await listarAbonos();
  const hoy = new Date();
  const resultado = [];
  for (const a of abonos) {
    if (a.estado !== 'activo') continue;
    const ec = estadoDeCuenta(a, hoy);
    if (ec.estado === 'debe' || ec.estado === 'porvencer') {
      resultado.push({ abono: a, ...ec });
    }
  }
  return resultado;
}

/* ── Control de visitas del abono ───────────────────────────
   Un abono incluye visitas periódicas. Guardamos la fecha de la
   última visita; la próxima se calcula según la periodicidad.
   Esto NO crea turnos solo: solo avisa cuándo toca. */

/* Meses entre visitas según periodicidad (mismo que la cuota) */
function _mesesVisita(abono) {
  return MESES_PERIODO[abono.periodicidad] || 1;
}

/* Marca que se hizo una visita hoy (o en la fecha dada) */
export async function registrarVisitaAbono(id, fecha) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  const abono = await dbGet(db, STORE, id);
  if (!abono) throw new Error('Abono no encontrado');
  abono.ultima_visita = fecha || new Date().toISOString().slice(0, 10);
  await dbPut(db, STORE, abono);
  return abono;
}

/* ¿Toca visita? Devuelve {toca, proxima} */
export function estadoVisita(abono, hoy = new Date()) {
  const meses = _mesesVisita(abono);
  const base = abono.ultima_visita || abono.desde;
  if (!base) return { toca: false, proxima: null };
  const proxima = new Date(base + 'T12:00:00');
  proxima.setMonth(proxima.getMonth() + meses);
  const toca = hoy >= proxima;
  return { toca, proxima: proxima.toISOString().slice(0, 10) };
}

/* Abonos a los que les toca visita (para el aviso) */
export async function abonosConVisitaPendiente() {
  const abonos = await listarAbonos();
  const hoy = new Date();
  return abonos
    .filter(a => a.estado === 'activo')
    .map(a => ({ abono: a, ...estadoVisita(a, hoy) }))
    .filter(x => x.toca);
}
