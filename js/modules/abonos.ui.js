/**
 * ELECTROMEL — modules/abonos.ui.js
 * Interfaz del módulo de abonos: listado con buscador, agrupado por estado,
 * formulario de alta/edición, y registro de pagos.
 */

import {
  listarAbonos, guardarAbono, registrarPagoAbono, borrarAbono,
  estadoDeCuenta, resumenAbonos, periodoActual, estadoVisita
} from '../services/abonos.js';
import { showToast } from '../core/ui.js';
import { pesos, escapeHtml, mensajeAmigable } from '../core/utils.js';
import { upsertCliente } from '../services/clientes.js';

let _filtro = '';

/* ── Render principal ──────────────────────────────────── */
export async function renderAbonos() {
  const cont = document.getElementById('abonos-lista');
  if (!cont) return;

  let abonos;
  try { abonos = await listarAbonos(); }
  catch (e) { cont.innerHTML = '<div class="empty dim">Error al cargar abonos.</div>'; return; }

  /* Resumen KPIs */
  const r = resumenAbonos(abonos);
  const kpis = document.getElementById('abonos-kpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="kpi"><div class="kpi-label">Clientes</div><div class="kpi-valor">${r.activos}</div></div>
      <div class="kpi"><div class="kpi-label">A cobrar/mes</div><div class="kpi-valor verde">${pesos(r.totalMes)}</div></div>
      <div class="kpi"><div class="kpi-label">Adeudado</div><div class="kpi-valor rojo">${pesos(r.adeudado)}</div></div>`;
  }

  /* Filtrar por buscador */
  const q = _filtro.trim().toLowerCase();
  let lista = abonos;
  if (q) {
    lista = abonos.filter(a =>
      [a.cliente_nombre, a.equipo, a.zona].join(' ').toLowerCase().includes(q));
  }

  if (!lista.length) {
    cont.innerHTML = q
      ? '<div class="empty dim">Sin resultados para esa búsqueda.</div>'
      : '<div class="empty dim">Todavía no cargaste clientes con abono. Tocá el botón + para agregar.</div>';
    return;
  }

  /* Calcular estado y agrupar */
  const conEstado = lista.map(a => ({ a, ec: estadoDeCuenta(a) }));
  const grupos = {
    debe:      conEstado.filter(x => x.ec.estado === 'debe'),
    porvencer: conEstado.filter(x => x.ec.estado === 'porvencer'),
    aldia:     conEstado.filter(x => x.ec.estado === 'aldia')
  };

  let html = '';
  if (grupos.debe.length)      html += _seccion('🔴 Con deuda', grupos.debe);
  if (grupos.porvencer.length) html += _seccion('🟡 Por vencer este mes', grupos.porvencer);
  if (grupos.aldia.length)     html += _seccion('🟢 Al día', grupos.aldia);
  cont.innerHTML = html;
}

function _seccion(titulo, items) {
  let h = `<div class="abono-seccion-titulo">${titulo} (${items.length})</div>`;
  for (const { a, ec } of items) h += _tarjetaAbono(a, ec);
  return h;
}

function _tarjetaAbono(a, ec) {
  const estadoTxt = ec.estado === 'debe'
    ? `Debe ${ec.meses_debe} ${ec.meses_debe === 1 ? 'mes' : 'meses'} · ${pesos(ec.deuda)}`
    : ec.estado === 'porvencer' ? 'Por cobrar este mes' : 'Al día ✓';
  const estadoCls = ec.estado;
  const equipoTxt = [a.equipo, a.periodicidad].filter(Boolean).join(' · ');
  const ev = estadoVisita(a);
  const visitaBadge = ev.toca ? ' <span class="abono-visita-badge">📅 toca visita</span>' : '';

  return `
    <div class="abono-card" data-id="${a.id}">
      <div class="abono-card-top" onclick="_toggleAbono(${a.id})">
        <div>
          <div class="abono-nombre">${escapeHtml(a.cliente_nombre)}${visitaBadge}</div>
          <div class="abono-equipo dim txt-sm">${escapeHtml(equipoTxt)}</div>
          <span class="abono-estado ${estadoCls}">${estadoTxt}</span>
        </div>
        <div class="abono-cuota">${pesos(a.cuota)}<small>por ${a.periodicidad === 'mensual' ? 'mes' : a.periodicidad}</small></div>
      </div>
      <div class="abono-detalle" id="abono-det-${a.id}">
        ${a.incluye ? `<div class="row"><span class="lbl dim">Incluye</span><span>${escapeHtml(a.incluye)}</span></div>` : ''}
        ${a.zona ? `<div class="row"><span class="lbl dim">Zona</span><span>${escapeHtml(a.zona)}</span></div>` : ''}
        <div class="row"><span class="lbl dim">Cliente desde</span><span>${escapeHtml(a.desde || '—')}</span></div>
        ${ev.proxima ? `<div class="row"><span class="lbl dim">Próxima visita</span><span>${ev.toca ? '⚠️ ' : ''}${escapeHtml(ev.proxima)}</span></div>` : ''}
        <div class="abono-acciones">
          <button class="btn btn-success btn-sm" type="button" onclick="_cobrarAbono(${a.id})">💵 Registrar pago</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="_agendarVisitaAbono(${a.id})">📅 Agendar visita</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="_checklistAbono(${a.id})">🏋️ Checklist</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="_editarAbono(${a.id})">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="_borrarAbonoUI(${a.id})">🗑️</button>
        </div>
      </div>
    </div>`;
}

/* ── Buscador ──────────────────────────────────────────── */
export function buscarAbonos(q) {
  _filtro = q || '';
  renderAbonos();
}

/* ── Toggle detalle ────────────────────────────────────── */
window._toggleAbono = (id) => {
  const det = document.getElementById('abono-det-' + id);
  if (det) det.classList.toggle('abierto');
};

/* ── Registrar pago del período actual ─────────────────── */
window._cobrarAbono = async (id) => {
  try {
    const periodo = periodoActual();
    await registrarPagoAbono(id, periodo);
    showToast('✓ Pago registrado (' + periodo + ')', 'success');
    renderAbonos();
  } catch (e) { showToast('❌ ' + mensajeAmigable(e), 'error'); }
};

/* ── Abrir formulario (alta o edición) ─────────────────── */
export function abrirFormularioAbono(abono = null) {
  const modal = document.getElementById('modal-abono');
  if (!modal) return;
  const g = (id) => document.getElementById(id);
  g('abono-id').value          = abono?.id ?? '';
  g('abono-cliente-nombre').value = abono?.cliente_nombre || '';
  g('abono-cliente-cuit').value = abono?.cliente_cuit || '';
  g('abono-cliente-tel').value = abono?.cliente_telefono || '';
  g('abono-cliente-dir').value = abono?.cliente_direccion || '';
  g('abono-cliente-cp').value  = abono?.cliente_cp || '';
  g('abono-cliente-ciudad').value = abono?.cliente_ciudad || '';
  g('abono-cliente-provincia').value = abono?.cliente_provincia || '';
  g('abono-equipo').value      = abono?.equipo || '';
  g('abono-zona').value        = abono?.zona || '';
  g('abono-cuota').value       = abono?.cuota || '';
  g('abono-periodicidad').value= abono?.periodicidad || 'mensual';
  g('abono-incluye').value     = abono?.incluye || '';
  g('abono-dia').value         = abono?.dia_cobro || 1;
  g('abono-desde').value       = abono?.desde || new Date().toISOString().slice(0, 10);
  modal.classList.add('active');
  /* Autocompletado de cliente */
  import('../services/clientes.js').then(m => m.initAutocompletado('abono')).catch(()=>{});
}

window._editarAbono = async (id) => {
  const abonos = await listarAbonos();
  const a = abonos.find(x => x.id === id);
  if (a) abrirFormularioAbono(a);
};

/* ── Guardar desde el formulario ───────────────────────── */
export async function guardarAbonoUI() {
  const g = (id) => document.getElementById(id)?.value;
  try {
    const idVal = g('abono-id');
    /* Conservar pagos existentes si es edición */
    let pagos = {};
    if (idVal) {
      const abonos = await listarAbonos();
      const prev = abonos.find(x => String(x.id) === String(idVal));
      if (prev) pagos = prev.pagos || {};
    }
    await guardarAbono({
      id: idVal ? parseInt(idVal) : undefined,
      cliente_nombre:   g('abono-cliente-nombre'),
      cliente_cuit:     g('abono-cliente-cuit'),
      cliente_telefono: g('abono-cliente-tel'),
      cliente_direccion: g('abono-cliente-dir'),
      cliente_cp:       g('abono-cliente-cp'),
      cliente_ciudad:   g('abono-cliente-ciudad'),
      cliente_provincia: g('abono-cliente-provincia'),
      equipo:           g('abono-equipo'),
      zona:             g('abono-zona'),
      cuota:            g('abono-cuota'),
      periodicidad:     g('abono-periodicidad'),
      incluye:          g('abono-incluye'),
      dia_cobro:        g('abono-dia'),
      desde:            g('abono-desde'),
      pagos
    });
    /* Guardar también en la base de clientes (compatible con ING/OTE/PRE) */
    try {
      await upsertCliente({
        nombre:    g('abono-cliente-nombre'),
        cuit:      g('abono-cliente-cuit'),
        telefono:  g('abono-cliente-tel'),
        direccion: g('abono-cliente-dir'),
        cp:        g('abono-cliente-cp'),
        ciudad:    g('abono-cliente-ciudad'),
        provincia: g('abono-cliente-provincia')
      });
    } catch (e) { console.warn('[upsertCliente abono]', e); }
    showToast('✓ Abono guardado', 'success');
    document.getElementById('modal-abono')?.classList.remove('active');
    renderAbonos();
  } catch (e) {
    showToast('❌ ' + mensajeAmigable(e), 'error');
  }
}

window._borrarAbonoUI = async (id) => {
  if (!confirm('¿Eliminar este abono? No se puede deshacer.')) return;
  try { await borrarAbono(id); showToast('Abono eliminado', 'success'); renderAbonos(); }
  catch (e) { showToast('❌ ' + mensajeAmigable(e), 'error'); }
};

/* ── Abrir el checklist de mantenimiento desde el abono ─── */
window._checklistAbono = async (id) => {
  try {
    const abonos = await listarAbonos();
    const a = abonos.find(x => x.id === id);
    if (!a) return;
    const { abrirChecklist } = await import('./checklist.ui.js');
    await abrirChecklist(a.cliente_nombre, a);
  } catch (e) {
    showToast('No se pudo abrir el checklist', 'error');
  }
};

/* ── Abrir gestor de flota desde el formulario de abono ─── */
window._abrirFlotaDesdeAbono = async () => {
  const nombre = document.getElementById('abono-cliente-nombre')?.value.trim();
  if (!nombre) { showToast('Primero escribí el nombre del cliente', 'warn'); return; }
  /* Asegurar que el cliente exista en la base (para colgarle la flota) */
  try {
    const g = (id) => document.getElementById(id)?.value;
    await upsertCliente({
      nombre,
      cuit:      g('abono-cliente-cuit'),
      telefono:  g('abono-cliente-tel'),
      direccion: g('abono-cliente-dir'),
      cp:        g('abono-cliente-cp'),
      ciudad:    g('abono-cliente-ciudad'),
      provincia: g('abono-cliente-provincia')
    });
  } catch (e) { /* seguimos igual, buscará por nombre */ }
  const { abrirFlota } = await import('./flota.ui.js');
  await abrirFlota(null, nombre);
};

/* ── Agendar una visita en la agenda desde el abono ──────── */
window._agendarVisitaAbono = async (id) => {
  try {
    const abonos = await listarAbonos();
    const a = abonos.find(x => x.id === id);
    if (!a) return;
    const { abrirFormularioTurno } = await import('../modules/agenda/agenda.render.js');
    abrirFormularioTurno(null);
    setTimeout(() => {
      const set = (idc, val) => { const e = document.getElementById(idc); if (e && val != null) e.value = val; };
      set('turno-cliente-nombre', a.cliente_nombre);
      set('turno-cliente-cuit',   a.cliente_cuit);
      set('turno-cliente-tel',    a.cliente_telefono);
      set('turno-cliente-dir',    a.cliente_direccion);
      set('turno-cliente-cp',     a.cliente_cp);
      set('turno-cliente-ciudad', a.cliente_ciudad || a.zona || '');
      set('turno-cliente-provincia', a.cliente_provincia);
      set('turno-servicio',       'Mantenimiento programado');
      set('turno-notas',          'Visita por abono: ' + (a.equipo || ''));
      if (window._recalcTurnoScore) window._recalcTurnoScore();
    }, 250);
    /* Marcar que se agendó una visita (resetea el contador del período) */
    try {
      const { registrarVisitaAbono } = await import('../services/abonos.js');
      await registrarVisitaAbono(id);
    } catch (e) { /* no crítico */ }
    showToast('Completá día y hora de la visita', 'info');
  } catch (e) {
    showToast('No se pudo abrir la agenda', 'error');
  }
};
