/**
 * ELECTROMEL — core/ciudades.js
 * Ciudades ↔ código postal de la zona de cobertura.
 *
 *  ▸ CIUDADES_CP: lista precargada (editable acá).
 *  ▸ Aprendidas: cuando cargás una ciudad NUEVA junto a su CP en cualquier
 *    formulario, se guarda en el store 'config' (clave 'ciudades_cp_v1') y
 *    queda disponible para autocompletar y sugerir la próxima vez.
 *
 * Autocompletado bidireccional (ciudad→CP y CP→ciudad) en todos los
 * formularios con cliente, vía delegación de eventos en `document`.
 */

import { store } from './store.js';

export const CIUDADES_CP = [
  { ciudad: 'San Martín de los Andes', cp: '8370' },
  { ciudad: 'Junín de los Andes',      cp: '8371' },
  { ciudad: 'Villa La Angostura',      cp: '8407' },
  { ciudad: 'Aluminé',                 cp: '8345' },
  { ciudad: 'Zapala',                  cp: '8340' },
  { ciudad: 'Neuquén',                 cp: '8300' },
  { ciudad: 'Cipolletti',              cp: '8324' },
  { ciudad: 'Plottier',                cp: '8316' },
  { ciudad: 'Centenario',              cp: '8309' },
  { ciudad: 'San Carlos de Bariloche', cp: '8400' }
];

/* Pares de campos (ciudad ↔ cp) en cada formulario con cliente */
const PARES = [
  ['ott-cliente-ciudad',   'ott-cliente-cp'],
  ['ote-cliente-ciudad',   'ote-cliente-cp'],
  ['pre-cliente-ciudad',   'pre-cliente-cp'],
  ['abono-cliente-ciudad', 'abono-cliente-cp'],
  ['mant-cliente-ciudad',  'mant-cliente-cp'],
  ['turno-cliente-ciudad', 'turno-cliente-cp']
];

const CFG_KEY = 'ciudades_cp_v1';
let _aprendidas = [];   // [{ ciudad, cp }] cargadas desde el store

function _norm(s) {
  return (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Lista combinada: precargadas + aprendidas (sin duplicar por nombre) */
export function todasCiudades() {
  const out = CIUDADES_CP.slice();
  const vistos = new Set(CIUDADES_CP.map(c => _norm(c.ciudad)));
  for (const c of _aprendidas) {
    const k = _norm(c.ciudad);
    if (!vistos.has(k)) { out.push(c); vistos.add(k); }
  }
  return out;
}

/* Ciudad → CP */
export function cpDeCiudad(ciudad) {
  const k = _norm(ciudad);
  const m = todasCiudades().find(c => _norm(c.ciudad) === k);
  return m ? m.cp : '';
}

/* CP → Ciudad */
export function ciudadDeCp(cp) {
  const k = (cp || '').toString().trim();
  const m = todasCiudades().find(c => c.cp === k);
  return m ? m.ciudad : '';
}

/* Agrega las ciudades a un <datalist> sin pisar las que ya tenga */
export function mergeDatalistCiudades(id) {
  const dl = document.getElementById(id);
  if (!dl) return;
  const existentes = new Set(Array.from(dl.options || []).map(o => _norm(o.value)));
  todasCiudades().forEach(c => {
    if (!existentes.has(_norm(c.ciudad))) {
      const opt = document.createElement('option');
      opt.value = c.ciudad;
      dl.appendChild(opt);
    }
  });
}

/* Cargar aprendidas desde el store 'config' */
async function _cargarAprendidas() {
  try {
    const db = store.get('db');
    if (!db) return;
    const { getCfg } = await import('./db.js');
    const arr = await getCfg(db, CFG_KEY, []);
    if (Array.isArray(arr)) _aprendidas = arr.filter(c => c && c.ciudad && c.cp);
  } catch (e) { console.warn('[ciudades] cargar aprendidas:', e); }
}

/* Aprender una ciudad nueva (si no existe ya por nombre) y persistirla */
async function _aprender(ciudad, cp) {
  ciudad = (ciudad || '').trim();
  cp     = (cp || '').toString().trim();
  if (!ciudad || !cp) return;
  const k = _norm(ciudad);
  if (todasCiudades().some(c => _norm(c.ciudad) === k)) return;   // ya existe

  _aprendidas.push({ ciudad, cp });
  try {
    const db = store.get('db');
    if (!db) return;
    const { setCfg } = await import('./db.js');
    await setCfg(db, CFG_KEY, _aprendidas);
    mergeDatalistCiudades('zonas-datalist-global');
    mergeDatalistCiudades('turno-ciudades-datalist');
  } catch (e) { console.warn('[ciudades] aprender:', e); }
}

let _instalado = false;

/* Inicializa: carga aprendidas, puebla datalists e instala el autocompletado.
   El listener se instala una sola vez (idempotente). */
export async function initCiudadesCP() {
  await _cargarAprendidas();
  mergeDatalistCiudades('zonas-datalist-global');

  if (_instalado) return;
  _instalado = true;

  const cpDe = {}, ciudadDe = {};
  for (const [ci, cp] of PARES) { cpDe[ci] = cp; ciudadDe[cp] = ci; }

  /* Delegación: cubre campos estáticos y dinámicos (turno). Se dispara al
     terminar de elegir/escribir (change). Autocompleta el campo vacío y, si
     ambos quedan completos con una ciudad nueva, la aprende. */
  document.addEventListener('change', (e) => {
    const id = e.target && e.target.id;
    if (!id) return;

    let ciudadId = null, cpId = null;
    if (cpDe[id])           { ciudadId = id;            cpId = cpDe[id]; }
    else if (ciudadDe[id])  { ciudadId = ciudadDe[id];  cpId = id; }
    else return;

    const ciudadEl = document.getElementById(ciudadId);
    const cpEl     = document.getElementById(cpId);
    if (!ciudadEl || !cpEl) return;

    /* Autocompletar el que esté vacío (sin pisar lo cargado) */
    if (e.target === ciudadEl) {
      const cp = cpDeCiudad(ciudadEl.value);
      if (cp && !cpEl.value.trim()) cpEl.value = cp;
    } else {
      const ciudad = ciudadDeCp(cpEl.value);
      if (ciudad && !ciudadEl.value.trim()) ciudadEl.value = ciudad;
    }

    /* Aprender si ambos quedaron completos y es una ciudad nueva */
    const ci = ciudadEl.value.trim();
    const cp = cpEl.value.trim();
    if (ci && cp) _aprender(ci, cp);
  });
}
