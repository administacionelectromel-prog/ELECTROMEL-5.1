/**
 * ELECTROMEL — services/por.cobrar.js
 * Calcula el dinero "por cobrar": de los trabajos aprobados / en proceso /
 * entregados sin cobrar, cuánto falta entrar descontando el adelanto.
 *
 * Saldo de un trabajo = total - adelanto (lo ya pagado).
 */

import { dbGetAll } from '../core/db.js';
import { store } from '../core/store.js';
import { ESTADOS_SIN_SALDO } from '../core/estados.js';

/* Estados que NO suman al "por cobrar": centralizados en core/estados.js (ESTADOS_SIN_SALDO) */
const ESTADOS_EXCLUIDOS = ESTADOS_SIN_SALDO;

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

    /* Pagado REAL = SOLO la suma del historial de pagos (r.pagos[]).
       Igual que la ficha del trabajo ("Pagado real" y "Saldo").
       NO usar el campo 'adelanto' del formulario: es un valor previsto que
       NO necesariamente se cobró (causaba mostrar pagos que no existían). */
    const pagos = (t.r && Array.isArray(t.r.pagos)) ? t.r.pagos : [];
    const pagadoReal = pagos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);

    const saldo = Math.max(0, totalTrabajo - pagadoReal);
    if (saldo <= 0) continue;          // ya está todo pagado

    items.push({
      numero:   t.numero,
      tipo:     t.tipo || (t.numero || '').split('-')[0],
      cliente:  t.cliente_nombre || '—',
      cliente_telefono: t.cliente_telefono || '',
      equipo:   t.equipo_tipo || t.equipo || '',
      zona:     t.zona || t.cliente_ciudad || '',
      estado:   t.estado || '',
      total:    totalTrabajo,
      adelanto: pagadoReal,
      saldo
    });
    total += saldo;
  }

  /* Ordenar por saldo descendente (los más grandes primero) */
  items.sort((a, b) => b.saldo - a.saldo);

  /* Desglose por zona */
  const zonasMap = {};
  for (const it of items) {
    const z = it.zona || 'Sin zona';
    if (!zonasMap[z]) zonasMap[z] = { zona: z, total: 0, cantidad: 0 };
    zonasMap[z].total += it.saldo;
    zonasMap[z].cantidad++;
  }
  const porZona = Object.values(zonasMap).sort((a, b) => b.total - a.total);

  return { total, items, cantidad: items.length, porZona };
}
