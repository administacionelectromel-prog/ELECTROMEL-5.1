/**
 * ELECTROMEL — clientes.js
 * Servicio de clientes: upsert inteligente, búsqueda por nombre/CUIT/tel,
 * dropdown de autocompletado para los formularios ING/OTT/OTE/PRE.
 */

import { store }             from '../core/store.js';
import { dbGetAll, dbPut, logEvent } from '../core/db.js';
import { escapeHtml }        from '../core/utils.js';

/* ── Normalización interna ──────────────────────────────── */
function _normalizarData(data) {
  if (!data) return null;

  /* Aceptar ambos formatos: { nombre, telefono, ... } o el objeto
     crudo de un ingreso/orden { cliente_nombre, cliente_telefono, ... }.
     (ING y OTT pasan el objeto crudo: sin este mapeo, el cliente
     nunca se indexaba y no aparecía en el autocompletado.) */
  if (!data.nombre && data.cliente_nombre) {
    data = {
      nombre:    data.cliente_nombre,
      cuit:      data.cliente_cuit,
      telefono:  data.cliente_telefono,
      direccion: data.cliente_direccion,
      cp:        data.cliente_cp,
      ciudad:    data.cliente_ciudad,
      provincia: data.cliente_provincia
    };
  }

  if (!data.nombre) return null;
  const nombre = String(data.nombre).trim();
  if (!nombre) return null;

  const cuitRaw = String(data.cuit || '').trim();
  const cuit    = cuitRaw.replace(/\D/g, '');
  const telRaw  = String(data.telefono || '').trim();
  const telNorm = telRaw.replace(/\D/g, '');

  return {
    nombre,
    nombre_lower:          nombre.toLowerCase(),
    cuit:                  cuit || null,
    cuit_raw:              cuitRaw || null,
    telefono:              telRaw || null,
    telefono_normalizado:  telNorm || null,
    direccion:             String(data.direccion || '').trim() || null,
    cp:                    String(data.cp || '').trim() || null,
    ciudad:                String(data.ciudad || '').trim() || null,
    provincia:             String(data.provincia || '').trim() || null
  };
}

async function _buscarClienteExistente(norm) {
  const db = store.get('db');
  const todos = await dbGetAll(db, 'clientes');

  /* 1. Exacto por CUIT (más confiable) */
  if (norm.cuit) {
    const byCuit = todos.find(c => c.cuit && c.cuit === norm.cuit);
    if (byCuit) return byCuit;
  }

  /* 2. Exacto por teléfono */
  if (norm.telefono_normalizado && norm.telefono_normalizado.length >= 8) {
    const byTel = todos.find(c =>
      c.telefono_normalizado && c.telefono_normalizado === norm.telefono_normalizado
    );
    if (byTel) return byTel;
  }

  /* 3. Nombre idéntico (case-insensitive) */
  const byNombre = todos.find(c => c.nombre_lower === norm.nombre_lower);
  return byNombre || null;
}

/* ── dbAdd helper (para clientes con autoIncrement) ────── */
async function _dbAdd(storeName, record) {
  const db = store.get('db');
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ── upsertCliente(data, origenNumero) ──────────────────── */
export async function upsertCliente(data, origenNumero) {
  const db = store.get('db');
  if (!db) return null;

  const norm = _normalizarData(data);
  if (!norm) return null;

  try {
    const existente = await _buscarClienteExistente(norm);
    const ahora = new Date().toISOString();

    if (existente) {
      /* Actualizar campos vacíos con los nuevos datos */
      let cambios = false;
      const campos = ['cuit', 'cuit_raw', 'telefono', 'telefono_normalizado',
                      'direccion', 'cp', 'ciudad', 'provincia'];
      campos.forEach(f => {
        if (norm[f] && !existente[f]) { existente[f] = norm[f]; cambios = true; }
      });

      /* Nombre: actualizar solo si el nuevo es más largo (más completo) */
      if (norm.nombre && norm.nombre.length > (existente.nombre || '').length) {
        existente.nombre       = norm.nombre;
        existente.nombre_lower = norm.nombre_lower;
        cambios = true;
      }

      /* Historial de trabajos — deduplicado a prueba de balas.
         Se normaliza el número (mayúsculas, sin espacios) y se
         reconstruye el array como conjunto único: correr el
         reindexado N veces deja SIEMPRE el mismo resultado. */
      if (origenNumero) {
        const num = String(origenNumero).trim().toUpperCase();
        if (num) {
          const prev = Array.isArray(existente.historial) ? existente.historial : [];
          const set  = new Set(prev.map(x => String(x).trim().toUpperCase()));
          if (!set.has(num)) {
            set.add(num);
            cambios = true;
          } else if (prev.length !== set.size) {
            /* Ya estaba, pero había duplicados viejos → limpiar igual */
            cambios = true;
          }
          existente.historial      = [num, ...[...set].filter(x => x !== num)];
          existente.trabajos_count = existente.historial.length;
        }
      }

      existente.ultimo_contacto = ahora;
      if (cambios) await dbPut(db, 'clientes', existente);
      return existente;
    } else {
      /* Crear nuevo cliente */
      const nuevo = {
        nombre:               norm.nombre,
        nombre_lower:         norm.nombre_lower,
        cuit:                 norm.cuit,
        cuit_raw:             norm.cuit_raw,
        telefono:             norm.telefono,
        telefono_normalizado: norm.telefono_normalizado,
        direccion:            norm.direccion,
        cp:                   norm.cp,
        ciudad:               norm.ciudad,
        provincia:            norm.provincia,
        primer_contacto:      ahora,
        ultimo_contacto:      ahora,
        historial:            origenNumero ? [origenNumero] : [],
        trabajos_count:       origenNumero ? 1 : 0
      };
      const id = await _dbAdd('clientes', nuevo);
      nuevo.id = id;
      await logEvent(db, {
        type:    'CLIENT_CREATED',
        message: 'Cliente nuevo: ' + norm.nombre,
        data:    { nombre: norm.nombre, cuit: norm.cuit, origen: origenNumero }
      });
      return nuevo;
    }
  } catch(err) {
    console.warn('[upsertCliente]', err);
    return null;
  }
}

/* ── buscarClientes(termino, limit) ─────────────────────── */
/**
 * Búsqueda full-text en nombre, CUIT y teléfono.
 * Ordenado por relevancia → trabajos_count → ultimo_contacto.
 */
export async function buscarClientes(termino, limit = 8) {
  const db = store.get('db');
  if (!db || !termino || termino.length < 2) return [];

  /* Comparación insensible a tildes/ñ: "gomez" encuentra "Gómez",
     "muñoz" y "munoz" se encuentran entre sí. Se normaliza al vuelo
     en ambos lados: no requiere reindexar nada. */
  const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const t      = sinAcentos(termino.trim().toLowerCase());
  const tDigits = termino.replace(/\D/g, '');
  const todos  = await dbGetAll(db, 'clientes');
  const matches = [];

  for (const c of todos) {
    let score = 0;
    const nl = sinAcentos(c.nombre_lower || '');
    if (nl.startsWith(t))          score = 100;
    else if (nl.includes(t))        score = 50;
    if (tDigits && c.cuit?.includes(tDigits))     score = Math.max(score, 80);
    if (tDigits && c.telefono_normalizado?.includes(tDigits)) score = Math.max(score, 70);
    if (score > 0) matches.push({ c, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tcDiff = (b.c.trabajos_count || 0) - (a.c.trabajos_count || 0);
    if (tcDiff !== 0) return tcDiff;
    return (b.c.ultimo_contacto || '').localeCompare(a.c.ultimo_contacto || '');
  });

  return matches.slice(0, limit).map(m => m.c);
}

/* ── initAutocompletado(prefix) ─────────────────────────── */
/**
 * Conecta el input de nombre cliente a un dropdown de sugerencias.
 * prefix: 'ing' | 'ott' | 'ote' | 'pre' | 'turno'
 * Al elegir una sugerencia, completa TODOS los campos del formulario.
 */
export function initAutocompletado(prefix) {
  const input = document.getElementById(prefix + '-cliente-nombre');
  if (!input) {
    console.warn('[autocompletado] no se encontró el campo ' + prefix + '-cliente-nombre');
    return;
  }
  if (input._autocompletado) return;
  input._autocompletado = true;

  /* Crear dropdown */
  let dropdown = document.getElementById(prefix + '-cliente-suggestions');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id        = prefix + '-cliente-suggestions';
    dropdown.className = 'autocomplete-dropdown hide';
    /* Asegurar que el contenedor pueda posicionar el dropdown */
    if (input.parentNode) {
      const cs = window.getComputedStyle(input.parentNode);
      if (cs.position === 'static') input.parentNode.style.position = 'relative';
      input.parentNode.appendChild(dropdown);
    }
  }

  let lastSearch = '';
  let searchTimer = null;

  input.addEventListener('input', () => {
    const term = (input.value || '').trim();
    if (term === lastSearch) return;
    lastSearch = term;
    clearTimeout(searchTimer);

    if (term.length < 2) {
      dropdown.classList.add('hide');
      dropdown.innerHTML = '';
      return;
    }

    searchTimer = setTimeout(() => {
      buscarClientes(term, 8).then(resultados => {
        if (!resultados.length) {
          console.log('[autocompletado] sin resultados para "' + term + '" (¿hay clientes guardados?)');
        }
        _renderSugerencias(dropdown, resultados, prefix);
      }).catch(err => {
        console.error('[autocompletado] error en búsqueda:', err);
      });
    }, 150);
  });

  /* Cerrar con delay para que el mousedown del item se procese */
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hide'), 250);
  });
}

function _renderSugerencias(dropdown, resultados, prefix) {
  dropdown.innerHTML = '';
  if (!resultados.length) { dropdown.classList.add('hide'); return; }

  resultados.forEach(c => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';

    const nombre = document.createElement('div');
    nombre.className   = 'autocomplete-nombre';
    nombre.textContent = c.nombre;

    const meta = document.createElement('div');
    meta.className = 'autocomplete-meta';
    const parts = [];
    if (c.cuit_raw || c.cuit) parts.push('CUIT: ' + (c.cuit_raw || c.cuit));
    if (c.telefono)            parts.push('Tel: ' + c.telefono);
    if (c.ciudad)              parts.push(c.ciudad);
    meta.textContent = parts.join(' · ');

    item.appendChild(nombre);
    item.appendChild(meta);

    const n = c.trabajos_count || 0;
    if (n > 0) {
      const badge = document.createElement('div');
      badge.className   = 'autocomplete-trabajos' + (n >= 3 ? ' recurrente' : '');
      badge.textContent = (n >= 3 ? '★ ' : '') + n + (n === 1 ? ' trabajo' : ' trabajos');
      item.appendChild(badge);
    }

    /* mousedown evita que blur del input cierre el dropdown antes del click */
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      _aplicarCliente(c, prefix);
      dropdown.classList.add('hide');
    });

    dropdown.appendChild(item);
  });

  dropdown.classList.remove('hide');
}

function _aplicarCliente(c, prefix) {
  const map = {
    '-cliente-nombre':    c.nombre     || '',
    '-cliente-cuit':      c.cuit_raw   || c.cuit || '',
    '-cliente-tel':       c.telefono   || '',
    '-cliente-dir':       c.direccion  || '',
    '-cliente-cp':        c.cp         || '',
    '-cliente-ciudad':    c.ciudad     || '',
    '-cliente-provincia': c.provincia  || ''
  };
  Object.entries(map).forEach(([suf, val]) => {
    const el = document.getElementById(prefix + suf);
    if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}

/* ── Reindexar clientes desde órdenes antiguas ─────────────
   Recorre ING/OTT/OTE/PRE y crea las fichas de cliente que falten.
   Seguro de correr varias veces: upsertCliente evita duplicados. */
export async function reindexarClientes() {
  const db = store.get('db');
  if (!db) return { creados: 0, revisados: 0 };

  const stores = ['ingresos', 'ordenes', 'exteriors', 'presupuestos'];
  let revisados = 0;
  let antes = 0;

  try { antes = (await dbGetAll(db, 'clientes', false)).length; } catch(e) {}

  /* Limpiar historiales existentes: se reconstruyen de cero desde las
     órdenes reales. Así el reindexado corrige cualquier duplicado
     previo (correrlo varias veces siempre deja el resultado correcto). */
  try {
    const clientes = await dbGetAll(db, 'clientes', false);
    for (const c of clientes) {
      if (c.historial?.length || c.trabajos_count) {
        c.historial = [];
        c.trabajos_count = 0;
        await dbPut(db, 'clientes', c);
      }
    }
  } catch(e) { console.warn('[reindex] limpieza historial', e); }

  for (const st of stores) {
    let registros = [];
    try { registros = await dbGetAll(db, st, false); } catch(e) { continue; }
    for (const r of registros) {
      if (!r.cliente_nombre) continue;
      revisados++;
      try {
        await upsertCliente({
          nombre:     r.cliente_nombre,
          cuit:       r.cliente_cuit,
          telefono:   r.cliente_telefono,
          direccion:  r.cliente_direccion,
          cp:         r.cliente_cp,
          ciudad:     r.cliente_ciudad,
          provincia:  r.cliente_provincia
        }, r.numero);
      } catch(e) { /* seguir con el siguiente */ }
    }
  }

  let despues = antes;
  try { despues = (await dbGetAll(db, 'clientes', false)).length; } catch(e) {}

  return { creados: despues - antes, revisados, total: despues };
}

/* ── precargarTurnoConCliente(cliente) ──────────────────────
   Llena el formulario de turno con los datos de un cliente.
   Centraliza la lógica antes repetida en abonos.ui.js y
   mantenimientos.ui.js. `cliente` puede venir de un abono, un
   mantenimiento o cualquier registro con campos cliente_*. */
export function precargarTurnoConCliente(cliente, extra = {}) {
  if (!cliente) return;
  const set = (id, val) => { const e = document.getElementById(id); if (e && val != null) e.value = val; };
  set('turno-cliente-nombre',    cliente.cliente_nombre);
  set('turno-cliente-cuit',      cliente.cliente_cuit);
  set('turno-cliente-tel',       cliente.cliente_telefono);
  set('turno-cliente-dir',       cliente.cliente_direccion);
  set('turno-cliente-cp',        cliente.cliente_cp);
  set('turno-cliente-ciudad',    cliente.cliente_ciudad || cliente.zona || '');
  set('turno-cliente-provincia', cliente.cliente_provincia);
  if (extra.servicio) set('turno-servicio', extra.servicio);
  if (extra.notas)    set('turno-notas', extra.notas);
  if (window._recalcTurnoScore) window._recalcTurnoScore();
}
