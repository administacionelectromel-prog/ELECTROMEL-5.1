/**
 * ELECTROMEL — services/por.cobrar.js
 * Calcula el dinero "por cobrar": de los trabajos aprobados / en proceso /
 * entregados sin cobrar, cuánto falta entrar descontando el adelanto.
 *
 * Saldo de un trabajo = total - adelanto (lo ya pagado).
 */

import { dbGetAll } from '../core/db.js';
import { store } from '../core/store.js';

/* Estados que YA cerraron el cobro o no corresponden a un saldo pendiente */
const ESTADOS_EXCLUIDOS = [
  'pagado',                 // ya cobrado completo
  'rechazada_entregada',    // rechazado y devuelto
  'rechazado',
  'retirado_sin_reparar',   // se lo llevó sin reparar
  'ingresado',              // todavía no es trabajo confirmado
  'en_diagnostico',
  'presupuesto_enviado'     // esperando aprobación, no confirmado
];

export async function calcularPorCobrar() {
  const db = store.get('db');
  if (!db) return { total: 0, items: [] };

  const [ordenes, exteriors] = await Promise.all([
    dbGetAll(db, 'ordenes', false).catch(() => []),
    dbGetAll(db, 'exteriors', false).catch(() => [])
  ]);

  const trabajos = [...ordenes, ...exteriors].filter(t => !t.es_turno);
  const items = [];
  let total = 0;

  for (const t of trabajos) {
    const estado = String(t.estado || '').toLowerCase();
    if (ESTADOS_EXCLUIDOS.includes(estado)) continue;

    const totalTrabajo = parseFloat(t.total || 0) || 0;
    if (totalTrabajo <= 0) continue;   // sin monto definido aún

    const adelanto = parseFloat(t.adelanto || 0) || 0;
    const saldo = Math.max(0, totalTrabajo - adelanto);
    if (saldo <= 0) continue;          // ya está todo pagado

    items.push({
      numero:   t.numero,
      tipo:     t.tipo || (t.numero || '').split('-')[0],
      cliente:  t.cliente_nombre || '—',
      zona:     t.zona || t.cliente_ciudad || '',
      estado:   t.estado || '',
      total:    totalTrabajo,
      adelanto,
      saldo
    });
    total += saldo;
  }

  /* Ordenar por saldo descendente (los más grandes primero) */
  items.sort((a, b) => b.saldo - a.saldo);

  return { total, items, cantidad: items.length };
}
