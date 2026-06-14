/**
 * ELECTROMEL — ott.js
 * Módulo Orden de Trabajo Taller (OTT).
 */

import { store, bus }              from '../core/store.js';
import { dbGet, dbPut, dbGetAll, getNextNumber, peekNextNumber,
         getBaseForDate, getCfg, logEvent, invalidateCache } from '../core/db.js';
import { showToast, openModal, closeModal, actualizarInfoSistema } from '../core/ui.js';
import { pesos, fechaHoy, STORE_POR_TIPO, modalReady, mensajeAmigable } from '../core/utils.js';
import { initAutocompletado, upsertCliente } from '../services/clientes.js';
import { registrarEstimado, cerrarRegistroReal } from '../services/rentabilidad.js';
import { onOrderDelivered, onPartialPayment, onOrderExpense, adjustOrderExpense } from '../services/finance.js';
import { imprimirOTT_A4 } from '../services/pdf/ott.pdf.js';
import { registrarEntrega, vincularOTTGarantia } from '../services/garantia.js';
import { initPlantillasInline, abrirMiniPanelPlantillas } from './plantillas/index.js';

/* ── helpers ──────────────────────────────────────────────*/
const v  = id => { const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; };
const nv = id => { const el = document.getElementById(id); if(!el) return 0; const x=parseFloat(el.value); return isFinite(x)&&x>0?x:0; };
const el = id => document.getElementById(id);

/* ── Mapa item-class → categoría de plantilla ───────────── */
const ITEM_PLANTILLA_CAT = {
  'item-diag':    'diagnostico',
  'item-trabajo': 'trabajo'
};

/* ── _addItem / _removeItem / _syncItemsHidden ─────────── */
export function addItem(containerId, itemClass, rows) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  rows = rows || 2;

  const categoria = ITEM_PLANTILLA_CAT[itemClass] || null;

  const row = document.createElement('div');
  row.className = 'item-row ' + (itemClass || 'item-row');

  /* Wrapper del textarea + dropdown inline */
  const taWrap = document.createElement('div');
  taWrap.className = 'item-ta-wrap';
  taWrap.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;';

  const ta = document.createElement('textarea');
  ta.className   = itemClass || 'item-text';
  ta.rows        = rows;
  ta.placeholder = categoria === 'diagnostico'
    ? 'Diagnóstico — escribí o usá 📋...'
    : categoria === 'trabajo'
      ? 'Trabajo a realizar — escribí o usá 📋...'
      : 'Escribir aquí...';

  taWrap.appendChild(ta);

  /* Botón plantillas 📋 */
  const btnP = document.createElement('button');
  btnP.type      = 'button';
  btnP.className = 'item-plantillas-btn';
  btnP.title     = 'Plantillas rápidas';
  btnP.textContent = '📋';
  btnP.addEventListener('click', e => {
    e.stopPropagation();
    store.set('ui.lastActiveField', ta);
    if (categoria) {
      abrirMiniPanelPlantillas(ta, categoria);
    } else {
      abrirMiniPanelPlantillas(ta, 'diagnostico');
    }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'item-del btn-icon';
  delBtn.type      = 'button';
  delBtn.title     = 'Eliminar';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => removeItem(delBtn));

  /* Barra de acciones debajo del textarea */
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.appendChild(btnP);

  taWrap.appendChild(actions);
  row.appendChild(taWrap);
  row.appendChild(delBtn);
  cont.appendChild(row);
  ta.focus();

  /* Inicializar autocomplete inline si tiene categoría */
  if (categoria) {
    initPlantillasInline(ta, categoria);
  }

  return row;
}

export function removeItem(btn) {
  const row = btn?.closest?.('.item-row');
  if (row) row.remove();
}

/* Sincroniza los item-rows de una lista a un hidden input */
export function syncItemsHidden() {
  const ITEM_HIDDEN_MAP = {
    'ott-diag-items':    'ott-diagnostico',
    'ott-trabajo-items': 'ott-trabajo',
    'ote-desc-items':    'ote-desc-servicio',
    'pre-desc-items':    'pre-descripcion'
  };
  Object.entries(ITEM_HIDDEN_MAP).forEach(([contId, hidId]) => {
    const cont   = document.getElementById(contId);
    const hidden = document.getElementById(hidId);
    if (!cont || !hidden) return;
    const lines = Array.from(cont.querySelectorAll('textarea,input[type=text]'))
      .map(ta => (ta.value || '').trim())
      .filter(Boolean);
    hidden.value = lines.join('\n');
  });
}

function _initListaItems(containerId, itemClass, rows) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  if (cont.querySelectorAll('.item-row').length === 0) addItem(containerId, itemClass, rows || 2);
}

/* ── _recalcularSaldoOTT ──────────────────────────────── */
window._recalcularSaldoOTT = function(origen) {
  const total = parseFloat(el('ott-total')?.value) || 0;
  const pctEl = el('ott-adelanto-pct');
  const monEl = el('ott-adelanto-monto');
  const saldoEl = el('ott-saldo');
  let pct = parseFloat(pctEl?.value) || 0;
  let mon = parseFloat(monEl?.value) || 0;
  if (origen === 'pct')        { mon = Math.round(total * pct / 100); if(monEl) monEl.value = mon || ''; }
  else if (origen === 'monto') { pct = total > 0 ? Math.round((mon/total)*100) : 0; if(pctEl) pctEl.value = pct || ''; }
  else {
    if (pct > 0) { mon = Math.round(total * pct / 100); if(monEl) monEl.value = mon || ''; }
    else if (mon > 0 && total > 0) { pct = Math.round((mon/total)*100); if(pctEl) pctEl.value = pct || ''; }
  }
  if (saldoEl) saldoEl.value = pesos(Math.max(0, total - mon));
};

window._onEstadoOTTChange = function() {
  const estado = el('ott-estado')?.value || '';
  const retornoBlock = el('ott-retorno-fields');
  if (!retornoBlock) return;
  const estadosRetorno = ['prep_envio','enviado','entregado','rechazada_entregada'];
  retornoBlock.classList.toggle('hide', !estadosRetorno.includes(estado));
};

/* ── abrirFormularioOTT ──────────────────────────────── */
export async function abrirFormularioOTT() {
  const db = store.get('db');
  store.set('ott.editandoId', null);
  store.set('ott.ingresoOrigenId', null);

  _resetFormularioOTT();
  initAutocompletado('ott');

  const n = await peekNextNumber(db, 'OTT');
  const prev = el('ott-numero-preview'); if (prev) prev.textContent = n;

  const fechaEl = el('ott-fecha'); if (fechaEl) fechaEl.value = fechaHoy();
  const base = await getBaseForDate(db, fechaHoy());
  const baseEl = el('ott-base'); if (baseEl) baseEl.value = base;

  const [ciudad, provincia] = await Promise.all([getCfg(db,'empresa_ciudad',''), getCfg(db,'empresa_provincia','')]);
  const elC = el('ott-cliente-ciudad'); const elP = el('ott-cliente-provincia');
  if (elC && !elC.value && ciudad)    elC.value = ciudad;
  if (elP && !elP.value && provincia) elP.value = provincia;

  _initListaItems('ott-diag-items',   'item-diag',   2);
  _initListaItems('ott-trabajo-items','item-trabajo', 2);
  window._onEstadoOTTChange?.();

  openModal('modal-ott');
  setTimeout(() => el('ott-cliente-nombre')?.focus(), 200);
}

export function cerrarFormularioOTT() {
  closeModal('modal-ott');
  store.set('ott.editandoId', null);
  store.set('ott.ingresoOrigenId', null);
}

function _resetFormularioOTT() {
  ['ott-cliente-nombre','ott-cliente-cuit','ott-cliente-tel','ott-cliente-dir',
   'ott-cliente-cp','ott-cliente-ciudad','ott-cliente-provincia',
   'ott-equipo-marca','ott-equipo-modelo','ott-falla','ott-error',
   'ott-numIngreso','ott-total','ott-adelanto-pct','ott-adelanto-monto',
   'ott-garantia','ott-tiempo','ott-ent-transporte','ott-ent-guia','ott-ent-costo',
   'ott-ret-transporte','ott-ret-guia','ott-ret-costo','ott-fecha',
   'ott-diagnostico','ott-trabajo'].forEach(id => { const e=el(id); if(e) e.value=''; });
  const tipo = el('ott-equipo-tipo');    if(tipo)   tipo.selectedIndex = 0;
  const estado = el('ott-estado');       if(estado) estado.value = 'ingresado';
  const base = el('ott-base');           if(base)   base.selectedIndex = 0;
  const saldo = el('ott-saldo');         if(saldo)  saldo.value = pesos(0);
  ['ott-diag-items','ott-trabajo-items'].forEach(id => { const c=el(id); if(c) c.innerHTML=''; });
  el('ott-from-ing-banner')?.classList.add('hide');
  el('ott-numIngreso-wrap')?.classList.add('hide');
}

/* ── _readOTT ────────────────────────────────────────── */
function _readOTT() {
  syncItemsHidden();
  const nombre = v('ott-cliente-nombre');
  if (!nombre) { showToast('⚠️ Falta nombre del cliente','warn'); el('ott-cliente-nombre')?.focus(); return null; }
  const total = nv('ott-total');
  if (total <= 0 && !document.getElementById('ott-es-garantia')?.checked) {
    showToast('⚠️ Falta el total','warn'); el('ott-total')?.focus(); return null;
  }
  const fecha = v('ott-fecha') || fechaHoy();
  const esGarantia    = !!document.getElementById('ott-es-garantia')?.checked;
  const ottGarOrigen  = esGarantia ? (v('ott-garantia-origen') || '').toUpperCase().trim() : '';
  const ingGarantia   = esGarantia ? v('ott-ing-garantia') : '';
  const cobroExtra    = esGarantia ? nv('ott-cobro-extra') : 0;
  const motivoCobro   = esGarantia ? v('ott-motivo-cobro-extra') : '';

  /* Total real: si es garantía puede ser 0 o el cobro extra */
  const totalFinal = esGarantia ? cobroExtra : total;

  return {
    fecha, base: v('ott-base')||'SMA',
    zona: v('ott-zona') || '',
    anio: parseInt((fecha||'').slice(0,4)) || new Date().getFullYear(),
    cliente_nombre: nombre, cliente_cuit: v('ott-cliente-cuit'),
    cliente_telefono: v('ott-cliente-tel'), cliente_direccion: v('ott-cliente-dir'),
    cliente_cp: v('ott-cliente-cp'), cliente_ciudad: v('ott-cliente-ciudad'),
    cliente_provincia: v('ott-cliente-provincia'),
    equipo_tipo: v('ott-equipo-tipo')||'Soldadora Inverter',
    equipo_marca: v('ott-equipo-marca'), equipo_modelo: v('ott-equipo-modelo'),
    equipo_falla: v('ott-falla'), equipo_error: v('ott-error'),
    numIngreso: v('ott-numIngreso'),
    diagnostico: v('ott-diagnostico'), trabajo: v('ott-trabajo'),
    total: totalFinal,
    adelanto_pct: parseFloat(el('ott-adelanto-pct')?.value)||0,
    adelanto: esGarantia ? 0 : nv('ott-adelanto-monto'),
    garantia: v('ott-garantia'), tiempo_estimado: v('ott-tiempo'),
    encomienda_entrada_transporte: v('ott-ent-transporte'),
    encomienda_entrada_guia: v('ott-ent-guia'),
    encomienda_entrada_costo: parseFloat(v('ott-ent-costo').replace(/[^\d.]/g,''))||0,
    encomienda_retorno_transporte: v('ott-ret-transporte'),
    encomienda_retorno_guia: v('ott-ret-guia'),
    encomienda_retorno_costo: nv('ott-ret-costo'),
    estado: v('ott-estado')||'ingresado',
    /* Garantía */
    es_garantia:          esGarantia,
    ott_garantia_origen:  ottGarOrigen  || null,
    ing_garantia:         ingGarantia  || null,
    cobro_extra:          cobroExtra,
    motivo_cobro_extra:   motivoCobro  || null,
    r: { pagos: [] }, creado_at: new Date().toISOString()
  };
}

/* ── guardarOTT ──────────────────────────────────────── */
export async function guardarOTT() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible','error'); return; }
  const data = _readOTT();
  if (!data) return;

  try {
    const editandoId = store.get('ott.editandoId');
    let numero;

    if (editandoId) {
      numero = editandoId; data.numero = numero;
      const previo = await dbGet(db,'ordenes',numero);
      if (previo?.r?.pagos) data.r = previo.r;
      if (previo?.creado_at) { data.creado_at = previo.creado_at; data.modificado_at = new Date().toISOString(); }
    } else {
      numero = await getNextNumber(db,'OTT'); data.numero = numero;
    }

    await dbPut(db,'ordenes',data);
    invalidateCache('ordenes');

    /* Egresos logísticos */
    await _registrarEgresosLogisticos(db, data);

    try { await upsertCliente(data, numero); } catch(e) { console.warn(e); }
    if (!editandoId) { try { await registrarEstimado(data); } catch(e) { console.warn(e); } }

    /* Archivar ING de origen */
    if (data.numIngreso && !editandoId) {
      try {
        const ing = await dbGet(db,'ingresos',data.numIngreso);
        if (ing && !ing.archivado) {
          ing.estado = 'archivado_por_ott'; ing.archivado = true;
          ing.convertido_a_ott = numero; ing.fecha_conversion = new Date().toISOString();
          await dbPut(db,'ingresos',ing); invalidateCache('ingresos');
        }
      } catch(e) { console.warn('[guardarOTT] archivar ING:', e); }
    }

    /* Entregado/pagado → fecha de entrega + cerrar rentabilidad */
    if (['entregado','pagado','rechazada_entregada'].includes(data.estado)) {
      try { await onOrderDelivered(data); } catch(e) { if (!String(e).includes('ya está')) console.warn(e); }
      try { await cerrarRegistroReal(numero, {
        ingreso: data.total,
        costo: (data.encomienda_retorno_costo||0)+(data.encomienda_entrada_costo||0),
        horas: 0
      }); } catch(e) { console.warn(e); }
      /* Guardar fecha_entrega y calcular fecha_fin_garantia */
      registrarEntrega(db, numero, data.fecha).catch(e => console.warn('[guardarOTT] registrarEntrega:', e));
    }

    /* Vincular a OTT de origen si es garantía */
    if (data.es_garantia && data.ott_garantia_origen) {
      vincularOTTGarantia(data.ott_garantia_origen, numero)
        .catch(e => console.warn('[guardarOTT] vincularOTTGarantia:', e));
    }

    await logEvent(db, {
      type: editandoId ? 'ORDER_UPDATED' : 'ORDER_CREATED',
      message: `OTT ${editandoId?'actualizada':'creada'} ${numero} — ${data.cliente_nombre}`,
      ref: numero, data: { tipo:'OTT', estado: data.estado, total: data.total }
    });

    store.set('ott.guardadoId', numero);
    cerrarFormularioOTT();
    showToast(`✅ ${numero} guardada`, 'success');
    _abrirConfirmacionOTT(numero, data);
    bus.emit('registro:guardado', { tipo:'OTT', numero, data });
    actualizarInfoSistema();

  } catch(err) {
    console.error('[guardarOTT]', err);
    showToast('❌ ' + mensajeAmigable(err), 'error');
  }
}

async function _registrarEgresosLogisticos(db, data) {
  const tareas = [];
  if ((data.encomienda_entrada_costo||0) > 0) tareas.push(_upsertEgresoLogistico(db, data, 'entrada'));
  if ((data.encomienda_retorno_costo||0) > 0) tareas.push(_upsertEgresoLogistico(db, data, 'retorno'));
  await Promise.all(tareas);
}

async function _upsertEgresoLogistico(db, data, tipo) {
  const tag    = `logistica_${tipo}:${data.numero}`;
  const monto  = tipo === 'entrada' ? (data.encomienda_entrada_costo||0) : (data.encomienda_retorno_costo||0);
  const transp = tipo === 'entrada' ? (data.encomienda_entrada_transporte||'') : (data.encomienda_retorno_transporte||'');
  const movs   = await dbGetAll(db, 'finance_movements', false);
  const previo = movs.find(m => m.notes?.includes(tag) && !m.is_adjustment);
  if (!previo) {
    return onOrderExpense(
      { numero: data.numero, cliente_nombre: data.cliente_nombre, base: data.base },
      { amount: monto, category: 'logistica', description: `Envio ${tipo} ${data.numero}${transp?' ('+transp+')':''}`, notes: tag, date: data.fecha }
    );
  } else if (Math.abs(previo.amount - monto) > 0.01) {
    return adjustOrderExpense(
      { numero: data.numero }, previo.transaction_id, { amount: monto, description: `Ajuste envio ${tipo} ${data.numero}` }
    );
  }
}

function _abrirConfirmacionOTT(numero, data) {
  const body = document.getElementById('modal-ott-ok-body');
  if (body) {
    const equipoTxt = [data.equipo_tipo, data.equipo_marca, data.equipo_modelo].filter(Boolean).join(' · ');
    body.innerHTML = `
      <div class="card">
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Número</span><span class="mono"><b>${numero}</b></span></div>
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Cliente</span><span>${(data.cliente_nombre || '')}</span></div>
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Equipo</span><span>${equipoTxt}</span></div>
      </div>`;
  }

  const footer = document.querySelector('#modal-ott-ok .modal-footer');
  if (footer) { footer.classList.add('modal-footer-stack'); footer.innerHTML = `
    <button class="btn btn-block mb-4" type="button" onclick="imprimirOTT_A4('${numero}')">🖨️ PDF A4</button>
    <button class="btn btn-success btn-block mb-4" type="button" onclick="abrirPagoParcial('${numero}')">💵 Registrar pago</button>
    <button class="btn btn-ghost btn-block mb-4" type="button" onclick="_programarMantDesde('OTT','${numero}')">🔧 Programar mantenimiento</button>
    <button class="btn btn-ghost btn-block mb-4" type="button" onclick="abrirGaleriaFotos('${numero}')">📷 Fotos del trabajo</button>
    <button class="btn btn-ghost btn-block" type="button" onclick="document.getElementById('modal-ott-ok').classList.remove('active')">Cerrar</button>`; }
  /* Guardar datos para el preset de mantenimiento */
  try {
    window.__ultimoEquipo = {
      origen: numero,
      cliente_nombre: data.cliente_nombre || '',
      cliente_telefono: data.cliente_telefono || '',
      equipo: [data.equipo_tipo, data.equipo_marca, data.equipo_modelo].filter(Boolean).join(' '),
      base: data.base || 'SMA'
    };
  } catch(e) {}
  openModal('modal-ott-ok');
}

/* ── crearOTTdesdeING ────────────────────────────────── */
export async function crearOTTdesdeING(numIng) {
  const db = store.get('db');
  if (!numIng) { showToast('⚠️ Falta número de ingreso','warn'); return; }
  const ing = await dbGet(db,'ingresos',numIng);
  if (!ing) { showToast(`⚠️ ING ${numIng} no encontrado`,'error'); return; }

  await abrirFormularioOTT();
  store.set('ott.ingresoOrigenId', numIng);

  modalReady(document.getElementById('modal-ott'), () => {
    const set = (id, val) => { const e=el(id); if(e) e.value=val||''; };
    set('ott-cliente-nombre',    ing.cliente_nombre);
    set('ott-cliente-cuit',      ing.cliente_cuit);
    set('ott-cliente-tel',       ing.cliente_telefono);
    set('ott-cliente-dir',       ing.cliente_direccion);
    set('ott-cliente-cp',        ing.cliente_cp);
    set('ott-cliente-ciudad',    ing.cliente_ciudad);
    set('ott-cliente-provincia', ing.cliente_provincia);
    if (ing.equipo_tipo) { const t=el('ott-equipo-tipo'); if(t) t.value=ing.equipo_tipo; }
    set('ott-equipo-marca',  ing.equipo_marca);
    set('ott-equipo-modelo', ing.equipo_modelo);
    set('ott-falla',         ing.equipo_falla);
    set('ott-error',         ing.equipo_error);
    set('ott-numIngreso',    numIng);
    el('ott-numIngreso-wrap')?.classList.remove('hide');
    el('ott-from-ing-banner')?.classList.remove('hide');
    const bn = el('ott-from-ing-num'); if(bn) bn.textContent = numIng;
    if (ing.encomienda) {
      set('ott-ent-transporte', ing.encomienda_transporte);
      set('ott-ent-guia',       ing.encomienda_guia);
      if (ing.encomienda_costo) set('ott-ent-costo', pesos(ing.encomienda_costo));
      el('ott-entrada-fields')?.classList.remove('hide');
    }
    if (ing.fecha) set('ott-fecha', ing.fecha);
    if (ing.base)  set('ott-base',  ing.base);
  });
}

export function crearOTTdesdeINGActual() {
  const id = store.get('ing.guardadoId');
  if (!id) { showToast('⚠️ Sin ingreso activo','warn'); return; }
  /* Cerrar el modal de éxito del ING si está abierto */
  document.getElementById('modal-ing-ok')?.classList.remove('active');
  crearOTTdesdeING(id);
}
export { imprimirOTT_A4 };
