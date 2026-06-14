/**
 * ELECTROMEL — modules/zonas.ui.js
 * Interfaz de la sección "Bases y zonas" en Config.
 * Maneja: direcciones de base, lista de ciudades y el modal de ciudad.
 */

import {
  cargarZonas, guardarBaseInfo, guardarCiudad, eliminarCiudad,
  costoViajeCiudad, normCiudad
} from '../services/zonas.js';
import { showToast, openModal, closeModal } from '../core/ui.js';
import { escapeHtml, pesos } from '../core/utils.js';

const $ = id => document.getElementById(id);
const val = (id, v) => { const e = $(id); if (e) e.value = v ?? ''; };
const get = id => { const e = $(id); return e ? e.value.trim() : ''; };

/* ── Cargar valores de bases + lista de ciudades ───────── */
export async function renderZonasConfig() {
  const z = await cargarZonas();
  /* Direcciones / radios */
  val('cfg-base-sma-dir', z.bases.SMA?.direccion || '');
  val('cfg-base-sma-radio', z.bases.SMA?.radio_km || '');
  val('cfg-base-nqn-dir', z.bases.NQN?.direccion || '');
  val('cfg-base-nqn-radio', z.bases.NQN?.radio_km || '');
  /* Lista de ciudades */
  renderCiudadesList(z);
}

function renderCiudadesList(z) {
  const cont = $('cfg-ciudades-list');
  if (!cont) return;
  const ciudades = Object.values(z.ciudades || {});
  if (!ciudades.length) {
    cont.innerHTML = '<div class="dim txt-sm" style="padding:6px 0;">Sin ciudades cargadas.</div>';
    return;
  }
  ciudades.sort((a, b) => a.nombre.localeCompare(b.nombre));
  cont.innerHTML = ciudades.map(c => {
    const v = costoViajeCiudad(c.nombre);
    const total = (parseFloat(c.pasaje)||0)+(parseFloat(c.combustible)||0)+(parseFloat(c.vianda)||0)+(parseFloat(c.hospedaje)||0);
    return `
      <div class="bp-item">
        <div class="bp-item-main">
          <div><b>${escapeHtml(c.nombre)}</b> <span class="dim txt-sm">(${c.base})</span></div>
          <div class="dim txt-sm">Viaje: ${pesos(total)} · ${c.tiempo_hs || 0} hs</div>
        </div>
        <div class="bp-item-actions">
          <button class="btn btn-ghost btn-sm" type="button" onclick="editarCiudad('${escapeHtml(c.nombre)}')">✏️</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="borrarCiudad('${escapeHtml(c.nombre)}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Guardar direcciones/radios de las bases ───────────── */
export async function guardarBasesInfo() {
  try {
    await guardarBaseInfo('SMA', { direccion: get('cfg-base-sma-dir'), radio_km: get('cfg-base-sma-radio') });
    await guardarBaseInfo('NQN', { direccion: get('cfg-base-nqn-dir'), radio_km: get('cfg-base-nqn-radio') });
    showToast('✓ Direcciones guardadas', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Formulario de ciudad ──────────────────────────────── */
export function abrirFormularioCiudad(preset = null) {
  val('ciudad-original', preset?.nombre || '');
  val('ciudad-nombre', preset?.nombre || '');
  val('ciudad-base', preset?.base || 'SMA');
  val('ciudad-pasaje', preset?.pasaje || '');
  val('ciudad-combustible', preset?.combustible || '');
  val('ciudad-vianda', preset?.vianda || '');
  val('ciudad-hospedaje', preset?.hospedaje || '');
  val('ciudad-tiempo', preset?.tiempo_hs || '');
  openModal('modal-ciudad');
}

export function cerrarFormularioCiudad() {
  closeModal('modal-ciudad');
}

export async function guardarCiudadForm() {
  const nombre = get('ciudad-nombre');
  if (!nombre) { showToast('Falta el nombre de la ciudad', 'error'); return; }
  try {
    /* Si cambió el nombre, eliminar la entrada vieja */
    const original = get('ciudad-original');
    if (original && normCiudad(original) !== normCiudad(nombre)) {
      await eliminarCiudad(original);
    }
    await guardarCiudad({
      nombre,
      base:        get('ciudad-base'),
      pasaje:      get('ciudad-pasaje'),
      combustible: get('ciudad-combustible'),
      vianda:      get('ciudad-vianda'),
      hospedaje:   get('ciudad-hospedaje'),
      tiempo_hs:   get('ciudad-tiempo')
    });
    cerrarFormularioCiudad();
    await renderZonasConfig();
    showToast('✓ Ciudad guardada', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export async function editarCiudad(nombre) {
  const z = await cargarZonas();
  const c = z.ciudades[normCiudad(nombre)];
  if (c) abrirFormularioCiudad(c);
}

export async function borrarCiudad(nombre) {
  await eliminarCiudad(nombre);
  await renderZonasConfig();
  showToast('Ciudad eliminada', 'info');
}
