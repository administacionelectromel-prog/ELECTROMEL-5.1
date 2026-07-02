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
  PUBLICIDAD: 'publicidad',
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

/* ── egresoPublicidad ────────────────────────────────────
   Crea un egreso en la caja por gasto de campaña/publicidad.
   Devuelve el movimiento (con transaction_id para vincularlo). */
export async function egresoPublicidad({ monto, fecha, descripcion }) {
  return createMovement({
    type:        TYPES.EXPENSE,
    category:    CATEGORIES.PUBLICIDAD,
    amount:      monto,
    date:        fecha,
    description: descripcion || 'Campaña publicitaria',
    base:        'SMA'
  });
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

/* ── _findRecentDuplicateIncome ──────────────────────────────
   Busca un ingreso idéntico ya registrado para la misma orden
   (mismo monto, misma fecha, misma descripción) en una ventana
   de tiempo reciente. Sirve para frenar doble-toques / dobles
   disparos que cargaban el mismo pago dos veces a la caja. */
async function _findRecentDuplicateIncome({ related_order_id, amount, date, description }, windowMs = 120000) {
  if (!related_order_id) return null;
  const db = store.get('db');
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx  = db.transaction('finance_movements', 'readonly');
      const idx = tx.objectStore('finance_movements').index('related_order_id');
      const req = idx.getAll(IDBKeyRange.only(related_order_id));
      req.onsuccess = () => {
        const now = Date.now();
        const amt = parseFloat(amount) || 0;
        const dup = (req.result || []).find(m =>
          m.type === TYPES.INCOME &&
          Math.abs((parseFloat(m.amount) || 0) - amt) < 0.01 &&
          m.date === date &&
          (m.description || '') === (description || '') &&
          m.created_at &&
          (now - new Date(m.created_at).getTime()) < windowMs
        );
        resolve(dup || null);
      };
      req.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

/* ── onPartialPayment ────────────────────────────────────── */
export async function onPartialPayment(order, { monto, metodo, fecha, nota }) {
  const amount      = parseFloat(monto) || 0;
  const date        = fecha || new Date().toISOString().slice(0, 10);
  const description = `Pago parcial (${metodo || 'efectivo'}): ${order.numero}`;

  /* Anti-duplicado: si ya hay un pago idéntico (misma orden, mismo monto,
     misma fecha) cargado hace menos de 2 minutos, es un doble disparo →
     no lo vuelvo a contar para no inflar la caja. */
  const dup = await _findRecentDuplicateIncome({ related_order_id: order.numero, amount, date, description });
  if (dup) {
    console.warn('[finance] Pago parcial duplicado evitado:', order.numero, amount);
    return dup;
  }

  return createMovement({
    type:             TYPES.INCOME,
    category:         CATEGORIES.TRABAJO,
    amount,
    date,
    related_order_id: order.numero,
    client_name:      order.cliente_nombre,
    description,
    notes:            nota || '',
    base:             order.base || 'SMA'
  });
}

/* ── gastosOrden ─────────────────────────────────────────
   Devuelve los egresos de repuestos/componentes vinculados a una
   orden (para mostrarlos en la ficha de trabajo). */
export async function gastosOrden(numero) {
  const db = store.get('db');
  if (!db || !numero) return [];
  return new Promise((resolve) => {
    try {
      const tx  = db.transaction('finance_movements', 'readonly');
      const idx = tx.objectStore('finance_movements').index('related_order_id');
      const req = idx.getAll(IDBKeyRange.only(numero));
      req.onsuccess = () => {
        const movs = (req.result || [])
          .filter(m => m.type === TYPES.EXPENSE && m.category === CATEGORIES.COMPONENTE)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        resolve(movs);
      };
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
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
