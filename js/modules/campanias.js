/* ═══════════════════════════════════════════════════════════
   📈 CAMPAÑAS — Marketing / origen de clientes
   Vive dentro de Admin. Los clientes se derivan de los trabajos
   reales (el origen se carga al crear el ingreso). Las campañas
   son el gasto de publicidad por canal (egreso a la caja).
   El sistema cruza ambos y calcula clientes/origen, facturado,
   costo por cliente y ROI.
   ═══════════════════════════════════════════════════════════ */
import { store }                       from '../core/store.js';
import { dbGetAll, dbGet, dbPut, dbDelete, invalidateCache, logEvent } from '../core/db.js';
import { showToast, confirmarLindo }   from '../core/ui.js';
import { pesos, escapeHtml }           from '../core/utils.js';
import { egresoPublicidad }            from '../services/finance.js';

/* Opciones rápidas de "¿Cómo nos conociste?" */
export const ORIGENES = [
  'Facebook', 'Marketplace', 'Grupo Facebook', 'WhatsApp',
  'Cliente anterior', 'Recomendación', 'Publicidad callejera', 'Google', 'Otro'
];

function _uuid() {
  return 'camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* ── CRUD de campañas ────────────────────────────────────── */
export async function listarCampanias() {
  const db = store.get('db');
  try { return (await dbGetAll(db, 'campanias')) || []; } catch (e) { return []; }
}

export async function agregarCampania({ canal, monto, fecha, nombre }) {
  const db = store.get('db');
  const m  = parseFloat(monto) || 0;
  const f  = fecha || new Date().toISOString().slice(0, 10);
  /* Egreso real en la caja (categoría publicidad) */
  const mov = await egresoPublicidad({ monto: m, fecha: f, descripcion: 'Campaña: ' + (nombre || canal) });
  const camp = {
    id:             _uuid(),
    canal,
    nombre:         nombre || canal,
    monto:          m,
    fecha:          f,
    transaction_id: mov.transaction_id,
    created_at:     new Date().toISOString()
  };
  await dbPut(db, 'campanias', camp);
  invalidateCache();
  await logEvent(db, { type: 'CAMP_ADDED', message: 'Campaña: ' + canal + ' $' + m }).catch(()=>{});
  return camp;
}

export async function borrarCampania(id) {
  const db = store.get('db');
  const camp = await dbGet(db, 'campanias', id);
  if (!camp) return;
  if (camp.transaction_id) await dbDelete(db, 'finance_movements', camp.transaction_id).catch(()=>{});
  await dbDelete(db, 'campanias', id);
  invalidateCache();
}

/* ── Cálculo de métricas por origen ──────────────────────────
   Clientes = ingresos con ese origen.
   Facturado = total de las OTT vinculadas a esos ingresos.
   Gastado = suma de campañas de ese canal. */
export async function calcularMetricas() {
  const db = store.get('db');
  const [ingresos, ordenes, campanias] = await Promise.all([
    dbGetAll(db, 'ingresos').catch(()=>[]),
    dbGetAll(db, 'ordenes').catch(()=>[]),
    dbGetAll(db, 'campanias').catch(()=>[])
  ]);

  /* Facturado por número de ingreso (de las OTT) */
  const totalPorIngreso = {};
  (ordenes || []).forEach(o => {
    if (o.numIngreso) {
      totalPorIngreso[o.numIngreso] = (totalPorIngreso[o.numIngreso] || 0) + (parseFloat(o.total) || 0);
    }
  });

  const porOrigen = {};
  const ensure = (k) => porOrigen[k] || (porOrigen[k] = { origen: k, clientes: 0, facturado: 0, gastado: 0 });

  (ingresos || []).forEach(ing => {
    const o = (ing.origen_marketing || '').trim();
    if (!o) return;
    const row = ensure(o);
    row.clientes++;
    row.facturado += totalPorIngreso[ing.numero] || 0;
  });

  (campanias || []).forEach(c => {
    const row = ensure(c.canal);
    row.gastado += parseFloat(c.monto) || 0;
  });

  const filas = Object.values(porOrigen).map(r => ({
    ...r,
    costoPorCliente: r.clientes ? r.gastado / r.clientes : 0,
    roi:             r.gastado > 0 ? r.facturado / r.gastado : null
  })).sort((a, b) => b.facturado - a.facturado);

  const total = filas.reduce((a, r) => ({
    clientes:  a.clientes  + r.clientes,
    facturado: a.facturado + r.facturado,
    gastado:   a.gastado   + r.gastado
  }), { clientes: 0, facturado: 0, gastado: 0 });

  return { filas, total, campanias: campanias || [] };
}

/* ── Render del panel (dentro de Admin) ──────────────────── */
export async function renderCampanias() {
  const cont = document.getElementById('campanias-panel');
  if (!cont) return;

  const { filas, total, campanias } = await calcularMetricas();
  const roiGlobal = total.gastado > 0 ? (total.facturado / total.gastado) : null;

  /* Tabla por origen */
  const filasHtml = filas.length ? filas.map(r => `
    <div class="row" style="justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--borde);">
      <div style="flex:1;min-width:0;">
        <div class="txt-sm bold">${escapeHtml(r.origen)}</div>
        <div class="dim txt-xs">${r.clientes} cliente${r.clientes===1?'':'s'}${r.gastado>0?' · gastado '+pesos(r.gastado):''}</div>
      </div>
      <div style="text-align:right;">
        <div class="ok bold mono txt-sm">${pesos(r.facturado)}</div>
        <div class="dim txt-xs">${r.roi!=null ? r.roi.toFixed(1)+'× ROI · '+pesos(r.costoPorCliente)+'/cli' : (r.clientes?'sin gasto asociado':'')}</div>
      </div>
    </div>`).join('')
    : '<div class="dim txt-sm" style="padding:10px 0;">Todavía no hay clientes con origen cargado. Cargá el origen al crear un ingreso (botón "¿Cómo nos conociste?").</div>';

  /* Campañas cargadas */
  const campsHtml = (campanias || []).slice().sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(c => `
    <div class="row" style="justify-content:space-between;align-items:center;background:var(--surface-3);border-radius:8px;padding:8px 10px;margin-bottom:6px;">
      <div><div class="txt-sm">${escapeHtml(c.nombre || c.canal)}</div><div class="dim txt-xs">${escapeHtml(c.canal)} · ${c.fecha||''}</div></div>
      <div class="row center" style="gap:8px;">
        <span class="mono peligro txt-sm">-${pesos(c.monto)}</span>
        <button class="btn btn-ghost btn-sm" type="button" onclick="borrarCampaniaUI('${c.id}')" aria-label="Quitar">✕</button>
      </div>
    </div>`).join('');

  const opciones = ORIGENES.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');

  cont.innerHTML = `
    <div class="card">

      <div class="row" style="gap:8px;margin:8px 0;">
        <div style="flex:1;background:var(--surface-2);border-radius:10px;padding:10px;text-align:center;">
          <div class="dim txt-xs">Clientes</div>
          <div class="bold" style="font-size:18px;">${total.clientes}</div>
        </div>
        <div style="flex:1;background:var(--surface-2);border-radius:10px;padding:10px;text-align:center;">
          <div class="dim txt-xs">Facturado</div>
          <div class="ok bold" style="font-size:16px;">${pesos(total.facturado)}</div>
        </div>
        <div style="flex:1;background:var(--surface-2);border-radius:10px;padding:10px;text-align:center;">
          <div class="dim txt-xs">ROI global</div>
          <div class="bold" style="font-size:18px;">${roiGlobal!=null ? roiGlobal.toFixed(1)+'×' : '—'}</div>
        </div>
      </div>

      <div style="margin-top:6px;">${filasHtml}</div>

      <details style="margin-top:12px;border-top:1px solid var(--borde);padding-top:10px;">
        <summary style="cursor:pointer;font-size:13px;color:var(--acento);list-style:none;user-select:none;">💸 Cargar gasto de campaña${campanias.length?' · '+campanias.length+' cargada'+(campanias.length===1?'':'s'):''}</summary>
        <div class="dim txt-xs" style="margin:8px 0;">El gasto descuenta de la caja como egreso de publicidad.</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <select id="camp-canal" style="flex:1;min-width:130px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:8px;color:var(--texto);font-size:13px;">${opciones}</select>
          <input type="number" id="camp-monto" placeholder="$ gastado" inputmode="numeric" style="max-width:110px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:8px;color:var(--texto);font-size:13px;">
        </div>
        <div class="row" style="gap:6px;align-items:center;margin-bottom:8px;">
          <input type="text" id="camp-nombre" placeholder="Nombre (opc. ej: Facebook Junio)" style="flex:1;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:8px;color:var(--texto);font-size:12px;">
          <input type="date" id="camp-fecha" style="background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:7px;color:var(--texto);font-size:12px;">
        </div>
        <button class="btn btn-primary" type="button" style="width:100%;" onclick="agregarCampaniaUI()">+ Cargar campaña</button>
        ${campsHtml ? `<div style="margin-top:10px;">${campsHtml}</div>` : ''}
      </details>
    </div>`;
}

/* ── Acciones de UI (globales) ───────────────────────────── */
window.agregarCampaniaUI = async () => {
  const canal  = document.getElementById('camp-canal')?.value || 'Otro';
  const monto  = parseFloat(document.getElementById('camp-monto')?.value) || 0;
  const nombre = (document.getElementById('camp-nombre')?.value || '').trim();
  const fecha  = document.getElementById('camp-fecha')?.value || new Date().toISOString().slice(0,10);
  if (monto <= 0) { showToast('Poné un monto mayor a 0', 'warn'); return; }
  try {
    await agregarCampania({ canal, monto, fecha, nombre });
    showToast('✓ Campaña cargada', 'success');
    await renderCampanias();
  } catch (e) { console.warn('[agregarCampaniaUI]', e); showToast('No se pudo cargar', 'error'); }
};

window.borrarCampaniaUI = async (id) => {
  const ok = await confirmarLindo('¿Borrar esta campaña? También se quita el egreso de la caja.', {
    titulo: 'Borrar campaña', textoOk: 'Borrar', peligro: true
  });
  if (!ok) return;
  try {
    await borrarCampania(id);
    showToast('✓ Campaña borrada', 'success');
    await renderCampanias();
  } catch (e) { console.warn('[borrarCampaniaUI]', e); showToast('No se pudo borrar', 'error'); }
};
