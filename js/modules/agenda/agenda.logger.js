/**
 * ELECTROMEL — agenda/agenda.logger.js
 * Logger condicional para el módulo agenda.
 * En producción todas las llamadas son no-ops.
 * Activar: window.ELECTROMEL_DEV = true (antes de cargar la app)
 */

import { DEV_MODE } from './agenda.constants.js';

const PREFIX = '[Agenda]';

const _noop = () => {};

/**
 * Logger del módulo agenda.
 * Todos los métodos son seguros de llamar en producción — no lanzan errores.
 */
export const AgendaLogger = {

  /** Activo en DEV_MODE */
  get enabled() { return DEV_MODE || window.ELECTROMEL_DEV === true; },

  /**
   * Log de debug — solo en DEV_MODE
   * @param {string} msg
   * @param {...*} args
   */
  debug(msg, ...args) {
    if (!this.enabled) return;
    console.debug(`${PREFIX} ${msg}`, ...args);
  },

  /**
   * Log de info — solo en DEV_MODE
   * @param {string} msg
   * @param {...*} args
   */
  info(msg, ...args) {
    if (!this.enabled) return;
    console.info(`${PREFIX} ${msg}`, ...args);
  },

  /**
   * Warn — siempre activo (problemas que no rompen la app)
   * @param {string} msg
   * @param {...*} args
   */
  warn(msg, ...args) {
    console.warn(`${PREFIX} ⚠️ ${msg}`, ...args);
  },

  /**
   * Error — siempre activo
   * @param {string} msg
   * @param {...*} args
   */
  error(msg, ...args) {
    console.error(`${PREFIX} ❌ ${msg}`, ...args);
  },

  /**
   * Mide el tiempo de una función async en DEV_MODE
   * @template T
   * @param {string} label
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async time(label, fn) {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    try {
      const result = await fn();
      const ms = (performance.now() - t0).toFixed(1);
      console.debug(`${PREFIX} ⏱ ${label}: ${ms}ms`);
      return result;
    } catch(e) {
      const ms = (performance.now() - t0).toFixed(1);
      console.error(`${PREFIX} ⏱ ${label} FAILED after ${ms}ms`, e);
      throw e;
    }
  },

  /**
   * Agrupa logs relacionados en DEV_MODE
   * @param {string} label
   * @param {Function} fn
   */
  group(label, fn) {
    if (!this.enabled) { fn(); return; }
    console.group(`${PREFIX} ${label}`);
    try { fn(); } finally { console.groupEnd(); }
  },

  /**
   * Tabla de datos en DEV_MODE
   * @param {string} label
   * @param {Object[]} data
   */
  table(label, data) {
    if (!this.enabled) return;
    console.debug(`${PREFIX} ${label}:`);
    console.table(data);
  }
};
