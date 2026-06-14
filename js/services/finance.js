/**
 * ELECTROMEL — finance.js
 * FinanceService v3 — fuente única de verdad para movimientos financieros.
 * Nadie escribe directamente en finance_movements, solo a través de este servicio.
 */

import { dbGetAll, dbPut, dbGet } from '../core/db.js';
import { logEvent } from '../core/db.js';
import { pesos }    from '../core/utils.js';
import { store }    from '../core/store.js';

const TYPES = {
  INCOME:  'income',
  EXPENSE: 'expense'
};

const CATEGORIES = {
  TRABAJO:    'trabajo',
  COMPONENTE: 'componente',
  LOGISTICA:  'logistica',
  VIATIC:     'viatico',
  ALQUILER:   'alquiler',
  OTRO:       'otro'
};

function _uuid() {
  return 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/* ── createMovement ─────────────────────────────────────── */
async function createMovement({ type, category, amount, date, related_order_id,
                                 client_name, description, notes, base }) {
  const db  = store.get('db');
  const mov = {
    transaction_id:   _uuid(),
    type:             type || TYPES.EXPENSE,
    category:         category || CATEGORIES.OTRO,
    amount:           parseFloat(amount) || 0,
    date:             date || new Date().toISOString().slice(0, 10),
    related_order_id: related_order_id || null,
    client_name:      client_name || null,
    description:      description || '',
    notes:            notes || '',
    base:             base || 'SMA',
    created_at:       new Date().toISOString()
  };
  await dbPut(db, 'finance_movements', mov);
  return mov;
}

/* ── canAddIncome — usa índice IDB, no full scan ────────── */
async function canAddIncome(orderId) {
  if (!orderId) return false;
  const db = store.get('db');
  return new Promise((resolve, reject) => {
    try {
      const tx  = db.transaction('finance_movements', 'readonly');
      const idx = tx.objectStore('finance_movements').index('related_order_id');
      const req = idx.getAll(IDBKeyRange.only(orderId));
      req.onsuccess = () => {
        const tiene = (req.result || []).some(m => m.type === TYPES.INCOME);
        resolve(!tiene);
      };
      req.onerror = () => reject(req.error);
    } catch(e) { reject(e); }
  });
}

/* ── onOrderDelivered ────────────────────────────────────── */
export async function onOrderDelivered(order) {
  const ok = await canAddIncome(order.numero);
  if (!ok) throw new Error('Income ya registrado para ' + order.numero);

  const mov = await createMovement({
    type:             TYPES.INCOME,
    category:         CATEGORIES.TRABAJO,
    amount:           parseFloat(order.total) || 0,
    date:             new Date().toISOString().slice(0, 10),
    related_order_id: order.numero,
    client_name:      order.cliente_nombre,
    description:      `Entrega: ${order.numero}`,
    base:             order.base || 'SMA'
  });

  await logEvent(store.get('db'), {
    type:    'ORDER_PAID',
    message: `Ingreso registrado: ${order.numero} — ${pesos(order.total)}`,
    ref:     order.numero,
    data:    { transaction_id: mov.transaction_id, amount: mov.amount }
  });

  return mov;
}

/* ── onPartialPayment ────────────────────────────────────── */
export async function onPartialPayment(order, { monto, metodo, fecha, nota }) {
  return createMovement({
    type:             TYPES.INCOME,
    category:         CATEGORIES.TRABAJO,
    amount:           parseFloat(monto) || 0,
    date:             fecha || new Date().toISOString().slice(0, 10),
    related_order_id: order.numero,
    client_name:      order.cliente_nombre,
    description:      `Pago parcial (${metodo || 'efectivo'}): ${order.numero}`,
    notes:            nota || '',
    base:             order.base || 'SMA'
  });
}

/* ── onOrderExpense ──────────────────────────────────────── */
export async function onOrderExpense(order, { category, amount, description }) {
  return createMovement({
    type:             TYPES.EXPENSE,
    category:         category || CATEGORIES.COMPONENTE,
    amount:           parseFloat(amount) || 0,
    date:             new Date().toISOString().slice(0, 10),
    related_order_id: order.numero,
    client_name:      order.cliente_nombre,
    description:      description || '',
    base:             order.base || 'SMA'
  });
}

/* ── adjustOrderExpense ──────────────────────────────────── */
export async function adjustOrderExpense(order, originalTxId, newData) {
  const db = store.get('db');
  if (!originalTxId) throw new Error('adjustOrderExpense: falta originalTxId');
  const orig = await dbGet(db, 'finance_movements', originalTxId);
  if (!orig)          throw new Error('adjustOrderExpense: movimiento no encontrado');

  const newAmount = parseFloat(newData.amount) || 0;
  const diff      = newAmount - orig.amount;
  if (Math.abs(diff) < 0.01) return null;

  const isReduction = diff < 0;
  const adjMov = await createMovement({
    type:             TYPES.EXPENSE,
    category:         orig.category,
    amount:           Math.abs(diff),
    date:             newData.date || new Date().toISOString().slice(0, 10),
    related_order_id: orig.related_order_id,
    client_name:      orig.client_name,
    description:      `AJUSTE ${isReduction ? '(-)' : '(+)'} ${orig.description || ''}`,
    notes:            `Ajuste de ${originalTxId}. Original: ${pesos(orig.amount)} → Nuevo: ${pesos(newAmount)}`,
    base:             orig.base
  });

  adjMov.is_adjustment = true;
  adjMov.adjusts_tx_id = originalTxId;
  adjMov.is_reduction  = isReduction;
  await dbPut(db, 'finance_movements', adjMov);

  await logEvent(db, {
    type:    'EXPENSE_ADJUSTED',
    message: `Ajuste ${isReduction ? '−' : '+'}${pesos(Math.abs(diff))}`,
    ref:     orig.related_order_id,
    data:    { original_tx: originalTxId, diff }
  });

  return adjMov;
}

/* ── getLogs ────────────────────────────────────────────── */
export async function getLogs(filters = {}) {
  const db   = store.get('db');
  let movs   = await dbGetAll(db, 'finance_movements', false);
  if (filters.from) movs = movs.filter(m => m.date >= filters.from);
  if (filters.to)   movs = movs.filter(m => m.date <= filters.to);
  if (filters.type) movs = movs.filter(m => m.type === filters.type);
  if (filters.base) movs = movs.filter(m => m.base === filters.base);
  return movs;
}

/* ── resumenPeriodo ─────────────────────────────────────── */
export async function resumenPeriodo(rango) {
  const db = store.get('db');
  if (!db) return { ingresos: 0, egresos: 0, ganancia: 0, n_trabajos: 0, ticket_avg: 0 };

  const movs = await dbGetAll(db, 'finance_movements');
  const enRango = movs.filter(m => m.date >= rango.from && m.date <= rango.to);

  const ingresos = enRango
    .filter(m => m.type === TYPES.INCOME && !m.is_adjustment)
    .reduce((a, m) => a + (m.amount || 0), 0);

  const egresos = enRango
    .filter(m => m.type === TYPES.EXPENSE)
    .reduce((a, m) => {
      if (m.is_adjustment && m.is_reduction) return a - (m.amount || 0);
      return a + (m.amount || 0);
    }, 0);

  const trabajos = enRango.filter(m =>
    m.type === TYPES.INCOME &&
    !m.is_adjustment &&
    m.category === CATEGORIES.TRABAJO
  );

  return {
    ingresos,
    egresos,
    ganancia:    ingresos - egresos,
    n_trabajos:  trabajos.length,
    ticket_avg:  trabajos.length ? ingresos / trabajos.length : 0
  };
}

export { TYPES, CATEGORIES };
