/**
 * ELECTROMEL — services/whatsapp.vars.js
 * Arma las variables "ricas" para los mensajes de WhatsApp según el
 * tipo de documento (ING, OTT, OTE, PRE). Centraliza la lógica de qué
 * datos lleva cada mensaje, leyendo del trabajo y de la config.
 *
 * Devuelve un objeto de variables listo para buildWhatsAppMessage().
 */

import { getCfg } from '../core/db.js';
import { store } from '../core/store.js';
import { pesos } from '../core/utils.js';

/* ── Datos bancarios desde config (texto multilínea) ───── */
async function _datosBancarios() {
  const db = store.get('db');
  if (!db) return '';
  const [nombre, alias, cbu] = await Promise.all([
    getCfg(db, 'banco_nombre').catch(() => ''),
    getCfg(db, 'banco_alias').catch(() => ''),
    getCfg(db, 'banco_cbu').catch(() => '')
  ]);
  const partes = [];
  if (nombre) partes.push('🏦 ' + nombre);
  if (alias)  partes.push('Alias: ' + alias);
  if (cbu)    partes.push('CBU: ' + cbu);
  return partes.join('\n');
}

/* ── Variables para un ingreso (ING) ───────────────────── */
export async function varsIngreso(ing) {
  return {
    cliente:  ing.cliente_nombre || '',
    equipo:   [ing.equipo_tipo, ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ') || ing.equipo || '',
    numero:   ing.numero || '',
    guia:     ing.guia || ing.numero_guia || '',
    garantia: ing.es_garantia ? 'Sí (ingresa por garantía)' : ''
  };
}

/* ── Variables para OTT / OTE / PRE (texto rico) ────────── */
export async function varsOrden(orden) {
  const banco = await _datosBancarios();
  const total = parseFloat(orden.total || 0) || 0;
  const adelanto = parseFloat(orden.adelanto || 0) || 0;
  const contra = Math.max(0, total - adelanto);

  return {
    cliente:     orden.cliente_nombre || '',
    equipo:      [orden.equipo_tipo, orden.equipo_marca, orden.equipo_modelo].filter(Boolean).join(' ') || orden.equipo || '',
    numero:      orden.numero || '',
    diagnostico: orden.diagnostico || '',
    trabajo:     orden.trabajo || '',
    total:       total ? pesos(total) : '',
    adelanto:    adelanto ? pesos(adelanto) : '',
    contra_entrega: contra ? pesos(contra) : '',
    garantia:    orden.garantia ? (orden.garantia + ' días') : '',
    dias_entrega: orden.tiempo_estimado ? (orden.tiempo_estimado + ' días') : '',
    banco
  };
}

/* ── Variables mínimas (resto de estados) ──────────────── */
export function varsEstado(orden, estadoTexto) {
  return {
    cliente: orden.cliente_nombre || '',
    numero:  orden.numero || '',
    estado:  estadoTexto || orden.estado || ''
  };
}
