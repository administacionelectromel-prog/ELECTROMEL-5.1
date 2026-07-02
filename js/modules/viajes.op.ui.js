/* ════════════════════════════════════════════════════════════════
   UI — VIAJES OPERATIVOS (Agenda) — v6.8
   Lista de viajes con semáforo 🔴🟡🟢, punto de equilibrio,
   facturado vs cobrado, y sugerencias desde turnos agendados.
   ──────────────────────────────────────────────────────────────── */

import {
  listarViajes, listarViajesVigentes, getViaje, guardarViaje, eliminarViaje,
  calcularGastoViaje, analizarViaje, calcularDias,
  listarCiudades, sugerirViajes,
  listarTrabajosParaAsociar, toggleTrabajoEnViaje,
  agregarGastoRealDiario, quitarGastoRealItem, listarGastosRubro,
  actualizarEstimacionCiudad, quitarGastoReal,
  compararTransporte
} from '../services/gasto.operativo.js';
import { showToast, openModal, closeModal, confirmarLindo } from '../core/ui.js';
import { pesos, fechaHoy } from '../core/utils.js';

let _editandoViajeId = null;

/* ── Render principal: lista de viajes + sugerencias ─────────────── */
export async function renderViajesOp() {
  await renderViajeActual();
  await _renderSugerencias();
  await _renderListaViajes();
}

/* ── Ajustar período del viaje (extender/acortar fácil) ──────────── */
export async function ajustarPeriodoViaje(viajeId) {
  const v = await getViaje(viajeId);
  if (!v) return;
  const body = document.getElementById('modal-viaje-detalle-body');
  if (!body) return;

  body.innerHTML = `
    <div class="card">
      <div class="card-title">📅 Ajustar período del viaje</div>
      <div class="dim txt-xs mb-6">Cambiá las fechas si te quedás más o menos días de lo planeado.</div>

      <div class="field"><label class="field-label">Fecha de salida</label>
        <input type="date" id="ajuste-salida-${viajeId}" value="${v.fecha_salida || ''}"></div>
      <div class="field"><label class="field-label">Fecha de regreso</label>
        <input type="date" id="ajuste-regreso-${viajeId}" value="${v.fecha_regreso || ''}"></div>

      <div class="dim txt-xs mb-6">Ajuste rápido del regreso:</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn btn-ghost btn-sm" type="button" onclick="_ajustarRegresoRapido(${viajeId},-7)">− 1 semana</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="_ajustarRegresoRapido(${viajeId},-1)">− 1 día</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="_ajustarRegresoRapido(${viajeId},1)">+ 1 día</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="_ajustarRegresoRapido(${viajeId},7)">+ 1 semana</button>
      </div>

      <div class="row" style="gap:8px;">
        <button class="btn btn-ghost flex-1" type="button" onclick="verDetalleViajeOp(${viajeId})">← Volver</button>
        <button class="btn btn-primary flex-1" type="button" onclick="guardarAjustePeriodo(${viajeId})">💾 Guardar fechas</button>
      </div>
    </div>`;
  document.getElementById('modal-viaje-detalle-title').textContent = '📅 Ajustar período';
  openModal('modal-viaje-detalle');
}

/* Ajuste rápido: suma/resta días al campo de regreso */
export function _ajustarRegresoRapido(viajeId, dias) {
  const input = document.getElementById(`ajuste-regreso-${viajeId}`);
  if (!input || !input.value) return;
  const f = new Date(input.value + 'T12:00:00');
  f.setDate(f.getDate() + dias);
  input.value = f.toISOString().slice(0, 10);
}

export async function guardarAjustePeriodo(viajeId) {
  const salida = document.getElementById(`ajuste-salida-${viajeId}`)?.value;
  const regreso = document.getElementById(`ajuste-regreso-${viajeId}`)?.value;
  if (!salida || !regreso) { showToast('Faltan fechas', 'warn'); return; }
  if (regreso < salida) { showToast('El regreso no puede ser antes de la salida', 'warn'); return; }
  const v = await getViaje(viajeId);
  if (!v) return;
  v.fecha_salida = salida;
  v.fecha_regreso = regreso;
  await guardarViaje(v);
  showToast('✓ Período actualizado', 'success');
  await verDetalleViajeOp(viajeId);
  renderViajesOp();
}

/* ── Viaje del PERÍODO ACTUAL (hoy entre salida y regreso) ──────────
   Se muestra arriba, debajo del buscador de mantenimientos.
   Si hoy solo estás en SMA (ningún viaje en curso), no muestra nada. */
export async function renderViajeActual() {
  const cont = document.getElementById('agenda-viaje-actual');
  if (!cont) return;
  const viajes = await listarViajes();
  /* Buscar el viaje en curso hoy (que no sea SMA) */
  const hoy = fechaHoy();
  const actual = viajes.find(v => {
    if (!v.fecha_salida || !v.fecha_regreso) return false;
    const enCurso = hoy >= v.fecha_salida.slice(0, 10) && hoy <= v.fecha_regreso.slice(0, 10);
    const esSMA = (v.ciudad || '').toLowerCase().includes('san martín') || (v.ciudad || '').toLowerCase().includes('san martin') || (v.ciudad || '').toLowerCase() === 'sma';
    return enCurso && !esSMA;
  });

  if (!actual) { cont.innerHTML = ''; return; }

  const a = await analizarViaje(actual);
  const restantes = _diasRestantes(actual.fecha_regreso);
  cont.innerHTML = `
    <div class="card" style="border:1px solid var(--acento);background:var(--acento-dim, rgba(232,160,32,0.08));margin-bottom:12px;">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="txt-xs acento bold" style="text-transform:uppercase;letter-spacing:0.5px;">📍 Estás acá ahora</div>
          <div class="bold" style="font-size:17px;">${_esc(a.gasto.ciudad_nombre)}</div>
          <div class="dim txt-xs">${_fecha(actual.fecha_salida)} → ${_fecha(actual.fecha_regreso)}</div>
        </div>
        <div class="row center" style="gap:6px;">
          <div style="text-align:center;background:var(--acento);border-radius:8px;padding:6px 10px;">
            <div class="bold mono" style="font-size:18px;line-height:1;color:#1a1a1a;">${restantes >= 0 ? restantes : 0}</div>
            <div style="font-size:9px;text-transform:uppercase;color:#1a1a1a;font-weight:600;">faltan</div>
          </div>
          <div style="text-align:center;background:var(--surface-3);border-radius:8px;padding:6px 10px;">
            <div class="bold mono" style="font-size:18px;line-height:1;">${a.gasto.dias}</div>
            <div class="dim" style="font-size:9px;text-transform:uppercase;">días</div>
          </div>
        </div>
      </div>
      <div class="row" style="gap:8px;margin-top:10px;">
        <button class="btn btn-primary btn-sm flex-1" type="button" onclick="abrirGastosRapido(${actual.id})">💵 Cargar gasto</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="verDetalleViajeOp(${actual.id})">Ver detalle</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="ajustarPeriodoViaje(${actual.id})" title="Extender o acortar">📅</button>
      </div>
    </div>`;
}

async function _renderListaViajes() {
  const cont = document.getElementById('agenda-viajes-list');
  if (!cont) return;
  const vigentes = await listarViajesVigentes();
  /* El viaje actual ya se muestra arriba (renderViajeActual): no repetirlo acá */
  const hoy = fechaHoy();
  const viajes = vigentes.filter(v => {
    if (!v.fecha_salida || !v.fecha_regreso) return true;
    const enCurso = hoy >= v.fecha_salida.slice(0, 10) && hoy <= v.fecha_regreso.slice(0, 10);
    const esSMA = (v.ciudad || '').toLowerCase().includes('san mart') || (v.ciudad || '').toLowerCase() === 'sma';
    return !(enCurso && !esSMA); // ocultar el que ya está arriba
  });
  if (!viajes.length) {
    cont.innerHTML = '<div class="dim txt-sm">No hay otros viajes. Tocá "+ Viaje" o usá una sugerencia.</div>';
    return;
  }
  const partes = [];
  for (const v of viajes) {
    const a = await analizarViaje(v);
    partes.push(_cardViaje(v, a));
  }
  cont.innerHTML = partes.join('');
}

function _cardViaje(v, a) {
  const semClass = a.semaforo === 'verde' ? 'semaforo-verde'
                 : a.semaforo === 'amarillo' ? 'semaforo-amarillo' : 'semaforo-rojo';
  const semIcon = a.semaforo === 'verde' ? '🟢' : a.semaforo === 'amarillo' ? '🟡' : '🔴';
  let semMsg;
  if (a.semaforo === 'verde')      semMsg = `${semIcon} Viaje rentable · Neto proyectado ${pesos(a.netoProyectado)}`;
  else if (a.semaforo === 'amarillo') semMsg = `${semIcon} Cubre gastos pero falta margen · Faltan ${pesos(a.faltante)}`;
  else                             semMsg = `${semIcon} No cubre el gasto · Faltan ${pesos(a.faltante)}`;

  const coberturaClamp = Math.min(100, Math.max(0, a.cobertura));
  const fillClass = a.semaforo === 'verde' ? 'verde' : a.semaforo === 'amarillo' ? 'amarillo' : 'rojo';

  /* Días que faltan para el regreso (si el viaje está en curso o por venir) */
  const restantes = _diasRestantes(v.fecha_regreso);
  const enCurso = _estaEnCurso(v.fecha_salida, v.fecha_regreso);

  return `
    <div class="card ${semClass}" style="border-left:3px solid var(--${a.semaforo === 'verde' ? 'exito' : a.semaforo === 'amarillo' ? 'acento' : 'peligro'});margin-bottom:10px;">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="bold">📍 ${_esc(a.gasto.ciudad_nombre)}</div>
          <div class="dim txt-xs">${_fecha(v.fecha_salida)} → ${_fecha(v.fecha_regreso)}</div>
        </div>
        <div class="row center" style="gap:6px;">
          ${enCurso && restantes >= 0 ? `<div style="text-align:center;background:var(--acento-dim, rgba(232,160,32,0.15));border-radius:6px;padding:4px 8px;">
            <div class="bold acento mono" style="font-size:16px;line-height:1;">${restantes}</div>
            <div class="dim" style="font-size:9px;text-transform:uppercase;">faltan</div>
          </div>` : ''}
          <div style="text-align:center;background:var(--surface-3);border-radius:6px;padding:4px 8px;">
            <div class="bold mono" style="font-size:16px;line-height:1;">${a.gasto.dias}</div>
            <div class="dim" style="font-size:9px;text-transform:uppercase;">días</div>
          </div>
        </div>
      </div>

      <div style="padding:8px 10px;border-radius:8px;margin:8px 0;font-size:12px;font-weight:600;
        background:var(--${a.semaforo === 'verde' ? 'exito' : a.semaforo === 'amarillo' ? 'acento' : 'peligro'}-dim, rgba(128,128,128,0.1));
        color:var(--${a.semaforo === 'verde' ? 'exito' : a.semaforo === 'amarillo' ? 'acento' : 'peligro'});">
        ${semMsg}
      </div>

      <!-- Punto de equilibrio -->
      <div style="margin:8px 0;">
        <div class="row" style="justify-content:space-between;font-size:11px;color:var(--texto-2);margin-bottom:4px;">
          <span>Cobertura del objetivo</span>
          <span class="acento bold">${a.cobertura}%</span>
        </div>
        <div style="height:6px;background:var(--surface-3);border-radius:3px;overflow:hidden;">
          <div class="progress-fill ${fillClass}" style="height:100%;width:${coberturaClamp}%;border-radius:3px;"></div>
        </div>
        <div class="row" style="justify-content:space-between;margin-top:4px;">
          <span class="txt-xs dim">Objetivo: <span class="acento mono bold">${pesos(a.objetivo)}</span></span>
          <span class="txt-xs dim">Facturado: <span class="mono bold">${pesos(a.facturado)}</span></span>
        </div>
      </div>

      <!-- Stats: facturado / cobrado / neto -->
      <div class="row" style="gap:6px;margin:8px 0;">
        <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:8px;text-align:center;">
          <div class="dim" style="font-size:9px;text-transform:uppercase;">Facturado</div>
          <div class="bold mono acento" style="font-size:12px;">${_k(a.facturado)}</div>
        </div>
        <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:8px;text-align:center;">
          <div class="dim" style="font-size:9px;text-transform:uppercase;">Cobrado</div>
          <div class="bold mono" style="font-size:12px;">${_k(a.cobrado)}</div>
        </div>
        <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:8px;text-align:center;">
          <div class="dim" style="font-size:9px;text-transform:uppercase;">Gasto op.</div>
          <div class="bold mono peligro" style="font-size:12px;">${_k(a.gasto.total)}</div>
        </div>
      </div>

      ${a.trabajosFaltan > 0 ? `<div class="txt-xs dim mb-4">💡 Faltan ~${a.trabajosFaltan} trabajo(s) más para cubrir el objetivo.</div>` : ''}
      ${a.nConMonto > 0 ? `<div class="txt-xs dim mb-4">${a.nConMonto} trabajo(s) con monto · costo asignado ${pesos(a.gastoPorTrabajo)} c/u.</div>` : '<div class="txt-xs dim mb-4">Sin trabajos facturables todavía.</div>'}

      <div class="row" style="gap:6px;margin-top:8px;">
        <button class="btn btn-ghost btn-sm flex-1" type="button" onclick="verDetalleViajeOp(${v.id})">Ver detalle</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="editarViajeOp(${v.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="eliminarViajeOp(${v.id})" aria-label="Eliminar viaje">🗑️</button>
      </div>
    </div>`;
}

/* ── Sugerencias desde turnos agendados ──────────────────────────── */
async function _renderSugerencias() {
  const cont = document.getElementById('agenda-viajes-sugerencias');
  if (!cont) return;
  const sugerencias = await sugerirViajes();
  if (!sugerencias.length) { cont.innerHTML = ''; return; }

  /* No sugerir viajes que ya existen (misma ciudad + fechas) */
  const viajes = await listarViajes();
  const nuevas = sugerencias.filter(s => !viajes.some(v =>
    (v.ciudad || '').toLowerCase() === (s.ciudad || '').toLowerCase() &&
    v.fecha_salida === s.fecha_salida
  ));
  if (!nuevas.length) { cont.innerHTML = ''; return; }

  cont.innerHTML = nuevas.map((s, i) => `
    <div class="card" style="background:rgba(232,160,32,0.06);border:1px solid rgba(232,160,32,0.25);margin-bottom:8px;">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div>
          <div class="txt-xs acento bold">💡 Viaje sugerido</div>
          <div class="bold">${_esc(s.ciudad)}</div>
          <div class="dim txt-xs">${_fecha(s.fecha_salida)} → ${_fecha(s.fecha_regreso)} · ${s.n_turnos} turno(s)</div>
          ${!s.configurada ? '<div class="txt-xs peligro">⚠️ Ciudad no configurada (cargala en Config)</div>' : ''}
        </div>
        <button class="btn btn-primary btn-sm" type="button" onclick='crearViajeDesdeSugerencia(${JSON.stringify(s).replace(/'/g, "&#39;")})'>Crear</button>
      </div>
    </div>`).join('');
}

export async function crearViajeDesdeSugerencia(s) {
  try {
    await guardarViaje({
      ciudad_id:     s.ciudad_id,
      ciudad:        s.ciudad,
      fecha_salida:  s.fecha_salida,
      fecha_regreso: s.fecha_regreso,
      estado:        'planificado'
    });
    showToast('✓ Viaje creado desde la sugerencia', 'success');
    renderViajesOp();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Formulario de alta/edición de viaje ─────────────────────────── */
export async function abrirFormularioViajeOp(id) {
  _editandoViajeId = id || null;
  let v = { ciudad_id:'', fecha_salida:'', fecha_regreso:'', transporte:'auto', gastos_extra:[] };
  if (id) {
    const existente = await getViaje(id);
    if (existente) v = existente;
  }
  const ciudades = await listarCiudades();
  if (!ciudades.length) {
    showToast('Primero cargá una ciudad en Config', 'warn');
    return;
  }

  const body = document.getElementById('modal-viaje-op-body');
  if (!body) return;
  const opciones = ciudades.map(c =>
    `<option value="${c.id}" ${String(v.ciudad_id) === String(c.id) ? 'selected' : ''}>${_esc(c.nombre)}${c.codigo ? ' (' + _esc(c.codigo) + ')' : ''}</option>`
  ).join('');

  body.innerHTML = `
    <div class="field">
      <label class="field-label">Ciudad *</label>
      <select id="vop-ciudad" onchange="_recalcViajeOpPreview()">${opciones}</select>
    </div>
    <div class="field-row">
      <div class="field"><label class="field-label">Fecha salida *</label><input type="date" id="vop-salida" value="${v.fecha_salida || ''}" onchange="_recalcViajeOpPreview()"></div>
      <div class="field"><label class="field-label">Fecha regreso *</label><input type="date" id="vop-regreso" value="${v.fecha_regreso || ''}" onchange="_recalcViajeOpPreview()"></div>
    </div>
    <div id="vop-preview" class="card" style="background:var(--surface-2);padding:10px;"></div>
    <div class="row" style="gap:8px;margin-top:10px;">
      <button class="btn btn-ghost flex-1" type="button" onclick="cerrarFormularioViajeOp()">Cancelar</button>
      <button class="btn btn-primary flex-1" type="button" onclick="guardarViajeOpForm()">💾 Guardar viaje</button>
    </div>`;
  document.getElementById('modal-viaje-op-title').textContent = id ? '✏️ Editar viaje' : '🗺️ Planificar viaje';
  openModal('modal-viaje-op');
  _recalcViajeOpPreview();
}

/* Preview en vivo del gasto estimado del viaje */
export async function _recalcViajeOpPreview() {
  const cont = document.getElementById('vop-preview');
  if (!cont) return;
  const ciudadId = parseInt(document.getElementById('vop-ciudad')?.value, 10);
  const salida = document.getElementById('vop-salida')?.value;
  const regreso = document.getElementById('vop-regreso')?.value;
  if (!ciudadId || !salida || !regreso) {
    cont.innerHTML = '<div class="dim txt-xs">Elegí ciudad y fechas para ver la estimación.</div>';
    return;
  }
  const gasto = await calcularGastoViaje({ ciudad_id: ciudadId, fecha_salida: salida, fecha_regreso: regreso, gastos_extra: [] });
  cont.innerHTML = `
    <div class="txt-xs bold acento mb-4">Estimación — ${gasto.dias} día(s) a ${_esc(gasto.ciudad_nombre)}</div>
    ${_lineaPreview('🏨 Alojamiento', gasto.alojamiento)}
    ${_lineaPreview('🍽️ Comida', gasto.comida)}
    ${gasto.combustible ? _lineaPreview('⛽ Combustible i/v', gasto.combustible) : ''}
    ${gasto.pasaje ? _lineaPreview('🎫 Pasaje', gasto.pasaje) : ''}
    ${gasto.movilidad ? _lineaPreview('🚖 Movilidad local', gasto.movilidad) : ''}
    <div style="height:1px;background:var(--borde);margin:6px 0;"></div>
    <div class="row" style="justify-content:space-between;">
      <div class="txt-xs bold">TOTAL GASTO OPERATIVO</div>
      <div class="txt-xs mono bold peligro">${pesos(gasto.total)}</div>
    </div>`;
}

function _lineaPreview(label, monto) {
  return `<div class="row" style="justify-content:space-between;margin-bottom:3px;">
    <div class="txt-xs dim">${label}</div>
    <div class="txt-xs mono peligro">${pesos(monto)}</div>
  </div>`;
}

export function cerrarFormularioViajeOp() {
  closeModal('modal-viaje-op');
  _editandoViajeId = null;
}

export async function guardarViajeOpForm() {
  const ciudadId = parseInt(document.getElementById('vop-ciudad')?.value, 10);
  const salida = document.getElementById('vop-salida')?.value;
  const regreso = document.getElementById('vop-regreso')?.value;
  if (!ciudadId) { showToast('Elegí una ciudad', 'warn'); return; }
  if (!salida)   { showToast('Falta la fecha de salida', 'warn'); return; }

  const ciudades = await listarCiudades();
  const ciudad = ciudades.find(c => String(c.id) === String(ciudadId));

  const viaje = {
    ciudad_id:     ciudadId,
    ciudad:        ciudad ? ciudad.nombre : '',
    fecha_salida:  salida,
    fecha_regreso: regreso || salida,
    transporte:    ciudad ? ciudad.transporte : 'auto',
    estado:        'planificado'
  };
  if (_editandoViajeId) {
    viaje.id = _editandoViajeId;
    /* Conservar gastos extra y estado del viaje editado */
    const existente = await getViaje(_editandoViajeId);
    if (existente) {
      viaje.gastos_extra = existente.gastos_extra || [];
      viaje.estado = existente.estado || 'planificado';
    }
  }
  try {
    await guardarViaje(viaje);
    showToast('✓ Viaje guardado', 'success');
    cerrarFormularioViajeOp();
    renderViajesOp();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export async function editarViajeOp(id) {
  await abrirFormularioViajeOp(id);
}

export async function eliminarViajeOp(id) {
  if (!(await confirmarLindo('¿Eliminar este viaje?', { titulo: 'Eliminar viaje' }))) return;
  try {
    await eliminarViaje(id);
    showToast('Viaje eliminado', 'info');
    renderViajesOp();
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

/* ── Detalle del viaje (con gastos extra editables) ──────────────── */
export async function verDetalleViajeOp(id) {
  window._gastosRapidoViajeId = null;  /* salir del modo rápido */
  const v = await getViaje(id);
  if (!v) return;
  const a = await analizarViaje(v);
  const body = document.getElementById('modal-viaje-detalle-body');
  if (!body) return;

  /* Armar las secciones de gastos reales por rubro (async) */
  const rubroAloj = await _rubroReal(v.id, 'alojamiento', '🏨 Alojamiento', v);
  const rubroComida = await _rubroReal(v.id, 'comida', '🍽️ Comida', v);
  const rubroTransp = v.transporte === 'colectivo'
    ? await _rubroReal(v.id, 'pasaje', '🎫 Pasaje', v)
    : await _rubroReal(v.id, 'combustible', '⛽ Combustible', v);
  const rubroMovil = await _rubroReal(v.id, 'movilidad', '🚖 Movilidad local', v);

  const extras = Array.isArray(v.gastos_extra) ? v.gastos_extra : [];
  const extrasHtml = extras.length
    ? extras.map((g, i) => `
        <div class="row" style="justify-content:space-between;align-items:center;background:var(--surface-3);border-radius:8px;padding:8px 10px;margin-bottom:6px;">
          <div class="txt-sm">${_esc(g.concepto)}</div>
          <div class="row center" style="gap:8px;">
            <span class="mono peligro txt-sm">${pesos(g.monto)}</span>
            <button class="btn btn-ghost btn-sm" type="button" onclick="quitarGastoExtraViaje(${id},${i})" aria-label="Quitar">✕</button>
          </div>
        </div>`).join('')
    : '<div class="dim txt-xs mb-6">Sin gastos extra cargados.</div>';

  const trabajosHtml = a.trabajos.length
    ? a.trabajos.map(t => {
        const tieneMonto = (t.total || 0) > 0;
        return `
        <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--borde);">
          <div>
            <div class="txt-sm bold">${_esc(t.cliente_nombre || '—')} <span class="dim txt-xs">${t._tipo}-${String(t._numero).split('-').pop()}</span>${t._manual ? ' <span class="acento txt-xs">(manual)</span>' : ''}</div>
            <div class="txt-xs dim">${tieneMonto ? 'Costo asignado: ' + pesos(a.gastoPorTrabajo) : '<span style="opacity:0.6;">Sin presupuesto aún (no cuenta)</span>'}</div>
          </div>
          <div class="mono acento bold">${pesos(t.total || 0)}</div>
        </div>`;
      }).join('')
    : '<div class="dim txt-xs">Sin trabajos asociados todavía. Tocá "Gestionar trabajos" abajo.</div>';

  body.innerHTML = `
    <div class="card ${a.semaforo === 'verde' ? 'semaforo-verde' : a.semaforo === 'amarillo' ? 'semaforo-amarillo' : 'semaforo-rojo'}">
      <div class="bold" style="font-size:16px;">📍 ${_esc(a.gasto.ciudad_nombre)}</div>
      <div class="dim txt-xs">${_fecha(v.fecha_salida)} → ${_fecha(v.fecha_regreso)} · ${a.gasto.dias} días</div>
    </div>

    <!-- Punto de equilibrio -->
    <div class="card">
      <div class="card-title">🎯 Punto de equilibrio</div>
      ${_filaDetalle('Objetivo del viaje', pesos(a.objetivo), 'acento')}
      ${_filaDetalle('Facturado', pesos(a.facturado))}
      ${_filaDetalle('Cobertura', a.cobertura + '%', a.semaforo === 'verde' ? 'exito' : 'acento')}
      ${a.faltante > 0 ? _filaDetalle('Faltan', pesos(a.faltante), 'peligro') : ''}
      ${a.trabajosFaltan > 0 ? `<div class="txt-xs dim mt-8">💡 ~${a.trabajosFaltan} trabajo(s) más para cubrir.</div>` : ''}
    </div>

    <!-- Utilidad proyectada vs realizada -->
    <div class="card">
      <div class="card-title">💰 Utilidad</div>
      ${_filaDetalle('Facturado', pesos(a.facturado), 'acento')}
      ${_filaDetalle('Cobrado', pesos(a.cobrado))}
      <div style="height:1px;background:var(--borde);margin:6px 0;"></div>
      ${_filaDetalle('Neto proyectado (s/facturado)', pesos(a.netoProyectado), a.netoProyectado >= 0 ? 'exito' : 'peligro')}
      ${_filaDetalle('Neto realizado (s/cobrado)', pesos(a.netoRealizado), a.netoRealizado >= 0 ? 'exito' : 'peligro')}
    </div>

    <!-- Desglose del gasto -->
    <div class="card">
      <div class="card-title">📋 Gasto operativo detallado</div>
      ${_filaGasto('🏨 Alojamiento (' + a.gasto.dias + ' días)', a.gasto.alojamiento, a.gasto.esReal.alojamiento)}
      ${_filaGasto('🍽️ Comida (' + a.gasto.dias + ' días)', a.gasto.comida, a.gasto.esReal.comida)}
      ${a.gasto.combustible ? _filaGasto('⛽ Combustible', a.gasto.combustible, a.gasto.esReal.combustible) : ''}
      ${a.gasto.pasaje ? _filaGasto('🎫 Pasaje', a.gasto.pasaje, a.gasto.esReal.pasaje) : ''}
      ${a.gasto.movilidad ? _filaGasto('🚖 Movilidad local', a.gasto.movilidad, a.gasto.esReal.movilidad) : ''}
      ${a.gasto.extras ? _filaDetalle('🔧 Gastos extra', pesos(a.gasto.extras)) : ''}
      <div style="height:1px;background:var(--borde);margin:6px 0;"></div>
      ${_filaDetalle('TOTAL', pesos(a.gasto.total), 'peligro')}
      ${a.nConMonto > 0 ? _filaDetalle('Por trabajo (÷' + a.nConMonto + ')', pesos(a.gastoPorTrabajo)) : ''}
    </div>

    <!-- Gastos REALES por rubro (acumulables día a día) -->
    <div class="card">
      <div class="card-title">💵 Gastos reales del viaje</div>
      <div class="dim txt-xs mb-6">Cargá los gastos a medida que ocurren (se van sumando). Cada uno se suma a la caja como egreso. Así no se te olvida nada al final.</div>
      ${rubroAloj}
      ${rubroComida}
      ${rubroTransp}
      ${rubroMovil}
    </div>

    <!-- Comparador auto vs colectivo -->
    <div class="card" id="comparador-${v.id}">
      <div class="card-title">🚗🆚🚌 ¿Conviene auto o colectivo?</div>
      <div class="dim txt-xs">Calculando...</div>
    </div>

    <!-- Trabajos del viaje -->
    <div class="card">
      <div class="card-title">🔧 Trabajos en este viaje</div>
      ${trabajosHtml}
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="gestionarTrabajosViaje(${v.id})" style="margin-top:10px;">🔧 Gestionar trabajos (asociar/quitar)</button>
    </div>

    <!-- Gastos extra -->
    <div class="card">
      <div class="card-title">➕ Gastos extra del período</div>
      ${extrasHtml}
      <div class="field-row" style="margin-top:8px;">
        <div class="field" style="flex:2;"><input type="text" id="extra-concepto-${id}" placeholder="Ej: Pinza rota"></div>
        <div class="field"><input type="number" id="extra-monto-${id}" placeholder="$" inputmode="numeric"></div>
      </div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="agregarGastoExtraViaje(${id})">+ Agregar gasto</button>
    </div>`;
  document.getElementById('modal-viaje-detalle-title').textContent = '📍 ' + a.gasto.ciudad_nombre;
  openModal('modal-viaje-detalle');
  _renderComparador(v);
}

/* ── Ventana chica: solo cargar gastos (atajo del banner del viaje) ──────
   Abre el mismo modal pero SOLO con los rubros de gastos, sin el análisis
   completo (punto de equilibrio, utilidad, etc.). Para cargar rápido a diario. */
export async function abrirGastosRapido(id) {
  const v = await getViaje(id);
  if (!v) { showToast('Viaje no encontrado', 'warn'); return; }
  const body = document.getElementById('modal-viaje-detalle-body');
  if (!body) return;

  /* Marcar que estamos en modo rápido (para que el refresco vuelva acá) */
  window._gastosRapidoViajeId = id;

  const rubroAloj   = await _rubroReal(v.id, 'alojamiento', '🏨 Alojamiento', v);
  const rubroComida = await _rubroReal(v.id, 'comida', '🍽️ Comida', v);
  const rubroTrans  = (v.transporte === 'colectivo' || v.transporte === 'avion')
    ? await _rubroReal(v.id, 'pasaje', '🎫 Pasaje', v)
    : await _rubroReal(v.id, 'combustible', '⛽ Combustible', v);
  const rubroMovil  = await _rubroReal(v.id, 'movilidad', '🚖 Movilidad local', v);

  body.innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">💵 Cargar gastos del viaje</div>
      <div class="dim txt-xs">Cada gasto se suma a la caja como egreso. Cargá a medida que ocurren.</div>
    </div>
    ${rubroComida}
    ${_seccionGastosExtra(v)}
    ${rubroAloj}
    ${rubroTrans}
    ${rubroMovil}
    <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="verDetalleViajeOp(${id})" style="margin-top:8px;">📊 Ver análisis completo del viaje</button>`;

  document.getElementById('modal-viaje-detalle-title').textContent = '💵 Gastos — ' + _esc(v.ciudad || '');
  openModal('modal-viaje-detalle');
}

/* Renderizar el comparador auto vs colectivo */
async function _renderComparador(v) {
  const cont = document.getElementById('comparador-' + v.id);
  if (!cont) return;
  const c = await compararTransporte(v);
  if (!c) { cont.innerHTML = '<div class="card-title">🚗🆚🚌 ¿Conviene auto o colectivo?</div><div class="dim txt-xs">Faltan datos de la ciudad.</div>'; return; }

  const autoGana = c.conviene === 'auto';
  cont.innerHTML = `
    <div class="card-title">🚗🆚🚌 ¿Conviene auto o colectivo?</div>
    <div class="row" style="gap:8px;">
      <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:10px;text-align:center;${autoGana ? 'border:1px solid var(--exito);' : ''}">
        <div style="font-size:20px;">🚗</div>
        <div class="dim txt-xs">Auto</div>
        <div class="bold mono ${autoGana ? 'exito' : ''}">${pesos(c.auto.total)}</div>
        <div class="dim" style="font-size:9px;">combustible ${pesos(c.auto.combustible)}</div>
      </div>
      <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:10px;text-align:center;${!autoGana ? 'border:1px solid var(--exito);' : ''}">
        <div style="font-size:20px;">🚌</div>
        <div class="dim txt-xs">Colectivo</div>
        <div class="bold mono ${!autoGana ? 'exito' : ''}">${pesos(c.colectivo.total)}</div>
        <div class="dim" style="font-size:9px;">${c.tienePasaje ? 'pasaje i/v ' + pesos(c.colectivo.pasaje) : 'sin pasaje cargado'}</div>
      </div>
    </div>
    <div style="text-align:center;margin-top:10px;padding:8px;border-radius:8px;background:var(--exito-dim, rgba(76,175,125,0.12));color:var(--exito);font-size:12px;font-weight:600;">
      ${c.tienePasaje
        ? `✅ Conviene ${autoGana ? '🚗 auto' : '🚌 colectivo'} · ahorrás ${pesos(c.ahorro)}`
        : '⚠️ Cargá el pasaje de la ciudad en Config para comparar'}
    </div>
    <div class="dim txt-xs" style="margin-top:6px;text-align:center;">Alojamiento, comida y movilidad son iguales en ambos (${pesos(c.base)}).</div>`;
}

export async function agregarGastoExtraViaje(id) {
  const concepto = document.getElementById(`extra-concepto-${id}`)?.value?.trim();
  const monto = parseFloat(document.getElementById(`extra-monto-${id}`)?.value) || 0;
  if (!concepto) { showToast('Falta el concepto', 'warn'); return; }
  if (monto <= 0) { showToast('Falta el monto', 'warn'); return; }
  const v = await getViaje(id);
  if (!v) return;
  const extras = Array.isArray(v.gastos_extra) ? v.gastos_extra : [];
  extras.push({ concepto, monto });
  v.gastos_extra = extras;
  await guardarViaje(v);
  showToast('✓ Gasto agregado', 'success');
  if (window._gastosRapidoViajeId === id) { await abrirGastosRapido(id); }
  else { await verDetalleViajeOp(id); }
  renderViajesOp();
}

export async function quitarGastoExtraViaje(id, idx) {
  const v = await getViaje(id);
  if (!v) return;
  const extras = Array.isArray(v.gastos_extra) ? v.gastos_extra : [];
  extras.splice(idx, 1);
  v.gastos_extra = extras;
  await guardarViaje(v);
  showToast('Gasto quitado', 'info');
  if (window._gastosRapidoViajeId === id) { await abrirGastosRapido(id); }
  else { await verDetalleViajeOp(id); }
  renderViajesOp();
}

/* ── Gestionar qué trabajos están asociados al viaje ─────────────── */
export async function gestionarTrabajosViaje(viajeId) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return;
  const lista = await listarTrabajosParaAsociar(viaje);
  const body = document.getElementById('modal-viaje-detalle-body');
  if (!body) return;

  if (!lista.length) {
    body.innerHTML = `
      <div class="card">
        <div class="dim txt-sm">No hay fichas cargadas todavía (ING, OTT, OTE, PRE).</div>
        <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="verDetalleViajeOp(${viajeId})" style="margin-top:10px;">← Volver al viaje</button>
      </div>`;
    return;
  }

  const filas = lista.map(t => `
    <div class="row center" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--borde);">
      <div style="font-size:22px;cursor:pointer;" onclick="_toggleTrabajoViaje(${viajeId},'${t.idStr.replace(/'/g, "\\'")}',${t.autoDetectado})">
        ${t.incluido ? '✅' : '⬜'}
      </div>
      <div class="flex-1" onclick="_toggleTrabajoViaje(${viajeId},'${t.idStr.replace(/'/g, "\\'")}',${t.autoDetectado})" style="cursor:pointer;">
        <div class="txt-sm bold">${_esc(t.cliente)} <span class="dim txt-xs">${t.tipo}-${String(t.numero).split('-').pop()}</span></div>
        <div class="txt-xs dim">${_esc(t.equipo || '')}${t.ciudad ? ' · ' + _esc(t.ciudad) : ''}${t.autoDetectado ? ' · <span class="exito">auto</span>' : ''}</div>
      </div>
      <div class="mono acento bold txt-sm">${pesos(t.total)}</div>
    </div>`).join('');

  body.innerHTML = `
    <div class="card">
      <div class="card-title">🔧 Asociar trabajos al viaje</div>
      <div class="dim txt-xs mb-6">Tocá una ficha para asociarla o quitarla. Las marcadas "auto" se detectaron por la ciudad. Podés agregar o quitar cualquiera a mano.</div>
      ${filas}
      <button class="btn btn-primary btn-block btn-sm" type="button" onclick="verDetalleViajeOp(${viajeId})" style="margin-top:12px;">✓ Listo, volver al viaje</button>
    </div>`;
  document.getElementById('modal-viaje-detalle-title').textContent = '🔧 Trabajos del viaje';
}

export async function _toggleTrabajoViaje(viajeId, idStr, autoDetectado) {
  await toggleTrabajoEnViaje(viajeId, idStr, autoDetectado);
  /* Refrescar la lista manteniéndola abierta */
  await gestionarTrabajosViaje(viajeId);
  /* Refrescar la lista de viajes de fondo */
  renderViajesOp();
}

/* ── Gastos reales: helpers y funciones (acumulables día a día) ──────── */
function _filaGasto(label, monto, esReal) {
  return `<div class="row" style="justify-content:space-between;padding:3px 0;">
    <div class="txt-sm dim">${label}${esReal ? ' <span class="exito txt-xs">✓ real</span>' : ' <span class="dim txt-xs">(est.)</span>'}</div>
    <div class="mono txt-sm ${esReal ? 'exito bold' : ''}">${pesos(monto)}</div>
  </div>`;
}

/* Sección de un rubro: total acumulado + lista de gastos + agregar */
async function _rubroReal(viajeId, rubro, label, viaje) {
  const lista = await listarGastosRubro(viajeId, rubro);
  const total = lista.reduce((a, g) => a + (g.monto || 0), 0);
  const tieneGastos = lista.length > 0;

  const itemsHtml = tieneGastos
    ? lista.map((g, i) => `
        <div class="row center" style="gap:8px;padding:4px 0;font-size:12px;">
          <span class="dim" style="font-size:10px;">${g.fecha ? g.fecha.slice(8,10)+'/'+g.fecha.slice(5,7) : ''}</span>
          <span class="flex-1">${g.concepto ? _esc(g.concepto) : '<span class="dim">—</span>'}</span>
          <span class="mono">${pesos(g.monto)}</span>
          <button class="btn btn-ghost btn-sm" type="button" onclick="quitarItemGastoViaje(${viajeId},'${rubro}',${i})" aria-label="Quitar" style="padding:2px 6px;">✕</button>
        </div>`).join('')
    : '';

  return `
    <div style="border:1px solid var(--borde);border-radius:10px;padding:10px;margin-bottom:8px;">
      <div class="row center" style="gap:8px;">
        <div class="txt-sm bold" style="flex:1;">${label}</div>
        ${tieneGastos ? `<span class="exito bold mono txt-sm">${pesos(total)}</span>` : '<span class="dim txt-xs">solo estimado</span>'}
      </div>
      ${tieneGastos ? `
      <details style="margin-top:6px;border-top:1px solid var(--borde);padding-top:6px;">
        <summary style="cursor:pointer;font-size:11px;color:var(--acento);list-style:none;user-select:none;">▸ Ver ${lista.length} gasto${lista.length === 1 ? '' : 's'}</summary>
        <div style="margin-top:6px;">${itemsHtml}</div>
      </details>` : ''}
      <div class="row center" style="gap:6px;margin-top:8px;">
        <input type="text" id="real-concepto-${rubro}-${viajeId}" placeholder="Concepto (opcional)" style="flex:1;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:12px;">
        <input type="number" id="real-monto-${rubro}-${viajeId}" placeholder="$" inputmode="numeric" style="max-width:90px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:13px;">
        <button class="btn btn-primary btn-sm" type="button" onclick="agregarGastoDiarioViaje(${viajeId},'${rubro}')">+ Sumar</button>
      </div>
      ${tieneGastos ? `<button class="btn btn-ghost btn-sm" type="button" onclick="limpiarRubroViaje(${viajeId},'${rubro}')" style="margin-top:6px;width:100%;font-size:11px;">Borrar todos (volver al estimado)</button>` : ''}
    </div>`;
}

/* Sección "Gastos extra del período" reutilizable (lista colapsable). */
function _seccionGastosExtra(v) {
  const id = v.id;
  const extras = Array.isArray(v.gastos_extra) ? v.gastos_extra : [];
  const total = extras.reduce((a, g) => a + (g.monto || 0), 0);
  const itemsHtml = extras.length
    ? extras.map((g, i) => `
        <div class="row" style="justify-content:space-between;align-items:center;background:var(--surface-3);border-radius:8px;padding:8px 10px;margin-bottom:6px;">
          <div class="txt-sm">${_esc(g.concepto)}</div>
          <div class="row center" style="gap:8px;">
            <span class="mono peligro txt-sm">${pesos(g.monto)}</span>
            <button class="btn btn-ghost btn-sm" type="button" onclick="quitarGastoExtraViaje(${id},${i})" aria-label="Quitar">✕</button>
          </div>
        </div>`).join('')
    : '';

  return `
    <div style="border:1px solid var(--borde);border-radius:10px;padding:10px;margin-bottom:8px;">
      <div class="row center" style="gap:8px;">
        <div class="txt-sm bold" style="flex:1;">🔧 Gastos extra</div>
        ${extras.length ? `<span class="exito bold mono txt-sm">${pesos(total)}</span>` : '<span class="dim txt-xs">sin cargar</span>'}
      </div>
      ${extras.length ? `
      <details style="margin-top:6px;border-top:1px solid var(--borde);padding-top:6px;">
        <summary style="cursor:pointer;font-size:11px;color:var(--acento);list-style:none;user-select:none;">▸ Ver ${extras.length} gasto${extras.length === 1 ? '' : 's'}</summary>
        <div style="margin-top:6px;">${itemsHtml}</div>
      </details>` : ''}
      <div class="row center" style="gap:6px;margin-top:8px;">
        <input type="text" id="extra-concepto-${id}" placeholder="Ej: Ferretería" style="flex:1;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:12px;">
        <input type="number" id="extra-monto-${id}" placeholder="$" inputmode="numeric" style="max-width:90px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:13px;">
        <button class="btn btn-primary btn-sm" type="button" onclick="agregarGastoExtraViaje(${id})">+ Sumar</button>
      </div>
    </div>`;
}

export async function agregarGastoDiarioViaje(viajeId, rubro) {
  const monto = parseFloat(document.getElementById(`real-monto-${rubro}-${viajeId}`)?.value) || 0;
  const concepto = document.getElementById(`real-concepto-${rubro}-${viajeId}`)?.value?.trim() || '';
  if (monto <= 0) { showToast('Cargá un monto válido', 'warn'); return; }

  const info = await agregarGastoRealDiario(viajeId, rubro, monto, concepto);
  showToast('✓ Gasto sumado y registrado en la caja', 'success');

  try {
    const adminMod = await import('./admin.js');
    if (adminMod.renderAdminCaja) await adminMod.renderAdminCaja();
  } catch (e) { /* nada */ }

  /* Preguntar si actualiza la estimación de la ciudad (solo si el viaje terminó) */
  if (info && info.campoCiudad && info.cambioSignificativo) {
    const nombreRubro = { alojamiento: 'alojamiento/día', comida: 'comida/día', pasaje: 'pasaje', movilidad: 'movilidad local' }[rubro] || rubro;
    const msg = `Este viaje terminó. El ${nombreRubro} promedio fue ${pesos(info.valorCiudadSugerido)} (estimación actual ${pesos(info.valorActual)}).\n\n¿Actualizo la estimación de ${info.ciudadNombre} para próximos viajes?`;
    if (await confirmarLindo(msg, { titulo: 'Actualizar estimación', peligro: false, textoOk: 'Actualizar' })) {
      await actualizarEstimacionCiudad(info.ciudadId, info.campoCiudad, info.valorCiudadSugerido);
      showToast('✓ Estimación de la ciudad actualizada', 'success');
    }
  }
  /* Refrescar: si estamos en modo rápido, refrescar la ventana chica; si no, el detalle completo */
  if (window._gastosRapidoViajeId === viajeId) {
    await abrirGastosRapido(viajeId);
  } else {
    await verDetalleViajeOp(viajeId);
  }
  renderViajesOp();
}

export async function quitarItemGastoViaje(viajeId, rubro, idx) {
  await quitarGastoRealItem(viajeId, rubro, idx);
  showToast('Gasto quitado de la caja', 'info');
  try {
    const adminMod = await import('./admin.js');
    if (adminMod.renderAdminCaja) await adminMod.renderAdminCaja();
  } catch (e) { /* nada */ }
  if (window._gastosRapidoViajeId === viajeId) {
    await abrirGastosRapido(viajeId);
  } else {
    await verDetalleViajeOp(viajeId);
  }
  renderViajesOp();
}

export async function limpiarRubroViaje(viajeId, rubro) {
  if (!(await confirmarLindo('¿Borrar todos los gastos reales de este rubro? Se quitan también de la caja y vuelve al estimado.', { titulo: 'Borrar gastos' }))) return;
  await quitarGastoReal(viajeId, rubro);
  showToast('Volvió al estimado', 'info');
  try {
    const adminMod = await import('./admin.js');
    if (adminMod.renderAdminCaja) await adminMod.renderAdminCaja();
  } catch (e) { /* nada */ }
  await verDetalleViajeOp(viajeId);
  renderViajesOp();
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function _filaDetalle(label, valor, color) {
  return `<div class="row" style="justify-content:space-between;padding:3px 0;">
    <div class="txt-sm dim">${label}</div>
    <div class="mono ${color || ''} ${color ? 'bold' : ''} txt-sm">${valor}</div>
  </div>`;
}

function _fecha(iso) {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0].slice(2)}`;
}

/* Días que faltan desde HOY hasta la fecha de regreso (>=0; negativo si ya pasó) */
function _diasRestantes(fechaRegreso) {
  if (!fechaRegreso) return -1;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const reg = new Date(fechaRegreso.slice(0, 10) + 'T00:00:00');
  return Math.round((reg - hoy) / 86400000);
}

/* ¿Hoy cae entre la fecha de salida y la de regreso (inclusive)? */
function _estaEnCurso(fechaSalida, fechaRegreso) {
  if (!fechaSalida || !fechaRegreso) return false;
  const hoy = fechaHoy();
  return hoy >= fechaSalida.slice(0, 10) && hoy <= fechaRegreso.slice(0, 10);
}

function _k(n) {
  const v = Math.round((n || 0) / 1000);
  return '$' + v + 'k';
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
