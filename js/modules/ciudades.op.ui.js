/* ════════════════════════════════════════════════════════════════
   UI — CIUDADES OPERATIVAS (Config) — v6.8
   Precio nafta global + lista y formulario de ciudades.
   ──────────────────────────────────────────────────────────────── */

import {
  listarCiudades, getCiudad, guardarCiudad, eliminarCiudad,
  getCombustibleGlobal, setCombustibleGlobal, calcularCombustible,
  costoPorDiaCiudad
} from '../services/gasto.operativo.js';
import { showToast, openModal, closeModal, confirmarLindo } from '../core/ui.js';
import { pesos } from '../core/utils.js';

let _editandoCiudadId = null;

/* ── Cargar precio nafta en los inputs de Config ─────────────────── */
export async function cargarNaftaGlobal() {
  try {
    const { precio, rendimiento } = await getCombustibleGlobal();
    const p = document.getElementById('cfg-nafta-precio');
    const r = document.getElementById('cfg-nafta-rend');
    if (p) p.value = precio;
    if (r) r.value = rendimiento;
  } catch (e) { /* nada */ }
}

export async function guardarNaftaGlobal() {
  const precio = parseFloat(document.getElementById('cfg-nafta-precio')?.value) || 1200;
  const rend   = parseFloat(document.getElementById('cfg-nafta-rend')?.value) || 12;
  if (precio <= 0 || rend <= 0) { showToast('⚠️ Valores inválidos', 'warn'); return; }
  await setCombustibleGlobal(precio, rend);
  showToast('✓ Precio de nafta guardado', 'success');
  renderCiudadesOpList(); // recalcular combustible mostrado
}

/* ── Renderizar lista de ciudades en Config ──────────────────────── */
export async function renderCiudadesOpList() {
  const cont = document.getElementById('cfg-ciudades-op-list');
  if (!cont) return;
  const ciudades = await listarCiudades();
  if (!ciudades.length) {
    cont.innerHTML = '<div class="dim txt-sm">Todavía no cargaste ciudades. Tocá "+ Agregar ciudad".</div>';
    return;
  }
  const { precio, rendimiento } = await getCombustibleGlobal();
  cont.innerHTML = ciudades.map(c => {
    const porDia = costoPorDiaCiudad(c);
    const combus = (c.transporte || 'auto') === 'auto'
      ? calcularCombustible((c.km || 0) * 2, precio, rendimiento)
      : 0;
    const transpIcon = (c.transporte || 'auto') === 'auto' ? '🚗 Auto' : '🚌 Colectivo';
    return `
      <div class="card" style="margin-bottom:8px;">
        <div class="row" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <div class="bold">${_esc(c.nombre)}${c.codigo ? ` <span class="dim txt-xs">(${_esc(c.codigo)})</span>` : ''}</div>
            <div class="dim txt-xs">${c.km || 0} km · ${transpIcon} · margen mín. ${c.margen_minimo || 30}%</div>
          </div>
          <div style="text-align:right;">
            <div class="txt-xs dim">Por día</div>
            <div class="acento bold mono">${pesos(porDia)}</div>
          </div>
        </div>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:8px;">
          <span class="txt-xs dim">🏨 ${pesos(c.alojamiento_dia || 0)}/día</span>
          <span class="txt-xs dim">🍽️ ${pesos(c.comida_dia || 0)}/día</span>
          ${combus ? `<span class="txt-xs dim">⛽ ${pesos(combus)} i/v</span>` : ''}
          ${c.pasaje ? `<span class="txt-xs dim">🎫 ${pesos(c.pasaje)}</span>` : ''}
          ${c.movilidad_local ? `<span class="txt-xs dim">🚖 ${pesos(c.movilidad_local)}</span>` : ''}
        </div>
        <div class="row" style="gap:6px;margin-top:10px;">
          <button class="btn btn-ghost btn-sm flex-1" type="button" onclick="editarCiudadOp(${c.id})">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="eliminarCiudadOp(${c.id})" aria-label="Eliminar ciudad">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Formulario de alta/edición ──────────────────────────────────── */
export async function abrirFormularioCiudadOp(id) {
  _editandoCiudadId = id || null;
  let c = { nombre:'', codigo:'', km:'', transporte:'auto', alojamiento_dia:'', comida_dia:'', pasaje:'', movilidad_local:'', margen_minimo:30 };
  if (id) {
    const existente = await getCiudad(id);
    if (existente) c = existente;
  }

  const modal = document.getElementById('modal-ciudad-op');
  if (!modal) return;
  const body = document.getElementById('modal-ciudad-op-body');
  body.innerHTML = `
    <div class="field-row">
      <div class="field"><label class="field-label">Nombre *</label><input type="text" id="cop-nombre" value="${_esc(c.nombre)}" placeholder="Ej: Neuquén"></div>
      <div class="field"><label class="field-label">Código</label><input type="text" id="cop-codigo" value="${_esc(c.codigo)}" placeholder="NQN" maxlength="4"></div>
    </div>
    <div class="field-row">
      <div class="field"><label class="field-label">Distancia km (solo ida)</label><input type="number" id="cop-km" value="${c.km || ''}" placeholder="460" inputmode="numeric"></div>
      <div class="field"><label class="field-label">Transporte</label>
        <select id="cop-transporte">
          <option value="auto" ${c.transporte==='auto'?'selected':''}>🚗 Auto</option>
          <option value="colectivo" ${c.transporte==='colectivo'?'selected':''}>🚌 Colectivo</option>
        </select>
      </div>
    </div>
    <div class="divider-label"><span>Gastos por día (×días del viaje)</span></div>
    <div class="field-row">
      <div class="field"><label class="field-label">Alojamiento / día $</label><input type="number" id="cop-aloj" value="${c.alojamiento_dia || ''}" placeholder="50000" inputmode="numeric"></div>
      <div class="field"><label class="field-label">Comida / día $</label><input type="number" id="cop-comida" value="${c.comida_dia || ''}" placeholder="8000" inputmode="numeric"></div>
    </div>
    <div class="divider-label"><span>Gastos fijos del viaje</span></div>
    <div class="field-row">
      <div class="field"><label class="field-label">Pasaje $ (si es colectivo)</label><input type="number" id="cop-pasaje" value="${c.pasaje || ''}" placeholder="0" inputmode="numeric"></div>
      <div class="field"><label class="field-label">Movilidad local $</label><input type="number" id="cop-movilidad" value="${c.movilidad_local || ''}" placeholder="5000" inputmode="numeric"></div>
    </div>
    <div class="field"><label class="field-label">Margen mínimo de rentabilidad %</label><input type="number" id="cop-margen" value="${c.margen_minimo || 30}" placeholder="30" inputmode="numeric" min="0" max="99"></div>
    <div class="txt-xs dim mb-6">El combustible se calcula solo con el precio de nafta global y los km (ida y vuelta).</div>
    <div class="row" style="gap:8px;">
      <button class="btn btn-ghost flex-1" type="button" onclick="cerrarFormularioCiudadOp()">Cancelar</button>
      <button class="btn btn-primary flex-1" type="button" onclick="guardarCiudadOpForm()">💾 Guardar</button>
    </div>`;
  document.getElementById('modal-ciudad-op-title').textContent = id ? '✏️ Editar ciudad' : '+ Nueva ciudad';
  openModal('modal-ciudad-op');
}

export function cerrarFormularioCiudadOp() {
  closeModal('modal-ciudad-op');
  _editandoCiudadId = null;
}

export async function guardarCiudadOpForm() {
  const v = (id) => document.getElementById(id)?.value || '';
  const nombre = v('cop-nombre').trim();
  if (!nombre) { showToast('Falta el nombre de la ciudad', 'warn'); return; }
  const ciudad = {
    nombre,
    codigo:          v('cop-codigo'),
    km:              parseFloat(v('cop-km')) || 0,
    transporte:      v('cop-transporte') || 'auto',
    alojamiento_dia: parseFloat(v('cop-aloj')) || 0,
    comida_dia:      parseFloat(v('cop-comida')) || 0,
    pasaje:          parseFloat(v('cop-pasaje')) || 0,
    movilidad_local: parseFloat(v('cop-movilidad')) || 0,
    margen_minimo:   parseFloat(v('cop-margen')) || 30
  };
  if (_editandoCiudadId) ciudad.id = _editandoCiudadId;
  try {
    await guardarCiudad(ciudad);
    showToast('✓ Ciudad guardada', 'success');
    cerrarFormularioCiudadOp();
    renderCiudadesOpList();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export async function editarCiudadOp(id) {
  await abrirFormularioCiudadOp(id);
}

export async function eliminarCiudadOp(id) {
  if (!(await confirmarLindo('¿Eliminar esta ciudad? Los viajes ya cargados conservan sus datos.', { titulo: 'Eliminar ciudad' }))) return;
  try {
    await eliminarCiudad(id);
    showToast('Ciudad eliminada', 'info');
    renderCiudadesOpList();
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
