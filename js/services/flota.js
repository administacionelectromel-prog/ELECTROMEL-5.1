/**
 * ELECTROMEL — services/flota.js
 * Flota de máquinas de un cliente (gimnasios, obras con varias máquinas).
 *
 * La flota vive DENTRO del cliente (store 'clientes'), en el array `maquinas`.
 * Cada máquina:
 * {
 *   id,            // id único interno (timestamp)
 *   marca, modelo,
 *   numero,        // número/identificación interna (ej: GO-01)
 *   estado,        // 'activa' | 'baja'
 *   fecha_baja,    // ISO, si fue dada de baja
 *   creada
 * }
 *
 * Las máquinas dadas de baja se conservan en el array (para historial) pero
 * con estado 'baja', y NO aparecen en la lista activa.
 */

import { dbGet, dbPut, dbGetAll, logEvent } from '../core/db.js';
import { store } from '../core/store.js';

/* ── Buscar un cliente por id o por nombre ─────────────── */
async function _getCliente(clienteId, nombre) {
  const db = store.get('db');
  if (!db) return null;
  if (clienteId != null) {
    const c = await dbGet(db, 'clientes', clienteId).catch(() => null);
    if (c) return c;
  }
  if (nombre) {
    const todos = await dbGetAll(db, 'clientes', false).catch(() => []);
    const n = String(nombre).trim().toLowerCase();
    return todos.find(c => (c.nombre_lower || (c.nombre || '').toLowerCase()) === n) || null;
  }
  return null;
}

/* ── Listar máquinas activas de un cliente ─────────────── */
export async function listarMaquinas(clienteId, nombre, incluirBajas = false) {
  const c = await _getCliente(clienteId, nombre);
  if (!c || !Array.isArray(c.maquinas)) return [];
  return incluirBajas ? c.maquinas : c.maquinas.filter(m => m.estado !== 'baja');
}

/* ── Guardar la flota completa de un cliente ───────────── */
export async function guardarFlota(clienteId, nombre, maquinas) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  const c = await _getCliente(clienteId, nombre);
  if (!c) throw new Error('Cliente no encontrado. Guardá primero el cliente.');
  c.maquinas = maquinas || [];
  await dbPut(db, 'clientes', c);
  await logEvent(db, { type: 'FLOTA_GUARDADA', message: `Flota de ${c.nombre}: ${c.maquinas.filter(m=>m.estado!=='baja').length} máq.` }).catch(()=>{});
  return c.maquinas;
}

/* ── Agregar una máquina ───────────────────────────────── */
export async function agregarMaquina(clienteId, nombre, maquina) {
  const activas = await listarMaquinas(clienteId, nombre, true);
  const nueva = {
    id:     Date.now() + '-' + Math.floor(Math.random() * 1000),
    marca:  (maquina.marca || '').trim(),
    modelo: (maquina.modelo || '').trim(),
    numero: (maquina.numero || '').trim(),
    estado: 'activa',
    creada: new Date().toISOString()
  };
  activas.push(nueva);
  await guardarFlota(clienteId, nombre, activas);
  return nueva;
}

/* ── Dar de baja una máquina (sale de la lista activa) ─── */
export async function darDeBajaMaquina(clienteId, nombre, maquinaId) {
  const todas = await listarMaquinas(clienteId, nombre, true);
  const m = todas.find(x => x.id === maquinaId);
  if (m) {
    m.estado = 'baja';
    m.fecha_baja = new Date().toISOString();
    await guardarFlota(clienteId, nombre, todas);
  }
  return todas.filter(x => x.estado !== 'baja');
}

/* ── Eliminar una máquina del todo (antes de guardar) ──── */
export async function eliminarMaquina(clienteId, nombre, maquinaId) {
  const todas = await listarMaquinas(clienteId, nombre, true);
  const filtradas = todas.filter(x => x.id !== maquinaId);
  await guardarFlota(clienteId, nombre, filtradas);
  return filtradas.filter(x => x.estado !== 'baja');
}

/* ── Editar una máquina (marca/modelo/número) ──────────── */
export async function editarMaquina(clienteId, nombre, maquinaId, datos) {
  const todas = await listarMaquinas(clienteId, nombre, true);
  const m = todas.find(x => x.id === maquinaId);
  if (m) {
    if (datos.marca  != null) m.marca  = String(datos.marca).trim();
    if (datos.modelo != null) m.modelo = String(datos.modelo).trim();
    if (datos.numero != null) m.numero = String(datos.numero).trim();
    await guardarFlota(clienteId, nombre, todas);
  }
  return todas.filter(x => x.estado !== 'baja');
}

/* ── Historial de checklists del cliente ───────────────────
   Cada constancia de mantenimiento queda registrada en el
   cliente (array `checklists`), para ver visitas anteriores. */
export async function guardarChecklistHistorial(clienteId, nombre, registro) {
  const db = store.get('db');
  if (!db) return;
  const c = await _getCliente(clienteId, nombre);
  if (!c) return;
  c.checklists = c.checklists || [];
  c.checklists.unshift({
    fecha: new Date().toISOString(),
    ...registro
  });
  /* Conservar solo los últimos 50 */
  if (c.checklists.length > 50) c.checklists = c.checklists.slice(0, 50);
  await dbPut(db, 'clientes', c);
}

export async function listarChecklistsHistorial(clienteId, nombre) {
  const c = await _getCliente(clienteId, nombre);
  return (c && Array.isArray(c.checklists)) ? c.checklists : [];
}

/* ── ¿El cliente tiene flota cargada? ──────────────────── */
export async function tieneFlota(clienteId, nombre) {
  const activas = await listarMaquinas(clienteId, nombre, false);
  return activas.length > 0;
}
