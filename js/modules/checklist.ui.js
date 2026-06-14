/**
 * ELECTROMEL — modules/checklist.ui.js
 * Checklist de mantenimiento de la flota de máquinas de un cliente.
 *
 * Muestra cada máquina activa con:
 *   - tilde (se le hizo el service o no)
 *   - estado: OK / Observación / Baja
 * Al terminar:
 *   - aplica las bajas (salen de la lista)
 *   - genera el OTE de constancia en PDF
 */

import { listarMaquinas, darDeBajaMaquina } from '../services/flota.js';
import { showToast } from '../core/ui.js';
import { escapeHtml, mensajeAmigable } from '../core/utils.js';

let _ctx = { clienteNombre: null, abono: null, maquinas: [], marca: {} };

/* ── Abrir el checklist para un cliente ────────────────── */
export async function abrirChecklist(clienteNombre, abono = null) {
  const maquinas = await listarMaquinas(null, clienteNombre, false);
  if (!maquinas.length) {
    showToast('Este cliente no tiene máquinas cargadas. Cargalas primero con 🏋️ en el abono.', 'warn');
    return;
  }
  _ctx = { clienteNombre, abono, maquinas, marca: {} };
  /* Estado inicial: todas tildadas y en OK (lo normal) */
  for (const m of maquinas) _ctx.marca[m.id] = { hecho: true, estado: 'ok' };

  const modal = document.getElementById('modal-checklist');
  if (!modal) return;
  const titulo = document.getElementById('checklist-cliente');
  if (titulo) titulo.textContent = clienteNombre;
  modal.classList.add('active');
  renderChecklist();
}

window.cerrarChecklist = () => {
  document.getElementById('modal-checklist')?.classList.remove('active');
};

function renderChecklist() {
  const cont = document.getElementById('checklist-lista');
  if (!cont) return;
  cont.innerHTML = _ctx.maquinas.map(m => {
    const mk = _ctx.marca[m.id] || { hecho: false, estado: 'ok' };
    return `
    <div class="chk-maquina">
      <div class="chk-top">
        <div class="chk-check ${mk.hecho ? 'marcado' : ''}" onclick="_chkToggle('${m.id}')">${mk.hecho ? '✓' : ''}</div>
        <div class="chk-info">
          <div class="chk-marca">${escapeHtml([m.marca, m.modelo].filter(Boolean).join(' — ') || 'Sin marca')}</div>
          ${m.numero ? `<div class="chk-id dim txt-sm">${escapeHtml(m.numero)}</div>` : ''}
        </div>
      </div>
      <div class="chk-estados">
        <div class="chk-estado ${mk.estado === 'ok' ? 'sel-ok' : ''}" onclick="_chkEstado('${m.id}','ok')">OK</div>
        <div class="chk-estado ${mk.estado === 'obs' ? 'sel-obs' : ''}" onclick="_chkEstado('${m.id}','obs')">Observación</div>
        <div class="chk-estado ${mk.estado === 'baja' ? 'sel-baja' : ''}" onclick="_chkEstado('${m.id}','baja')">Baja</div>
      </div>
      ${mk.estado === 'baja' ? '<div class="chk-nota-baja">⚠️ Saldrá de la lista para el próximo mantenimiento.</div>' : ''}
    </div>`;
  }).join('');

  /* Resumen */
  const res = document.getElementById('checklist-resumen');
  if (res) {
    const marcas = Object.values(_ctx.marca);
    const hechas = marcas.filter(x => x.hecho).length;
    const obs = marcas.filter(x => x.estado === 'obs').length;
    const bajas = marcas.filter(x => x.estado === 'baja').length;
    res.innerHTML = `📋 <b>${hechas} con service</b> · ${obs} observación · <b>${bajas} baja</b>`;
  }
}

window._chkToggle = (id) => {
  if (!_ctx.marca[id]) _ctx.marca[id] = { hecho: false, estado: 'ok' };
  _ctx.marca[id].hecho = !_ctx.marca[id].hecho;
  renderChecklist();
};

window._chkEstado = (id, estado) => {
  if (!_ctx.marca[id]) _ctx.marca[id] = { hecho: true, estado: 'ok' };
  _ctx.marca[id].estado = estado;
  /* Si es baja, igual queda como "atendida" para la constancia */
  if (estado === 'baja') _ctx.marca[id].hecho = true;
  renderChecklist();
};

/* ── Finalizar: aplicar bajas y generar OTE de constancia ── */
window._finalizarChecklist = async () => {
  try {
    /* Armar el detalle para el PDF */
    const detalle = _ctx.maquinas.map(m => {
      const mk = _ctx.marca[m.id] || { hecho: false, estado: 'ok' };
      return {
        marca: m.marca, modelo: m.modelo, numero: m.numero,
        hecho: mk.hecho, estado: mk.estado
      };
    });

    /* Aplicar las bajas en la flota */
    const bajas = detalle.filter(d => d.estado === 'baja');
    for (const m of _ctx.maquinas) {
      if (_ctx.marca[m.id]?.estado === 'baja') {
        await darDeBajaMaquina(null, _ctx.clienteNombre, m.id);
      }
    }

    /* Generar el OTE de constancia en PDF */
    const { imprimirChecklistPDF } = await import('../services/pdf/checklist.pdf.js');
    await imprimirChecklistPDF({
      cliente: _ctx.clienteNombre,
      equipo: _ctx.abono?.equipo || '',
      zona: _ctx.abono?.zona || '',
      detalle
    });

    cerrarChecklist();
    showToast(`✅ Checklist listo${bajas.length ? ` (${bajas.length} baja)` : ''}`, 'success');
  } catch (e) {
    console.error('[finalizarChecklist]', e);
    showToast('❌ ' + mensajeAmigable(e), 'error');
  }
};
