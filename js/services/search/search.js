/**
 * ELECTROMEL — services/search/search.js
 * Motor de búsqueda incremental reutilizable.
 * Compatible con: clientes, plantillas, fallas, equipos, agenda.
 *
 * Uso:
 *   import { SearchEngine } from './services/search/search.js';
 *   const engine = new SearchEngine({ debounce: 200, fuzzy: true });
 *   const results = await engine.search('igbt', items, ['texto','categoria']);
 */

export class SearchEngine {
  /**
   * @param {Object} [opts]
   * @param {number}  [opts.debounce=200]  ms de espera antes de buscar
   * @param {boolean} [opts.fuzzy=false]   búsqueda aproximada
   * @param {number}  [opts.maxResults=50] máximo de resultados
   */
  constructor(opts = {}) {
    this._opts  = { debounce: 200, fuzzy: false, maxResults: 50, ...opts };
    this._timer = null;
  }

  /**
   * Busca sincrónicamente en un array de items.
   * @param {string} query
   * @param {Array}  items
   * @param {string[]} fields - campos a buscar (soporta dot notation: 'cliente.nombre')
   * @returns {Array} resultados ordenados por relevancia
   */
  search(query, items, fields = []) {
    if (!query || query.trim().length < 2) return items;
    const q = query.trim().toLowerCase();
    const scored = [];

    for (const item of items) {
      const score = this._score(item, q, fields);
      if (score > 0) scored.push({ item, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this._opts.maxResults).map(s => s.item);
  }

  /**
   * Búsqueda con debounce — retorna Promise.
   * @param {string} query
   * @param {Function} fetcher - async () => items[]
   * @param {string[]} fields
   * @returns {Promise<Array>}
   */
  searchDebounced(query, fetcher, fields = []) {
    clearTimeout(this._timer);
    return new Promise((resolve, reject) => {
      this._timer = setTimeout(async () => {
        try {
          const items   = await fetcher();
          const results = this.search(query, items, fields);
          resolve(results);
        } catch(e) {
          reject(e);
        }
      }, this._opts.debounce);
    });
  }

  /* ── Score engine ─────────────────────────────────────── */
  _score(item, query, fields) {
    const values = fields.length
      ? fields.map(f => _getNestedValue(item, f))
      : [JSON.stringify(item)];

    let maxScore = 0;
    for (const raw of values) {
      if (!raw) continue;
      const val = String(raw).toLowerCase();
      const s   = this._scoreString(val, query);
      if (s > maxScore) maxScore = s;
    }
    return maxScore;
  }

  _scoreString(str, query) {
    if (str === query)          return 100;     /* match exacto */
    if (str.startsWith(query)) return 90;      /* empieza con */
    if (str.includes(query))   return 70;      /* contiene */
    if (this._opts.fuzzy)      return this._fuzzyScore(str, query); /* fuzzy */
    return 0;
  }

  /** Fuzzy score básico — cuenta caracteres en orden */
  _fuzzyScore(str, query) {
    let si = 0, qi = 0, score = 0;
    while (si < str.length && qi < query.length) {
      if (str[si] === query[qi]) { score++; qi++; }
      si++;
    }
    if (qi < query.length) return 0; /* no todos los chars encontrados */
    return Math.round((score / query.length) * 40); /* máx 40pts para fuzzy */
  }

  cancel() { clearTimeout(this._timer); }
}

/* ── Helper: acceso a propiedad anidada ──────────────── */
function _getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/* ── Instancias especializadas ───────────────────────── */

/** Búsqueda de clientes */
export const clienteSearch = new SearchEngine({ debounce: 150, fuzzy: true, maxResults: 10 });

/** Búsqueda de plantillas */
export const plantillaSearch = new SearchEngine({ debounce: 100, fuzzy: false, maxResults: 8 });

/** Búsqueda general del panel */
export const panelSearch = new SearchEngine({ debounce: 250, fuzzy: false, maxResults: 200 });

/**
 * Búsqueda rápida en el panel principal.
 * @param {string} query
 * @param {Array} registros
 * @returns {Array}
 */
export function buscarEnPanel(query, registros) {
  return panelSearch.search(query, registros, [
    'numero', 'cliente_nombre', 'equipo_tipo', 'equipo_marca',
    'equipo_modelo', 'falla', 'estado'
  ]);
}
