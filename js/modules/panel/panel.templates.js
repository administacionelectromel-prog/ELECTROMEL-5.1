/**
 * ELECTROMEL — modules/panel/panel.templates.js
 * Builders de elementos DOM para el panel.
 * Funciones puras — no acceden a store ni DB.
 */

import { escapeHtml, pesos, fmtFechaCorta, getLabelEstado,
         formatAntiguedad, getEdadHoras, btnGuard } from '../../core/utils.js';
import { TIPO_ICONOS, TIPO_LABELS, ESTADOS_POR_TIPO, siguienteEstadoSimple } from './panel.store.js';

/* ═══════════════════════════════════════════════════════════
   TARJETA DE REGISTRO (panel principal)
   ═══════════════════════════════════════════════════════════ */

/**
 * Construye el elemento DOM de una tarjeta del panel.
 * @param {Object} r - registro normalizado
 * @param {Function} onDetalle - callback al tocar
 * @param {Function} onCrearOTT - callback botón ING
 */
export function buildTarjeta(r, onDetalle, onCrearOTT) {
  const card = document.createElement('div');
  card.className     = `reg-card semaforo-${r._color}`;
  card.dataset.numero = r.numero;
  card.dataset.tipo   = r.tipo;

  card.innerHTML =
    `<div class="reg-card-head">
      <span>${TIPO_ICONOS[r.tipo] || ''}</span>
      <span class="reg-card-tipo">${TIPO_LABELS[r.tipo] || r.tipo}</span>
      <span class="reg-card-numero">${escapeHtml(r.numero)}</span>
      <span class="reg-card-estado estado-${r._color}">${getLabelEstado(r.estado)}</span>
    </div>
    <div class="reg-card-cliente">${escapeHtml(r.cliente_nombre)}</div>`;

  const eqParts = [r.equipo_tipo, r.equipo_marca, r.equipo_modelo].filter(Boolean);
  if (eqParts.length) {
    const eq = document.createElement('div');
    eq.className   = 'reg-card-equipo';
    eq.textContent = eqParts.join(' · ');
    card.appendChild(eq);
  }

  const foot = document.createElement('div');
  foot.className = 'reg-card-foot';
  foot.innerHTML = `<span class="reg-card-edad">${formatAntiguedad(r._horas)}</span>`;
  if (r.total > 0) foot.innerHTML += `<span class="reg-card-total">${pesos(r.total)}</span>`;
  card.appendChild(foot);

  /* ¿Hay saldo pendiente? (para el botón de cobro rápido)
     Los pagos viven en el registro original (raw.r.pagos), no en el normalizado. */
  const totalReg = parseFloat(r.total) || 0;
  const origen = r.raw || r;
  const pagosReg = (origen.r && Array.isArray(origen.r.pagos)) ? origen.r.pagos : [];
  const pagadoReg = pagosReg.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
  const saldoReg = totalReg - pagadoReg;
  const tienePago = !r.archivado && totalReg > 0 && saldoReg > 0;

  /* Botón "siguiente estado" en 1 toque (camino normal del trabajo).
     Solo si hay un siguiente paso lógico y el trabajo no está archivado. */
  const sig = !r.archivado ? siguienteEstadoSimple(r.tipo, r.estado) : null;
  if (sig || tienePago) {
    const action = document.createElement('div');
    action.className = 'reg-card-action';
    action.style.cssText = 'display:flex;gap:8px;';

    if (sig) {
      const btn = document.createElement('button');
      btn.className   = 'btn btn-success btn-sm';
      btn.type        = 'button';
      btn.style.cssText = 'flex:1.3;font-size:13px;';
      btn.textContent = `→ ${getLabelEstado(sig)}`;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        /* btnGuard frena el doble-toque: bloquea el botón mientras avanza
           el estado (y mientras está abierta la ventanita de cobro), así no
           se dispara el cobro dos veces. Además deshabilito el botón de
           cobro hermano para que no se pueda cobrar por los dos caminos. */
        action.querySelectorAll('button').forEach(b => { if (b !== btn) b.disabled = true; });
        btnGuard(btn, () =>
          Promise.resolve(window.avanzarEstadoRapido?.(r.numero, r.tipo, sig)),
          { minMs: 800 }
        );
      });
      action.appendChild(btn);
    }

    /* Botón de cobro rápido: abre la ventanita de pago directo desde la tarjeta.
       Siempre muestra el monto que resta cobrar. */
    if (tienePago) {
      const btnPago = document.createElement('button');
      btnPago.className = 'btn btn-primary btn-sm';
      btnPago.type      = 'button';
      btnPago.style.cssText = 'flex:1;font-size:13px;white-space:nowrap;';
      btnPago.textContent = `💵 ${pesos(saldoReg)}`;
      btnPago.title = `Cobrar — saldo ${pesos(saldoReg)}`;
      btnPago.addEventListener('click', e => {
        e.stopPropagation();
        window.abrirPagoParcial?.(r.numero);
      });
      action.appendChild(btnPago);
    }

    card.appendChild(action);
  }

  if (r.tipo === 'ING' && onCrearOTT) {
    const action = document.createElement('div');
    action.className = 'reg-card-action';
    const btn = document.createElement('button');
    btn.className   = 'btn btn-primary';
    btn.type        = 'button';
    btn.textContent = '🔧 Crear OTT desde este ingreso';
    btn.addEventListener('click', e => { e.stopPropagation(); onCrearOTT(r.numero); });
    action.appendChild(btn);
    card.appendChild(action);
  }

  card.addEventListener('click', () => onDetalle(r.numero, r.tipo));
  return card;
}

/* ═══════════════════════════════════════════════════════════
   CARDS DEL MODAL DETALLE
   ═══════════════════════════════════════════════════════════ */

export function buildCardDetalle(titulo, filas) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">${escapeHtml(titulo)}</div>`;
  filas.forEach(([label, value]) => {
    if (!value && value !== 0) return;
    const row = document.createElement('div');
    row.className = 'detalle-row';
    row.innerHTML =
      `<span class="detalle-label">${escapeHtml(label)}</span>` +
      `<span class="detalle-value">${escapeHtml(String(value))}</span>`;
    card.appendChild(row);
  });
  return card;
}

export function buildCardBullets(titulo, texto) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">${escapeHtml(titulo)}</div>`;
  String(texto).split('\n').forEach(line => {
    if (!line.trim()) return;
    const p = document.createElement('div');
    p.className   = 'detalle-bullet';
    p.textContent = '• ' + line.trim();
    card.appendChild(p);
  });
  return card;
}

export function buildCardTabla(titulo, items) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">${escapeHtml(titulo)}</div>`;
  items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'tabular-detalle-row';
    row.innerHTML =
      `<span class="dim">${it.cantidad}×</span>` +
      `<span class="flex-1">${escapeHtml(it.detalle || '')}</span>` +
      `<span class="mono">${pesos(it.subtotal || 0)}</span>`;
    card.appendChild(row);
  });
  return card;
}

export function buildCardPagos(pagos) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">💵 Historial de pagos (${pagos.length})</div>`;
  pagos.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'pago-row';
    row.innerHTML =
      `<span class="pago-num">#${i + 1}</span>` +
      `<span class="pago-monto mono bold">${pesos(p.monto || 0)}</span>` +
      `<span class="pago-metodo">${escapeHtml(p.metodo || '—')}</span>` +
      `<span class="pago-fecha">${fmtFechaCorta(p.fecha)}</span>`;
    card.appendChild(row);
  });
  return card;
}

export function buildCardCambioEstado(estadoActual, tipo, onCambio) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="card-title">📊 Cambiar estado</div>';

  const field = document.createElement('div');
  field.className = 'field';
  const select = document.createElement('select');
  select.id = 'detalle-select-estado';
  (ESTADOS_POR_TIPO[tipo] || []).forEach(est => {
    const opt = document.createElement('option');
    opt.value = est; opt.textContent = getLabelEstado(est);
    if (est === estadoActual) opt.selected = true;
    select.appendChild(opt);
  });

  const hintOTE = document.createElement('div');
  hintOTE.style.cssText = 'margin-top:8px;padding:10px;background:var(--surface-2);' +
    'border-radius:var(--r-sm);border:1px solid var(--acento);display:none;';
  hintOTE.innerHTML =
    '<div class="txt-sm bold" style="color:var(--acento);">✅ Presupuesto aprobado</div>' +
    '<div class="txt-sm dim" style="margin-top:4px;">Guardá el cambio de estado y luego ' +
    'abrí el presupuesto para convertirlo en <strong>OTE</strong>.</div>';

  select.addEventListener('change', () => {
    if (onCambio) onCambio(select.value);
    if (tipo === 'PRE') hintOTE.style.display = select.value === 'aprobado' ? 'block' : 'none';
  });

  field.appendChild(select);
  card.appendChild(field);
  if (tipo === 'PRE') card.appendChild(hintOTE);
  return card;
}

export function buildCardEstadoArchivado(estado, creado_at) {
  return buildCardDetalle('📊 Estado', [
    ['Estado actual', getLabelEstado(estado)],
    ['Antigüedad',    formatAntiguedad(getEdadHoras(creado_at))]
  ]);
}

/* ── Empty state ──────────────────────────────────────── */
export function buildEmptyState(vacio) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.innerHTML = `<div class="empty-icon">📋</div>
    <div class="empty-text">${vacio
      ? 'Aún no hay registros.<br>Tocá <span class="acento bold">+</span> para crear uno.'
      : 'Sin resultados con los filtros actuales.'}</div>`;
  return empty;
}
