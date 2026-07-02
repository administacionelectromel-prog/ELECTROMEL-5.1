/* ═══════════════════════════════════════════════════════════
   🩺 DIAGNÓSTICO DE LA BASE — Paso 0 de la migración
   Verificación de SOLO LECTURA: no modifica ni un registro.
   - Stores del esquema vs stores reales de la base abierta
   - Índices esperados vs índices reales
   - Conteo de registros por store
   - Consistencia referencial entre stores
   Genera un informe en pantalla, copiable para soporte.
   ═══════════════════════════════════════════════════════════ */
import { store }              from '../core/store.js';
import { DB_SCHEMA }          from '../core/db.js';
import { escapeHtml }         from '../core/utils.js';
import { showToast }          from '../core/ui.js';

/* Conteo nativo (no carga los registros, ideal para stores pesados) */
function _count(db, storeName) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/* getAll liviano (solo para stores chicos usados en consistencia) */
function _getAll(db, storeName) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

/* ── Diagnóstico completo (solo lectura) ─────────────────── */
export async function diagnosticarBase() {
  const db = store.get('db');
  if (!db) throw new Error('Base de datos no disponible');

  const inf = {
    fecha:      new Date().toISOString(),
    dbVersion:  db.version,
    stores:     [],       /* { nombre, registros, indicesFaltan[] } */
    problemas:  [],       /* { nivel: 'error'|'aviso', detalle } */
    total:      0
  };
  const err   = (d) => inf.problemas.push({ nivel: 'error', detalle: d });
  const aviso = (d) => inf.problemas.push({ nivel: 'aviso', detalle: d });

  /* 1 · Stores: esquema vs reales */
  const reales    = Array.from(db.objectStoreNames);
  const esperados = Object.keys(DB_SCHEMA);
  esperados.forEach(s => { if (!reales.includes(s)) err(`Store faltante en la base: "${s}"`); });
  reales.forEach(s =>    { if (!esperados.includes(s)) aviso(`Store extra (no está en el esquema): "${s}"`); });

  /* 2 · Índices + 3 · Conteos */
  for (const s of esperados) {
    if (!reales.includes(s)) continue;
    const fila = { nombre: s, registros: null, indicesFaltan: [] };
    try {
      const os  = db.transaction(s, 'readonly').objectStore(s);
      const idxReales = Array.from(os.indexNames);
      (DB_SCHEMA[s].indices || []).forEach(ix => {
        if (!idxReales.includes(ix.name)) fila.indicesFaltan.push(ix.name);
      });
      if (fila.indicesFaltan.length) err(`Índices faltantes en "${s}": ${fila.indicesFaltan.join(', ')}`);
    } catch (e) { aviso(`No se pudieron leer los índices de "${s}"`); }
    fila.registros = await _count(db, s);
    if (fila.registros == null) aviso(`No se pudo contar registros de "${s}"`);
    else inf.total += fila.registros;
    inf.stores.push(fila);
  }

  /* 4 · Consistencia referencial (stores livianos) */
  const [ingresos, ordenes, exteriors, finanzas, campanias, presupuestos] = await Promise.all([
    _getAll(db, 'ingresos'), _getAll(db, 'ordenes'),
    _getAll(db, 'exteriors'), _getAll(db, 'finance_movements'),
    _getAll(db, 'campanias'), _getAll(db, 'presupuestos')
  ]);
  const setIng = new Set(ingresos.map(r => r.numero));
  const setOtt = new Set(ordenes.map(r => r.numero));
  const setOte = new Set(exteriors.map(r => r.numero));
  const setPre = new Set(presupuestos.map(r => r.numero));
  const setTxn = new Set(finanzas.map(m => m.transaction_id));

  ordenes.forEach(o => {
    if (o.numIngreso && !setIng.has(o.numIngreso))
      aviso(`${o.numero}: su ingreso "${o.numIngreso}" no existe`);
    const pagado = (o.pagos || []).reduce((a, p) => a + (parseFloat(p.monto ?? p.amount) || 0), 0);
    if (o.total != null && pagado > (parseFloat(o.total) || 0) + 0.01)
      aviso(`${o.numero}: pagos ($${pagado}) superan el total ($${o.total})`);
  });
  ingresos.forEach(i => {
    if (i.convertido_a_ott && !setOtt.has(i.convertido_a_ott))
      aviso(`${i.numero}: apunta a la OTT "${i.convertido_a_ott}" que no existe`);
  });
  finanzas.forEach(m => {
    if (m.related_order_id && !setOtt.has(m.related_order_id) &&
        !setOte.has(m.related_order_id) && !setIng.has(m.related_order_id) &&
        !setPre.has(m.related_order_id))
      aviso(`Movimiento de caja ${m.transaction_id}: su orden "${m.related_order_id}" no existe`);
  });
  campanias.forEach(c => {
    if (c.transaction_id && !setTxn.has(c.transaction_id))
      aviso(`Campaña "${c.nombre || c.canal}": su egreso en caja no existe`);
  });

  return inf;
}

/* ── Informe en texto plano (para copiar/compartir) ──────── */
export function informeTexto(inf) {
  const L = [];
  L.push('🩺 DIAGNÓSTICO ELECTROMEL — ' + inf.fecha.slice(0, 16).replace('T', ' '));
  L.push('DB versión: ' + inf.dbVersion + ' · Registros totales: ' + inf.total);
  L.push('');
  L.push('REGISTROS POR STORE:');
  inf.stores.forEach(s => L.push('  ' + s.nombre + ': ' + (s.registros ?? '?')));
  L.push('');
  const errores = inf.problemas.filter(p => p.nivel === 'error');
  const avisos  = inf.problemas.filter(p => p.nivel === 'aviso');
  L.push('RESULTADO: ' + (errores.length ? '❌ ' + errores.length + ' error(es)' :
                          avisos.length  ? '⚠️ ' + avisos.length + ' aviso(s)' : '✅ Base sana'));
  errores.forEach(p => L.push('  ❌ ' + p.detalle));
  avisos.forEach(p =>  L.push('  ⚠️ ' + p.detalle));
  return L.join('\n');
}

/* ── UI: correr y mostrar en Config ──────────────────────── */
export async function renderDiagnostico() {
  const cont = document.getElementById('diag-resultado');
  if (!cont) return;
  cont.innerHTML = '<div class="dim txt-sm">Analizando la base…</div>';
  try {
    const inf = await diagnosticarBase();
    window.__ultimoDiagTexto = informeTexto(inf);
    const errores = inf.problemas.filter(p => p.nivel === 'error');
    const avisos  = inf.problemas.filter(p => p.nivel === 'aviso');
    const estado  = errores.length
      ? `<span class="peligro bold">❌ ${errores.length} error(es)</span>`
      : avisos.length
        ? `<span class="bold" style="color:var(--acento);">⚠️ ${avisos.length} aviso(s)</span>`
        : '<span class="ok bold">✅ Base sana</span>';

    const filas = inf.stores.map(s =>
      `<div class="row" style="justify-content:space-between;padding:2px 0;">
         <span class="dim txt-xs">${escapeHtml(s.nombre)}</span>
         <span class="mono txt-xs">${s.registros ?? '?'}</span>
       </div>`).join('');

    const probs = inf.problemas.length
      ? '<div style="margin-top:8px;border-top:1px solid var(--borde);padding-top:8px;">' +
        inf.problemas.map(p =>
          `<div class="txt-xs" style="margin-bottom:4px;">${p.nivel === 'error' ? '❌' : '⚠️'} ${escapeHtml(p.detalle)}</div>`).join('') +
        '</div>'
      : '';

    cont.innerHTML = `
      <div style="margin-top:8px;">
        <div class="row" style="justify-content:space-between;align-items:center;">
          <div>${estado}</div>
          <div class="dim txt-xs">${inf.total} registros · DB v${inf.dbVersion}</div>
        </div>
        <details style="margin-top:8px;">
          <summary style="cursor:pointer;font-size:11px;color:var(--acento);list-style:none;user-select:none;">▸ Ver detalle por store</summary>
          <div style="margin-top:6px;">${filas}</div>
        </details>
        ${probs}
        <button class="btn btn-ghost btn-sm" type="button" style="width:100%;margin-top:8px;" onclick="copiarDiagnostico()">📋 Copiar informe</button>
      </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="peligro txt-sm">Error al diagnosticar: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

window.correrDiagnostico = () => renderDiagnostico();

window.copiarDiagnostico = async () => {
  const txt = window.__ultimoDiagTexto || '';
  if (!txt) { showToast('Corré el diagnóstico primero', 'warn'); return; }
  try {
    await navigator.clipboard.writeText(txt);
    showToast('📋 Informe copiado', 'success');
  } catch (e) {
    showToast('No se pudo copiar', 'error');
  }
};
