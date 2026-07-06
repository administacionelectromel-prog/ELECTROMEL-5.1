/**
 * ELECTROMEL — ote.js
 * Módulo de Órdenes de Trabajo Exterior (OTE).
 * Gestiona el formulario, tablas de trabajo/materiales, guardado,
 * conversión desde PRE, y el modal de confirmación.
 */

import { store }              from '../core/store.js';
import { dbGet, dbPut, getNextNumber, peekNextNumber,
         getCfg, logEvent, getBaseForDate, invalidateCache } from '../core/db.js';
import { showToast }          from '../core/ui.js';
import { pesos, escapeHtml, modalReady, mensajeAmigable, fechaHoy } from '../core/utils.js';
import { upsertCliente, initAutocompletado } from '../services/clientes.js';
import { registrarEstimado }  from '../services/rentabilidad.js';
import { onOrderDelivered, onOrderExpense } from '../services/finance.js';
import { imprimirOTE_A4 } from '../services/pdf/ote.pdf.js';
import { crearFilaTabular, leerTabular, leerItems, syncItemsHidden, poblarItems } from './ing.js';
import { bus }                from '../core/store.js';
import { initPlantillasInline, abrirMiniPanelPlantillas } from './plantillas/index.js';

/* ── Helper: crear item-row de descripción con plantillas ── */
function _crearDescItemOTE(texto) {
  const row   = document.createElement('div');
  row.className = 'item-row';

  const bullet = document.createElement('span');
  bullet.className   = 'item-bullet';
  bullet.textContent = '●';

  const wrap = document.createElement('div');
  wrap.className = 'item-ta-wrap';

  const ta = document.createElement('textarea');
  ta.rows        = 2;
  ta.className   = 'ote-desc-item';
  ta.placeholder = 'Descripción del servicio — escribí o usá 📋...';
  if (texto) ta.value = texto;

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const btnP = document.createElement('button');
  btnP.type      = 'button';
  btnP.className = 'item-plantillas-btn';
  btnP.title     = 'Plantillas rápidas';
  btnP.textContent = '📋';
  btnP.addEventListener('click', e => {
    e.stopPropagation();
    store.set('ui.lastActiveField', ta);
    abrirMiniPanelPlantillas(ta, 'diagnostico');
  });
  actions.appendChild(btnP);
  wrap.appendChild(ta);
  wrap.appendChild(actions);

  const rmBtn = document.createElement('button');
  rmBtn.type      = 'button';
  rmBtn.className = 'item-remove';
  rmBtn.textContent = '×';
  rmBtn.addEventListener('click', () => {
    const cont = row.parentElement;
    if (cont && cont.querySelectorAll('.item-row').length > 1) cont.removeChild(row);
    else ta.value = '';
  });

  row.appendChild(bullet);
  row.appendChild(wrap);
  row.appendChild(rmBtn);

  /* Inline autocomplete */
  initPlantillasInline(ta, 'diagnostico');
  return row;
}

/* ── Helpers de tabla OTE ─────────────────────────────── */
export function addTrabajoOTE(opts)   { return crearFilaTabular('ote-trabajo-list',    opts); }
export function addMaterialOTE(opts)  { return crearFilaTabular('ote-materiales-list', opts); }

/** Agrega un nuevo item de descripción con plantillas al contenedor */
export function addDescItemOTE() {
  const cont = document.getElementById('ote-desc-items');
  if (cont) cont.appendChild(_crearDescItemOTE());
}

/** Recalcula subtotales y total general de la OTE */
export function recalcOTETotal() {
  const trab = leerTabular('ote-trabajo-list');
  const mat  = leerTabular('ote-materiales-list');
  const mo   = parseFloat(document.getElementById('ote-mano-obra')?.value) || 0;
  const via  = parseFloat(document.getElementById('ote-viatico')?.value)   || 0;

  const subTrab = trab.reduce((a, x) => a + x.subtotal, 0);
  const subMat  = mat.reduce((a,  x) => a + x.subtotal, 0);
  const total   = subTrab + subMat + mo + via;

  const fmt = n => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ts = document.getElementById('ote-trabajo-subtotal');
  if (ts) ts.textContent = fmt(subTrab);
  const ms = document.getElementById('ote-materiales-subtotal');
  if (ms) ms.textContent = fmt(subMat);
  const td = document.getElementById('ote-total-display');
  if (td) td.textContent = fmt(total);
  const th = document.getElementById('ote-total');
  if (th) th.value = String(total);
}

/* ── abrirFormularioOTE ─────────────────────────────────── */
export async function abrirFormularioOTE(preset = null) {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  _resetFormularioOTE();
  initAutocompletado('ote');

  /* Próximo número */
  const preview = document.getElementById('ote-numero-preview');
  if (preview) peekNextNumber(db, 'OTE').then(n => { preview.textContent = n; }).catch(() => {});

  /* Fecha hoy */
  const hoy = fechaHoy();
  const fechaEl = document.getElementById('ote-fecha');
  if (fechaEl) fechaEl.value = hoy;

  /* Base sugerida */
  getBaseForDate(db, hoy).then(base => {
    const sel = document.getElementById('ote-base');
    if (sel && (base === 'SMA' || base === 'NQN')) sel.value = base;
  }).catch(() => {});

  /* Al menos 1 fila de trabajo */
  addTrabajoOTE();

  /* Precarga (ej: desde un mantenimiento programado o un turno de agenda) */
  if (preset && typeof preset === 'object') {
    const set = (id, v) => { const e = document.getElementById(id); if (e && v != null && v !== '') e.value = v; };
    set('ote-cliente-nombre',   preset.cliente_nombre);
    set('ote-cliente-tel',      preset.cliente_telefono);
    set('ote-cliente-dir',      preset.cliente_direccion);
    set('ote-cliente-ciudad',   preset.cliente_ciudad);
    set('ote-cliente-cp',       preset.cliente_cp);
    set('ote-cliente-provincia',preset.cliente_provincia);
    set('ote-origen-mkt',       preset.origen_marketing);
    set('ote-tipo-servicio',    preset.tipo_servicio);
    set('ote-equipo-marca',     preset.equipo_marca);
    set('ote-equipo-modelo',    preset.equipo_modelo);
    set('ote-falla',            preset.falla);
    set('ote-error',            preset.codigo_error);
    set('ote-desc-servicio',    preset.desc_servicio);
    /* La fecha de la OTE es la de HOY (cuando se crea la orden), no la
       del presupuesto/turno de origen, que pudo ser días antes. */
    if (preset.base === 'SMA' || preset.base === 'NQN') set('ote-base', preset.base);
    /* Turno de agenda de origen → para marcarlo realizado al guardar */
    store.set('ote.turnoOrigenId', preset._turnoOrigenId || null);
  }

  document.getElementById('modal-ote')?.classList.add('active');
}

export function cerrarFormularioOTE() {
  document.getElementById('modal-ote')?.classList.remove('active');
  store.set('ote.presupuestoOrigenId', null);
  store.set('ote.turnoOrigenId', null);
  document.getElementById('ote-from-pre-banner')?.classList.add('hide');
}

function _resetFormularioOTE() {
  [
    'ote-cliente-nombre','ote-cliente-cuit','ote-cliente-tel','ote-cliente-dir',
    'ote-cliente-cp','ote-cliente-ciudad','ote-cliente-provincia','ote-origen-mkt',
    'ote-tipo-servicio','ote-fecha','ote-numPresupuesto',
    'ote-equipo-marca','ote-equipo-modelo','ote-falla','ote-error',
    'ote-mano-obra','ote-viatico','ote-total',
    'ote-gasto-vianda','ote-gasto-movilidad','ote-gasto-otros','ote-desc-servicio'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = el.type === 'number' ? '0' : '';
  });

  const base = document.getElementById('ote-base');
  if (base) base.value = 'SMA';
  const estado = document.getElementById('ote-estado');
  if (estado) estado.value = 'pendiente_pago';

  document.getElementById('ote-trabajo-list')?.replaceChildren();
  document.getElementById('ote-materiales-list')?.replaceChildren();

  const descItems = document.getElementById('ote-desc-items');
  if (descItems) {
    descItems.innerHTML = '';
    descItems.appendChild(_crearDescItemOTE());
  }

  document.getElementById('ote-from-pre-banner')?.classList.add('hide');
  const td = document.getElementById('ote-total-display');
  if (td) td.textContent = '$0,00';

  /* Sin turno de origen por defecto (lo setea el preset si vino de un turno) */
  store.set('ote.turnoOrigenId', null);
}

/* ── _readOTE → objeto de datos o null ─────────────────── */
function _readOTE() {
  const v   = id => (document.getElementById(id)?.value || '').trim();
  const num = id => parseFloat(document.getElementById(id)?.value) || 0;

  const nombre = v('ote-cliente-nombre');
  if (!nombre) { showToast('Falta el nombre del cliente', 'warn'); document.getElementById('ote-cliente-nombre')?.focus(); return null; }

  const tipoServicio = v('ote-tipo-servicio');
  if (!tipoServicio) { showToast('Elegí un tipo de servicio', 'warn'); document.getElementById('ote-tipo-servicio')?.focus(); return null; }

  syncItemsHidden();

  const trabajoItems    = leerTabular('ote-trabajo-list');
  const materialesItems = leerTabular('ote-materiales-list');
  const subTrab = trabajoItems.reduce((a, x) => a + x.subtotal, 0);
  const subMat  = materialesItems.reduce((a, x) => a + x.subtotal, 0);
  const mo      = num('ote-mano-obra');
  const via     = num('ote-viatico');

  return {
    cliente_nombre:    nombre,
    cliente_cuit:      v('ote-cliente-cuit'),
    cliente_telefono:  v('ote-cliente-tel'),
    cliente_direccion: v('ote-cliente-dir'),
    cliente_cp:        v('ote-cliente-cp'),
    cliente_ciudad:    v('ote-cliente-ciudad'),
    cliente_provincia: v('ote-cliente-provincia'),
    origen_marketing:  v('ote-origen-mkt') || '',
    tipo_servicio:     tipoServicio,
    equipo_marca:      v('ote-equipo-marca'),
    equipo_modelo:     v('ote-equipo-modelo'),
    falla:             v('ote-falla'),
    codigo_error:      v('ote-error'),
    base:              v('ote-base')           || 'SMA',
    zona:              v('ote-zona') || '',
    anio:              parseInt((v('ote-fecha')||'').slice(0,4)) || new Date().getFullYear(),
    fecha:             v('ote-fecha') || fechaHoy(),
    numPresupuesto:    v('ote-numPresupuesto'),
    descripcion:       v('ote-desc-servicio'),
    trabajo_items:     trabajoItems,
    materiales_items:  materialesItems,
    sub_trabajo:       subTrab,
    sub_materiales:    subMat,
    mano_obra:         mo,
    viatico:           via,
    total:             subTrab + subMat + mo + via,
    gasto_vianda:      num('ote-gasto-vianda'),
    gasto_movilidad:   num('ote-gasto-movilidad'),
    gasto_otros:       num('ote-gasto-otros'),
    estado:            v('ote-estado')         || 'pendiente_pago'
  };
}

/* ── guardarOTE ─────────────────────────────────────────── */
export async function guardarOTE() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  const data = _readOTE();
  if (!data) return;

  try {
    const numero = await getNextNumber(db, 'OTE');
    data.numero    = numero;
    data.creado_at = new Date().toISOString();
    data.archivada = false;

    await dbPut(db, 'exteriors', data);

    /* Gastos internos */
    const gastos = [
      { amount: data.gasto_vianda,    cat: 'viatico',   desc: 'Vianda OTE' },
      { amount: data.gasto_movilidad, cat: 'logistica',  desc: 'Movilidad OTE' },
      { amount: data.gasto_otros,     cat: 'otro',       desc: 'Otros gastos OTE' }
    ];
    for (const g of gastos) {
      if (g.amount > 0) {
        onOrderExpense(
          { numero, cliente_nombre: data.cliente_nombre, base: data.base },
          { amount: g.amount, category: g.cat, description: g.desc + ' ' + numero, date: data.fecha }
        ).catch(e => console.warn('[guardarOTE] gasto:', e));
      }
    }

    /* Ingreso si se guarda como pagado */
    if (data.estado === 'pagado' && data.total > 0) {
      onOrderDelivered(data).catch(e => { if (!String(e).includes('ya está')) console.warn('[guardarOTE] onOrderDelivered:', e); });
    }

    /* Upsert cliente */
    upsertCliente({ nombre: data.cliente_nombre, cuit: data.cliente_cuit,
      telefono: data.cliente_telefono, direccion: data.cliente_direccion,
      ciudad: data.cliente_ciudad, provincia: data.cliente_provincia }, numero)
      .catch(e => console.warn('[guardarOTE] upsertCliente:', e));

    /* Estimado rentabilidad */
    registrarEstimado(data).catch(e => console.warn('[guardarOTE] registrarEstimado:', e));

    /* Log */
    await logEvent(db, {
      type: 'ORDER_CREATED', message: `OTE creada: ${numero}`,
      ref: numero, data: { cliente: data.cliente_nombre, servicio: data.tipo_servicio, total: data.total }
    });

    /* Archivar PRE de origen */
    if (data.numPresupuesto) {
      _archivarPREOrigen(db, data.numPresupuesto, numero);
    }

    invalidateCache();

    /* Si esta OTE/Visita salió de un turno de la agenda, darlo por realizado */
    const _turnoId = store.get('ote.turnoOrigenId');
    if (_turnoId && window.__concluirTurnoAuto) {
      window.__concluirTurnoAuto(_turnoId).catch(e => console.warn('[guardarOTE] concluir turno:', e));
    }

    /* Feedback */
    store.set('ote.guardadoId', numero);
    cerrarFormularioOTE();
    _abrirConfirmacionOTE(numero, data);
    showToast(`✓ OTE ${numero} guardada`, 'success');
    bus.emit('panel:refresh', {});

  } catch(err) {
    console.error('[guardarOTE]', err);
    showToast('❌ ' + mensajeAmigable(err), 'error');
  }
}

async function _archivarPREOrigen(db, numPRE, numOTE) {
  try {
    const pre = await dbGet(db, 'presupuestos', numPRE);
    if (!pre || pre.archivado) return;
    pre.estado           = 'aprobado';
    pre.archivado        = true;
    pre.convertido_a_ote = numOTE;
    pre.fecha_conversion = new Date().toISOString();
    await dbPut(db, 'presupuestos', pre);
    invalidateCache('presupuestos');
    await logEvent(db, {
      type: 'ORDER_STATE_CHANGED',
      message: `PRE ${numPRE} archivado → convertido a ${numOTE}`,
      ref: numPRE
    });
  } catch(e) { console.warn('[_archivarPREOrigen]', e); }
}

function _abrirConfirmacionOTE(numero, data) {
  const ok = document.getElementById('modal-ote-ok');
  if (!ok) return;
  const body = document.getElementById('modal-ote-ok-body');
  if (body) {
    body.innerHTML =
      `<div class="card">
        <div class="row-sb"><span class="dim txt-sm">Número</span><span class="bold mono">${escapeHtml(numero)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Cliente</span><span>${escapeHtml(data.cliente_nombre)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Servicio</span><span>${escapeHtml(data.tipo_servicio)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Total</span><span class="bold">${pesos(data.total)}</span></div>
      </div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="imprimirOTE_A4('${escapeHtml(numero)}')">🖨️ PDF A4</button>
      <button class="btn btn-success btn-block btn-sm" type="button" onclick="whatsappOTEGuardada('${escapeHtml(numero)}')">💬 Enviar WhatsApp</button>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="_programarMantDesde('OTE','${escapeHtml(numero)}')">🔧 Programar mantenimiento</button>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="abrirGaleriaFotos('${escapeHtml(numero)}')">📷 Fotos del trabajo</button>`;
  }
  /* Datos para WhatsApp y preset de mantenimiento */
  try {
    window.__oteGuardada = {
      numero,
      cliente_nombre:   data.cliente_nombre || '',
      cliente_telefono: data.cliente_telefono || '',
      servicio:         data.tipo_servicio || '',
      total:            parseFloat(data.total) || 0
    };
    window.__ultimoEquipo = {
      origen: numero,
      cliente_nombre: data.cliente_nombre || '',
      cliente_telefono: data.cliente_telefono || '',
      equipo: data.tipo_servicio || '',
      base: data.base || 'SMA'
    };
  } catch(e) {}
  ok.classList.add('active');
}

/* WhatsApp desde la confirmación de OTE recién guardada */
window.whatsappOTEGuardada = async (numero) => {
  const g = window.__oteGuardada || {};
  let msg = `Hola ${g.cliente_nombre || ''}! Te paso el detalle de tu orden ${numero} en ELECTROMEL.`;
  if (g.servicio)  msg += `\n\nServicio: ${g.servicio}`;
  if (g.total > 0) msg += `\nTotal: $${(g.total).toLocaleString('es-AR')}`;
  msg += `\n\n¡Gracias por confiar en nosotros!`;
  try {
    const { openWhatsApp } = await import('../services/whatsapp.js');
    openWhatsApp(g.cliente_telefono, msg);
  } catch(e) { console.warn('[whatsappOTEGuardada]', e); showToast('No se pudo abrir WhatsApp', 'error'); }
};

/* ── crearOTEdesdePRE ────────────────────────────────────── */
export async function crearOTEdesdePRE(numPRE) {
  const db = store.get('db');
  if (!db || !numPRE) return;

  try {
    const pre = await dbGet(db, 'presupuestos', numPRE);
    if (!pre) { showToast('❌ PRE no encontrado', 'error'); return; }

    await abrirFormularioOTE();

    const modal = document.getElementById('modal-ote');
    modalReady(modal, () => {
      const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

      v('ote-cliente-nombre',   pre.cliente_nombre);
      v('ote-cliente-cuit',     pre.cliente_cuit);
      v('ote-cliente-tel',      pre.cliente_telefono);
      v('ote-cliente-dir',      pre.cliente_direccion);
      v('ote-cliente-cp',       pre.cliente_cp);
      v('ote-cliente-ciudad',   pre.cliente_ciudad);
      v('ote-cliente-provincia', pre.cliente_provincia);
      v('ote-tipo-servicio',    pre.tipo_servicio);
      v('ote-base',             pre.base || 'SMA');
      v('ote-numPresupuesto',   pre.numero);

      if (pre.descripcion) {
        const descCont = document.getElementById('ote-desc-items');
        if (descCont) {
          descCont.innerHTML = '';
          pre.descripcion.split('\n').filter(l => l.trim()).forEach(linea => {
            descCont.appendChild(_crearDescItemOTE(linea.trim()));
          });
          if (!descCont.children.length) descCont.appendChild(_crearDescItemOTE());
        }
      }

      const trList = document.getElementById('ote-trabajo-list');
      if (trList) { trList.innerHTML = ''; (pre.trabajo_items || []).forEach(it => crearFilaTabular('ote-trabajo-list', it)); }

      const matList = document.getElementById('ote-materiales-list');
      if (matList) { matList.innerHTML = ''; (pre.materiales_items || []).forEach(it => crearFilaTabular('ote-materiales-list', it)); }

      v('ote-mano-obra', pre.mano_obra || 0);
      v('ote-viatico',   pre.viatico   || 0);

      recalcOTETotal();

      const banner = document.getElementById('ote-from-pre-banner');
      const numEl  = document.getElementById('ote-from-pre-num');
      if (banner) banner.classList.remove('hide');
      if (numEl)  numEl.textContent = pre.numero;

      store.set('ote.presupuestoOrigenId', pre.numero);
      showToast(`📋 Datos cargados desde ${pre.numero}`, 'success');
    });
  } catch(e) {
    console.error('[crearOTEdesdePRE]', e);
    showToast('❌ Error al cargar PRE', 'error');
  }
}

export function crearOTEdesdePREActual() {
  const numero = store.get('pre.guardadoId');
  if (!numero) { showToast('⚠️ No hay PRE para convertir', 'warn'); return; }
  document.getElementById('modal-pre-ok')?.classList.remove('active');
  crearOTEdesdePRE(numero);
}

/* ── Visita Técnica rápida ──────────────────────────────────
   Atajo: abre el formulario OTE precargado como visita técnica,
   para registrar/cobrar una visita sin cargar toda la orden. */
export function abrirFormularioVisita(preset = null) {
  abrirFormularioOTE({
    ...(preset && typeof preset === 'object' ? preset : {}),
    tipo_servicio: 'Visita técnica',
    desc_servicio: 'Visita técnica'
  });
}
