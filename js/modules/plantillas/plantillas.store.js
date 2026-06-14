/**
 * ELECTROMEL — modules/plantillas/plantillas.store.js
 * Estado y persistencia de plantillas en IndexedDB.
 */

import { store }      from '../../core/store.js';
import { dbGet, dbPut } from '../../core/db.js';

/* ── Defaults ──────────────────────────────────────────── */
export const PLANTILLAS_DEFAULT = [
  { categoria: 'diagnostico', texto: 'IGBT en corto circuito — se reemplaza módulo completo' },
  { categoria: 'diagnostico', texto: 'Capacitores del bus DC inflados — cambio preventivo de serie' },
  { categoria: 'diagnostico', texto: 'Driver de gate sin señal — falla en circuito de disparo' },
  { categoria: 'diagnostico', texto: 'Termistor NTC defectuoso — activa protección térmica errónea' },
  { categoria: 'diagnostico', texto: 'Puente rectificador dañado — diodo en corto' },
  { categoria: 'diagnostico', texto: 'Bobina de inductancia con corto entre espiras' },
  { categoria: 'diagnostico', texto: 'Placa de control sin alimentación auxiliar' },
  { categoria: 'diagnostico', texto: 'Ventilador trabado — causa sobretemperatura' },
  { categoria: 'diagnostico', texto: 'Optoacoplador PC817 defectuoso — sin disparo de gate' },
  { categoria: 'diagnostico', texto: 'Fusible de entrada fundido — revisión de causa raíz' },
  { categoria: 'trabajo', texto: 'Reemplazo de IGBTs y drivers de gate' },
  { categoria: 'trabajo', texto: 'Cambio de capacitores del bus de continua' },
  { categoria: 'trabajo', texto: 'Limpieza profunda con aire comprimido + revisión general' },
  { categoria: 'trabajo', texto: 'Calibración y ajuste de corriente de salida' },
  { categoria: 'trabajo', texto: 'Reemplazo de ventilador de refrigeración' },
  { categoria: 'trabajo', texto: 'Cambio de fusibles y revisión protecciones' },
  { categoria: 'trabajo', texto: 'Reparación de placa de control' },
  { categoria: 'trabajo', texto: 'Aplicación de pasta térmica en módulos de potencia' },
  { categoria: 'trabajo', texto: 'Revisión de soldaduras frías y re-estañado' },
  { categoria: 'trabajo', texto: 'Prueba de carga a 100A por 30 minutos — OK sin observaciones' },
  { categoria: 'materiales', texto: 'IGBT 20N60 (par)' },
  { categoria: 'materiales', texto: 'Capacitor electrolítico 400V 470µF 105°C' },
  { categoria: 'materiales', texto: 'Ventilador 12VDC 120×120mm' },
  { categoria: 'materiales', texto: 'Optoacoplador PC817 / TLP250' },
  { categoria: 'materiales', texto: 'Fusible cerámico 20A 500V acción rápida' },
  { categoria: 'materiales', texto: 'Pasta térmica disipadora' },
  { categoria: 'materiales', texto: 'Resistencia gate 10Ω 2W' },
  { categoria: 'materiales', texto: 'Termistor NTC 10kΩ' },
  { categoria: 'notas', texto: 'Equipo llega con golpes visibles — se documenta antes de intervenir' },
  { categoria: 'notas', texto: 'Cliente declara que sufrió sobretensión de red' },
  { categoria: 'notas', texto: 'Intervención previa de tercero — se encontraron componentes modificados' },
  { categoria: 'notas', texto: 'Equipo fuera de garantía de fábrica' },
  { categoria: 'notas', texto: 'Se entrega con cargador / accesorios (documentar)' },
  { categoria: 'notas', texto: 'Requiere conseguir repuesto — plazo a confirmar' },
  { categoria: 'notas', texto: 'Pendiente aprobación del cliente para continuar' },
  { categoria: 'notas', texto: 'Falla intermitente — requiere mayor tiempo de diagnóstico' }
];

const DB_KEY = 'plantillas_v1';

/* ── CRUD ──────────────────────────────────────────────── */
export async function cargarPlantillas() {
  const db = store.get('db');
  if (!db) return _defaults();
  try {
    const rec = await dbGet(db, 'config', DB_KEY);
    if (rec?.value && Array.isArray(rec.value) && rec.value.length > 0) return rec.value;
    const defaults = _defaults();
    await dbPut(db, 'config', { key: DB_KEY, value: defaults });
    return defaults;
  } catch(e) {
    console.warn('[plantillas.store] cargarPlantillas:', e);
    return _defaults();
  }
}

export async function guardarPlantillas(lista) {
  const db = store.get('db');
  if (!db) return;
  return dbPut(db, 'config', { key: DB_KEY, value: lista });
}

export async function incrementarUsos(id) {
  const lista = await cargarPlantillas();
  const idx   = lista.findIndex(x => x.id === id);
  if (idx >= 0) {
    lista[idx].usos = (lista[idx].usos || 0) + 1;
    guardarPlantillas(lista); /* fire and forget */
  }
}

export async function agregarPlantillaStore(cat, texto) {
  const lista  = await cargarPlantillas();
  const existe = lista.some(p => p.categoria === cat && p.texto.toLowerCase() === texto.toLowerCase());
  if (existe) return false;
  lista.push({ id: 'p_' + Date.now(), categoria: cat, texto, usos: 0, creada_at: new Date().toISOString() });
  await guardarPlantillas(lista);
  return true;
}

export async function eliminarPlantillaStore(id) {
  const lista = await cargarPlantillas();
  await guardarPlantillas(lista.filter(p => p.id !== id));
}

/* ── Estado UI ─────────────────────────────────────────── */
export const getCatActiva    = () => store.get('plantillas.catActiva') || 'diagnostico';
export const setCatActiva    = v  => store.set('plantillas.catActiva', v);
export const getLastField    = () => store.get('ui.lastActiveField');
export const setLastField    = v  => store.set('ui.lastActiveField', v);

/* ── Helpers privados ──────────────────────────────────── */
function _defaults() {
  return PLANTILLAS_DEFAULT.map((p, i) => ({
    id:        'def_' + i,
    categoria:  p.categoria,
    texto:      p.texto,
    usos:       0,
    creada_at:  new Date().toISOString()
  }));
}
