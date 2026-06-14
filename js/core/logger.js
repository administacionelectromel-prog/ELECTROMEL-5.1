/**
 * ELECTROMEL — core/logger.js
 * Logger unificado con niveles, prefijos y DEV_MODE.
 * Reemplaza AgendaLogger — compatible hacia atrás.
 *
 * Uso:
 *   import { createLogger } from './core/logger.js';
 *   const log = createLogger('Panel');
 *   log.debug('card rendered', { id });
 *   log.warn('no records found');
 *   log.time('render', async () => { ... });
 */

const IS_DEV = typeof window !== 'undefined' &&
  (window.ELECTROMEL_DEV === true || window.location?.hostname === 'localhost');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = IS_DEV ? 0 : 2; /* En prod: solo warn + error */

function _log(level, prefix, msg, ...args) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const tag = `[${prefix}]`;
  switch(level) {
    case 'debug': console.debug(tag, msg, ...args); break;
    case 'info':  console.info(tag, msg,  ...args); break;
    case 'warn':  console.warn(tag, '⚠️', msg, ...args); break;
    case 'error': console.error(tag, '❌', msg, ...args); break;
  }
}

/**
 * Crea un logger con prefijo de módulo.
 * @param {string} prefix - nombre del módulo (ej. 'Panel', 'Agenda', 'Media')
 * @returns {Logger}
 */
export function createLogger(prefix) {
  return {
    debug: (msg, ...args) => _log('debug', prefix, msg, ...args),
    info:  (msg, ...args) => _log('info',  prefix, msg, ...args),
    warn:  (msg, ...args) => _log('warn',  prefix, msg, ...args),
    error: (msg, ...args) => _log('error', prefix, msg, ...args),

    /** Mide tiempo de una función async en DEV. */
    async time(label, fn) {
      if (!IS_DEV) return fn();
      const t0 = performance.now();
      try {
        const r = await fn();
        console.debug(`[${prefix}] ⏱ ${label}: ${(performance.now()-t0).toFixed(1)}ms`);
        return r;
      } catch(e) {
        console.error(`[${prefix}] ⏱ ${label} FAILED:`, e);
        throw e;
      }
    },

    /** Agrupa logs relacionados (solo DEV). */
    group(label, fn) {
      if (!IS_DEV) { fn(); return; }
      console.group(`[${prefix}] ${label}`);
      try { fn(); } finally { console.groupEnd(); }
    },

    /** Tabla (solo DEV). */
    table(label, data) {
      if (!IS_DEV) return;
      console.debug(`[${prefix}] ${label}:`);
      console.table(data);
    },

    get enabled() { return IS_DEV; }
  };
}

/* ── Logger global de la app ──────────────────────────── */
export const AppLogger = createLogger('ELECTROMEL');

/* ── Compatibilidad con AgendaLogger ──────────────────── */
export const AgendaLogger = createLogger('Agenda');
