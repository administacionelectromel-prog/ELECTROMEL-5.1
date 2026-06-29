/**
 * ELECTROMEL — modules/panel/panel.detail.js
 * Modal de detalle universal: apertura, render por tipo, guardar cambios.
 */

import { store, bus }     from '../../core/store.js';
import { dbGet, dbPut, dbDelete, logEvent, invalidateCache } from '../../core/db.js';
import { showToast, confirmarLindo }      from '../../core/ui.js';
import { pesos, escapeHtml, fmtFechaCorta, getLabelEstado,
         ESTADOS_FINALES, STORE_POR_TIPO, getTipoFromNumero } from '../../core/utils.js';
import { onOrderDelivered, onPartialPayment, onOrderExpense, gastosOrden } from '../../services/finance.js';
import { cerrarRegistroReal } from '../../services/rentabilidad.js';
import { registrarEntrega, convertirGarantiaANormal } from '../../services/garantia.js';
import { buildCardDetalle, buildCardBullets, buildCardTabla,
         buildCardPagos, buildCardCambioEstado, buildCardEstadoArchivado } from './panel.templates.js';
import { TIPO_ICONOS, TIPO_LABELS, ESTADOS_POR_TIPO,
         detalleActual, resetDetalle } from './panel.store.js';

/* ── Abrir ────────────────────────────────────────────── */
export async function abrirModalDetalle(numero, tipo) {
  const db = store.get('db');
  if (!db) return;
  tipo = tipo || getTipoFromNumero(numero);
  const storeName = STORE_POR_TIPO[tipo];
  if (!storeName) { showToast('Tipo desconocido: ' + tipo, 'warn'); return; }

  try {
    const reg = await dbGet(db, storeName, numero);
    if (!reg) { showToast('No se encontró ' + numero, 'error'); return; }

    detalleActual.numero   = numero;
    detalleActual.tipo     = tipo;
    detalleActual.registro = reg;
    detalleActual.archivado = ESTADOS_FINALES.has(reg.estado);
    detalleActual.cambios  = {};

    const tituloEl = document.getElementById('detalle-titulo');
    if (tituloEl) tituloEl.textContent = (TIPO_ICONOS[tipo] || '') + ' ' + (TIPO_LABELS[tipo] || tipo);

    _renderDetalle();
    renderRepuestosFicha();

    const btnGuardar = document.getElementById('btn-detalle-guardar');
    if (btnGuardar) btnGuardar.style.display = detalleActual.archivado ? 'none' : '';

    document.getElementById('modal-detalle')?.classList.add('active');
  } catch(err) {
    console.error('[abrirModalDetalle]', err);
    showToast('Error: ' + err.message, 'error');
  }
}

/* ── Cerrar ───────────────────────────────────────────── */
export function cerrarModalDetalle() {
  document.getElementById('modal-detalle')?.classList.remove('active');
  resetDetalle();
}

/* ═══════════════════════════════════════════════════════════
   REPUESTOS / GASTOS INTERNOS (OTT y OTE)
   Egresos de repuestos vinculados a la orden. Figuran en la ficha
   (para el taller) pero NO en el PDF del cliente. Sección colapsable.
   ═══════════════════════════════════════════════════════════ */
export async function renderRepuestosFicha() {
  const cont = document.getElementById('detalle-repuestos');
  if (!cont) return;
  const { numero, tipo, archivado } = detalleActual;
  if (tipo !== 'OTT' && tipo !== 'OTE') { cont.innerHTML = ''; return; }

  let gastos = [];
  try { gastos = await gastosOrden(numero); } catch(e) {}
  const total = gastos.reduce((a, g) => a + (parseFloat(g.amount) || 0), 0);

  const itemsHtml = gastos.map(g => `
    <div class="row" style="justify-content:space-between;align-items:center;background:var(--surface-3);border-radius:8px;padding:8px 10px;margin-bottom:6px;">
      <div><div class="txt-sm">${escapeHtml(g.description || 'Repuesto')}</div><div class="dim txt-xs">${g.date || ''}</div></div>
      <div class="row center" style="gap:8px;">
        <span class="mono peligro txt-sm">-${pesos(g.amount)}</span>
        ${archivado ? '' : `<button class="btn btn-ghost btn-sm" type="button" onclick="borrarRepuestoFicha('${g.transaction_id}')" aria-label="Quitar">✕</button>`}
      </div>
    </div>`).join('');

  cont.className = 'card';
  cont.innerHTML = `
    <div class="row center" style="gap:8px;">
      <div class="card-title" style="flex:1;margin:0;">🔧 Repuestos / gastos internos</div>
      ${gastos.length ? `<span class="peligro bold mono txt-sm">-${pesos(total)}</span>` : '<span class="dim txt-xs">sin cargar</span>'}
    </div>
    <div class="dim txt-xs" style="margin-top:2px;">Egreso interno — no aparece en el PDF del cliente.</div>
    ${gastos.length ? `
    <details style="margin-top:8px;border-top:1px solid var(--borde);padding-top:8px;">
      <summary style="cursor:pointer;font-size:11px;color:var(--acento);list-style:none;user-select:none;">▸ Ver ${gastos.length} gasto${gastos.length === 1 ? '' : 's'}</summary>
      <div style="margin-top:6px;">${itemsHtml}</div>
    </details>` : ''}
    ${archivado ? '' : `
    <div class="row center" style="gap:6px;margin-top:8px;">
      <input type="text" id="repuesto-concepto" placeholder="Ej: Banda nueva" style="flex:1;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:12px;">
      <input type="number" id="repuesto-monto" placeholder="$" inputmode="numeric" style="max-width:90px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:13px;">
      <button class="btn btn-primary btn-sm" type="button" onclick="agregarRepuestoFicha()">+ Sumar</button>
    </div>`}
  `;
}

window.agregarRepuestoFicha = async () => {
  const { tipo, registro } = detalleActual;
  if (tipo !== 'OTT' && tipo !== 'OTE') return;
  const concepto = (document.getElementById('repuesto-concepto')?.value || '').trim();
  const monto    = parseFloat(document.getElementById('repuesto-monto')?.value) || 0;
  if (monto <= 0) { showToast('Poné un monto mayor a 0', 'warn'); return; }
  try {
    await onOrderExpense(registro, { amount: monto, description: concepto || 'Repuesto' });
    invalidateCache();
    showToast('✓ Gasto cargado', 'success');
    await renderRepuestosFicha();
    bus.emit('admin:refresh');
  } catch(e) { console.warn('[agregarRepuestoFicha]', e); showToast('No se pudo cargar', 'error'); }
};

window.borrarRepuestoFicha = async (txnId) => {
  if (!txnId) return;
  const db = store.get('db');
  try {
    const mov = await dbGet(db, 'finance_movements', txnId);
    const ok = await confirmarLindo(
      `¿Borrar este gasto interno?\n\n${mov?.description || ''}\n-${pesos(mov?.amount || 0)}`,
      { titulo: 'Borrar gasto', textoOk: 'Borrar', peligro: true }
    );
    if (!ok) return;
    await dbDelete(db, 'finance_movements', txnId);
    invalidateCache();
    showToast('✓ Gasto borrado', 'success');
    await renderRepuestosFicha();
    bus.emit('admin:refresh');
  } catch(e) { console.warn('[borrarRepuestoFicha]', e); showToast('No se pudo borrar', 'error'); }
};

/* ── Render ───────────────────────────────────────────── */
function _renderDetalle() {
  const body = document.getElementById('modal-detalle-body');
  if (!body) return;
  const { registro: r, tipo, archivado } = detalleActual;
  body.innerHTML = '';

  /* Cliente */
  body.appendChild(buildCardDetalle('👤 Cliente', [
    ['Nombre / Razón Social', r.cliente_nombre],
    ['CUIT/DNI',  r.cliente_cuit],
    ['Teléfono',  r.cliente_telefono],
    ['Dirección', [r.cliente_direccion, r.cliente_ciudad, r.cliente_provincia,
                   r.cliente_cp ? 'CP ' + r.cliente_cp : null].filter(Boolean).join(', ')]
  ]));

  /* Equipo / Servicio */
  if (tipo === 'ING' || tipo === 'OTT') {
    body.appendChild(buildCardDetalle('🔧 Equipo', [
      ['Tipo',         r.equipo_tipo],
      ['Marca/Modelo', [r.equipo_marca, r.equipo_modelo].filter(Boolean).join(' ')],
      ['Falla declarada', r.equipo_falla],
      ['Código error', r.equipo_error]
    ]));
  } else if (tipo === 'OTE') {
    body.appendChild(buildCardDetalle('🚐 Servicio', [
      ['Tipo de servicio', r.tipo_servicio],
      ['Base',  r.base === 'NQN' ? 'Neuquén' : 'San Martín de los Andes'],
      ['Fecha', fmtFechaCorta(r.fecha)]
    ]));
  } else if (tipo === 'PRE') {
    body.appendChild(buildCardDetalle('📝 Servicio', [
      ['Tipo',            r.tipo_servicio],
      ['Modelo / Equipo', r.equipo_modelo],
      ['Problema',        r.problema],
      ['Fecha',           fmtFechaCorta(r.fecha)],
      ['Validez',         r.vigencia_dias ? r.vigencia_dias + ' días' : '—'],
      r.convertido_a_ote ? ['OTE generada', r.convertido_a_ote] : null
    ].filter(Boolean)));
  }

  /* Garantía OTT */
  if (tipo === 'OTT') {
    const garRows = [
      ['Garantía ofrecida', r.garantia || 'Sin garantía'],
      r.fecha_entrega      ? ['Fecha de entrega',     fmtFechaCorta(r.fecha_entrega)]     : null,
      r.fecha_fin_garantia ? ['Vencimiento garantía', fmtFechaCorta(r.fecha_fin_garantia)] : null,
    ].filter(Boolean);
    if (garRows.length > 1) body.appendChild(buildCardDetalle('🛡️ Garantía', garRows));

    /* Reingresos */
    if (r.reingresos?.length) {
      const cardR = document.createElement('div');
      cardR.className = 'card';
      cardR.innerHTML = `<div class="card-title">🔄 Reingresos por garantía (${r.reingresos.length})</div>`;
      r.reingresos.forEach(num => {
        const row = document.createElement('div');
        row.className = 'row-sb';
        row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--borde);';
        row.innerHTML = `<span class="mono txt-sm">${escapeHtml(num)}</span>
          <button class="btn btn-ghost btn-sm" type="button">Ver →</button>`;
        row.querySelector('button').addEventListener('click', () => {
          cerrarModalDetalle();
          const t = num.startsWith('ING-') ? 'ING' : 'OTT';
          setTimeout(() => abrirModalDetalle(num, t), 100);
        });
        cardR.appendChild(row);
      });
      body.appendChild(cardR);
    }

    /* Badge es_garantia */
    if (r.es_garantia) {
      const badge = document.createElement('div');
      badge.className = 'card';
      badge.style.cssText = 'border-color:var(--acento);background:var(--surface-2);';
      let html = `<div class="card-title" style="color:var(--acento);">🛡️ Trabajo en garantía</div>`;
      if (r.ott_garantia_origen) html += `<div class="txt-sm"><strong>OTT origen:</strong> ${escapeHtml(r.ott_garantia_origen)}</div>`;
      if (r.cobro_extra > 0)     html += `<div class="txt-sm"><strong>Cobro extra:</strong> ${pesos(r.cobro_extra)}</div>`;
      if (r.motivo_cobro_extra)  html += `<div class="txt-sm"><strong>Motivo:</strong> ${escapeHtml(r.motivo_cobro_extra)}</div>`;
      if (!r.es_garantia_convertida) {
        html += `<button class="btn btn-ghost btn-block btn-sm" type="button" id="btn-convertir-garantia" style="margin-top:8px;">↩️ Convertir a OTT de cobro normal</button>`;
      } else {
        html += `<div class="dim txt-sm" style="margin-top:4px;">✓ Convertida a OTT normal</div>`;
      }
      badge.innerHTML = html;
      badge.querySelector('#btn-convertir-garantia')?.addEventListener('click', () => {
        const nuevoTotal = parseFloat(prompt('Ingresá el nuevo total a cobrar:', r.cobro_extra || '0'));
        if (!isFinite(nuevoTotal) || nuevoTotal < 0) return;
        convertirGarantiaANormal(r.numero, nuevoTotal).then(ok => {
          if (ok) { cerrarModalDetalle(); bus.emit('panel:refresh', {}); }
        });
      });
      body.appendChild(badge);
    }
  }

  /* Badge garantía ING */
  if (tipo === 'ING' && r.es_garantia) {
    const badge = document.createElement('div');
    badge.className = 'card';
    badge.style.cssText = 'border-color:var(--acento);background:var(--surface-2);';
    badge.innerHTML = `<div class="card-title" style="color:var(--acento);">🛡️ Reingreso por garantía</div>
      <div class="txt-sm"><strong>OTT de origen:</strong> ${escapeHtml(r.ott_garantia_origen || '—')}</div>
      <div class="txt-sm"><strong>Garantía vigente al ingresar:</strong> ${r.garantia_vigente ? '✅ Sí' : '⚠️ No'}</div>`;
    body.appendChild(badge);
  }

  /* Diagnóstico y trabajo OTT */
  if (tipo === 'OTT') {
    if (r.diagnostico) body.appendChild(buildCardBullets('🔍 Diagnóstico',        r.diagnostico));
    if (r.trabajo)     body.appendChild(buildCardBullets('🔨 Trabajo a realizar',  r.trabajo));
  }

  /* Items OTE/PRE */
  if (tipo === 'OTE' || tipo === 'PRE') {
    if (r.descripcion)           body.appendChild(buildCardBullets('📋 Descripción del servicio', r.descripcion));
    if (r.trabajo_items?.length) body.appendChild(buildCardTabla(tipo === 'PRE' ? '🔨 Trabajo presupuestado' : '🔨 Trabajo realizado', r.trabajo_items));
    if (r.materiales_items?.length) body.appendChild(buildCardTabla(tipo === 'PRE' ? '🛒 Materiales cotizados' : '🛒 Materiales usados', r.materiales_items));
  }

  /* Encomienda */
  if (tipo === 'OTT') {
    const enc = [
      r.encomienda_entrada_transporte ? ['Transporte (entrada)', r.encomienda_entrada_transporte] : null,
      r.encomienda_entrada_guia       ? ['Guía (entrada)',       r.encomienda_entrada_guia]       : null,
      r.encomienda_entrada_costo > 0  ? ['Costo entrada',        pesos(r.encomienda_entrada_costo)] : null,
      r.encomienda_retorno_transporte ? ['Transporte (retorno)', r.encomienda_retorno_transporte] : null,
      r.encomienda_retorno_guia       ? ['Guía (retorno)',       r.encomienda_retorno_guia]       : null,
      r.encomienda_retorno_costo > 0  ? ['Costo retorno',        pesos(r.encomienda_retorno_costo)] : null,
    ].filter(Boolean);
    if (enc.length) body.appendChild(buildCardDetalle('📦 Encomienda', enc));
  }
  if (tipo === 'ING' && r.encomienda) {
    const enc = [
      r.encomienda_transporte ? ['Transporte', r.encomienda_transporte] : null,
      r.encomienda_guia       ? ['Guía',       r.encomienda_guia]       : null,
      r.encomienda_costo > 0  ? ['Costo envío', pesos(r.encomienda_costo)] : null,
    ].filter(Boolean);
    if (enc.length) body.appendChild(buildCardDetalle('📦 Encomienda', enc));
  }

  /* Costos */
  if (tipo === 'OTT') {
    const pagos  = r.r?.pagos || [];
    const pagado = pagos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
    body.appendChild(buildCardDetalle('💰 Presupuesto', [
      ['Total presupuestado', pesos(r.total || 0)],
      ['Adelanto' + (r.adelanto_pct ? ` (${r.adelanto_pct}%)` : ' (form)'), pesos(r.adelanto || 0)],
      ['Pagado real',         pesos(pagado)],
      ['Saldo',               pesos(Math.max(0, (r.total || 0) - pagado))],
      ['Garantía',            r.garantia],
      ['Tiempo estimado',     r.tiempo_estimado]
    ]));
  } else if (tipo === 'OTE' || tipo === 'PRE') {
    const pagos  = r.r?.pagos || [];
    const pagado = pagos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
    const saldo  = Math.max(0, (r.total || 0) - pagado);
    body.appendChild(buildCardDetalle('💰 Costos', [
      ['Subtotal trabajo',    pesos(r.sub_trabajo    || 0)],
      ['Subtotal materiales', pesos(r.sub_materiales || 0)],
      ['Mano de obra',        pesos(r.mano_obra      || 0)],
      ['Viático',             pesos(r.viatico        || 0)],
      ['TOTAL',               pesos(r.total          || 0)],
      pagado > 0 ? ['Pagado',          pesos(pagado)] : null,
      saldo  > 0 ? ['Saldo pendiente', pesos(saldo)]  : null,
    ].filter(Boolean)));
  }

  /* Pagos */
  if (r.r?.pagos?.length) body.appendChild(buildCardPagos(r.r.pagos));

  /* Repuestos / gastos internos (OTT y OTE) — se llena async tras render */
  if (tipo === 'OTT' || tipo === 'OTE') {
    const cont = document.createElement('div');
    cont.id = 'detalle-repuestos';
    body.appendChild(cont);
  }

  /* Botón Fotos del trabajo (ING, OTT, OTE) */
  if (tipo === 'ING' || tipo === 'OTT' || tipo === 'OTE') {
    const cardFotos = document.createElement('div');
    cardFotos.className = 'card';
    cardFotos.innerHTML = `<div class="card-title">📷 Fotos del trabajo</div>`;
    const btnFotos = document.createElement('button');
    btnFotos.className = 'btn btn-ghost btn-block btn-sm';
    btnFotos.type = 'button';
    btnFotos.textContent = '📷 Ver / agregar fotos';
    btnFotos.addEventListener('click', () => {
      if (window.abrirGaleriaFotos) window.abrirGaleriaFotos(r.numero);
    });
    cardFotos.appendChild(btnFotos);
    body.appendChild(cardFotos);
  }

  /* Lazy-load cards de pago, estado, impresión, WA */
  import('./panel.payments.js').then(m => {
    if (!archivado && (tipo === 'OTT' || tipo === 'OTE' || tipo === 'PRE')) {
      body.appendChild(m.buildCardBotonPago(r.numero));
    }
  });

  if (!archivado && ESTADOS_POR_TIPO[tipo]) {
    body.appendChild(buildCardCambioEstado(r.estado, tipo, val => {
      detalleActual.cambios.estado = val;
    }));
  } else {
    body.appendChild(buildCardEstadoArchivado(r.estado, r.creado_at));
  }

  import('./panel.router.js').then(m => body.appendChild(m.buildCardImpresion(tipo)));
  import('./panel.alerts.js').then(m => {
    if (r.cliente_telefono) body.appendChild(m.buildCardWhatsApp(r));
  });
}

/* ── Guardar cambios ──────────────────────────────────── */
export async function guardarCambiosDetalle() {
  const db = store.get('db');
  if (!db || !detalleActual.numero || detalleActual.archivado) return;
  const cambios = detalleActual.cambios || {};
  if (!Object.keys(cambios).length) { showToast('Sin cambios para guardar', 'info'); return; }

  try {
    const storeName = STORE_POR_TIPO[detalleActual.tipo];
    const reg       = await dbGet(db, storeName, detalleActual.numero);
    if (!reg) { showToast('No encontrado', 'error'); return; }

    const estadoAnterior = reg.estado;
    if (cambios.estado) reg.estado = cambios.estado;
    reg.actualizado_at = new Date().toISOString();
    await dbPut(db, storeName, reg);

    if ((cambios.estado === 'pagado' || cambios.estado === 'entregado') && estadoAnterior !== cambios.estado) {
      /* ── Registrar el cobro al entregar (sincronizado orden + caja) ──
         Antes se sumaba el total completo a la caja a ciegas, sin registrar
         el pago en la orden: la caja quedaba inflada y "Por cobrar" seguía
         mostrando saldo. Ahora se calcula el saldo real y se pregunta cuánto
         se cobró, registrando el pago bien (actualiza orden Y caja juntas). */
      const total = parseFloat(reg.total) || 0;
      const pagosPrevios = (reg.r && Array.isArray(reg.r.pagos)) ? reg.r.pagos : [];
      const yaPagado = pagosPrevios.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
      const saldo = Math.max(0, total - yaPagado);

      if (saldo > 0) {
        /* Ventanita linda: pregunta cuánto cobró con botones */
        const montoCobrado = await pedirCobroEntrega(reg.numero, saldo);

        if (montoCobrado > 0) {
          /* Registrar el pago en la orden (r.pagos) Y en la caja, sincronizados */
          if (!reg.r) reg.r = {};
          if (!Array.isArray(reg.r.pagos)) reg.r.pagos = [];
          const fechaPago = new Date().toISOString().slice(0, 10);
          reg.r.pagos.push({ monto: montoCobrado, metodo: 'efectivo', fecha: fechaPago, nota: 'Cobro al entregar', registrado_at: new Date().toISOString() });
          await dbPut(db, storeName, reg);
          await onPartialPayment(reg, { monto: montoCobrado, metodo: 'efectivo', fecha: fechaPago, nota: 'Cobro al entregar' }).catch(e => console.warn(e));
        }
      }

      if (detalleActual.tipo === 'OTT') {
        registrarEntrega(db, reg.numero).catch(e => console.warn(e));
      }
      /* Cerrar el registro de rentabilidad con el ingreso real ya cobrado */
      const pagosFinal = (reg.r && Array.isArray(reg.r.pagos)) ? reg.r.pagos : [];
      const ingreso = pagosFinal.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
      let costo = 0;
      if (detalleActual.tipo === 'OTT') costo = (parseFloat(reg.encomienda_entrada_costo)||0) + (parseFloat(reg.encomienda_retorno_costo)||0);
      else if (detalleActual.tipo === 'OTE') costo = (parseFloat(reg.sub_materiales)||0) + (parseFloat(reg.gasto_vianda)||0) + (parseFloat(reg.gasto_movilidad)||0) + (parseFloat(reg.gasto_otros)||0);
      cerrarRegistroReal(reg.numero, { ingreso, costo, horas: 0 }).catch(e => console.warn(e));

      if (detalleActual.tipo === 'OTE' && reg.numPresupuesto) {
        dbGet(db, 'presupuestos', reg.numPresupuesto).then(pre => {
          if (pre) { pre.estado = cambios.estado; pre.actualizado_at = new Date().toISOString(); return dbPut(db, 'presupuestos', pre); }
        }).catch(e => console.warn(e));
      }
    }

    await logEvent(db, {
      type: 'ORDER_STATE_CHANGED',
      message: `Estado ${reg.numero}: ${estadoAnterior} → ${reg.estado}`,
      ref: reg.numero, data: { from: estadoAnterior, to: reg.estado }
    });

    invalidateCache();
    cerrarModalDetalle();
    bus.emit('panel:refresh', {});
    showToast('✓ Cambios guardados', 'success');

  } catch(err) {
    console.error('[guardarCambiosDetalle]', err);
    showToast('Error al guardar: ' + err.message, 'error');
  }
}

/* ════════════════════════════════════════════════════════════════
   MODAL — COBRO AL ENTREGAR (ventanita linda)
   Muestra el modal con botones y devuelve una Promise con el monto
   cobrado (0 si no cobró nada). Reemplaza los prompt() del navegador.
   ──────────────────────────────────────────────────────────────── */
let _cobroResolve = null;
let _cobroSaldo = 0;

function pedirCobroEntrega(numero, saldo) {
  _cobroSaldo = saldo;
  const body = document.getElementById('modal-cobro-entrega-body');
  if (body) {
    body.innerHTML = `
      <div style="text-align:center;padding:8px 0;">
        <div class="dim txt-sm">Entregando ${escapeHtml(numero)}</div>
        <div class="dim txt-xs" style="margin-top:4px;">Saldo pendiente</div>
        <div class="bold mono" style="font-size:26px;color:var(--acento);margin-top:2px;">${pesos(saldo)}</div>
        <div class="dim txt-xs" style="margin-top:10px;">Elegí cuánto cobraste al entregar el equipo.</div>
      </div>`;
  }
  document.getElementById('modal-cobro-entrega')?.classList.add('active');
  return new Promise(resolve => { _cobroResolve = resolve; });
}

export function confirmarCobroEntrega(opcion) {
  const saldo = _cobroSaldo;
  let monto = 0;
  if (opcion === 'todo') {
    monto = saldo;
  } else if (opcion === 'parte') {
    const txt = prompt(`¿Cuánto cobraste de los ${pesos(saldo)}?`, '');
    monto = Math.min(saldo, Math.max(0, parseFloat(txt) || 0));
  } else {
    monto = 0; // nada
  }
  document.getElementById('modal-cobro-entrega')?.classList.remove('active');
  if (_cobroResolve) { _cobroResolve(monto); _cobroResolve = null; }
}

export function cerrarCobroEntrega() {
  /* Cerrar sin elegir = no cobró nada (queda pendiente) */
  document.getElementById('modal-cobro-entrega')?.classList.remove('active');
  if (_cobroResolve) { _cobroResolve(0); _cobroResolve = null; }
}

/* ════════════════════════════════════════════════════════════════
   AVANZAR ESTADO RÁPIDO (botón "→ siguiente" en las tarjetas)
   Cambia el estado en 1 toque, sin abrir el modal. Si el nuevo estado
   es 'entregado'/'pagado' con saldo pendiente, dispara la ventanita
   de cobro (misma lógica que el modal de detalle).
   ──────────────────────────────────────────────────────────────── */
export async function avanzarEstadoRapido(numero, tipo, nuevoEstado) {
  const db = store.get('db');
  if (!db) { showToast('⚠️ Base de datos no disponible', 'warn'); return; }
  const storeName = STORE_POR_TIPO[tipo];
  if (!storeName) { showToast('Tipo desconocido: ' + tipo, 'warn'); return; }

  try {
    const reg = await dbGet(db, storeName, numero);
    if (!reg) { showToast('No encontrado: ' + numero, 'warn'); return; }

    const estadoAnterior = reg.estado;
    reg.estado = nuevoEstado;
    reg.actualizado_at = new Date().toISOString();

    /* Si pasa a entregado/pagado con saldo → registrar cobro (ventanita linda) */
    if ((nuevoEstado === 'entregado' || nuevoEstado === 'pagado') && estadoAnterior !== nuevoEstado) {
      const total = parseFloat(reg.total) || 0;
      const pagosPrevios = (reg.r && Array.isArray(reg.r.pagos)) ? reg.r.pagos : [];
      const yaPagado = pagosPrevios.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
      const saldo = Math.max(0, total - yaPagado);

      if (saldo > 0) {
        const montoCobrado = await pedirCobroEntrega(reg.numero, saldo);
        if (montoCobrado > 0) {
          if (!reg.r) reg.r = {};
          if (!Array.isArray(reg.r.pagos)) reg.r.pagos = [];
          const fechaPago = new Date().toISOString().slice(0, 10);
          reg.r.pagos.push({ monto: montoCobrado, metodo: 'efectivo', fecha: fechaPago, nota: 'Cobro al entregar', registrado_at: new Date().toISOString() });
          await onPartialPayment(reg, { monto: montoCobrado, metodo: 'efectivo', fecha: fechaPago, nota: 'Cobro al entregar' }).catch(e => console.warn(e));
        }
      }

      if (tipo === 'OTT') registrarEntrega(db, reg.numero).catch(e => console.warn(e));
      const pagosFinal = (reg.r && Array.isArray(reg.r.pagos)) ? reg.r.pagos : [];
      const ingreso = pagosFinal.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
      cerrarRegistroReal(reg.numero, { ingreso, costo: 0, horas: 0 }).catch(e => console.warn(e));
    }

    await dbPut(db, storeName, reg);
    await logEvent(db, { type: 'ORDER_STATE_CHANGED', message: `Estado ${reg.numero}: ${estadoAnterior} → ${nuevoEstado} (rápido)`, ref: reg.numero });
    invalidateCache();
    bus.emit('panel:refresh', {});
    showToast(`✓ ${reg.numero} → ${getLabelEstado(nuevoEstado)}`, 'success');
  } catch (err) {
    console.error('[avanzarEstadoRapido]', err);
    showToast('Error: ' + err.message, 'error');
  }
}
