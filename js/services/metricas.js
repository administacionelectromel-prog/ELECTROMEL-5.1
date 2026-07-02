/**
 * ELECTROMEL — services/metricas.js
 * Métricas del negocio: equipos más reparados, marcas frecuentes,
 * clientes que más gastan, tiempo promedio de reparación.
 */

import { dbGetAll } from '../core/db.js';
import { store } from '../core/store.js';
import { ESTADOS_REPARADO } from '../core/estados.js';

export async function calcularMetricas() {
  const db = store.get('db');
  if (!db) return null;

  const [ingresos, ordenes] = await Promise.all([
    dbGetAll(db, 'ingresos', false).catch(() => []),
    dbGetAll(db, 'ordenes', false).catch(() => [])
  ]);

  /* Tipos de equipo más frecuentes (de los ingresos) */
  const tipos = {};
  const marcas = {};
  for (const i of ingresos) {
    const tipo = (i.equipo_tipo || '').trim();
    if (tipo) tipos[tipo] = (tipos[tipo] || 0) + 1;
    const marca = (i.equipo_marca || '').trim();
    if (marca) marcas[marca] = (marcas[marca] || 0) + 1;
  }

  /* Clientes que más gastan (suma de totales de órdenes) */
  const gastoCliente = {};
  let sumaTiempos = 0, countTiempos = 0;
  for (const o of ordenes) {
    const cli = (o.cliente_nombre || '').trim();
    const total = parseFloat(o.total || 0) || 0;
    if (cli && total > 0) gastoCliente[cli] = (gastoCliente[cli] || 0) + total;

    /* Tiempo de reparación: de creado_at a fecha_entrega */
    if (o.fecha_entrega && (o.creado_at || o.fecha)) {
      const ini = new Date((o.creado_at || o.fecha));
      const fin = new Date(o.fecha_entrega);
      const dias = (fin - ini) / 86400000;
      if (dias >= 0 && dias < 365) { sumaTiempos += dias; countTiempos++; }
    }
  }

  const top = (obj, n = 5) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([nombre, valor]) => ({ nombre, valor }));

  return {
    totalEquipos: ingresos.length,
    totalOrdenes: ordenes.length,
    tiposTop: top(tipos),
    marcasTop: top(marcas),
    clientesTop: top(gastoCliente),
    tiempoPromedio: countTiempos ? Math.round(sumaTiempos / countTiempos) : null
  };
}
