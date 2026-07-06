/**
 * ELECTROMEL — pre.js
 * Módulo de Presupuestos (PRE).
 * Gestiona el formulario de presupuesto, modo nuevo y modo edición,
 * descuentos porcentuales, lista de materiales del cliente,
 * guardado y conversión a OTE.
 */

import { store }              from '../core/store.js';
import { dbGet, dbPut, getNextNumber, peekNextNumber,
         logEvent, getBaseForDate, invalidateCache } from '../core/db.js';
import { showToast }          from '../core/ui.js';
import { pesos, escapeHtml, mensajeAmigable, fechaHoy }  from '../core/utils.js';
import { upsertCliente, initAutocompletado } from '../services/clientes.js';
import { registrarEstimado }  from '../services/rentabilidad.js';
import { imprimirPRE_A4, imprimirPRE_ListaMateriales } from '../services/pdf/ote.pdf.js';
import { crearFilaTabular, leerTabular, syncItemsHidden, poblarItems } from './ing.js';
import { bus }                from '../core/store.js';
import { initPlantillasInline, abrirMiniPanelPlantillas } from './plantillas/index.js';

export { imprimirPRE_A4, imprimirPRE_ListaMateriales };

/* ── Helper: crear item-row de descripción con plantillas ── */
function _crearDescItemPRE(texto) {
  const row   = document.createElement('div');
  row.className = 'item-row';

  const bullet = document.createElement('span');
  bullet.className   = 'item-bullet';
  bullet.textContent = '●';

  const wrap = document.createElement('div');
  wrap.className = 'item-ta-wrap';

  const ta = document.createElement('textarea');
  ta.rows        = 2;
  ta.className   = 'pre-desc-item';
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

  initPlantillasInline(ta, 'diagnostico');
  return row;
}

/** Agrega un nuevo item de descripción con plantillas al contenedor */
export function addDescItemPRE() {
  const cont = document.getElementById('pre-desc-items');
  if (cont) cont.appendChild(_crearDescItemPRE());
}

/* ── Helpers de tabla PRE ─────────────────────────────── */
export function addTrabajoPRE(opts)   { return crearFilaTabular('pre-trabajo-list',    opts); }
export function addMaterialPRE(opts)  { return crearFilaTabular('pre-materiales-list', opts); }

/** Fila de material a proveer por el cliente (sin precio) */
export function addMaterialClientePRE(opts = {}) {
  const container = document.getElementById('pre-materiales-cliente-list');
  if (!container) return null;

  const row = document.createElement('div');
  row.className = 'matcli-row';

  const cant = document.createElement('input');
  cant.type = 'number'; cant.step = '0.01'; cant.min = '0';
  cant.placeholder = 'Cant'; cant.className = 'matcli-cant';
  if (opts.cantidad) cant.value = opts.cantidad;

  const det = document.createElement('input');
  det.type = 'text'; det.placeholder = 'Detalle del material';
  det.className = 'matcli-detalle';
  if (opts.detalle) det.value = opts.detalle;

  const nota = document.createElement('input');
  nota.type = 'text'; nota.placeholder = 'Nota (opcional)';
  nota.className = 'matcli-nota';
  if (opts.nota) nota.value = opts.nota;

  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'tabular-remove'; rm.textContent = '×';
  rm.addEventListener('click', () => container.removeChild(row));

  row.appendChild(cant); row.appendChild(det); row.appendChild(nota); row.appendChild(rm);
  container.appendChild(row);
  return row;
}

function _leerMaterialesCliente() {
  const container = document.getElementById('pre-materiales-cliente-list');
  if (!container) return [];
  const out = [];
  container.querySelectorAll('.matcli-row').forEach(r => {
    const cant  = parseFloat(r.querySelector('.matcli-cant')?.value) || 0;
    const det   = r.querySelector('.matcli-detalle')?.value.trim() || '';
    const nota  = r.querySelector('.matcli-nota')?.value.trim()    || '';
    if (cant || det || nota) out.push({ cantidad: cant, detalle: det, nota });
  });
  return out;
}

/** Recalcula subtotales, total y descuento porcentual */
export function recalcPRETotal() {
  const trab    = leerTabular('pre-trabajo-list');
  const mat     = leerTabular('pre-materiales-list');
  const subTrab = trab.reduce((a, x) => a + x.subtotal, 0);
  const subMat  = mat.reduce((a,  x) => a + x.subtotal, 0);
  const mo      = parseFloat(document.getElementById('pre-mano-obra')?.value)  || 0;
  const vi      = parseFloat(document.getElementById('pre-viatico')?.value)    || 0;
  const total   = subTrab + subMat + mo + vi;

  const descEl  = document.getElementById('pre-descuento');
  const descPct = Math.max(0, Math.min(100, parseFloat(descEl?.value) || 0));
  const totalConDesc = total * (1 - descPct / 100);

  const fmt = n => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const el = id => document.getElementById(id);
  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };

  set('pre-trabajo-subtotal',    fmt(subTrab));
  set('pre-materiales-subtotal', fmt(subMat));
  set('pre-total-display',       fmt(total));

  const totalInput = el('pre-total');
  if (totalInput) totalInput.value = String(descPct > 0 ? totalConDesc : total);

  const descDisplay = el('pre-total-con-descuento');
  if (descDisplay) {
    if (descPct > 0) {
      descDisplay.textContent = fmt(totalConDesc) + ` (-${descPct}%)`;
      descDisplay.style.color = 'var(--exito)';
    } else {
      descDisplay.textContent = fmt(total);
      descDisplay.style.color = '';
    }
  }
}

/* ── abrirFormularioPRE ─────────────────────────────────── */
export async function abrirFormularioPRE(preset = null) {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  store.set('pre.editandoId', null);
  _resetFormularioPRE();
  initAutocompletado('pre');

  const preview = document.getElementById('pre-numero-preview');
  if (preview) peekNextNumber(db, 'PRE').then(n => { preview.textContent = n; }).catch(() => {});

  const hoy = fechaHoy();
  const fechaEl = document.getElementById('pre-fecha');
  if (fechaEl) fechaEl.value = hoy;

  getBaseForDate(db, hoy).then(base => {
    const sel = document.getElementById('pre-base');
    if (sel && (base === 'SMA' || base === 'NQN')) sel.value = base;
  }).catch(() => {});

  addTrabajoPRE();

  /* Precarga (ej: desde un turno de agenda) */
  if (preset && typeof preset === 'object') {
    const set = (id, v) => { const e = document.getElementById(id); if (e && v != null && v !== '') e.value = v; };
    set('pre-cliente-nombre',   preset.cliente_nombre);
    set('pre-cliente-tel',      preset.cliente_telefono);
    set('pre-cliente-dir',      preset.cliente_direccion);
    set('pre-cliente-ciudad',   preset.cliente_ciudad);
    if (preset.fecha) set('pre-fecha', preset.fecha);
    if (preset.base === 'SMA' || preset.base === 'NQN') set('pre-base', preset.base);
    store.set('pre.turnoOrigenId', preset._turnoOrigenId || null);
  } else {
    store.set('pre.turnoOrigenId', null);
  }

  const titleEl = document.querySelector('#modal-pre .modal-title');
  if (titleEl) titleEl.textContent = '📝 NUEVO PRESUPUESTO';

  document.getElementById('modal-pre')?.classList.add('active');
}

export function cerrarFormularioPRE() {
  document.getElementById('modal-pre')?.classList.remove('active');
  store.set('pre.editandoId', null);
  store.set('pre.turnoOrigenId', null);
  const titleEl = document.querySelector('#modal-pre .modal-title');
  if (titleEl) titleEl.textContent = '📝 NUEVO PRESUPUESTO';
}

/* ── abrirEdicionPRE ────────────────────────────────────── */
export async function abrirEdicionPRE(numero) {
  const db = store.get('db');
  if (!db || !numero) return;

  try {
    const pre = await dbGet(db, 'presupuestos', numero);
    if (!pre) { showToast('❌ PRE no encontrado', 'error'); return; }

    store.set('pre.editandoId', numero);
    _resetFormularioPRE();

    const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    v('pre-cliente-nombre',   pre.cliente_nombre);
    v('pre-cliente-cuit',     pre.cliente_cuit);
    v('pre-cliente-tel',      pre.cliente_telefono);
    v('pre-cliente-dir',      pre.cliente_direccion);
    v('pre-cliente-cp',       pre.cliente_cp);
    v('pre-cliente-ciudad',   pre.cliente_ciudad);
    v('pre-cliente-provincia', pre.cliente_provincia);
    v('pre-origen-mkt',        pre.origen_marketing);
    v('pre-tipo-servicio',    pre.tipo_servicio);
    v('pre-equipo-modelo',    pre.equipo_modelo);
    v('pre-problema',         pre.problema);
    v('pre-base',             pre.base || 'SMA');
    v('pre-estado',           pre.estado || 'pendiente');
    v('pre-garantia',         pre.garantia || '30 días');
    v('pre-tiempo',           pre.tiempo_estimado);
    v('pre-vigencia',         pre.vigencia_dias || '10');
    v('pre-descuento',        pre.descuento_pct  || '0');
    v('pre-mano-obra',        pre.mano_obra      || '0');
    v('pre-viatico',          pre.viatico        || '0');
    v('pre-nota-importante',  pre.nota_importante);
    if (pre.fecha) v('pre-fecha', pre.fecha);

    /* Descripción */
    if (pre.descripcion) {
      const descCont = document.getElementById('pre-desc-items');
      if (descCont) {
        descCont.innerHTML = '';
        pre.descripcion.split('\n').filter(l => l.trim()).forEach(linea => {
          descCont.appendChild(_crearDescItemPRE(linea.trim()));
        });
        if (!descCont.children.length) descCont.appendChild(_crearDescItemPRE());
      }
    }

    /* Tablas */
    const trList  = document.getElementById('pre-trabajo-list');
    const matList = document.getElementById('pre-materiales-list');
    const cliList = document.getElementById('pre-materiales-cliente-list');
    if (trList)  { trList.innerHTML  = ''; (pre.trabajo_items || []).forEach(it => crearFilaTabular('pre-trabajo-list',    it)); }
    if (matList) { matList.innerHTML = ''; (pre.materiales_items || []).forEach(it => crearFilaTabular('pre-materiales-list', it)); }
    if (cliList) { cliList.innerHTML = ''; (pre.materiales_cliente || []).forEach(it => addMaterialClientePRE(it)); }

    recalcPRETotal();

    const titleEl = document.querySelector('#modal-pre .modal-title');
    if (titleEl) titleEl.textContent = '✏️ EDITAR ' + numero;

    document.getElementById('modal-pre')?.classList.add('active');
  } catch(e) {
    console.error('[abrirEdicionPRE]', e);
    showToast('❌ Error al cargar PRE', 'error');
  }
}

function _resetFormularioPRE() {
  [
    'pre-cliente-nombre','pre-cliente-cuit','pre-cliente-tel','pre-cliente-dir',
    'pre-cliente-cp','pre-cliente-ciudad','pre-cliente-provincia','pre-origen-mkt',
    'pre-tipo-servicio','pre-equipo-modelo','pre-problema','pre-fecha',
    'pre-mano-obra','pre-viatico','pre-total',
    'pre-descripcion','pre-nota-importante','pre-tiempo','pre-descuento'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = el.type === 'number' ? '0' : '';
  });

  const d = id => { const e = document.getElementById(id); if (e) return e; };
  const set = (id, v) => { const e = d(id); if (e) e.value = v; };

  set('pre-base',     'SMA');
  set('pre-estado',   'pendiente');
  set('pre-garantia', '30 días');
  set('pre-vigencia', '10');

  ['pre-trabajo-list','pre-materiales-list','pre-materiales-cliente-list'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  const descItems = document.getElementById('pre-desc-items');
  if (descItems) {
    descItems.innerHTML = '';
    descItems.appendChild(_crearDescItemPRE());
  }

  ['pre-total-display','pre-trabajo-subtotal','pre-materiales-subtotal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '$0,00';
  });
}

/* ── _readPRE ─────────────────────────────────────────── */
function _readPRE() {
  const v   = id => (document.getElementById(id)?.value || '').trim();
  const num = id => parseFloat(document.getElementById(id)?.value) || 0;

  const nombre = v('pre-cliente-nombre');
  if (!nombre) { showToast('Falta el nombre del cliente', 'warn'); document.getElementById('pre-cliente-nombre')?.focus(); return null; }
  const tipo = v('pre-tipo-servicio');
  if (!tipo)  { showToast('Elegí un tipo de servicio', 'warn'); document.getElementById('pre-tipo-servicio')?.focus(); return null; }

  syncItemsHidden();

  const trabajoItems    = leerTabular('pre-trabajo-list');
  const materialesItems = leerTabular('pre-materiales-list');
  const matCliente      = _leerMaterialesCliente();

  /* Un presupuesto necesita al menos un ítem cargado */
  if (!trabajoItems.length && !materialesItems.length && !matCliente.length) {
    showToast('⚠️ Agregá al menos un trabajo o material al presupuesto', 'warn');
    return null;
  }

  const subTrab  = trabajoItems.reduce((a, x) => a + x.subtotal, 0);
  const subMat   = materialesItems.reduce((a, x) => a + x.subtotal, 0);
  const mo       = num('pre-mano-obra');
  const vi       = num('pre-viatico');
  const total    = subTrab + subMat + mo + vi;
  const descPct  = Math.max(0, Math.min(100, parseFloat(document.getElementById('pre-descuento')?.value) || 0));
  const totalFinal = descPct > 0 ? total * (1 - descPct / 100) : total;

  return {
    cliente_nombre:    nombre,
    cliente_cuit:      v('pre-cliente-cuit'),
    cliente_telefono:  v('pre-cliente-tel'),
    cliente_direccion: v('pre-cliente-dir'),
    cliente_cp:        v('pre-cliente-cp'),
    cliente_ciudad:    v('pre-cliente-ciudad'),
    cliente_provincia: v('pre-cliente-provincia'),
    origen_marketing:  v('pre-origen-mkt') || '',
    tipo_servicio:     tipo,
    equipo_modelo:     v('pre-equipo-modelo'),
    problema:          v('pre-problema'),
    base:              v('pre-base')    || 'SMA',
    zona:              v('pre-zona') || '',
    anio:              new Date().getFullYear(),
    estado:            v('pre-estado') || 'pendiente',
    fecha:             v('pre-fecha') || fechaHoy(),
    garantia:          v('pre-garantia') || '30 días',
    tiempo_estimado:   v('pre-tiempo'),
    vigencia_dias:     v('pre-vigencia') || '10',
    descuento_pct:     descPct,
    descripcion:       v('pre-descripcion'),
    nota_importante:   v('pre-nota-importante'),
    trabajo_items:     trabajoItems,
    materiales_items:  materialesItems,
    materiales_cliente: matCliente,
    sub_trabajo:       subTrab,
    sub_materiales:    subMat,
    mano_obra:         mo,
    viatico:           vi,
    total:             totalFinal,
    actualizado_at:    new Date().toISOString()
  };
}

/* ── guardarPRE ─────────────────────────────────────────── */
export async function guardarPRE() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  const data = _readPRE();
  if (!data) return;

  const editandoId = store.get('pre.editandoId');

  try {
    let numero;
    if (editandoId) {
      /* Modo edición: preservar número, creado_at y pagos */
      numero = editandoId;
      data.numero = numero;
      const previo = await dbGet(db, 'presupuestos', numero);
      if (previo) {
        data.creado_at = previo.creado_at;
        data.archivado = previo.archivado || false;
        if (previo.r) data.r = previo.r;
      }
    } else {
      numero = await getNextNumber(db, 'PRE');
      data.numero    = numero;
      data.creado_at = new Date().toISOString();
      data.archivado = false;
    }

    await dbPut(db, 'presupuestos', data);
    invalidateCache();

    /* Upsert cliente */
    upsertCliente({ nombre: data.cliente_nombre, cuit: data.cliente_cuit,
      telefono: data.cliente_telefono, direccion: data.cliente_direccion,
      ciudad: data.cliente_ciudad, provincia: data.cliente_provincia }, numero)
      .catch(e => console.warn('[guardarPRE] upsertCliente:', e));

    /* Estimado solo en modo nuevo */
    if (!editandoId) {
      registrarEstimado(data).catch(e => console.warn('[guardarPRE] registrarEstimado:', e));
    }

    await logEvent(db, {
      type:    editandoId ? 'ORDER_UPDATED' : 'ORDER_CREATED',
      message: (editandoId ? 'PRE editado: ' : 'PRE creado: ') + numero,
      ref:     numero,
      data:    { cliente: data.cliente_nombre, servicio: data.tipo_servicio, total: data.total }
    });

    /* Feedback */
    store.set('pre.guardadoId', numero);

    /* Si este PRE salió de un turno de la agenda, darlo por realizado */
    const _turnoId = store.get('pre.turnoOrigenId');
    if (_turnoId && window.__concluirTurnoAuto) {
      window.__concluirTurnoAuto(_turnoId).catch(e => console.warn('[guardarPRE] concluir turno:', e));
    }

    cerrarFormularioPRE();
    _abrirConfirmacionPRE(numero, data);
    showToast(`✓ PRE ${numero} ${editandoId ? 'actualizado' : 'guardado'}`, 'success');
    bus.emit('panel:refresh', {});

  } catch(err) {
    console.error('[guardarPRE]', err);
    showToast('❌ ' + mensajeAmigable(err), 'error');
  }
}

function _abrirConfirmacionPRE(numero, data) {
  const ok = document.getElementById('modal-pre-ok');
  if (!ok) return;
  const body = document.getElementById('modal-pre-ok-body');
  if (body) {
    const tieneLista = (data.materiales_cliente || []).length > 0;
    body.innerHTML =
      `<div class="card">
        <div class="row-sb"><span class="dim txt-sm">Número</span><span class="bold mono">${escapeHtml(numero)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Cliente</span><span>${escapeHtml(data.cliente_nombre)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Servicio</span><span>${escapeHtml(data.tipo_servicio)}</span></div>
        <div class="row-sb"><span class="dim txt-sm">Total</span><span class="bold">${pesos(data.total)}</span></div>
      </div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="imprimirPRE_A4('${escapeHtml(numero)}')">🖨️ PDF Presupuesto</button>
      <button class="btn btn-success btn-block btn-sm" type="button" onclick="whatsappPREGuardado('${escapeHtml(numero)}')">💬 Enviar WhatsApp</button>
      ${tieneLista ? `<button class="btn btn-ghost btn-block btn-sm" type="button" onclick="imprimirPRE_ListaMateriales('${escapeHtml(numero)}')">📋 Lista materiales cliente</button>` : ''}`;
  }
  /* Datos para WhatsApp */
  try {
    window.__preGuardado = {
      numero,
      cliente_nombre:   data.cliente_nombre || '',
      cliente_telefono: data.cliente_telefono || '',
      servicio:         data.tipo_servicio || '',
      total:            parseFloat(data.total) || 0
    };
  } catch(e) {}
  ok.classList.add('active');
}

/* WhatsApp desde la confirmación de PRE recién guardado */
window.whatsappPREGuardado = async (numero) => {
  const g = window.__preGuardado || {};
  let msg = `Hola ${g.cliente_nombre || ''}! Te paso el presupuesto ${numero} de ELECTROMEL.`;
  if (g.servicio)  msg += `\n\nServicio: ${g.servicio}`;
  if (g.total > 0) msg += `\nTotal presupuestado: $${(g.total).toLocaleString('es-AR')}`;
  msg += `\n\nCualquier duda quedo a disposición. ¡Gracias!`;
  try {
    const { openWhatsApp } = await import('../services/whatsapp.js');
    openWhatsApp(g.cliente_telefono, msg);
  } catch(e) { console.warn('[whatsappPREGuardado]', e); showToast('No se pudo abrir WhatsApp', 'error'); }
};
