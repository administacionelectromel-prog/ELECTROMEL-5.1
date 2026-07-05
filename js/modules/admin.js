/**
 * ELECTROMEL — admin.js
 * Módulo de Administración y Contabilidad.
 * Dashboard semanal, modo jefe, asistente, movimientos financieros,
 * stock, alquileres, base de clientes, audit log.
 */

import { store, bus }        from '../core/store.js';
import { dbGet, dbGetAll, dbPut, dbDelete, getCfg, setCfg, logEvent, invalidateCache } from '../core/db.js';
import { showToast, confirmarLindo } from '../core/ui.js';
import { pesos, escapeHtml, fmtFechaCorta, getDiasDesde, fechaHoy } from '../core/utils.js';
import { BUSINESS_CONFIG }    from '../core/config.js';
import { resumenPeriodo }     from '../services/finance.js';
import { calcularPrecisionSistema, calcularRankings, generarReporteSemanal } from '../services/rentabilidad.js';

/* ── UUID simple ─────────────────────────────────────── */
function _uuid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

/* ── Período helpers ─────────────────────────────────── */
/* Convierte un Date a 'YYYY-MM-DD' en hora LOCAL (no UTC, evita correr el día) */
function _fechaLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _periodoRango(period) {
  const hoy = new Date();
  if (period === 'week') {
    const dow  = hoy.getDay();
    const lun  = new Date(hoy); lun.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1)); lun.setHours(0,0,0,0);
    const dom  = new Date(lun); dom.setDate(lun.getDate() + 6);
    return { from: _fechaLocal(lun), to: _fechaLocal(dom) };
  }
  if (period === 'month') return {
    from: _fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    to:   _fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
  };
  return { from: hoy.getFullYear() + '-01-01', to: hoy.getFullYear() + '-12-31' };
}

function _periodoAnteriorRango(period) {
  const hoy = new Date();
  if (period === 'week') {
    const dow  = hoy.getDay();
    const lun  = new Date(hoy); lun.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1) - 7); lun.setHours(0,0,0,0);
    const dom  = new Date(lun); dom.setDate(lun.getDate() + 6);
    return { from: _fechaLocal(lun), to: _fechaLocal(dom) };
  }
  if (period === 'month') return {
    from: _fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    to:   _fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0))
  };
  return { from: (hoy.getFullYear()-1) + '-01-01', to: (hoy.getFullYear()-1) + '-12-31' };
}

/* ── _resumen ────────────────────────────────────────── */
async function _resumen(rango) {
  const db  = store.get('db');
  const mov = await dbGetAll(db, 'finance_movements');
  const en  = mov.filter(m => (m.date || '').slice(0,10) >= rango.from && (m.date || '').slice(0,10) <= rango.to);
  const ing = en.filter(m => m.type === 'income' && !m.is_adjustment).reduce((a,m) => a + (m.amount||0), 0);
  const egr = en.filter(m => m.type === 'expense').reduce((a,m) => a + (m.amount||0), 0);
  const gan = ing - egr;
  const trb = en.filter(m => m.type === 'income' && !m.is_adjustment && m.category === 'trabajo');
  return {
    ingresos: ing, egresos: egr, ganancia: gan, n_trabajos: trb.length,
    ticket_avg: trb.length ? ing / trb.length : 0,
    margen: ing > 0 ? Math.max(0, gan / ing) : 0
  };
}

/* ═══════════════════════════════════════════════════════════
   A. DASHBOARD SEMANAL
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminDashboard() {
  const body = document.getElementById('admin-dashboard-body');
  if (!body) return;
  try {
    const rango   = _periodoRango('week');
    const rangoA  = _periodoAnteriorRango('week');
    const actual  = await _resumen(rango);
    const ant     = await _resumen(rangoA);

    let estado, icon, titulo, frase;
    if (actual.ganancia > 0 && actual.margen >= 0.4) {
      estado = 'excelente'; icon = '🟢'; titulo = 'Semana excelente'; frase = 'Buen margen y ganancia positiva.';
    } else if (actual.ganancia > 0) {
      estado = 'ajustar'; icon = '🟡'; titulo = 'Semana positiva, margen bajo'; frase = 'Hay ganancia pero podrías subir precios.';
    } else {
      estado = 'perdida'; icon = '🔴'; titulo = 'Semana en pérdida';
      frase = actual.n_trabajos === 0 ? 'No hubo trabajos cerrados esta semana.' : 'Egresos superan ingresos.';
    }

    function delta(a, b) {
      if (!b) return '';
      const d = ((a - b) / Math.abs(b)) * 100;
      const arr = d > 0 ? '↑' : d < 0 ? '↓' : '→';
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      return `<span class="admin-kpi-delta ${cls}">${arr} ${Math.abs(Math.round(d))}% vs ant.</span>`;
    }

    body.innerHTML =
      `<div class="dash-semaforo estado-${estado}">
        <div class="dash-semaforo-icon">${icon}</div>
        <div class="dash-semaforo-titulo">${escapeHtml(titulo)}</div>
        <div class="dash-semaforo-frase">${escapeHtml(frase)}</div>
      </div>
      <div class="admin-kpi-grid">
        <div class="admin-kpi"><div class="admin-kpi-label">Ingresos</div><div class="admin-kpi-valor exito">${pesos(actual.ingresos)}</div>${delta(actual.ingresos, ant.ingresos)}</div>
        <div class="admin-kpi"><div class="admin-kpi-label">Egresos</div><div class="admin-kpi-valor peligro">${pesos(actual.egresos)}</div>${delta(actual.egresos, ant.egresos)}</div>
        <div class="admin-kpi"><div class="admin-kpi-label">Ganancia</div><div class="admin-kpi-valor acento">${pesos(actual.ganancia)}</div>${delta(actual.ganancia, ant.ganancia)}</div>
        <div class="admin-kpi"><div class="admin-kpi-label">Margen</div><div class="admin-kpi-valor">${Math.round(actual.margen*100)}%</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Trabajos</div><div class="admin-kpi-valor">${actual.n_trabajos}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Ticket prom.</div><div class="admin-kpi-valor">${pesos(actual.ticket_avg)}</div></div>
      </div>`;

    /* Rentabilidad por zona — basada en viajes operativos (v6.8) */
    try {
      const { listarViajes, analizarViaje } = await import('../services/gasto.operativo.js');
      const viajes = await listarViajes();
      if (viajes.length) {
        let zhtml = '<div class="card" style="margin-top:12px;"><div class="card-title">📍 Rentabilidad por zona (viajes)</div>';
        for (const v of viajes) {
          const a = await analizarViaje(v);
          const cls = a.netoProyectado >= 0 ? 'exito' : 'peligro';
          const semIcon = a.semaforo === 'verde' ? '🟢' : a.semaforo === 'amarillo' ? '🟡' : '🔴';
          zhtml += `<div style="padding:10px 0;border-bottom:1px solid var(--borde);">
            <div class="row-sb">
              <div><b>${semIcon} ${escapeHtml(a.gasto.ciudad_nombre)}</b> <span class="dim txt-sm">(${a.nTrabajos} trab. · ${a.gasto.dias}d)</span></div>
              <div class="${cls}" style="font-weight:700;">${pesos(a.netoProyectado)}</div>
            </div>
            <div class="dim txt-xs" style="margin-top:4px;">Facturado ${pesos(a.facturado)} · Cobrado ${pesos(a.cobrado)} · Gasto op. ${pesos(a.gasto.total)}</div>
            <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px;">
              ${a.gasto.alojamiento ? `<span class="txt-xs dim">🏨 ${pesos(a.gasto.alojamiento)}</span>` : ''}
              ${a.gasto.comida ? `<span class="txt-xs dim">🍽️ ${pesos(a.gasto.comida)}</span>` : ''}
              ${a.gasto.combustible ? `<span class="txt-xs dim">⛽ ${pesos(a.gasto.combustible)}</span>` : ''}
              ${a.gasto.extras ? `<span class="txt-xs dim">🔧 ${pesos(a.gasto.extras)}</span>` : ''}
            </div>
          </div>`;
        }
        zhtml += '</div>';
        body.innerHTML += zhtml;
      }
    } catch(e) { console.warn('[rentab zona v6.8]', e); }
  } catch(e) {
    body.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   B. MODO JEFE
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminJefe() {
  const body = document.getElementById('admin-jefe-body');
  if (!body) return;
  const periodo = document.getElementById('admin-jefe-periodo')?.value || 'week';
  try {
    const prec = await calcularPrecisionSistema();
    const rk   = await calcularRankings();
    const rep  = await generarReporteSemanal(_periodoRango(periodo));

    if (!rep || !rep.n_cerrados) {
      const txtPeriodo = periodo === 'week' ? 'esta semana' : periodo === 'month' ? 'este mes' : 'este año';
      body.innerHTML = `<div class="dim txt-sm">Sin trabajos cerrados ${txtPeriodo}. Probá cambiar el período arriba, o cerrá algunos trabajos para ver las métricas.</div>`;
      return;
    }

    const eficiencia = rep.n_cerrados > 0 ? Math.round(((rep.n_cerrados - rep.malas_decisiones) / rep.n_cerrados) * 100) : 0;
    const lblGanancia = periodo === 'week' ? 'Ganancia semanal' : periodo === 'month' ? 'Ganancia del mes' : 'Ganancia del año';
    let html =
      `<div class="jefe-bigstats">
        <div class="jefe-bigstat"><div class="jefe-bigstat-label">Eficiencia</div><div class="jefe-bigstat-valor">${eficiencia}%</div></div>
        <div class="jefe-bigstat"><div class="jefe-bigstat-label">Precisión sistema</div><div class="jefe-bigstat-valor">${Math.round(prec.precision_pct)}%</div></div>
        <div class="jefe-bigstat"><div class="jefe-bigstat-label">${lblGanancia}</div><div class="jefe-bigstat-valor">${pesos(rep.ganancia_real)}</div></div>
        <div class="jefe-bigstat"><div class="jefe-bigstat-label">Diferencia est./real</div><div class="jefe-bigstat-valor ${rep.diferencia >= 0 ? 'exito' : 'peligro'}">${pesos(rep.diferencia)}</div></div>
      </div>`;

    /* Top servicios */
    if (rk.servicios.length) {
      const maxS = Math.max(...rk.servicios.map(s => Math.abs(s.ganancia)), 1);
      html += '<div class="card"><div class="card-title">🏆 Top servicios más rentables</div>';
      rk.servicios.slice(0,5).forEach(s => {
        html += `<div class="top-row">
          <span class="top-row-label">${escapeHtml(s.nombre)} (${s.n})</span>
          <div class="top-row-bar"><div class="top-row-bar-fill" style="width:${Math.abs(s.ganancia)/maxS*100}%"></div></div>
          <span class="top-row-valor">${pesos(s.ganancia)}</span>
        </div>`;
      });
      html += '</div>';
    }

    /* Top clientes */
    if (rk.clientes.length) {
      const maxC = Math.max(...rk.clientes.map(c => c.ganancia), 1);
      html += '<div class="card"><div class="card-title">⭐ Top clientes</div>';
      rk.clientes.slice(0,8).forEach(c => {
        html += `<div class="top-row">
          <span class="top-row-label">${escapeHtml(c.nombre)} (${c.n})</span>
          <div class="top-row-bar"><div class="top-row-bar-fill" style="width:${c.ganancia/maxC*100}%"></div></div>
          <span class="top-row-valor">${pesos(c.ganancia)}</span>
        </div>`;
      });
      html += '</div>';
    }

    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   C. ASISTENTE
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminAsistente() {
  const body = document.getElementById('admin-asistente-body');
  if (!body) return;
  const periodo = document.getElementById('admin-asistente-periodo')?.value || 'week';
  try {
    const db     = store.get('db');
    const rango  = _periodoRango(periodo);
    const data   = await _resumen(rango);
    const recos  = [];
    const minSem = BUSINESS_CONFIG.min_jobs_week || 4;

    if (periodo === 'week' && data.n_trabajos < minSem && data.n_trabajos > 0)
      recos.push({ icon:'📅', texto:`Solo ${data.n_trabajos} trabajo(s) cerrados. Mínimo: ${minSem}.` });

    if (data.ingresos > 0 && data.margen < (BUSINESS_CONFIG.min_margin || 0.3))
      recos.push({ icon:'📉', texto:`Margen ${Math.round(data.margen*100)}% por debajo del mínimo. Subí precios.` });

    const movs    = await dbGetAll(db, 'finance_movements');
    const enRango = movs.filter(m => { const f=(m.date||'').slice(0,10); return f>=rango.from && f<=rango.to; });
    const viatico = enRango.filter(m => m.category === 'viatico').reduce((a,m) => a+(m.amount||0), 0);
    const ratioV  = data.ingresos > 0 ? viatico / data.ingresos : 0;
    if (ratioV > (BUSINESS_CONFIG.viatic_ratio_alert || 0.2))
      recos.push({ icon:'⛽', texto:`Viáticos: ${Math.round(ratioV*100)}% de ingresos. Límite: ${Math.round((BUSINESS_CONFIG.viatic_ratio_alert||0.2)*100)}%.` });

    const rentab  = await dbGetAll(db, 'rentabilidad_records');
    const cerrado = rentab.filter(r => r.cerrado && (r.fecha_cierre||'').slice(0,10) >= rango.from && (r.fecha_cierre||'').slice(0,10) <= rango.to);
    const malos   = cerrado.filter(r => r.es_mala_decision);
    if (malos.length) recos.push({ icon:'⚠️', texto:`${malos.length} trabajo(s) con ganancia bajo el mínimo.` });

    /* Trabajos realmente en curso: solo OTT/OTE sin cerrar.
       Se excluyen los ingresos (ING: son equipos esperando OTT, no
       trabajos) y los presupuestos (PRE: aún no son trabajo). Antes
       se contaba todo lo no-cerrado y el número se inflaba. */
    const abiertos = rentab.filter(r =>
      !r.cerrado && (r.tipo === 'OTT' || r.tipo === 'OTE'));
    if (abiertos.length > 10) recos.push({ icon:'🔄', texto:`${abiertos.length} trabajos abiertos. Cerrá los entregados.` });

    const rk = await calcularRankings();
    if (rk.servicios.length) {
      const best = rk.servicios[0];
      if (best.ganancia > (BUSINESS_CONFIG.min_profit_per_job || 5000) * 1.5)
        recos.push({ icon:'🌟', texto:`Tu servicio estrella: "${best.nombre}" con ${pesos(best.ganancia)} promedio.` });
    }

    let html =
      `<div class="admin-kpi-grid mb-6">
        <div class="admin-kpi"><div class="admin-kpi-label">Ingresos</div><div class="admin-kpi-valor exito">${pesos(data.ingresos)}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Ganancia</div><div class="admin-kpi-valor acento">${pesos(data.ganancia)}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Margen</div><div class="admin-kpi-valor">${Math.round(data.margen*100)}%</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Trabajos</div><div class="admin-kpi-valor">${data.n_trabajos}</div></div>
      </div>`;
    if (!recos.length) {
      html += '<div class="dim txt-sm">✨ Sin alertas para este período.</div>';
    } else {
      html += '<div class="card-title">Recomendaciones</div>';
      recos.forEach(r => html += `<div class="recomendacion"><span class="recomendacion-icon">${r.icon}</span><span class="recomendacion-texto">${escapeHtml(r.texto)}</span></div>`);
    }
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   D. KPIs POR PERÍODO
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminPeriodoKPIs() {
  const cont = document.getElementById('admin-periodo-body');
  if (!cont) return;
  try {
    const db      = store.get('db');
    const periodo = store.get('admin.periodoActivo') || 'week';
    const rango   = _periodoRango(periodo);
    const data    = await _resumen(rango);

    const ingresos = await dbGetAll(db, 'ingresos');
    const equipos  = ingresos.filter(r => { const f=(r.fecha||r.creado_at||'').slice(0,10); return f>=rango.from && f<=rango.to; }).length;
    const ordenes  = await dbGetAll(db, 'ordenes');
    const reparados = ordenes.filter(r => (r.estado==='entregado'||r.estado==='pagado') && ((r.actualizado_at||r.creado_at||'').slice(0,10))>=rango.from).length;

    cont.innerHTML =
      `<div class="admin-kpi-grid">
        <div class="admin-kpi"><div class="admin-kpi-label">Equipos ingresados</div><div class="admin-kpi-valor">${equipos}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Equipos reparados</div><div class="admin-kpi-valor">${reparados}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Ingresos $</div><div class="admin-kpi-valor exito">${pesos(data.ingresos)}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Egresos $</div><div class="admin-kpi-valor peligro">${pesos(data.egresos)}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Ganancia $</div><div class="admin-kpi-valor acento">${pesos(data.ganancia)}</div></div>
        <div class="admin-kpi"><div class="admin-kpi-label">Margen</div><div class="admin-kpi-valor">${Math.round(data.margen*100)}%</div></div>
      </div>`;
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   E. MOVIMIENTOS FINANCIEROS
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminMovs() {
  const cont = document.getElementById('admin-movs-body');
  if (!cont) return;
  try {
    const db     = store.get('db');
    const filtro = document.getElementById('admin-movs-filtro')?.value || 'all';
    const desde  = document.getElementById('admin-movs-desde')?.value || '';
    const hasta  = document.getElementById('admin-movs-hasta')?.value || '';

    let movs = await dbGetAll(db, 'finance_movements');
    if (filtro !== 'all') movs = movs.filter(m => m.type === filtro);
    if (desde)            movs = movs.filter(m => (m.date||'') >= desde);
    if (hasta)            movs = movs.filter(m => (m.date||'') <= hasta);
    movs.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    movs = movs.slice(0, 100);

    if (!movs.length) { cont.innerHTML = '<div class="dim txt-sm">Sin movimientos.</div>'; return; }

    const icons = { income:'💰', expense:'💸', viatico:'⛽' };
    cont.innerHTML = movs.map(m =>
      `<div class="mov-row">
        <span class="mov-icon">${icons[m.type] || '•'}</span>
        <div class="mov-data">
          <div class="mov-concepto">${escapeHtml(m.description || m.category || m.type)}</div>
          <div class="mov-meta">${m.date||''} · ${escapeHtml(m.category||m.type)}${m.related_order_id ? ' · ' + m.related_order_id : ''}</div>
        </div>
        <span class="mov-monto ${m.type}">${m.type === 'income' ? '+' : '-'}${pesos(m.amount)}</span>
        <button class="btn btn-ghost btn-sm" type="button" onclick="borrarMovimientoCaja('${m.transaction_id}')" title="Borrar movimiento" style="margin-left:6px;">✕</button>
      </div>`
    ).join('');
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

/* Borrar un movimiento de la caja (con confirmación). Sirve para corregir
   cargas erróneas o pagos duplicados. */
export async function borrarMovimientoCaja(txnId) {
  const db = store.get('db');
  if (!db || !txnId) return;
  try {
    const mov = await dbGet(db, 'finance_movements', txnId);
    if (!mov) { showToast('Movimiento no encontrado', 'warn'); return; }
    const signo = mov.type === 'income' ? '+' : '-';
    const esPagoOrden = mov.type === 'income' && mov.related_order_id;
    const ok = await confirmarLindo(
      `¿Borrar este movimiento de la caja?\n\n${mov.description || mov.category || mov.type}\n${signo}${pesos(mov.amount)}` +
      (esPagoOrden ? `\n\nTambién se quita del historial de pagos de ${mov.related_order_id}.` : ''),
      { titulo: 'Borrar movimiento', textoOk: 'Borrar', peligro: true }
    );
    if (!ok) return;
    await dbDelete(db, 'finance_movements', txnId);

    /* Sincronizar: los pagos también viven en r.pagos de la orden
       (la ficha y Por Cobrar leen ese array). Quitar la entrada espejo
       para que caja y ficha sigan mostrando lo mismo. */
    if (esPagoOrden) {
      try {
        const pref  = mov.related_order_id.slice(0, 3);
        const stNom = ({ OTT: 'ordenes', OTE: 'exteriors', ING: 'ingresos', PRE: 'presupuestos' })[pref];
        const orden = stNom ? await dbGet(db, stNom, mov.related_order_id) : null;
        if (orden && Array.isArray(orden.pagos)) {
          const idx = orden.pagos.findIndex(p =>
            (parseFloat(p.monto) || 0) === (parseFloat(mov.amount) || 0) &&
            (!mov.date || !p.fecha || p.fecha === mov.date));
          if (idx >= 0) {
            orden.pagos.splice(idx, 1);
            await dbPut(db, stNom, orden);
          }
        }
      } catch (e) { console.warn('[borrarMov] sync pagos', e); }
    }

    await logEvent(db, { type: 'MOV_DELETED', message: 'Movimiento borrado: ' + (mov.description||txnId), ref: mov.related_order_id || txnId }).catch(()=>{});
    invalidateCache();
    showToast('✓ Movimiento borrado', 'success');
    await renderAdminMovs();
    bus.emit('admin:refresh');
  } catch(e) {
    console.warn('[borrarMovimientoCaja]', e);
    showToast('No se pudo borrar', 'error');
  }
}

export async function exportarCSVMovs() {
  const db = store.get('db');
  if (!db) return;
  try {
    const filtro = document.getElementById('admin-movs-filtro')?.value || 'all';
    let movs = await dbGetAll(db, 'finance_movements');
    if (filtro !== 'all') movs = movs.filter(m => m.type === filtro);

    const header = 'transaction_id,date,type,category,amount,description,related_order_id\n';
    const rows   = movs.map(m => [
      m.transaction_id, m.date||'', m.type, m.category||'',
      m.amount, '"' + (m.description||'').replace(/"/g,'""') + '"',
      m.related_order_id||''
    ].join(',')).join('\n');
    const f = await import('../services/files.js');
    await f.descargarTexto(header + rows, 'movimientos_' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv');
    showToast('📥 CSV descargado', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   F. EGRESO MANUAL
   ═══════════════════════════════════════════════════════════ */
export async function guardarEgresoManual() {
  const db = store.get('db');
  if (!db) return;
  const concepto  = document.getElementById('egreso-concepto')?.value.trim() || '';
  const monto     = parseFloat(document.getElementById('egreso-monto')?.value) || 0;
  const categoria = document.getElementById('egreso-categoria')?.value || 'otro';
  const fecha     = document.getElementById('egreso-fecha')?.value || fechaHoy();
  const notas     = document.getElementById('egreso-notas')?.value.trim() || '';
  const base      = document.getElementById('egreso-base')?.value || 'SMA';

  if (monto <= 0) { showToast('Monto debe ser mayor a 0', 'warn'); return; }
  if (!concepto)  { showToast('Falta el concepto', 'warn'); return; }

  try {
    const { dbPut } = await import('../core/db.js');
    const txn = {
      transaction_id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      type:        'expense',
      category:    categoria,
      amount:      monto,
      date:        fecha,
      description: concepto,
      notes:       notas,
      base,
      related_order_id: null,
      created_at:  new Date().toISOString()
    };
    await dbPut(db, 'finance_movements', txn);
    await logEvent(db, { type: 'MANUAL_EXPENSE_CREATED', message: `Egreso manual: ${concepto} ${pesos(monto)}`, data: txn });

    document.getElementById('egreso-monto').value   = '';
    document.getElementById('egreso-concepto').value = '';
    document.getElementById('egreso-notas').value   = '';
    showToast('✓ Egreso registrado', 'success');
    renderAdminMovs();
    renderAdminDashboard();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   G. STOCK DE COMPONENTES
   ═══════════════════════════════════════════════════════════ */
export async function agregarStock() {
  const db = store.get('db');
  if (!db) return;
  const nombre = document.getElementById('stock-nombre')?.value.trim() || '';
  const cant   = parseInt(document.getElementById('stock-cant')?.value, 10) || 0;
  const minEl  = parseInt(document.getElementById('stock-min')?.value, 10) || 0;
  const notas  = document.getElementById('stock-notas')?.value.trim() || '';
  if (!nombre) { showToast('Falta el nombre', 'warn'); return; }
  try {
    const stock = (await getCfg(db, 'stock_componentes', [])) || [];
    stock.push({ id: _uuid(), nombre, cantidad: cant, minimo: minEl, notas, actualizado_at: new Date().toISOString() });
    await setCfg(db, 'stock_componentes', stock);
    ['stock-nombre','stock-cant','stock-min','stock-notas'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    renderAdminStock();
    showToast('✓ Agregado al stock', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

export async function eliminarStock(id) {
  const db = store.get('db');
  if (!db) return;
  try {
    let stock = (await getCfg(db, 'stock_componentes', [])) || [];
    await setCfg(db, 'stock_componentes', stock.filter(s => s.id !== id));
    renderAdminStock();
    showToast('✓ Eliminado', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function renderAdminStock() {
  const cont = document.getElementById('admin-stock-body');
  if (!cont) return;
  try {
    const db    = store.get('db');
    const stock = (await getCfg(db, 'stock_componentes', [])) || [];
    if (!stock.length) { cont.innerHTML = '<div class="dim txt-sm">Stock vacío.</div>'; return; }
    cont.innerHTML = stock.map(s => {
      const bajo = s.minimo > 0 && s.cantidad <= s.minimo;
      return `<div class="stock-row">
        <span class="stock-nombre">${escapeHtml(s.nombre)}</span>
        <span class="stock-cant${bajo ? ' low' : ''}">${s.cantidad}u</span>
        ${s.minimo > 0 ? `<span class="dim txt-sm">mín ${s.minimo}</span>` : ''}
        ${s.notas ? `<span class="dim txt-sm">${escapeHtml(s.notas)}</span>` : ''}
        <button class="btn btn-ghost btn-sm" type="button" onclick="eliminarStock('${s.id}')">×</button>
      </div>`;
    }).join('');
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   H. ALQUILERES Y VENCIMIENTOS
   ═══════════════════════════════════════════════════════════ */
export async function agregarAlquiler() {
  const db = store.get('db');
  if (!db) return;
  const desc  = document.getElementById('alquiler-desc')?.value.trim() || '';
  const monto = parseFloat(document.getElementById('alquiler-monto')?.value) || 0;
  const dia   = parseInt(document.getElementById('alquiler-dia')?.value, 10) || 1;
  const notas = document.getElementById('alquiler-notas')?.value.trim() || '';
  if (!desc) { showToast('Falta la descripción', 'warn'); return; }
  try {
    const lista = (await getCfg(db, 'alquileres', [])) || [];
    const hoy   = new Date();
    const prox  = new Date(hoy.getFullYear(), hoy.getMonth() + (hoy.getDate() >= dia ? 1 : 0), dia);
    lista.push({ id: _uuid(), nombre: desc, monto, dia, proxima_fecha: prox.toISOString().slice(0,10), notas, creado_at: new Date().toISOString() });
    await setCfg(db, 'alquileres', lista);
    ['alquiler-desc','alquiler-monto','alquiler-dia','alquiler-notas'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    renderAdminAlquileres();
    showToast('✓ Agregado', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

export async function eliminarAlquiler(id) {
  const db = store.get('db');
  if (!db) return;
  try {
    let lista = (await getCfg(db, 'alquileres', [])) || [];
    await setCfg(db, 'alquileres', lista.filter(a => a.id !== id));
    renderAdminAlquileres();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* Marcar un pago recurrente como pagado:
   - registra el egreso en la caja
   - avanza la fecha de vencimiento al mes siguiente
   Así el pago vuelve a verde y queda agendado para el próximo mes. */
export async function pagarAlquiler(id) {
  const db = store.get('db');
  if (!db) return;
  try {
    const lista = (await getCfg(db, 'alquileres', [])) || [];
    const item = lista.find(a => a.id === id);
    if (!item) return;

    if (!(await confirmarLindo(`¿Registrar el pago de "${item.nombre}" por ${pesos(item.monto)}?\nSe sumará como egreso en la caja y se agendará para el mes que viene.`, { titulo: 'Registrar pago', peligro: false, textoOk: 'Registrar' }))) return;

    /* 1. Registrar egreso en la caja */
    const { dbPut } = await import('../core/db.js');
    const hoyISO = fechaHoy();
    const txn = {
      transaction_id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type:        'expense',
      category:    'alquiler',
      amount:      item.monto || 0,
      date:        hoyISO,
      description: item.nombre,
      notes:       'Pago recurrente',
      base:        'SMA',
      related_order_id: null,
      created_at:  new Date().toISOString()
    };
    await dbPut(db, 'finance_movements', txn);
    await logEvent(db, { type: 'RECURRING_PAYMENT', message: `Pago recurrente: ${item.nombre} ${pesos(item.monto)}`, data: txn });

    /* 2. Avanzar la fecha al mes siguiente (mismo día de vencimiento) */
    const dia = item.dia || parseInt((item.proxima_fecha || '').slice(8, 10), 10) || 1;
    const venc = new Date((item.proxima_fecha || hoyISO) + 'T12:00:00');
    /* Si el día no existe en el mes siguiente (ej: 31 en febrero), usar el último día */
    const anioProx = venc.getFullYear();
    const mesProx = venc.getMonth() + 1;
    const ultimoDiaMes = new Date(anioProx, mesProx + 1, 0).getDate();
    const diaFinal = Math.min(dia, ultimoDiaMes);
    const prox = new Date(anioProx, mesProx, diaFinal);
    item.proxima_fecha = prox.toISOString().slice(0, 10);
    item.ultimo_pago = hoyISO;
    await setCfg(db, 'alquileres', lista);

    renderAdminAlquileres();
    /* Refrescar caja para que el egreso aparezca */
    try { renderAdminCaja(); } catch(e) {}
    showToast('✓ Pago registrado y agendado para el mes que viene', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function renderAdminAlquileres() {
  const cont = document.getElementById('admin-alquileres-body');
  if (!cont) return;
  try {
    const db    = store.get('db');
    const lista = (await getCfg(db, 'alquileres', [])) || [];
    if (!lista.length) { cont.innerHTML = '<div class="dim txt-sm">Sin pagos recurrentes.</div>'; return; }

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    cont.innerHTML = lista.map(a => {
      const fecha = new Date(a.proxima_fecha + 'T12:00:00');
      const dias  = Math.floor((fecha - hoy) / 86400000);
      const icon  = dias < 0 ? '🔴' : dias <= 7 ? '🟡' : '🟢';
      const cls   = dias < 0 ? 'peligro' : dias <= 7 ? 'acento' : 'exito';
      const lbl   = dias < 0 ? `VENCIDO hace ${Math.abs(dias)}d` : dias === 0 ? 'HOY' : `en ${dias} días`;
      const ultimo = a.ultimo_pago ? ` · último pago ${a.ultimo_pago}` : '';
      return `<div class="mov-row">
        <span class="mov-icon">${icon}</span>
        <div class="mov-data">
          <div class="mov-concepto">${escapeHtml(a.nombre)}</div>
          <div class="mov-meta">${a.proxima_fecha} · ${lbl}${ultimo}</div>
        </div>
        <span class="mov-monto ${cls}">${pesos(a.monto)}</span>
        <button class="btn btn-ghost btn-sm" type="button" onclick="pagarAlquiler('${a.id}')" title="Registrar pago">✓ Pagar</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="eliminarAlquiler('${a.id}')" aria-label="Eliminar">×</button>
      </div>`;
    }).join('');
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   I. BASE DE CLIENTES
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminClientes() {
  const cont = document.getElementById('admin-clientes-body');
  if (!cont) return;
  try {
    const db     = store.get('db');
    let clientes = await dbGetAll(db, 'clientes');
    const search = (document.getElementById('clientes-search')?.value || '').toLowerCase().trim();
    if (search) clientes = clientes.filter(c => (c.nombre + ' ' + (c.cuit||'') + ' ' + (c.telefono||'')).toLowerCase().includes(search));
    clientes.sort((a,b) => (b.trabajos_count||0) - (a.trabajos_count||0));
    clientes = clientes.slice(0, 100);

    if (!clientes.length) { cont.innerHTML = '<div class="dim txt-sm">Sin clientes.</div>'; return; }

    cont.innerHTML = clientes.map(c => {
      const tc    = c.trabajos_count || 0;
      const badge = tc >= 3 ? `<span class="cli-admin-badge recurrente">★ ${tc}</span>` : `<span class="cli-admin-badge">${tc}</span>`;
      const meta  = [c.cuit_raw||c.cuit ? 'CUIT '+(c.cuit_raw||c.cuit) : null, c.telefono ? 'Tel '+c.telefono : null, c.ciudad].filter(Boolean).join(' · ');
      return `<div class="cli-admin-row" onclick="verHistorialCliente(${c.id||0})">
        <div>
          <div class="cli-admin-nombre">${escapeHtml(c.nombre)}</div>
          <div class="cli-admin-meta">${escapeHtml(meta)}</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

export async function verHistorialCliente(id) {
  const db = store.get('db');
  if (!db || !id) return;
  try {
    const c = await dbGet(db, 'clientes', id);
    if (!c) { showToast('Cliente no encontrado', 'warn'); return; }

    let m = document.getElementById('modal-historial-cliente');
    if (!m) {
      m = document.createElement('div');
      m.id = 'modal-historial-cliente'; m.className = 'modal';
      m.innerHTML =
        '<div class="modal-header">' +
          '<button class="modal-close" type="button" onclick="document.getElementById(\'modal-historial-cliente\').classList.remove(\'active\')">×</button>' +
          '<div class="modal-title">👤 Historial de cliente</div></div>' +
        '<div class="modal-body" id="historial-cli-body"></div>' +
        '<div class="modal-footer"><button class="btn btn-ghost btn-block" type="button" onclick="document.getElementById(\'modal-historial-cliente\').classList.remove(\'active\')">Cerrar</button></div>';
      document.body.appendChild(m);
    }

    const body = document.getElementById('historial-cli-body');
    if (body) {
      body.innerHTML = '<div class="dim txt-sm">Cargando...</div>';
      m.classList.add('active');

      const hist = (c.historial || []).slice(0, 20);
      let html = `<div class="card"><div class="card-title">${escapeHtml(c.nombre)}</div>
        ${c.cuit_raw ? `<div class="dim txt-sm">CUIT: ${escapeHtml(c.cuit_raw)}</div>` : ''}
        ${c.telefono ? `<div class="dim txt-sm">Tel: ${escapeHtml(c.telefono)}</div>` : ''}
        ${c.ciudad   ? `<div class="dim txt-sm">Ciudad: ${escapeHtml(c.ciudad)}</div>` : ''}
        <div class="mt-6 dim txt-sm">Trabajos: <strong>${c.trabajos_count||0}</strong></div></div>`;

      /* Abono del cliente */
      try {
        const { listarAbonos, estadoDeCuenta } = await import('../services/abonos.js');
        const abonos = await listarAbonos();
        const ab = abonos.find(a => (a.cliente_nombre||'').toLowerCase() === (c.nombre||'').toLowerCase());
        if (ab) {
          const ec = estadoDeCuenta(ab);
          const estTxt = ec.estado === 'debe' ? `Debe ${ec.meses_debe} mes(es) · ${pesos(ec.deuda)}` : ec.estado === 'porvencer' ? 'Por cobrar este mes' : 'Al día ✓';
          html += `<div class="card"><div class="card-title">💳 Suscripción</div>
            <div class="row-sb"><span>Cuota ${ab.periodicidad}</span><span class="bold">${pesos(ab.cuota)}</span></div>
            <div class="dim txt-sm mt-2">${escapeHtml(estTxt)}</div>
            ${ab.incluye ? `<div class="dim txt-sm">Incluye: ${escapeHtml(ab.incluye)}</div>` : ''}</div>`;
        }
      } catch(e) { /* sin abono */ }

      /* Flota de máquinas */
      try {
        const { listarMaquinas, listarChecklistsHistorial } = await import('../services/flota.js');
        const maquinas = await listarMaquinas(c.id, c.nombre, false);
        if (maquinas.length) {
          html += `<div class="card"><div class="card-title">🏋️ Máquinas (${maquinas.length})</div>`;
          maquinas.forEach(mq => {
            html += `<div class="dim txt-sm" style="padding:3px 0;">• ${escapeHtml([mq.marca, mq.modelo, mq.numero].filter(Boolean).join(' — '))}</div>`;
          });
          html += '</div>';
        }
        /* Historial de checklists/mantenimientos */
        const checklists = await listarChecklistsHistorial(c.id, c.nombre);
        if (checklists.length) {
          html += `<div class="card"><div class="card-title">📋 Mantenimientos hechos (${checklists.length})</div>`;
          checklists.slice(0, 8).forEach(ch => {
            const fecha = (ch.fecha || '').slice(0, 10);
            html += `<div class="dim txt-sm" style="padding:4px 0;border-bottom:1px solid var(--borde);">${escapeHtml(fecha)} · ${ch.hechas}/${ch.total} con service${ch.bajas ? ` · ${ch.bajas} baja` : ''}${ch.observaciones ? ` · ${ch.observaciones} obs` : ''}</div>`;
          });
          html += '</div>';
        }
      } catch(e) { /* sin flota */ }

      /* Lo que debe (saldos pendientes) */
      try {
        const { calcularPorCobrar } = await import('../services/por.cobrar.js');
        const { items } = await calcularPorCobrar();
        const susDeudas = items.filter(it => (it.cliente||'').toLowerCase() === (c.nombre||'').toLowerCase());
        if (susDeudas.length) {
          const totalDebe = susDeudas.reduce((a,it)=>a+it.saldo,0);
          html += `<div class="card"><div class="card-title">💰 Por cobrar (${pesos(totalDebe)})</div>`;
          susDeudas.forEach(it => {
            html += `<div class="row-sb" style="padding:5px 0;"><span class="mono txt-sm">${escapeHtml(it.numero)}</span><span class="bold" style="color:var(--acento);">${pesos(it.saldo)}</span></div>`;
          });
          html += '</div>';
        }
      } catch(e) { /* sin deudas */ }

      if (hist.length) {
        html += '<div class="card"><div class="card-title">Últimas órdenes</div>';
        hist.forEach(num => {
          html += `<div class="row-sb" style="padding:8px 0;border-bottom:1px solid var(--borde);">
            <span class="mono txt-sm">${escapeHtml(num)}</span>
            <button class="btn btn-ghost btn-sm" type="button"
              onclick="document.getElementById('modal-historial-cliente').classList.remove('active');setTimeout(()=>window.abrirModalDetalle?.('${escapeHtml(num)}'),100)">Ver →</button>
          </div>`;
        });
        html += '</div>';
      }
      body.innerHTML = html;
    }
    m.classList.add('active');
  } catch(e) { showToast('Error al cargar historial', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   J. AUDIT LOG
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminAuditLog() {
  const cont = document.getElementById('admin-audit-body');
  if (!cont) return;
  try {
    const db     = store.get('db');
    let logs     = await dbGetAll(db, 'system_logs');
    const filtro = document.getElementById('audit-filtro-tipo')?.value || '';
    if (filtro) logs = logs.filter(l => l.type === filtro);
    logs.sort((a,b) => (b.ts||b.timestamp||'').localeCompare(a.ts||a.timestamp||''));
    logs = logs.slice(0, 100);

    if (!logs.length) { cont.innerHTML = '<div class="dim txt-sm">Sin eventos.</div>'; return; }

    const icons = {
      ORDER_CREATED:'📝', ORDER_PAID:'💰', ORDER_STATE_CHANGED:'🔄', PDF_GENERATED:'📄',
      CLIENT_CREATED:'👤', RENTAB_CERRADO:'✅', TURNO_CREATED:'📅', TURNO_REALIZADO:'✓',
      MANUAL_EXPENSE_CREATED:'💸', ORDER_UPDATED:'✏️', APP_START:'🚀',
      SYSTEM_RESET:'🔴', BACKUP_CREATED:'💾', BACKUP_RESTORED:'📥'
    };

    cont.innerHTML = logs.map(l => {
      const rawTs = l.ts || l.timestamp;
      const time  = rawTs ? new Date(rawTs).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      return `<div class="audit-row">
        <span class="audit-icon">${icons[l.type]||'•'}</span>
        <span class="audit-msg">${escapeHtml(l.message || l.type)}</span>
        <span class="audit-time">${time}</span>
      </div>`;
    }).join('');
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="peligro">Error: ${escapeHtml(String(e.message||e))}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   COLLAPSIBLES Y ORQUESTADOR
   ═══════════════════════════════════════════════════════════ */
async function _buildCollapsibles() {
  if (store.get('admin.collapsiblesInit')) return;
  store.set('admin.collapsiblesInit', true);
  const panel = document.getElementById('panel-contabilidad');
  if (!panel) return;

  /* Cargar qué secciones quedaron abiertas la última vez (desde IndexedDB) */
  let abiertasGuardadas = [];
  try {
    const db = store.get('db');
    if (db) {
      const raw = await getCfg(db, 'admin_secciones_abiertas', null);
      if (raw) abiertasGuardadas = JSON.parse(raw);
    }
  } catch (e) { /* sin estado previo */ }

  const guardarEstado = async () => {
    try {
      const abiertas = [];
      panel.querySelectorAll('.admin-section[data-collapsible="true"]').forEach(s => {
        const b = s.querySelector('.archivados-body');
        const t = s.dataset.title;
        if (b && !b.classList.contains('hide') && t) abiertas.push(t);
      });
      const db = store.get('db');
      if (db) await setCfg(db, 'admin_secciones_abiertas', JSON.stringify(abiertas));
    } catch (e) { /* no crítico */ }
  };

  panel.querySelectorAll('.admin-section[data-collapsible="true"]').forEach(sec => {
    if (sec.dataset.wrapped === '1') return;
    sec.dataset.wrapped = '1';
    const titulo = sec.dataset.title || 'Sección';
    const nodes  = Array.from(sec.childNodes);
    sec.innerHTML = '';

    const header = document.createElement('button');
    header.type = 'button'; header.className = 'archivados-header';
    header.innerHTML = `<span class="archivados-icon">▶</span><span class="archivados-title">${titulo}</span>`;
    sec.appendChild(header);

    const body = document.createElement('div');
    body.className = 'archivados-body hide';
    nodes.forEach(n => body.appendChild(n));
    sec.appendChild(body);

    /* Si esta sección estaba abierta la última vez, abrirla */
    if (abiertasGuardadas.includes(titulo)) {
      body.classList.remove('hide');
      header.querySelector('.archivados-icon').textContent = '▼';
      sec.classList.add('expanded');
    }

    header.addEventListener('click', () => {
      const open = !body.classList.contains('hide');
      body.classList.toggle('hide', open);
      header.querySelector('.archivados-icon').textContent = open ? '▶' : '▼';
      sec.classList.toggle('expanded', !open);
      guardarEstado();
    });
  });
}

let _adminInit = false;
export function initAdmin() {
  if (_adminInit) return;   // evitar doble registro de listeners
  _adminInit = true;
  bus.on('tab:cambio', ({ to }) => {
    if (to !== 'contabilidad') return;
    _buildCollapsibles().catch(e => console.warn('[collapsibles]', e));
    const fechaEl = document.getElementById('egreso-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = fechaHoy();

    Promise.all([
      renderAdminDashboard(),
      renderAdminCaja(),
      renderAdminPorCobrar(),
      renderAdminMetricas(),
      renderAdminJefe(),
      renderAdminAsistente(),
      renderAdminMovs(),
      renderAdminStock(),
      renderAdminAlquileres(),
      renderAdminClientes(),
      renderAdminAuditLog()
    ].map(p => p.catch(e => console.warn('[initAdmin]', e))));

    /* Archivo de viajes (módulo aparte) */
    import('./viajes.archivo.ui.js')
      .then(m => m.renderArchivoViajes())
      .catch(e => console.warn('[archivo viajes]', e));

    /* Campañas / marketing (módulo aparte) */
    import('./campanias.js')
      .then(m => m.renderCampanias())
      .catch(e => console.warn('[campanias]', e));
  });
}

/* ── Caja: ingresos/egresos de hoy y de la semana ───────── */
export async function renderAdminCaja() {
  const body = document.getElementById('admin-caja-body');
  if (!body) return;
  try {
    const db = store.get('db');
    const movs = await dbGetAll(db, 'finance_movements', false).catch(() => []);
    const hoy = new Date();
    const hoyStr = fechaHoy();   /* fecha LOCAL (no UTC) — evita contar mal cerca de medianoche */
    /* Inicio de semana (lunes) en fecha local */
    const dow = (hoy.getDay() + 6) % 7;   // 0 = lunes
    const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
    const lunesStr = `${lunes.getFullYear()}-${String(lunes.getMonth()+1).padStart(2,'0')}-${String(lunes.getDate()).padStart(2,'0')}`;

    let inHoy = 0, egHoy = 0, inSem = 0, egSem = 0;
    for (const m of movs) {
      const f = (m.date || '').slice(0, 10);
      if (!f) continue;
      const monto = Math.abs(parseFloat(m.amount || 0) || 0);
      const esIngreso = String(m.type || '').toLowerCase() === 'income';
      if (f === hoyStr) { esIngreso ? inHoy += monto : egHoy += monto; }
      if (f >= lunesStr) { esIngreso ? inSem += monto : egSem += monto; }
    }

    const bloque = (titulo, ing, egr) => `
      <div class="caja-bloque">
        <div class="caja-titulo">${titulo}</div>
        <div class="caja-row"><span>Entró</span><span class="caja-in">${pesos(ing)}</span></div>
        <div class="caja-row"><span>Salió</span><span class="caja-out">${pesos(egr)}</span></div>
        <div class="caja-row caja-neto"><span>Neto</span><span class="${ing-egr>=0?'caja-in':'caja-out'}">${pesos(ing-egr)}</span></div>
      </div>`;

    body.innerHTML = `<div class="caja-grid">${bloque('Hoy', inHoy, egHoy)}${bloque('Esta semana', inSem, egSem)}</div>`;
  } catch (e) {
    console.warn('[renderAdminCaja]', e);
    body.innerHTML = '<div class="dim txt-sm">No se pudo calcular la caja.</div>';
  }
}

/* ── Métricas del negocio ───────────────────────────────── */
export async function renderAdminMetricas() {
  const body = document.getElementById('admin-metricas-body');
  if (!body) return;
  try {
    const { calcularMetricas } = await import('../services/metricas.js');
    const m = await calcularMetricas();
    if (!m) { body.innerHTML = '<div class="dim txt-sm">Sin datos.</div>'; return; }

    const listaTop = (titulo, arr, fmt) => {
      if (!arr.length) return '';
      let h = `<div class="metrica-bloque"><div class="metrica-titulo">${titulo}</div>`;
      arr.forEach((x, i) => {
        h += `<div class="metrica-row"><span>${i+1}. ${escapeHtml(x.nombre)}</span><span class="metrica-val">${fmt ? fmt(x.valor) : x.valor}</span></div>`;
      });
      return h + '</div>';
    };

    let html = `<div class="card">
      <div class="metrica-kpis">
        <div class="metrica-kpi"><div class="metrica-kpi-num">${m.totalEquipos}</div><div class="metrica-kpi-lbl">Equipos ingresados</div></div>
        <div class="metrica-kpi"><div class="metrica-kpi-num">${m.totalOrdenes}</div><div class="metrica-kpi-lbl">Órdenes</div></div>
        ${m.tiempoPromedio != null ? `<div class="metrica-kpi"><div class="metrica-kpi-num">${m.tiempoPromedio}d</div><div class="metrica-kpi-lbl">Tiempo prom.</div></div>` : ''}
      </div>
      ${listaTop('🔧 Equipos más frecuentes', m.tiposTop)}
      ${listaTop('🏷️ Marcas más frecuentes', m.marcasTop)}
      ${listaTop('💰 Clientes que más gastan', m.clientesTop, pesos)}
    </div>`;
    body.innerHTML = html;
  } catch (e) {
    console.warn('[renderAdminMetricas]', e);
    body.innerHTML = '<div class="dim txt-sm">No se pudieron calcular las métricas.</div>';
  }
}

/* ── Por cobrar: trabajos aprobados con saldo pendiente ──── */
export async function renderAdminPorCobrar() {
  const body = document.getElementById('admin-porcobrar-body');
  if (!body) return;
  try {
    const { calcularPorCobrar } = await import('../services/por.cobrar.js');
    const { total, items, cantidad, porZona } = await calcularPorCobrar();

    if (!cantidad) {
      body.innerHTML = '<div class="dim txt-sm">No hay trabajos con saldo pendiente. 👍</div>';
      return;
    }

    let html = `
      <div class="porcobrar-total">
        <div class="porcobrar-total-label">Total por cobrar (${cantidad} trabajo${cantidad>1?'s':''})</div>
        <div class="porcobrar-total-monto">${pesos(total)}</div>
      </div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="_exportarPorCobrarPDF()" style="margin-bottom:10px;">📄 Exportar a PDF</button>`;

    /* Desglose por zona (si hay más de una zona) */
    if (porZona && porZona.length > 1) {
      html += '<div class="porcobrar-zonas">';
      for (const z of porZona) {
        html += `<div class="porcobrar-zona"><span>${escapeHtml(z.zona)} (${z.cantidad})</span><span>${pesos(z.total)}</span></div>`;
      }
      html += '</div>';
    }

    html += '<div class="porcobrar-lista">';
    for (const it of items) {
      const tel = it.cliente_telefono || it.telefono || '';
      html += `
        <div class="porcobrar-item">
          <div class="porcobrar-item-info" onclick="abrirModalDetalle('${it.numero}','${it.tipo}')" style="cursor:pointer;flex:1;">
            <div class="porcobrar-item-cliente">${escapeHtml(it.cliente)}</div>
            <div class="porcobrar-item-detalle dim txt-sm">${escapeHtml(it.numero)}${it.zona ? ' · ' + escapeHtml(it.zona) : ''} · Total ${pesos(it.total)}${it.adelanto > 0 ? ' · Pagado ' + pesos(it.adelanto) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="porcobrar-item-saldo" onclick="abrirModalDetalle('${it.numero}','${it.tipo}')" style="cursor:pointer;">${pesos(it.saldo)}</div>
            <button class="btn btn-ghost btn-sm" type="button" onclick="event.stopPropagation();_avisarPorCobrar('${it.numero}','${it.tipo}')" title="Recordar pago por WhatsApp">💬</button>
          </div>
        </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    console.warn('[renderAdminPorCobrar]', e);
    body.innerHTML = '<div class="dim txt-sm">No se pudo calcular.</div>';
  }
}

/* ── Avisar por WhatsApp desde Por Cobrar (recordar pago) ──── */
window._avisarPorCobrar = async (numero, tipo) => {
  try {
    const { calcularPorCobrar } = await import('../services/por.cobrar.js');
    const { items } = await calcularPorCobrar();
    const it = items.find(x => x.numero === numero);
    if (!it) { showToast('Trabajo no encontrado', 'warn'); return; }
    if (!it.cliente_telefono) { showToast('Este cliente no tiene teléfono cargado', 'warn'); return; }

    const { buildWhatsAppMessage, openWhatsApp } = await import('../services/whatsapp.js');
    const msg = await buildWhatsAppMessage('saldo_pendiente', {
      cliente: it.cliente,
      equipo:  it.equipo,
      numero:  it.numero,
      total:   pesos(it.total),
      saldo:   pesos(it.saldo)
    });
    openWhatsApp(it.cliente_telefono, msg);
  } catch (e) {
    console.warn('[_avisarPorCobrar]', e);
    showToast('No se pudo abrir WhatsApp', 'error');
  }
};
