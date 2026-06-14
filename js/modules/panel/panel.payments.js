/**
 * ELECTROMEL — modules/panel/panel.payments.js
 * Pagos parciales: abrir modal, cerrar, confirmar.
 */

import { store, bus }   from '../../core/store.js';
import { dbGet, dbPut, invalidateCache } from '../../core/db.js';
import { showToast }    from '../../core/ui.js';
import { pesos, getTipoFromNumero, STORE_POR_TIPO } from '../../core/utils.js';
import { onPartialPayment } from '../../services/finance.js';

/* ── Card botón pago ──────────────────────────────────── */
export function buildCardBotonPago(numero) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="card-title">💵 Registrar pago</div>';
  const btn = document.createElement('button');
  btn.className   = 'btn btn-primary btn-block';
  btn.type        = 'button';
  btn.textContent = '💵 Cargar pago / seña';
  btn.addEventListener('click', () => {
    import('./panel.detail.js').then(m => m.cerrarModalDetalle());
    setTimeout(() => abrirPagoParcial(numero), 100);
  });
  card.appendChild(btn);
  return card;
}

/* ── Abrir ────────────────────────────────────────────── */
export async function abrirPagoParcial(numero) {
  const db = store.get('db');
  if (!db) return;
  const tipo      = getTipoFromNumero(numero);
  const storeName = STORE_POR_TIPO[tipo] || 'ordenes';
  const orden     = await dbGet(db, storeName, numero);
  if (!orden) { showToast('⚠️ Registro no encontrado: ' + numero, 'error'); return; }

  store.set('pago.activoNumero', numero);
  store.set('pago.activoStore',  storeName);

  const total  = parseFloat(orden.total) || 0;
  const pagado = (orden.r?.pagos || []).reduce((a, p) => a + (parseFloat(p.monto) || 0), 0);
  const saldo  = Math.max(0, total - pagado);

  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s('pago-numero',  numero);
  s('pago-cliente', orden.cliente_nombre || '—');
  s('pago-total',   pesos(total));
  s('pago-pagado',  pesos(pagado));
  s('pago-saldo',   pesos(saldo));

  const montoEl = document.getElementById('pago-monto');
  if (montoEl) montoEl.value = saldo > 0 ? saldo : '';

  const metodoEl = document.getElementById('pago-metodo');
  if (metodoEl) metodoEl.value = 'efectivo';

  const fechaEl = document.getElementById('pago-fecha');
  if (fechaEl) fechaEl.value = new Date().toISOString().slice(0, 10);

  const notaEl = document.getElementById('pago-nota');
  if (notaEl) notaEl.value = '';

  document.getElementById('modal-pago-parcial')?.classList.add('active');
  setTimeout(() => { const e = document.getElementById('pago-monto'); if (e) { e.focus(); e.select(); } }, 200);
}

/* ── Cerrar ───────────────────────────────────────────── */
export function cerrarPagoParcial() {
  document.getElementById('modal-pago-parcial')?.classList.remove('active');
  store.set('pago.activoNumero', null);
  store.set('pago.activoStore',  null);
}

/* ── Confirmar ────────────────────────────────────────── */
export async function confirmarPagoParcial() {
  const db        = store.get('db');
  const numero    = store.get('pago.activoNumero');
  const storeName = store.get('pago.activoStore');
  if (!db || !numero) return;

  const monto = parseFloat(document.getElementById('pago-monto')?.value);
  if (!isFinite(monto) || monto <= 0) { showToast('⚠️ Monto inválido', 'warn'); return; }

  const metodo = document.getElementById('pago-metodo')?.value || 'efectivo';
  const fecha  = document.getElementById('pago-fecha')?.value  || new Date().toISOString().slice(0, 10);
  const nota   = document.getElementById('pago-nota')?.value?.trim() || '';

  try {
    const orden = await dbGet(db, storeName, numero);
    if (!orden) { showToast('⚠️ Registro no encontrado', 'error'); return; }

    if (!orden.r) orden.r = {};
    if (!Array.isArray(orden.r.pagos)) orden.r.pagos = [];
    orden.r.pagos.push({ monto, metodo, fecha, nota, registrado_at: new Date().toISOString() });

    await dbPut(db, storeName, orden);
    await onPartialPayment(orden, { monto, metodo, fecha, nota });

    invalidateCache();
    cerrarPagoParcial();
    showToast('✅ Pago registrado: ' + pesos(monto), 'success');
    bus.emit('panel:refresh', {});
    bus.emit('registro:pagado', { numero, tipo: getTipoFromNumero(numero), monto });

  } catch(err) {
    console.error('[confirmarPagoParcial]', err);
    showToast('❌ Error al registrar pago: ' + err.message, 'error');
  }
}
