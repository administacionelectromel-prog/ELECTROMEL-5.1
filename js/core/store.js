/**
 * ELECTROMEL — core/store.js
 * Store global reactivo con suscripciones granulares y batching.
 *
 * API:
 *   store.get(key)
 *   store.set(key, value)          → notifica suscriptores
 *   store.subscribe(key, fn)        → retorna unsubscribe()
 *   store.select(key, transform)    → valor derivado
 *   bus.on(event, fn)
 *   bus.emit(event, data)
 *   bus.off(event, fn)
 */

/* ═══════════════════════════════════════════════════════════
   STORE
   ═══════════════════════════════════════════════════════════ */
const _state  = {};
const _subs   = new Map();   /* key → Set<fn> */
let   _batchQueue  = null;   /* pending notifications during batch */
let   _batching    = false;

export const store = {
  /* ── get ──────────────────────────────────────────────── */
  get(key) {
    return _state[key];
  },

  /* ── set ──────────────────────────────────────────────── */
  set(key, value) {
    const prev = _state[key];
    _state[key] = value;
    if (prev !== value) {
      if (_batching) {
        _batchQueue.add(key);
      } else {
        _notify(key, value, prev);
      }
    }
  },

  /* ── subscribe ────────────────────────────────────────── */
  /**
   * Suscribe a cambios de una clave específica.
   * @param {string} key
   * @param {(newVal, oldVal) => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(key, fn) {
    if (!_subs.has(key)) _subs.set(key, new Set());
    _subs.get(key).add(fn);
    return () => _subs.get(key)?.delete(fn);
  },

  /* ── select ───────────────────────────────────────────── */
  /**
   * Valor derivado — lee y transforma.
   * @param {string} key
   * @param {(val) => T} transform
   * @returns {T}
   */
  select(key, transform) {
    return transform(_state[key]);
  },

  /* ── batch ────────────────────────────────────────────── */
  /**
   * Agrupa múltiples set() en una sola ronda de notificaciones.
   * Útil para actualizar varios campos sin re-renders intermedios.
   * @param {Function} fn
   */
  batch(fn) {
    _batching    = true;
    _batchQueue  = new Set();
    try {
      fn();
    } finally {
      _batching   = false;
      const keys  = _batchQueue;
      _batchQueue = null;
      keys.forEach(key => _notify(key, _state[key], undefined));
    }
  },

  /* ── snapshot ─────────────────────────────────────────── */
  snapshot() { return { ..._state }; },

  /* ── clear ────────────────────────────────────────────── */
  clear(key) {
    if (key) { delete _state[key]; } else { Object.keys(_state).forEach(k => delete _state[k]); }
  }
};

function _notify(key, newVal, oldVal) {
  const fns = _subs.get(key);
  if (!fns?.size) return;
  fns.forEach(fn => {
    try { fn(newVal, oldVal); }
    catch(e) { console.warn(`[store] subscriber error for '${key}':`, e); }
  });
}

/* ═══════════════════════════════════════════════════════════
   EVENT BUS
   ═══════════════════════════════════════════════════════════ */
const _handlers = new Map();  /* event → Set<fn> */

export const bus = {
  on(event, fn) {
    if (!_handlers.has(event)) _handlers.set(event, new Set());
    _handlers.get(event).add(fn);
    return () => bus.off(event, fn);
  },

  off(event, fn) {
    _handlers.get(event)?.delete(fn);
  },

  emit(event, data) {
    const fns = _handlers.get(event);
    if (!fns?.size) return;
    fns.forEach(fn => {
      try { fn(data); }
      catch(e) { console.warn(`[bus] handler error for '${event}':`, e); }
    });
  },

  /** Limpia todos los handlers de un evento. */
  clear(event) {
    if (event) _handlers.delete(event);
    else _handlers.clear();
  },

  /** Lista eventos activos (debug). */
  get events() { return [..._handlers.keys()]; }
};
