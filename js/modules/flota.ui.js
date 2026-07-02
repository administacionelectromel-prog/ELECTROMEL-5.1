/**
 * ELECTROMEL — modules/flota.ui.js
 * Interfaz para cargar y gestionar la flota de máquinas de un cliente.
 */

import { listarMaquinas, agregarMaquina, darDeBajaMaquina, eliminarMaquina, editarMaquina } from '../services/flota.js';
import { showToast, confirmarLindo } from '../core/ui.js';
import { escapeHtml, mensajeAmigable } from '../core/utils.js';

let _ctx = { clienteId: null, nombre: null };
let _editandoId = null;   // id de la máquina en edición, o null si es alta nueva

/* ── Abrir el gestor de flota para un cliente ──────────── */
export async function abrirFlota(clienteId, nombre) {
  _ctx = { clienteId: clienteId || null, nombre: nombre || null };
  const modal = document.getElementById('modal-flota');
  if (!modal) return;
  const titulo = document.getElementById('flota-cliente-nombre');
  if (titulo) titulo.textContent = nombre || 'Cliente';
  modal.classList.add('active');
  await renderFlota();
}

window.cerrarFlota = () => {
  document.getElementById('modal-flota')?.classList.remove('active');
};

/* ── Render de la lista ────────────────────────────────── */
async function renderFlota() {
  const cont = document.getElementById('flota-lista');
  if (!cont) return;
  let maquinas;
  try { maquinas = await listarMaquinas(_ctx.clienteId, _ctx.nombre, false); }
  catch (e) { cont.innerHTML = '<div class="empty dim">Error al cargar la flota.</div>'; return; }

  if (!maquinas.length) {
    cont.innerHTML = '<div class="empty dim">Todavía no cargaste máquinas. Usá el formulario de abajo para agregar.</div>';
    return;
  }

  cont.innerHTML = maquinas.map((m, i) => `
    <div class="flota-item">
      <div class="flota-num">${i + 1}</div>
      <div class="flota-info">
        <div class="flota-marca">${escapeHtml([m.marca, m.modelo].filter(Boolean).join(' — ') || 'Sin marca')}</div>
        ${m.numero ? `<div class="flota-id dim txt-sm">N°: ${escapeHtml(m.numero)}</div>` : ''}
      </div>
      <button class="flota-edit" type="button" onclick="_editarMaquina('${m.id}')" title="Editar" aria-label="Editar máquina">✏️</button>
      <button class="flota-del" type="button" onclick="_bajaMaquina('${m.id}')" title="Dar de baja" aria-label="Dar de baja máquina">✕</button>
    </div>`).join('');
}

/* ── Agregar máquina desde el mini-formulario ──────────── */
window._addMaquinaFlota = async () => {
  const g = (id) => document.getElementById(id);
  const marca = g('flota-marca')?.value.trim();
  const modelo = g('flota-modelo')?.value.trim();
  const numero = g('flota-numero')?.value.trim();
  if (!marca && !modelo && !numero) { showToast('Completá al menos la marca', 'warn'); return; }
  try {
    if (_editandoId) {
      await editarMaquina(_ctx.clienteId, _ctx.nombre, _editandoId, { marca, modelo, numero });
      showToast('✓ Máquina actualizada', 'success');
      _editandoId = null;
      _resetBotonFlota();
    } else {
      await agregarMaquina(_ctx.clienteId, _ctx.nombre, { marca, modelo, numero });
      showToast('✓ Máquina agregada', 'success');
    }
    g('flota-marca').value = '';
    g('flota-modelo').value = '';
    g('flota-numero').value = '';
    g('flota-marca').focus();
    await renderFlota();
  } catch (e) {
    showToast('❌ ' + mensajeAmigable(e), 'error');
  }
};

/* ── Editar una máquina: carga sus datos en el formulario ── */
window._editarMaquina = async (maquinaId) => {
  const maquinas = await listarMaquinas(_ctx.clienteId, _ctx.nombre, false);
  const m = maquinas.find(x => x.id === maquinaId);
  if (!m) return;
  const g = (id) => document.getElementById(id);
  g('flota-marca').value = m.marca || '';
  g('flota-modelo').value = m.modelo || '';
  g('flota-numero').value = m.numero || '';
  _editandoId = maquinaId;
  const btn = document.querySelector('#modal-flota .card .btn-primary');
  if (btn) btn.textContent = '✓ Guardar cambios';
  g('flota-marca').focus();
};

function _resetBotonFlota() {
  const btn = document.querySelector('#modal-flota .card .btn-primary');
  if (btn) btn.textContent = '+ Agregar a la lista';
}

/* ── Dar de baja una máquina ───────────────────────────── */
window._bajaMaquina = async (maquinaId) => {
  if (!(await confirmarLindo('¿Dar de baja esta máquina? Saldrá de la lista activa.', { titulo: 'Dar de baja' }))) return;
  try {
    await darDeBajaMaquina(_ctx.clienteId, _ctx.nombre, maquinaId);
    showToast('Máquina dada de baja', 'success');
    await renderFlota();
  } catch (e) {
    showToast('❌ ' + mensajeAmigable(e), 'error');
  }
};
