/**
 * ELECTROMEL — services/reporte.periodo.js
 * Recolecta los datos de un período (entre dos fechas) para el reporte
 * contable/operativo: equipos, plata, zonas y abonos.
 */

import { dbGetAll } from '../core/db.js';
import { store } from '../core/store.js';

/* Devuelve true si la fecha (ISO o YYYY-MM-DD) está dentro del rango */
function enRango(fechaStr, desde, hasta) {
  if (!fechaStr) return false;
  const f = String(fechaStr).slice(0, 10);
  return f >= desde && f <= hasta;
}

/* Estados que consideramos "reparado/terminado" */
const ESTADOS_REPARADO = ['entregado', 'terminado', 'reparado', 'finalizado', 'cobrado', 'completado'];

export async function datosReportePeriodo(desde, hasta) {
  const db = store.get('db');
  if (!db) return null;

  const [ingresos, ordenes, exteriors, movimientos, abonos] = await Promise.all([
    dbGetAll(db, 'ingresos', false).catch(() => []),
    dbGetAll(db, 'ordenes', false).catch(() => []),
    dbGetAll(db, 'exteriors', false).catch(() => []),
    dbGetAll(db, 'finance_movements', false).catch(() => []),
    dbGetAll(db, 'abonos', false).catch(() => [])
  ]);

  /* ── Equipos ──────────────────────────────────────────── */
  const fechaDe = (r) => (r.creado_at || r.fecha || '').slice(0, 10);
  const ingresosPeriodo = ingresos.filter(r => enRango(fechaDe(r), desde, hasta));
  const entraron = ingresosPeriodo.length;

  /* Reparados: órdenes en estado final dentro del período */
  const reparados = ordenes.filter(o =>
    enRango(fechaDe(o), desde, hasta) &&
    ESTADOS_REPARADO.includes(String(o.estado || '').toLowerCase())
  );

  /* ── Plata (movimientos de finanzas) ──────────────────── */
  const movsPeriodo = movimientos.filter(m => enRango(m.date, desde, hasta));
  let ingresosTotal = 0, egresosTotal = 0;
  const detalleIngresos = [], detalleEgresos = [];
  for (const m of movsPeriodo) {
    const monto = Math.abs(parseFloat(m.amount || 0) || 0);
    const tipo = String(m.type || '').toLowerCase();
    const concepto = m.description || m.client_name || m.related_order_id || m.category || '—';
    if (tipo === 'income') {
      ingresosTotal += monto;
      detalleIngresos.push({ fecha: (m.date || '').slice(0,10), concepto, monto });
    } else if (tipo === 'expense') {
      egresosTotal += monto;
      detalleEgresos.push({ fecha: (m.date || '').slice(0,10), concepto, monto });
    }
  }
  const ganancia = ingresosTotal - egresosTotal;

  /* ── Por zona ─────────────────────────────────────────── */
  const trabajos = [...ordenes, ...exteriors].filter(t => enRango(fechaDe(t), desde, hasta));
  const zonas = {};
  for (const t of trabajos) {
    const z = t.zona || t.cliente_ciudad || 'San Martín de los Andes';
    if (!zonas[z]) zonas[z] = { zona: z, cantidad: 0, ingresos: 0 };
    zonas[z].cantidad++;
    zonas[z].ingresos += parseFloat(t.total || 0) || 0;
  }
  const porZona = Object.values(zonas).sort((a, b) => b.ingresos - a.ingresos);

  /* ── Abonos ───────────────────────────────────────────── */
  let abonoCobrado = 0, abonoAdeudado = 0;
  const detalleAbonos = [];
  const { estadoDeCuenta } = await import('./abonos.js');
  for (const a of abonos) {
    if (a.estado !== 'activo') continue;
    /* Pagos registrados dentro del período */
    let cobradoEnPeriodo = 0;
    for (const [, pago] of Object.entries(a.pagos || {})) {
      if (enRango(pago.fecha, desde, hasta)) cobradoEnPeriodo += parseFloat(pago.monto || 0) || 0;
    }
    abonoCobrado += cobradoEnPeriodo;
    /* Deuda actual (a la fecha de hasta) */
    abonoAdeudado += estadoDeCuenta(a, new Date(hasta + 'T12:00:00')).deuda;
    detalleAbonos.push({ cliente: a.cliente_nombre, cuota: a.cuota, cobrado: cobradoEnPeriodo });
  }

  /* Lista detallada de trabajos del período */
  const listaTrabajos = trabajos.map(t => ({
    numero: t.numero,
    tipo: t.tipo || (t.numero || '').split('-')[0],
    cliente: t.cliente_nombre || '—',
    zona: t.zona || t.cliente_ciudad || '',
    fecha: fechaDe(t),
    total: parseFloat(t.total || 0) || 0
  })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  return {
    desde, hasta,
    equipos: { entraron, reparados: reparados.length },
    plata: { ingresos: ingresosTotal, egresos: egresosTotal, ganancia, detalleIngresos, detalleEgresos },
    porZona,
    abonos: { cobrado: abonoCobrado, adeudado: abonoAdeudado, detalle: detalleAbonos },
    listaTrabajos
  };
}
