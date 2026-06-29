/**
 * ELECTROMEL — modules/panel/panel.render.js
 * Orquestador de render del panel principal.
 * Coordina store → filters → cards → stats → alerts.
 */

import { store, bus }     from '../../core/store.js';
import { fechaHoy } from '../../core/utils.js';
import { prepararActivos, prepararArchivados,
         isArchivadosVisible } from './panel.filters.js';
import { renderTarjetas, renderArchivadosLista, actualizarStats } from './panel.cards.js';
import { abrirModalDetalle } from './panel.detail.js';
import { actualizarBannerWA } from './panel.alerts.js';

/* ── RAF batcher ──────────────────────────────────────── */
let _rafPending  = false;
let _rafCallback = null;

function _scheduleRender(fn) {
  _rafCallback = fn;
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    _rafCallback?.();
    _rafCallback = null;
  });
}

/* ═══════════════════════════════════════════════════════════
   RENDER PANEL PRINCIPAL
   ═══════════════════════════════════════════════════════════ */
export async function renderPanelPrincipal() {
  const db = store.get('db');
  if (!db) return;
  const lista = document.getElementById('panel-lista');
  if (!lista) return;

  try {
    const { activos, archivados, filtrados } = await prepararActivos();

    _scheduleRender(() => {
      renderTarjetas(lista, filtrados, abrirModalDetalle);
      actualizarStats(activos);
      renderFranjaHoy(activos);

      const archCount = document.getElementById('archivados-count');
      if (archCount) archCount.textContent = String(archivados.length);

      if (isArchivadosVisible()) renderArchivados();
    });

    /* Banner WA en diferido para no bloquear el render principal */
    setTimeout(() => actualizarBannerWA().catch(() => {}), 200);
    /* Poblar el selector de años (diferido, no bloquea) */
    setTimeout(() => {
      import('./panel.filters.js').then(m => m.poblarSelectorAnios()).catch(() => {});
    }, 250);

  } catch(err) {
    console.error('[renderPanelPrincipal]', err);
  }
}

/* ═══════════════════════════════════════════════════════════
   RENDER ARCHIVADOS
   ═══════════════════════════════════════════════════════════ */
export async function renderArchivados() {
  const cont = document.getElementById('panel-archivados');
  if (!cont) return;
  try {
    const archivados = await prepararArchivados();
    renderArchivadosLista(cont, archivados, abrirModalDetalle);
  } catch(e) { console.error('[renderArchivados]', e); }
}

/* ═══════════════════════════════════════════════════════════
   FRANJA "HOY" — lo accionable del día arriba del Panel
   Muestra: entregas pendientes (listo para retirar) · turnos de hoy ·
   trabajos esperando repuesto. Cada chip filtra el panel a eso.
   ═══════════════════════════════════════════════════════════ */
function renderFranjaHoy(activos) {
  const cont = document.getElementById('panel-hoy');
  if (!cont) return;

  const hoy = fechaHoy();

  /* Entregas pendientes: trabajos listos para retirar */
  const entregas = activos.filter(r => r.estado === 'listo_para_retirar' || r.estado === 'reparado').length;

  /* Esperando repuesto */
  const esperando = activos.filter(r => r.estado === 'espera_componentes').length;

  /* Turnos de hoy (en exteriors con es_turno y fecha = hoy, no cancelados) */
  const turnosHoy = activos.filter(r => {
    if (!r.es_turno) return false;
    const f = (r.fecha || '').slice(0, 10);
    const est = (r.estado_turno || '').toLowerCase();
    return f === hoy && !est.includes('cancel') && !est.includes('realizado');
  }).length;

  const chips = [];
  if (entregas > 0) {
    chips.push(`<button class="hoy-chip hoy-chip-verde" onclick="filtrarPanel('OTT')">📦 ${entregas} para entregar</button>`);
  }
  if (turnosHoy > 0) {
    chips.push(`<button class="hoy-chip hoy-chip-azul" onclick="window.location.hash='#agenda'">📅 ${turnosHoy} turno${turnosHoy>1?'s':''} hoy</button>`);
  }
  if (esperando > 0) {
    chips.push(`<button class="hoy-chip hoy-chip-amarillo" onclick="filtrarPanel('TODOS')">⏳ ${esperando} esperando repuesto</button>`);
  }

  /* Render inmediato con lo que tenemos (sin esperar las garantías) */
  _pintarFranjaHoy(cont, chips);

  /* Garantías por vencer: consulta async, se agrega el chip cuando llega */
  _agregarChipGarantias(cont, chips);
}

/* Pinta la franja HOY con los chips dados (o la oculta si no hay ninguno) */
function _pintarFranjaHoy(cont, chips) {
  if (!chips.length) {
    cont.innerHTML = '';
    cont.style.display = 'none';
    return;
  }
  cont.style.display = '';
  cont.innerHTML = `
    <div class="hoy-titulo">📌 Hoy</div>
    <div class="hoy-chips">${chips.join('')}</div>`;
}

/* Consulta garantías por vencer y agrega el chip a la franja (async) */
async function _agregarChipGarantias(cont, chips) {
  try {
    const { garantiasPorVencer } = await import('../../services/garantia.js');
    const pendientes = await garantiasPorVencer(15);
    if (!pendientes || !pendientes.length) return;
    chips.push(`<button class="hoy-chip hoy-chip-garantia" onclick="window.abrirGarantiasPorVencer?.()">🛡️ ${pendientes.length} garantía${pendientes.length>1?'s':''} por vencer</button>`);
    _pintarFranjaHoy(cont, chips);
  } catch (e) { /* sin garantías o error: no agregar chip */ }
}

/* ── Mostrar la lista de garantías por vencer (chip de la franja HOY) ──── */
window.abrirGarantiasPorVencer = async () => {
  const body = document.getElementById('modal-garantias-body');
  const modal = document.getElementById('modal-garantias');
  if (!body || !modal) return;
  body.innerHTML = '<div class="dim" style="padding:16px;">Cargando…</div>';
  modal.classList.add('active');
  try {
    const { garantiasPorVencer } = await import('../../services/garantia.js');
    const lista = await garantiasPorVencer(15);
    if (!lista.length) {
      body.innerHTML = '<div class="dim" style="padding:16px;">No hay garantías por vencer en los próximos 15 días.</div>';
      return;
    }
    let html = '<div style="padding:4px 0;">';
    for (const g of lista) {
      const urgente = g.dias <= 5;
      const fechaFmt = g.fin ? new Date(g.fin + 'T12:00:00').toLocaleDateString('es-AR') : '—';
      html += `
        <div onclick="abrirModalDetalle('${g.numero}','OTT');document.getElementById('modal-garantias').classList.remove('active');"
             style="cursor:pointer;padding:12px 14px;border-bottom:1px solid var(--borde);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div>
              <div style="font-weight:600;">${_escG(g.cliente || '—')}</div>
              <div class="dim txt-sm">${_escG(g.numero)} · vence ${fechaFmt}</div>
            </div>
            <div style="font-weight:700;color:${urgente ? 'var(--peligro,#e53935)' : 'var(--acento,#f5a623)'};white-space:nowrap;">
              ${g.dias} día${g.dias !== 1 ? 's' : ''}
            </div>
          </div>
        </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="dim" style="padding:16px;">No se pudieron cargar las garantías.</div>';
  }
};

function _escG(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
