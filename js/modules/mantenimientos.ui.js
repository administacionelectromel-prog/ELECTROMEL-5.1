/**
 * ELECTROMEL — modules/mantenimientos.ui.js
 * Capa de interfaz para mantenimientos programados.
 * Conecta el formulario (modal-mant) y la lista (#mant-lista) con el servicio.
 */

import {
  guardarMantenimiento, listarMantenimientos, mantenimientosPorVencer,
  marcarMantenimiento, eliminarMantenimiento, calcularProximaFecha,
  MANT_ESTADOS, MANT_TIPO
} from '../services/mantenimientos.js';
import { showToast, openModal, closeModal } from '../core/ui.js';
import { escapeHtml } from '../core/utils.js';

/* ── Helpers DOM ───────────────────────────────────────── */
const $ = id => document.getElementById(id);
const val = (id, v) => { const e = $(id); if (e) e.value = v ?? ''; };
const get = id => { const e = $(id); return e ? e.value.trim() : ''; };

/* ── Abrir formulario (vacío o precargado desde OTT/OTE) ── */
export function abrirFormularioMantenimiento(preset = {}) {
  /* Limpiar */
  val('mant-id', preset.id || '');
  val('mant-origen', preset.origen || 'manual');
  val('mant-cliente-nombre', preset.cliente_nombre || '');
  val('mant-cliente-cuit', preset.cliente_cuit || '');
  val('mant-cliente-tel', preset.cliente_telefono || '');
  val('mant-cliente-dir', preset.cliente_direccion || '');
  val('mant-cliente-cp', preset.cliente_cp || '');
  val('mant-cliente-ciudad', preset.cliente_ciudad || '');
  val('mant-cliente-provincia', preset.cliente_provincia || '');
  val('mant-equipo', preset.equipo || '');
  val('mant-base', preset.base || 'SMA');
  val('mant-tipo', preset.tipo || MANT_TIPO.FECHA);
  val('mant-intervalo-meses', preset.intervalo_meses || '');
  val('mant-intervalo-horas', preset.intervalo_horas || '');
  val('mant-proxima-fecha', preset.proxima_fecha || '');
  val('mant-proxima-fecha-horas', preset.proxima_fecha || '');
  val('mant-notas', preset.notas || '');
  _onMantTipoChange();
  openModal('modal-mant');
  /* Autocompletado de cliente (igual que OTE) */
  import('../services/clientes.js').then(m => m.initAutocompletado('mant')).catch(() => {});
}

export function cerrarFormularioMantenimiento() {
  closeModal('modal-mant');
}

/* ── Cambio tipo fecha/horas ───────────────────────────── */
export function _onMantTipoChange() {
  const tipo = get('mant-tipo');
  const bf = $('mant-bloque-fecha');
  const bh = $('mant-bloque-horas');
  if (bf) bf.style.display = (tipo === MANT_TIPO.FECHA) ? '' : 'none';
  if (bh) bh.style.display = (tipo === MANT_TIPO.HORAS) ? '' : 'none';
}

/* ── Recalcular próxima fecha al cambiar los meses ─────── */
export function _recalcMantFecha() {
  const meses = parseInt(get('mant-intervalo-meses')) || 0;
  if (meses > 0) {
    const f = $('mant-proxima-fecha');
    if (f && !f.value) f.value = calcularProximaFecha(meses);
  }
}

/* ── Guardar desde el formulario ───────────────────────── */
export async function guardarMantenimientoForm() {
  const nombre = get('mant-cliente-nombre');
  const equipo = get('mant-equipo');
  if (!nombre) { showToast('Falta el nombre del cliente', 'error'); return; }
  if (!equipo) { showToast('Falta el equipo', 'error'); return; }

  const tipo = get('mant-tipo');
  const proximaFecha = tipo === MANT_TIPO.FECHA
    ? get('mant-proxima-fecha')
    : get('mant-proxima-fecha-horas');

  try {
    await guardarMantenimiento({
      id:               get('mant-id') || undefined,
      origen:           get('mant-origen') || 'manual',
      cliente_nombre:   nombre,
      cliente_cuit:     get('mant-cliente-cuit'),
      cliente_telefono: get('mant-cliente-tel'),
      cliente_direccion: get('mant-cliente-dir'),
      cliente_cp:       get('mant-cliente-cp'),
      cliente_ciudad:   get('mant-cliente-ciudad'),
      cliente_provincia: get('mant-cliente-provincia'),
      equipo:           equipo,
      base:             get('mant-base') || 'SMA',
      zona:             get('mant-zona') || '',
      tipo:             tipo,
      intervalo_meses:  get('mant-intervalo-meses'),
      intervalo_horas:  get('mant-intervalo-horas'),
      proxima_fecha:    proximaFecha,
      notas:            get('mant-notas')
    });
    cerrarFormularioMantenimiento();
    await renderMantenimientos();
    /* Guardar también en la base de clientes (compatible con ING/OTE/PRE) */
    try {
      const { upsertCliente } = await import('../services/clientes.js');
      await upsertCliente({
        nombre:    nombre,
        cuit:      get('mant-cliente-cuit'),
        telefono:  get('mant-cliente-tel'),
        direccion: get('mant-cliente-dir'),
        cp:        get('mant-cliente-cp'),
        ciudad:    get('mant-cliente-ciudad'),
        provincia: get('mant-cliente-provincia')
      });
    } catch (e) { console.warn('[upsertCliente mant]', e); }
    showToast('✓ Mantenimiento guardado', 'success');
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  }
}

/* ── Render de la lista en la sección de Agenda ────────── */
export async function renderMantenimientos() {
  const cont = $('mant-lista');
  if (!cont) return;

  let lista = [];
  try { lista = await listarMantenimientos(); }
  catch (e) { cont.innerHTML = '<div class="dim txt-sm">Error al cargar.</div>'; return; }

  if (!lista.length) {
    /* Compacto: si no hay mantenimientos, no mostrar nada (solo queda el buscador) */
    cont.innerHTML = '';
    return;
  }

  /* Filtro por buscador */
  const q = (document.getElementById('mant-search')?.value || '').trim().toLowerCase();
  if (q) {
    lista = lista.filter(m =>
      [m.cliente_nombre, m.equipo, m.zona, m.cliente_ciudad].filter(Boolean).join(' ').toLowerCase().includes(q));
    if (!lista.length) {
      cont.innerHTML = '<div class="dim txt-sm" style="padding:8px 0;">Sin resultados para esa búsqueda.</div>';
      return;
    }
  }

  cont.innerHTML = lista.map(m => {
    const est = m._estado_calc;
    let color = 'var(--exito)', etiqueta = 'Programado';
    if (est === MANT_ESTADOS.VENCIDO)    { color = 'var(--peligro)'; etiqueta = 'VENCIDO'; }
    else if (est === MANT_ESTADOS.POR_VENCER) { color = 'var(--acento)'; etiqueta = 'Por vencer'; }
    else if (est === MANT_ESTADOS.COORDINADO) { color = 'var(--info, #4a9eff)'; etiqueta = 'Coordinado'; }

    let infoVenc = '';
    if (m.proxima_fecha) {
      const d = m._dias;
      if (d != null) {
        infoVenc = d < 0 ? `Venció hace ${Math.abs(d)} día(s)`
                 : d === 0 ? 'Vence hoy'
                 : `Faltan ${d} día(s)`;
      }
    }
    if (m.tipo === MANT_TIPO.HORAS && m.intervalo_horas) {
      infoVenc += (infoVenc ? ' · ' : '') + `cada ${m.intervalo_horas} hs`;
    }

    return `
      <div class="mant-item" style="border-left:3px solid ${color};">
        <div class="mant-item-main">
          <div class="mant-item-cliente">${escapeHtml(m.cliente_nombre)}</div>
          <div class="mant-item-equipo dim txt-sm">${escapeHtml(m.equipo)}</div>
          <div class="mant-item-venc txt-sm" style="color:${color};">${etiqueta}${infoVenc ? ' · ' + infoVenc : ''}</div>
        </div>
        <div class="mant-item-acciones">
          <button class="btn btn-ghost btn-sm" type="button" onclick="_waMantenimiento('${m.id}')" title="Avisar por WhatsApp">💬</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="agendarTurnoDesdeMant('${m.id}')" title="Agendar turno">📅 Turno</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="generarOTEdesdeMant('${m.id}')" title="Generar visita">🚐 OTE</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="editarMantenimiento('${m.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="completarMantenimiento('${m.id}')" title="Marcar hecho">✓</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="borrarMantenimiento('${m.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Acciones desde la lista ───────────────────────────── */
export async function editarMantenimiento(id) {
  const lista = await listarMantenimientos();
  const m = lista.find(x => x.id === id);
  if (m) abrirFormularioMantenimiento(m);
}

export async function completarMantenimiento(id) {
  await marcarMantenimiento(id, MANT_ESTADOS.COMPLETADO);
  await renderMantenimientos();
  showToast('✓ Mantenimiento completado', 'success');
}

export async function borrarMantenimiento(id) {
  await eliminarMantenimiento(id);
  await renderMantenimientos();
  showToast('Mantenimiento eliminado', 'info');
}

/* ── Avisar mantenimiento próximo por WhatsApp ─────────── */
export async function waMantenimiento(id) {
  const lista = await listarMantenimientos();
  const m = lista.find(x => x.id === id);
  if (!m) return;
  if (!m.cliente_telefono) { showToast('Este cliente no tiene teléfono cargado', 'warn'); return; }
  try {
    const { buildWhatsAppMessage, openWhatsApp } = await import('../services/whatsapp.js');
    const msg = await buildWhatsAppMessage('mantenimiento', {
      cliente: m.cliente_nombre,
      equipo:  m.equipo
    });
    openWhatsApp(m.cliente_telefono, msg);
  } catch (e) {
    showToast('No se pudo abrir WhatsApp', 'error');
  }
}
window._waMantenimiento = waMantenimiento;

/* ── Generar OTE desde un mantenimiento ────────────────── */
export async function generarOTEdesdeMant(id) {
  const lista = await listarMantenimientos();
  const m = lista.find(x => x.id === id);
  if (!m) return;

  /* Marcar como coordinado y abrir el formulario de OTE precargado */
  await marcarMantenimiento(id, MANT_ESTADOS.COORDINADO);
  await renderMantenimientos();

  if (window.abrirFormularioOTE) {
    window.abrirFormularioOTE({
      cliente_nombre:   m.cliente_nombre,
      cliente_cuit:     m.cliente_cuit,
      cliente_telefono: m.cliente_telefono,
      cliente_direccion: m.cliente_direccion,
      cliente_cp:       m.cliente_cp,
      cliente_ciudad:   m.cliente_ciudad,
      cliente_provincia: m.cliente_provincia,
      base:             'SMA',
      zona:             m.zona || '',
      tipo_servicio:    'Mantenimiento programado',
      desc_servicio:    `Mantenimiento de: ${m.equipo}`
    });
    showToast('Visita generada desde mantenimiento', 'success');
  } else {
    showToast('No se pudo abrir el formulario de OTE', 'error');
  }
}

/* ── Agendar un TURNO desde un mantenimiento ───────────────
   El mantenimiento define la periodicidad; acá se crea el turno
   concreto en la agenda con los datos del cliente ya cargados. */
export async function agendarTurnoDesdeMant(id) {
  const lista = await listarMantenimientos();
  const m = lista.find(x => x.id === id);
  if (!m) return;

  try {
    const { abrirFormularioTurno } = await import('./agenda/agenda.render.js');
    abrirFormularioTurno(null);   // abre formulario nuevo (vacío)
    /* Rellenar los campos con los datos del mantenimiento */
    setTimeout(async () => {
      const { precargarTurnoConCliente } = await import('../services/clientes.js');
      precargarTurnoConCliente(m, {
        servicio: 'Mantenimiento programado',
        notas: 'Mantenimiento de: ' + (m.equipo || '')
      });
    }, 250);
    await marcarMantenimiento(id, MANT_ESTADOS.COORDINADO);
    await renderMantenimientos();
    showToast('Completá día y hora del turno', 'info');
  } catch (e) {
    console.error('[agendarTurnoDesdeMant]', e);
    showToast('No se pudo abrir la agenda', 'error');
  }
}

/* ── Abrir mant desde OTT/OTE (usa window.__ultimoEquipo) ── */
export function _programarMantDesde(tipoOrigen, numero) {
  const eq = (typeof window !== 'undefined' && window.__ultimoEquipo) || {};
  /* Cerrar el modal de éxito si está abierto */
  ['modal-ott-ok', 'modal-ote-ok'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
  });
  abrirFormularioMantenimiento({
    origen:           numero || tipoOrigen,
    cliente_nombre:   eq.cliente_nombre || '',
    cliente_telefono: eq.cliente_telefono || '',
    equipo:           eq.equipo || '',
    base:             eq.base || 'SMA',
    intervalo_meses:  6,
    proxima_fecha:    calcularProximaFecha(6)
  });
}

/* ── init: render inicial al cargar la agenda ──────────── */
export function initMantenimientos() {
  renderMantenimientos().catch(() => {});
}
