/**
 * ELECTROMEL — db.js
 * Capa de acceso a IndexedDB v11.
 * Exporta helpers async: dbGet, dbPut, dbGetAll, dbDelete, dbCount
 * y la referencia global `db` a través del store.
 */

export const DB_NAME    = 'electromelDB';
export const DB_VERSION = 15;

export const DB_SCHEMA = {
  ingresos: {
    options: { keyPath: 'numero' },
    indices: [
      { name: 'estado',     key: 'estado' },
      { name: 'cliente',    key: 'cliente_nombre' },
      { name: 'creado_at',  key: 'creado_at' },
      { name: 'archivado',  key: 'archivado' },
      { name: 'zona',       key: 'zona' },
      { name: 'anio',       key: 'anio' }
    ]
  },
  ordenes: {
    options: { keyPath: 'numero' },
    indices: [
      { name: 'estado',     key: 'estado' },
      { name: 'cliente',    key: 'cliente_nombre' },
      { name: 'creado_at',  key: 'creado_at' },
      { name: 'base',       key: 'base' },
      { name: 'zona',       key: 'zona' },
      { name: 'anio',       key: 'anio' }
    ]
  },
  exteriors: {
    options: { keyPath: 'numero' },
    indices: [
      { name: 'estado',     key: 'estado' },
      { name: 'cliente',    key: 'cliente_nombre' },
      { name: 'fecha',      key: 'fecha' },
      { name: 'es_turno',   key: 'es_turno' },
      { name: 'base',       key: 'base' },
      { name: 'zona',       key: 'zona' },
      { name: 'anio',       key: 'anio' }
    ]
  },
  presupuestos: {
    options: { keyPath: 'numero' },
    indices: [
      { name: 'estado',     key: 'estado' },
      { name: 'cliente',    key: 'cliente_nombre' },
      { name: 'fecha',      key: 'fecha' },
      { name: 'archivado',  key: 'archivado' },
      { name: 'zona',       key: 'zona' },
      { name: 'anio',       key: 'anio' }
    ]
  },
  config: {
    options: { keyPath: 'key' },
    indices: []
  },
  basePeriodos: {
    options: { keyPath: 'id', autoIncrement: true },
    indices: [
      { name: 'base',       key: 'base' },
      { name: 'desde',      key: 'desde' }
    ]
  },
  finance_movements: {
    options: { keyPath: 'transaction_id' },
    indices: [
      { name: 'type',              key: 'type' },
      { name: 'date',              key: 'date' },
      { name: 'related_order_id',  key: 'related_order_id' },
      { name: 'base',              key: 'base' },
      { name: 'category',          key: 'category' }
    ]
  },
  system_logs: {
    options: { keyPath: 'id', autoIncrement: true },
    indices: [
      { name: 'type',  key: 'type' },
      { name: 'ts',    key: 'ts' }
    ]
  },
  clientes: {
    options: { keyPath: 'id', autoIncrement: true },
    indices: [
      { name: 'nombre',       key: 'nombre' },
      { name: 'telefono',     key: 'telefono' },
      { name: 'trabajos_count', key: 'trabajos_count' }
    ]
  },
  rentabilidad_records: {
    options: { keyPath: 'numero' },
    indices: [
      { name: 'estado',   key: 'estado' },
      { name: 'servicio', key: 'servicio' },
      { name: 'base',     key: 'base' }
    ]
  },
  fallas: {
    options: { keyPath: 'id', autoIncrement: true },
    indices: [
      { name: 'categoria', key: 'categoria' },
      { name: 'equipo',    key: 'equipo' }
    ]
  },
  mantenimientos: {
    options: { keyPath: 'id' },
    indices: [
      { name: 'estado',          key: 'estado' },
      { name: 'cliente',         key: 'cliente_nombre' },
      { name: 'proxima_fecha',   key: 'proxima_fecha' },
      { name: 'base',            key: 'base' }
    ]
  },
  fotos: {
    options: { keyPath: 'id' },
    indices: [
      { name: 'orden',     key: 'orden_numero' },
      { name: 'subida',    key: 'subida_drive' }
    ]
  },
  abonos: {
    options: { keyPath: 'id', autoIncrement: true },
    indices: [
      { name: 'cliente',   key: 'cliente_nombre' },
      { name: 'estado',    key: 'estado' },
      { name: 'zona',      key: 'zona' }
    ]
  }
};

/* ── Cache en memoria (TTL 5 segundos) ─────────────────── */
const _cache     = {};
const _cacheTTL  = 5000;

function _cacheKey(store, id) {
  return id !== undefined ? `${store}:${id}` : `all:${store}`;
}

function _cacheGet(key) {
  const e = _cache[key];
  if (!e) return null;
  if (Date.now() - e.ts > _cacheTTL) { delete _cache[key]; return null; }
  return e.val;
}

function _cacheSet(key, val) {
  _cache[key] = { val, ts: Date.now() };
}

export function invalidateCache(storeOrAll) {
  if (!storeOrAll || storeOrAll === 'all') {
    Object.keys(_cache).forEach(k => delete _cache[k]);
  } else {
    Object.keys(_cache).forEach(k => {
      if (k.startsWith(storeOrAll + ':') || k === `all:${storeOrAll}`) {
        delete _cache[k];
      }
    });
  }
}

/* ── openDB() ───────────────────────────────────────────── */
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);

    req.onupgradeneeded = (ev) => {
      const conn = ev.target.result;
      const oldV = ev.oldVersion;

      /* v11: eliminar store legacy "egresos" */
      if (oldV < 11 && conn.objectStoreNames.contains('egresos')) {
        conn.deleteObjectStore('egresos');
      }

      /* v12: nuevo store "mantenimientos" (se crea solo en el loop de abajo) */

      /* v13: nuevo store "fotos" (se crea solo en el loop de abajo) */

      /* v14: índices nuevos (zona, anio) en ordenes/exteriors/ingresos/presupuestos
              se crean solos en el loop de abajo. La conversión de datos
              NQN→SMA+zona corre por separado tras abrir (migrarBaseAZona). */

      /* v15: nuevo store "abonos" (se crea solo en el loop de abajo) */

      /* Crear stores faltantes (idempotente) */
      Object.entries(DB_SCHEMA).forEach(([name, cfg]) => {
        let store;
        if (!conn.objectStoreNames.contains(name)) {
          store = conn.createObjectStore(name, cfg.options);
        } else {
          store = ev.target.transaction.objectStore(name);
        }
        cfg.indices.forEach(idx => {
          if (!store.indexNames.contains(idx.name)) {
            store.createIndex(idx.name, idx.key, { unique: false });
          }
        });
      });
    };
  });
}

/* ── _dbSafe(store, mode, fn, ctx) ─────────────────────── */
function _dbSafe(db, storeName, mode, fn, ctx) {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('DB no disponible')); return; }
    try {
      const tx    = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      fn(store, tx, resolve, reject);
      tx.onerror = () => reject(tx.error);
    } catch(e) {
      reject(e);
    }
  });
}

/* ── CRUD ───────────────────────────────────────────────── */
export function dbGet(db, storeName, key) {
  const ck = _cacheKey(storeName, key);
  const cv = _cacheGet(ck);
  if (cv !== null) return Promise.resolve(cv);

  return _dbSafe(db, storeName, 'readonly', (store, tx, resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => { _cacheSet(ck, req.result || null); resolve(req.result || null); };
    req.onerror   = () => reject(req.error);
  });
}

export function dbPut(db, storeName, record) {
  invalidateCache(storeName);
  return _dbSafe(db, storeName, 'readwrite', (store, tx, resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export function dbDelete(db, storeName, key) {
  invalidateCache(storeName);
  return _dbSafe(db, storeName, 'readwrite', (store, tx, resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export function dbGetAll(db, storeName, useCache = true) {
  const ck = _cacheKey(storeName);
  if (useCache) {
    const cv = _cacheGet(ck);
    if (cv !== null) return Promise.resolve(cv);
  }
  return _dbSafe(db, storeName, 'readonly', (store, tx, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => { _cacheSet(ck, req.result || []); resolve(req.result || []); };
    req.onerror   = () => reject(req.error);
  });
}

export function dbCount(db, storeName) {
  return _dbSafe(db, storeName, 'readonly', (store, tx, resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ── Contadores de numeración ────────────────────────────── */
export async function getNextNumber(db, prefix) {
  const key     = `counter_${prefix}`;
  const rec     = await dbGet(db, 'config', key);
  const current = rec ? (rec.value || 0) : 0;
  const next    = current + 1;
  await dbPut(db, 'config', { key, value: next });
  return `${prefix}-${String(next).padStart(5, '0')}`;
}

export async function peekNextNumber(db, prefix) {
  const key = `counter_${prefix}`;
  const rec = await dbGet(db, 'config', key);
  const n   = rec ? ((rec.value || 0) + 1) : 1;
  return `${prefix}-${String(n).padStart(5, '0')}`;
}

export async function resetCounter(db, prefix) {
  const key = `counter_${prefix}`;
  await dbPut(db, 'config', { key, value: 0 });
}

/* ── Config helpers ────────────────────────────────────── */
export async function getCfg(db, key, defaultVal = '') {
  const rec = await dbGet(db, 'config', key);
  return rec !== null ? (rec.value !== undefined ? rec.value : rec) : defaultVal;
}

export async function setCfg(db, key, value) {
  return dbPut(db, 'config', { key, value });
}

/* ── Logging ────────────────────────────────────────────── */
export async function logEvent(db, { type, message, ref, data }) {
  try {
    await dbPut(db, 'system_logs', {
      type,
      message,
      ref:  ref  || null,
      data: data || null,
      ts:   new Date().toISOString()
    });
  } catch(e) {
    console.warn('[logEvent]', e);
  }
}

/* ── Purga de logs ─────────────────────────────────────── */
export async function pruneSystemLogs(db, maxEntries = 500) {
  try {
    const all = await dbGetAll(db, 'system_logs', false);
    if (all.length <= maxEntries) return;
    all.sort((a, b) => (a.id || 0) - (b.id || 0));
    const toDelete = all.slice(0, all.length - maxEntries);
    for (const rec of toDelete) {
      if (rec.id) await dbDelete(db, 'system_logs', rec.id);
    }
  } catch(e) {
    console.warn('[pruneSystemLogs]', e);
  }
}

/* ── getBaseForDate ─────────────────────────────────────── */
export async function getBaseForDate(db, dateStr) {
  const periodos = await dbGetAll(db, 'basePeriodos');
  if (!periodos.length) return 'SMA';
  const d = new Date(dateStr || new Date().toISOString().slice(0, 10));
  const matching = periodos
    .filter(p => {
      const desde  = p.desde ? new Date(p.desde) : null;
      const hasta  = p.hasta ? new Date(p.hasta) : null;
      if (!desde) return false;
      if (hasta) return d >= desde && d <= hasta;
      return d >= desde;
    })
    .sort((a, b) => new Date(b.desde) - new Date(a.desde));
  return matching.length ? matching[0].base : 'SMA';
}
