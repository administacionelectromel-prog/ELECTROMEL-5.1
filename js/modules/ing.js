/**
 * ELECTROMEL — ing.js
 * Módulo de Ingresos (ING).
 * Gestiona el formulario de recepción de equipos, guardado,
 * PDF A4, Ticket 57mm, Etiqueta, y la transición a OTT.
 */

import { store }                    from '../core/store.js';
import { dbGet, dbPut, getNextNumber, peekNextNumber,
         getBaseForDate, getCfg, logEvent } from '../core/db.js';
import { showToast, openModal, closeModal } from '../core/ui.js';
import { pesos, fmtFechaCorta, fmtHora,
         pdfSanitize, fechaHoy, escapeHtml, mensajeAmigable } from '../core/utils.js';
import { initAutocompletado, upsertCliente } from '../services/clientes.js';
import { registrarEstimado }                 from '../services/rentabilidad.js';
import { onOrderExpense }                    from '../services/finance.js';
import { getJsPDF, cargarDatosEmpresa, getCondicionesServicio } from '../services/pdf/base.js';
import { imprimirING_A4 } from '../services/pdf/ing.pdf.js';
import { invalidateCache }                   from '../core/db.js';
import { bus }                               from '../core/store.js';
import { validarGarantia, vincularReingreso } from '../services/garantia.js';
import { initPlantillasInline, abrirMiniPanelPlantillas } from './plantillas/index.js';

/* ── Helpers ────────────────────────────────────────────── */
function v(id) {
  const el = document.getElementById(id);
  return el ? (el.value || '').trim() : '';
}
function n(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const x = parseFloat(el.value);
  return isFinite(x) && x > 0 ? x : 0;
}

/* ── Exponer _togglearEncomiendaING globalmente ─────────── */
window._togglearEncomiendaING = function() {
  const tog  = document.getElementById('ing-encomienda-toggle');
  const wrap = document.getElementById('ing-encomienda-fields');
  if (!tog || !wrap) return;
  if (tog.checked) {
    wrap.classList.remove('hide');
  } else {
    wrap.classList.add('hide');
    ['ing-enc-transporte', 'ing-enc-guia', 'ing-enc-costo']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }
};

/* ── Generar HTML del formulario y montarlo ─────────────── */
function _buildFormHTML() {
  return `
    <div class="card">
      <div class="card-title">👤 Cliente</div>
      <div id="ing-cliente-autocomplete-wrap" class="field">
        <label class="field-label">Nombre / Razón Social *</label>
        <input type="text" id="ing-cliente-nombre" placeholder="Buscá un cliente o escribí uno nuevo" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">CUIT / DNI</label>
          <input type="text" id="ing-cliente-cuit" placeholder="20-12345678-9" inputmode="numeric">
        </div>
        <div class="field">
          <label class="field-label">Teléfono</label>
          <input type="text" id="ing-cliente-tel" placeholder="2944-555111" inputmode="tel">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Dirección</label>
        <input type="text" id="ing-cliente-dir" placeholder="Calle 123">
      </div>
      <div class="field-row-3">
        <div class="field"><label class="field-label">CP</label><input type="text" id="ing-cliente-cp" inputmode="numeric"></div>
        <div class="field"><label class="field-label">Ciudad</label><input type="text" id="ing-cliente-ciudad"></div>
        <div class="field"><label class="field-label">Provincia</label><input type="text" id="ing-cliente-provincia"></div>
      </div>
      <div class="field">
        <label class="field-label">📣 ¿Cómo nos conociste?</label>
        <select id="ing-origen-mkt">
          <option value="">— Seleccionar —</option>
          <option>Facebook</option>
          <option>Marketplace</option>
          <option>Grupo Facebook</option>
          <option>WhatsApp</option>
          <option>Cliente anterior</option>
          <option>Recomendación</option>
          <option>Publicidad callejera</option>
          <option>Google</option>
          <option>Otro</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔧 Equipo recibido</div>
      <div class="field">
        <label class="field-label">Tipo *</label>
        <select id="ing-equipo-tipo">
          <option value="Soldadora Inverter">Soldadora Inverter</option>
          <option value="Monopatín Eléctrico">Monopatín Eléctrico</option>
          <option value="Máquina Gym">Máquina Gym</option>
          <option value="Cinta de Correr">Cinta de Correr</option>
          <option value="Máquina Eléctrica">Máquina Eléctrica</option>
          <option value="Otro">Otro</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label class="field-label">Marca</label><input type="text" id="ing-equipo-marca" placeholder="Lusqtoff"></div>
        <div class="field"><label class="field-label">Modelo</label><input type="text" id="ing-equipo-modelo" placeholder="LIE 200"></div>
      </div>
      <div class="field">
        <label class="field-label">N° de serie</label>
        <input type="text" id="ing-equipo-serie" placeholder="Número de serie del equipo (opcional)">
      </div>
      <div class="field">
        <label class="field-label">Falla declarada por el cliente</label>
        <div class="item-ta-wrap">
          <textarea id="ing-falla" rows="3" placeholder="Ej: No enciende. Hace ruido extraño al conectar..."></textarea>
          <div class="item-actions">
            <button type="button" class="item-plantillas-btn" title="Plantillas rápidas"
              onclick="window._abrirPlantillasING()">📋 Plantillas</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Código de error declarado</label>
        <input type="text" id="ing-error" placeholder="Ej: E01, F-3, etc. (opcional)">
      </div>
    </div>

    <div class="card">
      <div class="row-sb">
        <div class="card-title" style="margin-bottom:0;">📦 ¿Recibido por encomienda?</div>
        <label class="toggle">
          <input type="checkbox" id="ing-encomienda-toggle" onchange="_togglearEncomiendaING()">
          <span class="toggle-track"></span>
        </label>
      </div>
      <div id="ing-encomienda-fields" class="hide" style="margin-top:14px;">
        <div class="field">
          <label class="field-label">Empresa de transporte</label>
          <input type="text" id="ing-enc-transporte" placeholder="Andreani, Vía Cargo, Cruz del Sur...">
        </div>
        <div class="field-row">
          <div class="field"><label class="field-label">N° de guía</label><input type="text" id="ing-enc-guia" placeholder="123456789"></div>
          <div class="field"><label class="field-label">Costo envío $</label><input type="number" id="ing-enc-costo" min="0" step="100" placeholder="0"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row-sb">
        <div class="card-title" style="margin-bottom:0;">🛡️ ¿Reingreso por garantía?</div>
        <label class="toggle">
          <input type="checkbox" id="ing-garantia-toggle" onchange="window._toggleGarantiaING()">
          <span class="toggle-track"></span>
        </label>
      </div>
      <div id="ing-garantia-fields" class="hide" style="margin-top:14px;">
        <div class="field">
          <label class="field-label">Buscar trabajo anterior (por cliente o equipo)</label>
          <input type="text" id="ing-ott-buscar" placeholder="🔍 Ej: Eduardo, soldadora..."
            oninput="window._buscarOttGarantia(this.value)" autocomplete="off">
          <div id="ing-ott-resultados" class="hide" style="margin-top:6px;border:1px solid var(--borde);
            border-radius:8px;max-height:220px;overflow-y:auto;background:var(--surface-2);"></div>
        </div>
        <div class="field">
          <label class="field-label">N° de OTT original *</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="ing-ott-origen" placeholder="OTT-0023" style="flex:1;"
              oninput="window._onIngOttOrigenInput()">
            <button type="button" class="btn btn-ghost" onclick="window._verificarGarantiaING()"
              style="white-space:nowrap;">Verificar</button>
          </div>
        </div>
        <div id="ing-garantia-resultado" class="hide" style="margin-top:8px;padding:12px;
          border-radius:var(--r-sm);border:1px solid var(--borde-2);background:var(--surface-2);">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📅 Recepción</div>
      <div class="field-row">
        <div class="field"><label class="field-label">Fecha</label><input type="date" id="ing-fecha"></div>
      </div>
      <input type="hidden" id="ing-base" value="SMA">
    </div>`;
}

/* ── initPanel — montar HTML si hace falta ──────────────── */
function _initFormING() {
  const body = document.getElementById('modal-ing-body');
  /* Generar el form si todavía no tiene campos reales.
     Nota: un comentario HTML cuenta como innerHTML, por eso verificamos
     la existencia de un campo concreto en vez de innerHTML.trim(). */
  if (body && !document.getElementById('ing-cliente-nombre')) {
    body.innerHTML = _buildFormHTML();
  }
}

/* ── abrirFormularioING ─────────────────────────────────── */
export async function abrirFormularioING() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  /* Montar formulario si está vacío */
  _initFormING();
  resetFormularioING();
  initAutocompletado('ing');

  /* Conectar plantillas inline al campo de falla */
  const fallaEl = document.getElementById('ing-falla');
  if (fallaEl) initPlantillasInline(fallaEl, 'diagnostico');

  /* Exponer handler del botón 📋 */
  window._abrirPlantillasING = () => {
    const ta = document.getElementById('ing-falla');
    if (ta) { store.set('ui.lastActiveField', ta); abrirMiniPanelPlantillas(ta, 'diagnostico'); }
  };

  /* Próximo número */
  const n = await peekNextNumber(db, 'ING');
  const prev = document.getElementById('ing-numero-preview');
  if (prev) prev.textContent = n;

  /* Fecha hoy */
  const fechaEl = document.getElementById('ing-fecha');
  if (fechaEl) fechaEl.value = fechaHoy();

  /* Base sugerida */
  const base = await getBaseForDate(db, fechaHoy());
  const baseEl = document.getElementById('ing-base');
  if (baseEl) baseEl.value = base;

  /* Pre-cargar ciudad/provincia de la empresa */
  const [ciudad, provincia] = await Promise.all([
    getCfg(db, 'empresa_ciudad', ''),
    getCfg(db, 'empresa_provincia', '')
  ]);
  const cEl = document.getElementById('ing-cliente-ciudad');
  const pEl = document.getElementById('ing-cliente-provincia');
  if (cEl && !cEl.value && ciudad)    cEl.value = ciudad;
  if (pEl && !pEl.value && provincia) pEl.value = provincia;

  openModal('modal-ing');
}

/* ── cerrarFormularioING ────────────────────────────────── */
export function cerrarFormularioING() {
  closeModal('modal-ing');
}

/* ── resetFormularioING ─────────────────────────────────── */
export function resetFormularioING() {
  const ids = [
    'ing-cliente-nombre','ing-cliente-cuit','ing-cliente-tel','ing-cliente-dir',
    'ing-cliente-cp','ing-cliente-ciudad','ing-cliente-provincia',
    'ing-equipo-marca','ing-equipo-modelo','ing-equipo-serie','ing-falla','ing-error',
    'ing-enc-transporte','ing-enc-guia','ing-enc-costo',
    'ing-ott-origen','ing-origen-mkt'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const tipo = document.getElementById('ing-equipo-tipo');
  if (tipo) tipo.selectedIndex = 0;
  const tog  = document.getElementById('ing-encomienda-toggle');
  const wrap = document.getElementById('ing-encomienda-fields');
  if (tog)  tog.checked = false;
  if (wrap) wrap.classList.add('hide');
  const garTog  = document.getElementById('ing-garantia-toggle');
  const garWrap = document.getElementById('ing-garantia-fields');
  const garRes  = document.getElementById('ing-garantia-resultado');
  if (garTog)  garTog.checked = false;
  if (garWrap) garWrap.classList.add('hide');
  if (garRes)  { garRes.classList.add('hide'); garRes.innerHTML = ''; }
  store.set('ing.garantiaValidada', null);
}

/* ── Garantía: toggle, verificar, autocompletar ─────────── */
window._toggleGarantiaING = function() {
  const tog  = document.getElementById('ing-garantia-toggle');
  const wrap = document.getElementById('ing-garantia-fields');
  const res  = document.getElementById('ing-garantia-resultado');
  if (!wrap) return;
  if (tog?.checked) {
    wrap.classList.remove('hide');
  } else {
    wrap.classList.add('hide');
    if (res) { res.classList.add('hide'); res.innerHTML = ''; }
    document.getElementById('ing-ott-origen')?.value && (document.getElementById('ing-ott-origen').value = '');
    store.set('ing.garantiaValidada', null);
  }
};

let _garantiaTimer = null;
window._buscarOttGarantia = async function(texto) {
  const cont = document.getElementById('ing-ott-resultados');
  if (!cont) return;
  const q = (texto || '').trim().toLowerCase();
  if (q.length < 2) { cont.classList.add('hide'); cont.innerHTML = ''; return; }

  try {
    const db = store.get('db');
    if (!db) return;
    const { dbGetAll } = await import('../core/db.js');
    const ordenes = await dbGetAll(db, 'ordenes', false).catch(() => []);

    /* Solo OTT entregadas (las que pueden tener garantía vigente) */
    const ESTADOS_ENT = ['entregado', 'pagado'];
    const matches = ordenes.filter(o => {
      if (!ESTADOS_ENT.includes(o.estado)) return false;
      const txt = `${o.cliente_nombre || ''} ${o.equipo_tipo || ''} ${o.equipo_marca || ''} ${o.equipo_modelo || ''} ${o.numero || ''}`.toLowerCase();
      return txt.includes(q);
    }).slice(0, 8);

    if (!matches.length) {
      cont.innerHTML = '<div class="dim txt-sm" style="padding:10px;">Sin trabajos entregados que coincidan.</div>';
      cont.classList.remove('hide');
      return;
    }

    let html = '';
    for (const o of matches) {
      const equipo = [o.equipo_tipo, o.equipo_marca, o.equipo_modelo].filter(Boolean).join(' ');
      const venceTxt = o.fecha_fin_garantia
        ? `vence ${new Date(o.fecha_fin_garantia + 'T12:00:00').toLocaleDateString('es-AR')}`
        : 'sin fecha de garantía';
      html += `
        <div onclick="window._elegirOttGarantia('${o.numero}')"
             style="cursor:pointer;padding:10px 12px;border-bottom:1px solid var(--borde);">
          <div style="font-weight:600;">${_escIng(o.cliente_nombre || '—')}</div>
          <div class="dim txt-sm">${_escIng(o.numero)}${equipo ? ' · ' + _escIng(equipo) : ''} · ${venceTxt}</div>
        </div>`;
    }
    cont.innerHTML = html;
    cont.classList.remove('hide');
  } catch (e) {
    console.warn('[buscarOttGarantia]', e);
  }
};

window._elegirOttGarantia = function(numero) {
  const input = document.getElementById('ing-ott-origen');
  const cont  = document.getElementById('ing-ott-resultados');
  const buscar = document.getElementById('ing-ott-buscar');
  if (input) input.value = numero;
  if (cont) { cont.classList.add('hide'); cont.innerHTML = ''; }
  if (buscar) buscar.value = '';
  window._verificarGarantiaING();
};

function _escIng(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

window._onIngOttOrigenInput = function() {
  clearTimeout(_garantiaTimer);
  const val = document.getElementById('ing-ott-origen')?.value?.trim() || '';
  if (val.match(/^OTT-\d+$/i)) {
    _garantiaTimer = setTimeout(() => window._verificarGarantiaING(), 600);
  }
};

window._verificarGarantiaING = async function() {
  const numOTT = document.getElementById('ing-ott-origen')?.value?.trim().toUpperCase();
  const res    = document.getElementById('ing-garantia-resultado');
  if (!numOTT) { showToast('Ingresá el número de OTT', 'warn'); return; }
  if (!res)    return;

  res.innerHTML = '<div class="dim txt-sm">Verificando...</div>';
  res.classList.remove('hide');

  const resultado = await validarGarantia(numOTT);
  store.set('ing.garantiaValidada', resultado);

  const color = resultado.valida ? '#1a4' : resultado.entregada ? '#a41' : '#888';
  res.innerHTML = `
    <div style="color:${color};font-weight:bold;margin-bottom:6px;">${escapeHtml(resultado.mensaje)}</div>
    ${resultado.cliente_nombre ? `<div class="txt-sm"><strong>Cliente:</strong> ${escapeHtml(resultado.cliente_nombre)}</div>` : ''}
    ${resultado.equipo ? `<div class="txt-sm"><strong>Equipo:</strong> ${escapeHtml(resultado.equipo)}</div>` : ''}
    ${resultado.fecha_entrega ? `<div class="txt-sm"><strong>Entregado:</strong> ${fmtFechaCorta(resultado.fecha_entrega)}</div>` : ''}
    ${resultado.fecha_fin ? `<div class="txt-sm"><strong>Vence garantía:</strong> ${fmtFechaCorta(resultado.fecha_fin)}</div>` : ''}
    ${resultado.diagnostico_original ? `<div class="txt-sm" style="margin-top:4px;"><strong>Diagnóstico original:</strong> ${escapeHtml(resultado.diagnostico_original.slice(0,120))}${resultado.diagnostico_original.length > 120 ? '…' : ''}</div>` : ''}
  `;

  /* Si es válida, autocompletar datos del cliente y equipo */
  if (resultado.valida || resultado.entregada) {
    _autocompletarDesdeGarantia(resultado);
    if (!resultado.valida) {
      showToast('⚠️ Garantía vencida — podés igualmente registrar el reingreso', 'warn');
    }
  }
};

function _autocompletarDesdeGarantia(resultado) {
  if (!resultado.ott_numero) return;
  const db = store.get('db');
  if (!db) return;
  dbGet(db, 'ordenes', resultado.ott_numero).then(ott => {
    if (!ott) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('ing-cliente-nombre',   ott.cliente_nombre);
    set('ing-cliente-cuit',     ott.cliente_cuit);
    set('ing-cliente-tel',      ott.cliente_telefono);
    set('ing-cliente-dir',      ott.cliente_direccion);
    set('ing-cliente-cp',       ott.cliente_cp);
    set('ing-cliente-ciudad',   ott.cliente_ciudad);
    set('ing-cliente-provincia',ott.cliente_provincia);
    /* Equipo */
    const tipoEl = document.getElementById('ing-equipo-tipo');
    if (tipoEl && ott.equipo_tipo) tipoEl.value = ott.equipo_tipo;
    set('ing-equipo-marca',  ott.equipo_marca);
    set('ing-equipo-modelo', ott.equipo_modelo);
    showToast('✓ Datos completados desde OTT original', 'success');
  }).catch(() => {});
}

/* ── _readING ───────────────────────────────────────────── */
function _readING() {
  const nombre = v('ing-cliente-nombre');
  if (!nombre) {
    showToast('⚠️ Falta el nombre del cliente', 'warn');
    document.getElementById('ing-cliente-nombre')?.focus();
    return null;
  }
  const telefono = v('ing-cliente-tel');
  if (!telefono) {
    showToast('⚠️ Falta el teléfono del cliente', 'warn');
    document.getElementById('ing-cliente-tel')?.focus();
    return null;
  }
  const falla = v('ing-falla');
  if (!falla) {
    showToast('⚠️ Falta la falla declarada del equipo', 'warn');
    document.getElementById('ing-falla')?.focus();
    return null;
  }
  const fecha      = v('ing-fecha') || fechaHoy();
  const encomienda = !!document.getElementById('ing-encomienda-toggle')?.checked;
  const esGarantia = !!document.getElementById('ing-garantia-toggle')?.checked;
  const ottOrigen  = esGarantia ? (v('ing-ott-origen') || '').toUpperCase().trim() : '';
  const garResult  = esGarantia ? store.get('ing.garantiaValidada') : null;

  return {
    fecha,
    base:              v('ing-base') || 'SMA',
    cliente_nombre:    nombre,
    cliente_cuit:      v('ing-cliente-cuit'),
    cliente_telefono:  telefono,
    cliente_direccion: v('ing-cliente-dir'),
    cliente_cp:        v('ing-cliente-cp'),
    cliente_ciudad:    v('ing-cliente-ciudad'),
    cliente_provincia: v('ing-cliente-provincia'),
    origen_marketing:  v('ing-origen-mkt') || '',
    equipo_tipo:       v('ing-equipo-tipo') || 'Soldadora Inverter',
    equipo_marca:      v('ing-equipo-marca'),
    equipo_modelo:     v('ing-equipo-modelo'),
    equipo_serie:      v('ing-equipo-serie'),
    equipo_falla:      falla,
    equipo_error:      v('ing-error'),
    encomienda,
    encomienda_transporte: encomienda ? v('ing-enc-transporte') : '',
    encomienda_guia:       encomienda ? v('ing-enc-guia')       : '',
    encomienda_costo:      encomienda ? n('ing-enc-costo')      : 0,
    /* Garantía */
    es_garantia:           esGarantia,
    ott_garantia_origen:   ottOrigen  || null,
    garantia_vigente:      garResult?.valida || false,
    garantia_dias_restantes: garResult?.dias_restantes || 0,
    estado:    'ingresado',
    creado_at: new Date().toISOString()
  };
}

/* ── guardarIngreso ─────────────────────────────────────── */
export async function guardarIngreso() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'error'); return; }

  const data = _readING();
  if (!data) return;

  try {
    const numero  = await getNextNumber(db, 'ING');
    data.numero   = numero;

    await dbPut(db, 'ingresos', data);
    invalidateCache('ingresos');

    /* Gasto de encomienda */
    if (data.encomienda && data.encomienda_costo > 0) {
      try {
        await onOrderExpense(
          { numero, cliente_nombre: data.cliente_nombre, base: data.base },
          { amount: data.encomienda_costo, category: 'logistica',
            description: `Envio entrada ${numero}${data.encomienda_transporte ? ' (' + data.encomienda_transporte + ')' : ''}`,
            date: data.fecha }
        );
      } catch(e) { console.warn('[guardarIngreso] gasto encomienda:', e); }
    }

    try { await upsertCliente(data, numero); } catch(e) { console.warn(e); }
    try { await registrarEstimado(data); }     catch(e) { console.warn(e); }

    /* Vincular reingreso a la OTT original si es garantía */
    if (data.es_garantia && data.ott_garantia_origen) {
      vincularReingreso(data.ott_garantia_origen, numero).catch(e => console.warn('[guardarIngreso] vincularReingreso:', e));
    }

    await logEvent(db, {
      type:    'ORDER_CREATED',
      message: `Ingreso ${numero} — ${data.cliente_nombre}`,
      ref:     numero,
      data:    { tipo: 'ING', cliente: data.cliente_nombre, equipo: data.equipo_tipo }
    });

    store.set('ing.guardadoId', numero);
    cerrarFormularioING();
    showToast(`✅ Ingreso ${numero} guardado`, 'success');
    abrirConfirmacionING(numero, data);
    bus.emit('registro:guardado', { tipo: 'ING', numero, data });

  } catch(err) {
    console.error('[guardarIngreso]', err);
    showToast('❌ ' + mensajeAmigable(err), 'error');
  }
}

/* ── abrirConfirmacionING ───────────────────────────────── */
export function abrirConfirmacionING(numero, data) {
  /* Llenar el body con el resumen del ingreso */
  const body = document.getElementById('modal-ing-ok-body');
  if (body) {
    let equipoTxt = data.equipo_tipo || '';
    const mm = [data.equipo_marca, data.equipo_modelo].filter(Boolean).join(' ');
    if (mm) equipoTxt += ' · ' + mm;
    body.innerHTML = `
      <div class="card">
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Número</span><span class="mono"><b>${escapeHtml(numero)}</b></span></div>
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Cliente</span><span>${escapeHtml(data.cliente_nombre || '')}</span></div>
        <div class="row-sb" style="padding:4px 0;"><span class="dim">Equipo</span><span>${escapeHtml(equipoTxt)}</span></div>
      </div>`;
  }

  /* Reconstruir footer con botones actuales */
  const footer = document.querySelector('#modal-ing-ok .modal-footer');
  if (footer) {
    footer.classList.add('modal-footer-stack');
    footer.innerHTML = `
      <button class="btn btn-block mb-4" type="button" onclick="imprimirING_A4('${numero}')">🖨️ PDF A4</button>
      <button class="btn btn-block mb-4" type="button" onclick="ticketImagenING('${numero}')">🧾 Ticket 57mm</button>
      <button class="btn btn-block mb-4" type="button" onclick="etiquetaImagenING('${numero}')">🏷️ Etiqueta</button>
      <button class="btn btn-block mb-4" type="button" onclick="_waIngreso('${numero}')">💬 Avisar por WhatsApp</button>
      <button class="btn btn-ghost btn-block mb-4" type="button" onclick="abrirGaleriaFotos('${numero}')">📷 Fotos del equipo</button>
      <div class="divider"></div>
      <button class="btn btn-primary btn-block btn-lg" type="button" onclick="crearOTTdesdeINGActual()">🔧 CREAR OT TALLER (OTT)</button>
      <button class="btn btn-ghost btn-block mt-6" type="button" onclick="cerrarConfirmacionING()">CERRAR</button>`;
  }
  openModal('modal-ing-ok');
}

export function cerrarConfirmacionING() {
  closeModal('modal-ing-ok');
}

/* ── Avisar al cliente por WhatsApp desde la confirmación de ING ── */
window._waIngreso = async (numero) => {
  const db = store.get('db');
  numero = numero || store.get('ing.guardadoId');
  if (!numero) return;
  try {
    const ing = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado', 'error'); return; }
    if (!ing.cliente_telefono) { showToast('⚠️ Este cliente no tiene teléfono cargado', 'warn'); return; }
    const { varsIngreso } = await import('../services/whatsapp.vars.js');
    const { buildWhatsAppMessage, openWhatsApp } = await import('../services/whatsapp.js');
    const vars = await varsIngreso(ing);
    const msg = await buildWhatsAppMessage('ing_recibido', vars);
    openWhatsApp(ing.cliente_telefono, msg);
  } catch (e) {
    showToast('No se pudo abrir WhatsApp', 'error');
  }
};

/* ── imprimirING_Ticket ─────────────────────────────────── */
export async function imprimirING_Ticket(numero) {
  const db    = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) return;
  numero = numero || store.get('ing.guardadoId');
  if (!numero) { showToast('⚠️ Sin ingreso para imprimir', 'warn'); return; }

  showToast('Generando ticket...', 'info');
  try {
    const ing  = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado: ' + numero, 'error'); return; }
    const cfg  = await cargarDatosEmpresa();
    const cond = await getCondicionesServicio();
    const scaleStr = await getCfg(db, 'scale_ticket', 1);
    const scale    = parseFloat(scaleStr) || 1;

    const W = 57;
    const doc = new jsPDF({ unit: 'mm', format: [W, 280] });
    const cx  = W / 2;
    const pad = 3;
    const iW  = W - 2 * pad;

    const FS = { title: 13 * scale, sub: 9 * scale, normal: 8 * scale, small: 7 * scale };
    let y = 5;

    /* Nombre empresa */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS.title);
    doc.text(pdfSanitize(cfg.empresa_nombre || 'ELECTROMEL'), cx, y, { align: 'center' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS.sub);
    const subL = doc.splitTextToSize(pdfSanitize(cfg.empresa_sub || ''), iW);
    doc.text(subL, cx, y, { align: 'center' });
    y += subL.length * 3.5 + 1;

    doc.setFontSize(FS.normal);
    if (cfg.empresa_cuit) { doc.text('CUIT: ' + cfg.empresa_cuit, cx, y, { align: 'center' }); y += 3.2; }
    if (cfg.empresa_tel)  { doc.text('Tel: ' + cfg.empresa_tel,   cx, y, { align: 'center' }); y += 3.2; }
    y += 2;

    /* Título */
    doc.setFontSize(FS.small);
    doc.text('--- RECIBO DE INGRESO ---', cx, y, { align: 'center' }); y += 4;
    doc.setFont('courier', 'bold');
    doc.setFontSize(FS.title - 1);
    doc.text('N°:  ' + ing.numero, cx, y, { align: 'center' }); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS.normal);
    doc.text(`Fecha: ${fmtFechaCorta(ing.fecha)}   Hora: ${fmtHora(new Date())}`, cx, y, { align: 'center' }); y += 5;

    /* Cliente */
    doc.setFontSize(FS.small);
    doc.text('--- CLIENTE ---', cx, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(FS.normal);
    _ticketLinea(doc, pad, y, 'Cliente:', pdfSanitize(ing.cliente_nombre || '—'), iW); y += 4;
    if (ing.cliente_cuit)     { _ticketLinea(doc, pad, y, 'CUIT/DNI:', ing.cliente_cuit, iW); y += 3.5; }
    if (ing.cliente_telefono) { _ticketLinea(doc, pad, y, 'Tel:', ing.cliente_telefono, iW); y += 3.5; }
    if (ing.cliente_ciudad)   { doc.setFont('helvetica','normal'); doc.text(ing.cliente_ciudad, pad, y); y += 3.5; }
    y += 2;

    /* Equipo */
    doc.setFontSize(FS.small);
    doc.text('--- EQUIPO ---', cx, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(FS.normal);
    _ticketLinea(doc, pad, y, 'Equipo:', pdfSanitize(ing.equipo_tipo || '—'), iW); y += 4;
    const mm = [ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ');
    if (mm) { _ticketLinea(doc, pad, y, 'Modelo:', pdfSanitize(mm), iW); y += 3.5; }
    if (ing.equipo_falla) {
      doc.setFont('helvetica','bold'); doc.text('Falla:', pad, y); y += 3.5;
      doc.setFont('helvetica','normal');
      const fl = doc.splitTextToSize(pdfSanitize(ing.equipo_falla), iW);
      doc.text(fl, pad, y); y += fl.length * 3.5;
    }

    /* Encomienda */
    if (ing.encomienda) {
      y += 2;
      doc.setFontSize(FS.small);
      doc.text('--- ENCOMIENDA ---', cx, y, { align: 'center' }); y += 3.5;
      doc.setFontSize(FS.normal);
      if (ing.encomienda_transporte) { doc.text(pdfSanitize(ing.encomienda_transporte), pad, y); y += 3.5; }
      if (ing.encomienda_guia)       { doc.text('Guia: ' + ing.encomienda_guia, pad, y); y += 3.5; }
    }

    /* Condiciones */
    y += 2;
    doc.setFontSize(FS.small);
    doc.text('-- CONDICIONES DEL SERVICIO --', cx, y, { align: 'center' }); y += 3.5;
    const condTxt = String(cond).split('\n').map(l => l.replace(/^\s*•\s*/, '- ')).join('\n');
    const condL = doc.splitTextToSize(pdfSanitize(condTxt), iW);
    doc.text(condL, pad, y); y += condL.length * 3 + 2;

    /* Firma */
    y += 4;
    doc.setFontSize(FS.normal);
    doc.text('Firma cliente:', pad, y); y += 8;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.line(pad, y, W - pad, y); y += 4;
    doc.text('Aclaración:', pad, y); y += 8;
    doc.line(pad, y, W - pad, y); y += 5;

    /* Pie */
    y += 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(FS.normal);
    const gr = doc.splitTextToSize('GRACIAS POR CONFIAR EN ELECTROMEL', iW);
    doc.text(gr, cx, y, { align: 'center' });

    doc.save(`${numero}_ticket.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'ING ticket: ' + numero, ref: numero });
    showToast('🧾 Ticket generado', 'success');
  } catch(err) {
    console.error('[imprimirING_Ticket]', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

function _ticketLinea(doc, x, y, label, valor, maxW) {
  doc.setFont('helvetica', 'bold');
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  const lw = doc.getTextWidth(label + ' ');
  const vl = doc.splitTextToSize(valor, maxW - lw);
  doc.text(vl[0] || '', x + lw, y);
}

/* ── imprimirING_Etiqueta ───────────────────────────────── */
export async function imprimirING_Etiqueta(numero) {
  const db    = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) return;
  numero = numero || store.get('ing.guardadoId');
  if (!numero) { showToast('⚠️ Sin ingreso', 'warn'); return; }

  showToast('Generando etiqueta...', 'info');
  try {
    const ing = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado', 'error'); return; }
    const cfg       = await cargarDatosEmpresa();
    const scaleStr  = await getCfg(db, 'scale_etiqueta', 1);
    const scale     = parseFloat(scaleStr) || 1;

    const W = 70, H = 40;
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' });

    /* Borde */
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4);
    doc.rect(1, 1, W - 2, H - 2);

    /* Header negro */
    doc.setFillColor(0, 0, 0);
    doc.rect(1, 1, W - 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10 * scale);
    doc.text(pdfSanitize(cfg.empresa_nombre || 'ELECTROMEL'), W / 2, 6, { align: 'center' });

    /* QR a la ficha del equipo (se escanea para abrir y cambiar estado) */
    const qrSize = 28;
    const qrX = W - qrSize - 2;
    const qrY = 9;
    let qrOk = false;

    if (window.qrcode) {
      try {
        /* URL de la app + deep-link al número de esta orden/ingreso */
        const baseUrl = (location.origin + location.pathname).replace(/index\.html$/, '');
        const fichaUrl = baseUrl + '#equipo=' + (ing.numero || '');
        const qr = window.qrcode(0, 'M');
        qr.addData(fichaUrl);
        qr.make();
        const size = Math.min(280, 240);
        const cvs  = document.createElement('canvas');
        cvs.width = cvs.height = size;
        const ctx  = cvs.getContext('2d');
        const cells = qr.getModuleCount();
        const cell  = size / cells;
        for (let r = 0; r < cells; r++) {
          for (let c = 0; c < cells; c++) {
            ctx.fillStyle = qr.isDark(r, c) ? '#000' : '#fff';
            ctx.fillRect(c * cell, r * cell, cell, cell);
          }
        }
        doc.addImage(cvs.toDataURL('image/png'), 'PNG', qrX, qrY, qrSize, qrSize);
        qrOk = true;
      } catch(e) { console.warn('[etiqueta QR]', e); }
    }
    if (!qrOk) {
      doc.setDrawColor(0, 0, 0); doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
      doc.text('Sin\nQR', qrX + qrSize / 2, qrY + qrSize / 2 - 1, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
    doc.text('Escaneá: ficha', qrX + qrSize / 2, qrY + qrSize + 2, { align: 'center' });

    /* Info izquierda */
    const infoX = 3;
    const infoW = qrX - infoX - 2;
    let y = 12;

    doc.setTextColor(0, 0, 0);
    doc.setFont('courier', 'bold'); doc.setFontSize(13 * scale);
    doc.text(ing.numero, infoX, y); y += 5.5;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7 * scale);
    doc.setTextColor(60, 60, 60);
    doc.text(fmtFechaCorta(ing.fecha), infoX, y); y += 4;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7 * scale); doc.setTextColor(0, 0, 0);
    doc.text('Cliente:', infoX, y);
    doc.setFont('helvetica', 'normal');
    const cliL = doc.splitTextToSize(pdfSanitize(ing.cliente_nombre || '—'), infoW - 12);
    doc.text(cliL[0], infoX + 12, y); y += 3.5;

    if (ing.cliente_telefono) {
      doc.setFont('helvetica', 'bold'); doc.text('Tel:', infoX, y);
      doc.setFont('helvetica', 'normal'); doc.text(ing.cliente_telefono, infoX + 8, y); y += 3.5;
    }

    /* Equipo */
    doc.setFont('helvetica', 'bold'); doc.text('Equipo:', infoX, y);
    doc.setFont('helvetica', 'normal');
    const eqL = doc.splitTextToSize(pdfSanitize(ing.equipo_tipo || ''), infoW - 13);
    doc.text(eqL[0], infoX + 13, y); y += 3.5;

    const mm = [ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ');
    if (mm) {
      const mmL = doc.splitTextToSize(pdfSanitize(mm), infoW);
      doc.text(mmL[0], infoX, y); y += 3.5;
    }

    doc.save(`${numero}_etiqueta.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'ING etiqueta: ' + numero, ref: numero });
    showToast('🏷️ Etiqueta generada', 'success');
  } catch(err) {
    console.error('[imprimirING_Etiqueta]', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}


/* ═══════════════════════════════════════════════════════════
   HELPERS TABULARES — compartidos con OTE y PRE
   ═══════════════════════════════════════════════════════════ */

/**
 * leerItems(containerId) → string multi-línea con los textos de los textareas.
 */
export function leerItems(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return '';
  const lineas = [];
  cont.querySelectorAll('.item-row textarea').forEach(ta => {
    const v = (ta.value || '').trim();
    if (v) lineas.push(v);
  });
  return lineas.join('\n');
}

/**
 * poblarItems(containerId, itemClass, texto, rows) — reconstruye ítems al editar.
 */
export function poblarItems(containerId, itemClass, texto, rows = 2) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  cont.innerHTML = '';
  const lineas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lineas.length) { addItem(containerId, itemClass, rows); return; }
  lineas.forEach(l => {
    const row = addItem(containerId, itemClass, rows);
    if (row) { const ta = row.querySelector('textarea'); if (ta) ta.value = l; }
  });
}

/**
 * leerTabular(containerId) → Array<{cantidad, detalle, precio, subtotal}>
 */
export function leerTabular(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return [];
  const items = [];
  cont.querySelectorAll('.tabular-row').forEach(row => {
    const cantidad = parseFloat(row.querySelector('.tabular-cant')?.value) || 0;
    const detalle  = (row.querySelector('.tabular-detalle')?.value || '').trim();
    const precio   = parseFloat(row.querySelector('.tabular-precio')?.value) || 0;
    const subtotal = parseFloat(row.dataset.subtotal) || cantidad * precio;
    if (detalle || cantidad > 0) items.push({ cantidad, detalle, precio, subtotal });
  });
  return items;
}

/**
 * crearFilaTabular(containerId, opts) → HTMLElement | null
 * Crea una fila de tabla (cantidad · detalle · precio · subtotal · eliminar).
 */
export function crearFilaTabular(containerId, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const row = document.createElement('div');
  row.className = 'tabular-row';

  const mkInput = (type, cls, placeholder, value) => {
    const el = document.createElement('input');
    el.type = type; el.className = cls;
    el.placeholder = placeholder;
    if (value) el.value = value;
    return el;
  };

  const cant = mkInput('number', 'tabular-cant',    'Cant',          opts.cantidad || '');
  const det  = mkInput('text',   'tabular-detalle', 'Detalle...',    opts.detalle  || '');
  const pu   = mkInput('number', 'tabular-precio',  '$ unitario',    opts.precio   || '');
  cant.step = pu.step = '0.01'; cant.min = pu.min = '0';

  const sub = document.createElement('span');
  sub.className = 'tabular-subtotal mono'; sub.textContent = '$0';

  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'tabular-remove'; rm.textContent = '×';

  const recalc = () => {
    const c = parseFloat(cant.value) || 0;
    const p = parseFloat(pu.value)   || 0;
    const s = c * p;
    sub.textContent   = typeof pesos === 'function' ? pesos(s) : ('$' + s.toLocaleString('es-AR'));
    row.dataset.subtotal = String(s);
    if (containerId.startsWith('ote-')) window._recalcOTETotal?.();
    if (containerId.startsWith('pre-')) window._recalcPRETotal?.();
  };

  cant.addEventListener('input', recalc);
  pu.addEventListener('input', recalc);
  rm.addEventListener('click', () => {
    row.parentNode?.removeChild(row);
    if (containerId.startsWith('ote-')) window._recalcOTETotal?.();
    if (containerId.startsWith('pre-')) window._recalcPRETotal?.();
  });

  row.appendChild(cant); row.appendChild(det);
  row.appendChild(pu);   row.appendChild(sub); row.appendChild(rm);
  container.appendChild(row);

  if (opts.cantidad || opts.precio) recalc();
  return row;
}

/* ── Export alias para compatibilidad ───────────────────── */
export { imprimirING_A4 };
export { addItem, removeItem, syncItemsHidden } from './ott.js';
export { resetFormularioING as _resetFormularioING };

/* ── init ───────────────────────────────────────────────── */
export function init() {
  _initFormING();
}
