/**
 * ELECTROMEL — modules/panel/panel.store.js
 * Estado del panel, constantes, normalización de registros.
 * Sin efectos de UI — importable desde cualquier sub-módulo.
 */

import { store }       from '../../core/store.js';
import { dbGetAll }    from '../../core/db.js';
import { ESTADOS_FINALES } from '../../core/utils.js';

/* ═══════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════ */
export const TIPO_ICONOS = { ING: '📥', OTT: '🔧', OTE: '🚐', PRE: '📝' };
export const TIPO_LABELS = { ING: 'Ingreso', OTT: 'OT Taller', OTE: 'OT Exterior', PRE: 'Presupuesto' };

export const ESTADOS_POR_TIPO = {
  ING: ['ingresado','retirado_sin_reparar','en_diagnostico','rechazada_entregada'],
  OTT: ['ingresado','retirado_sin_reparar','en_diagnostico','presupuesto_enviado',
        'aprobado','espera_componentes','en_reparacion','reparado',
        'listo_para_retirar','prep_envio','enviado','entregado',
        'rechazada_entregada','pendiente_pago','pendiente_saldo','pagado'],
  OTE: ['pendiente_pago','pendiente_saldo','pagado'],
  PRE: ['pendiente','aprobado','rechazado']
};

export const ESTADOS_RECORDATORIO = new Set([
  'listo_para_retirar','prep_envio','rechazada_entregada','rechazado'
]);

/* ── Secuencia SIMPLE para el botón "siguiente estado" en las tarjetas ──
   El camino normal del trabajo, sin los estados intermedios poco usados.
   Permite avanzar un trabajo en 1 toque desde el Panel. */
export const FLUJO_SIMPLE = {
  OTT: ['ingresado','en_diagnostico','presupuesto_enviado','aprobado','en_reparacion','reparado','listo_para_retirar','entregado'],
  OTE: ['pendiente_pago','pendiente_saldo','pagado'],
  ING: ['ingresado','en_diagnostico'],
  PRE: ['pendiente','aprobado']
};

/* Devuelve el siguiente estado del flujo simple, o null si ya está al final
   o si el estado actual no está en el camino normal (mejor no forzar). */
export function siguienteEstadoSimple(tipo, estadoActual) {
  const flujo = FLUJO_SIMPLE[tipo];
  if (!flujo) return null;
  const i = flujo.indexOf(estadoActual);
  if (i === -1 || i >= flujo.length - 1) return null;
  return flujo[i + 1];
}

export const UMBRALES_WA = [15, 30, 60, 120];

/* ═══════════════════════════════════════════════════════════
   ESTADO DEL DETALLE (compartido entre sub-módulos)
   ═══════════════════════════════════════════════════════════ */

/** @type {{ numero:string|null, tipo:string|null, registro:Object|null, archivado:boolean, cambios:Object }} */
export const detalleActual = {
  numero:   null,
  tipo:     null,
  registro: null,
  archivado: false,
  cambios:  {}
};

export function resetDetalle() {
  detalleActual.numero   = null;
  detalleActual.tipo     = null;
  detalleActual.registro = null;
  detalleActual.archivado = false;
  detalleActual.cambios  = {};
}

/* ═══════════════════════════════════════════════════════════
   GETTERS DE ESTADO DEL PANEL
   ═══════════════════════════════════════════════════════════ */
export const getFiltroActivo    = () => store.get('panel.filtroActivo')    || 'TODOS';
export const getSearchQuery     = () => (document.getElementById('panel-search')?.value || '').trim().toLowerCase();
export const isArchivadosVisible = () => !!store.get('panel.archivadosVisible');

export function setFiltroActivo(filtro) { store.set('panel.filtroActivo', filtro); }
export function setArchivadosVisible(v) { store.set('panel.archivadosVisible', v); }

/* ═══════════════════════════════════════════════════════════
   CARGAR Y NORMALIZAR TODOS LOS REGISTROS
   ═══════════════════════════════════════════════════════════ */

/**
 * Lee todas las stores y devuelve un array normalizado de registros.
 * @returns {Promise<NormalizedRecord[]>}
 */
export async function cargarTodos() {
  const db = store.get('db');
  const [ingresos, ordenes, exteriors, presupuestos] = await Promise.all([
    dbGetAll(db, 'ingresos'),
    dbGetAll(db, 'ordenes'),
    dbGetAll(db, 'exteriors'),
    dbGetAll(db, 'presupuestos')
  ]);

  const registros = [];

  ingresos.forEach(r => registros.push({
    numero: r.numero, tipo: 'ING',
    cliente_nombre: r.cliente_nombre || '—',
    equipo_tipo:    r.equipo_tipo    || '',
    equipo_marca:   r.equipo_marca   || '',
    equipo_modelo:  r.equipo_modelo  || '',
    falla:          r.equipo_falla   || '',
    estado:         r.estado         || 'ingresado',
    fecha: r.fecha, creado_at: r.creado_at || r.fecha,
    actualizado_at: r.actualizado_at,
    total: 0, raw: r
  }));

  ordenes.forEach(r => registros.push({
    numero: r.numero, tipo: 'OTT',
    cliente_nombre: r.cliente_nombre || '—',
    equipo_tipo:    r.equipo_tipo    || '',
    equipo_marca:   r.equipo_marca   || '',
    equipo_modelo:  r.equipo_modelo  || '',
    falla:          r.equipo_falla   || '',
    estado:         r.estado         || 'ingresado',
    fecha: r.fecha, creado_at: r.creado_at || r.fecha,
    actualizado_at: r.actualizado_at,
    total: parseFloat(r.total) || 0, raw: r
  }));

  exteriors.forEach(r => {
    if (r.es_turno) return;
    registros.push({
      numero: r.numero, tipo: 'OTE',
      cliente_nombre: r.cliente_nombre   || '—',
      equipo_tipo:    r.tipo_servicio    || '',
      equipo_marca: '', equipo_modelo: '', falla: '',
      estado:         r.estado           || 'pendiente_pago',
      fecha: r.fecha, creado_at: r.creado_at || r.fecha,
      actualizado_at: r.actualizado_at,
      total: parseFloat(r.total) || 0, raw: r
    });
  });

  presupuestos.forEach(r => {
    const estadoFinal = (r.archivado && !ESTADOS_FINALES.has(r.estado || ''))
      ? 'archivado_por_ote'
      : (r.estado || 'pendiente');
    registros.push({
      numero: r.numero, tipo: 'PRE',
      cliente_nombre: r.cliente_nombre  || '—',
      equipo_tipo:    r.tipo_servicio   || '',
      equipo_marca:  '',
      equipo_modelo:  r.equipo_modelo   || '',
      falla:          r.problema        || '',
      estado: estadoFinal,
      fecha: r.fecha, creado_at: r.creado_at || r.fecha,
      actualizado_at: r.actualizado_at,
      total: parseFloat(r.total) || 0, raw: r
    });
  });

  return registros;
}

/**
 * Filtra registros por tipo activo y búsqueda textual.
 * @param {Array} registros
 * @returns {Array}
 */
export const getAnioActivo = () => store.get('panel.anioActivo') || 'TODOS';
export const setAnioActivo = (a) => store.set('panel.anioActivo', a);

export function filtrar(registros) {
  const search = getSearchQuery();
  const filtro = getFiltroActivo();
  const anio   = getAnioActivo();
  return registros.filter(r => {
    if (filtro !== 'TODOS' && r.tipo !== filtro) return false;
    if (anio !== 'TODOS') {
      const ra = r.anio || parseInt(String(r.creado_at || r.fecha || '').slice(0, 4)) || null;
      if (String(ra) !== String(anio)) return false;
    }
    if (!search) return true;
    return [r.numero, r.cliente_nombre, r.equipo_tipo, r.equipo_marca, r.equipo_modelo, r.falla]
      .join(' ').toLowerCase().includes(search);
  });
}

/**
 * Ordena registros: semáforo rojo primero, luego por antigüedad.
 */
export function ordenarPorSemaforo(registros) {
  const ord = { rojo: 0, amarillo: 1, verde: 2, gris: 3 };
  return registros.slice().sort((a, b) => {
    const o = (ord[a._color] ?? 4) - (ord[b._color] ?? 4);
    return o !== 0 ? o : (b._horas || 0) - (a._horas || 0);
  });
}
