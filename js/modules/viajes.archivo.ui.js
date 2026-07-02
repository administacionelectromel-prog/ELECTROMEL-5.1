/* ════════════════════════════════════════════════════════════════
   UI — ARCHIVO DE VIAJES (Admin) — v6.9
   Historial de viajes terminados (+48hs) agrupado por ciudad,
   con totales y promedios reales para mejorar estimaciones.
   ──────────────────────────────────────────────────────────────── */

import {
  historialPorCiudad, listarViajesArchivados, analizarViaje, getViaje,
  actualizarEstimacionCiudad, getCiudad
} from '../services/gasto.operativo.js';
import { pesos } from '../core/utils.js';
import { showToast } from '../core/ui.js';

export async function renderArchivoViajes() {
  const cont = document.getElementById('admin-archivo-viajes-body');
  if (!cont) return;

  const historial = await historialPorCiudad();
  if (!historial.length) {
    cont.innerHTML = '<div class="dim txt-sm">Todavía no hay viajes archivados. Los viajes pasan al archivo 48hs después de la fecha de regreso.</div>';
    return;
  }

  const totalViajes = historial.reduce((a, c) => a + c.nViajes, 0);
  const totalNeto = historial.reduce((a, c) => a + c.totalNeto, 0);

  let html = `
    <div class="row" style="gap:6px;margin-bottom:12px;">
      <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:10px;text-align:center;">
        <div class="dim txt-xs">Viajes archivados</div>
        <div class="bold acento" style="font-size:18px;">${totalViajes}</div>
      </div>
      <div style="flex:1;background:var(--surface-3);border-radius:8px;padding:10px;text-align:center;">
        <div class="dim txt-xs">Neto total</div>
        <div class="bold ${totalNeto >= 0 ? 'exito' : 'peligro'}" style="font-size:18px;">${pesos(totalNeto)}</div>
      </div>
    </div>`;

  for (const c of historial) {
    const netoCls = c.totalNeto >= 0 ? 'exito' : 'peligro';
    html += `
      <div class="card" style="margin-bottom:10px;">
        <div class="row" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <div class="bold" style="font-size:15px;">📍 ${_esc(c.ciudad)}</div>
            <div class="dim txt-xs">${c.nViajes} viaje(s) · ${c.promDias} días promedio</div>
          </div>
          <div style="text-align:right;">
            <div class="dim txt-xs">Neto total</div>
            <div class="bold mono ${netoCls}">${pesos(c.totalNeto)}</div>
          </div>
        </div>

        <div class="row" style="gap:6px;margin-top:8px;">
          <div style="flex:1;text-align:center;background:var(--surface-2);border-radius:6px;padding:6px;">
            <div class="dim" style="font-size:9px;">FACTURADO</div>
            <div class="bold mono acento txt-sm">${_k(c.totalFacturado)}</div>
          </div>
          <div style="flex:1;text-align:center;background:var(--surface-2);border-radius:6px;padding:6px;">
            <div class="dim" style="font-size:9px;">COBRADO</div>
            <div class="bold mono txt-sm">${_k(c.totalCobrado)}</div>
          </div>
          <div style="flex:1;text-align:center;background:var(--surface-2);border-radius:6px;padding:6px;">
            <div class="dim" style="font-size:9px;">GASTO OP.</div>
            <div class="bold mono peligro txt-sm">${_k(c.totalGasto)}</div>
          </div>
        </div>

        <div class="card-title" style="margin-top:10px;font-size:12px;">📊 Promedios reales (para estimar)</div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          ${c.promAlojDia ? `<span class="txt-xs dim">🏨 ${pesos(c.promAlojDia)}/día</span>` : ''}
          ${c.promComidaDia ? `<span class="txt-xs dim">🍽️ ${pesos(c.promComidaDia)}/día</span>` : ''}
          ${c.promCombustible ? `<span class="txt-xs dim">⛽ ${pesos(c.promCombustible)}</span>` : ''}
          ${c.promPasaje ? `<span class="txt-xs dim">🎫 ${pesos(c.promPasaje)}</span>` : ''}
          ${c.promMovilidad ? `<span class="txt-xs dim">🚖 ${pesos(c.promMovilidad)}</span>` : ''}
        </div>

        <details style="margin-top:10px;">
          <summary class="txt-xs acento" style="cursor:pointer;">Ver los ${c.nViajes} viaje(s)</summary>
          <div style="margin-top:8px;">
            ${c.viajes.map(v => {
              const sem = v.semaforo === 'verde' ? '🟢' : v.semaforo === 'amarillo' ? '🟡' : '🔴';
              const cls = v.neto >= 0 ? 'exito' : 'peligro';
              return `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--borde);">
                <div class="txt-xs">${sem} ${_fecha(v.fecha_salida)} → ${_fecha(v.fecha_regreso)} (${v.dias}d)</div>
                <div class="mono txt-xs ${cls}">${pesos(v.neto)}</div>
              </div>`;
            }).join('')}
          </div>
        </details>
      </div>`;
  }

  cont.innerHTML = html;
}

function _fecha(iso) {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0].slice(2)}`;
}

function _k(n) {
  return '$' + Math.round((n || 0) / 1000) + 'k';
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
