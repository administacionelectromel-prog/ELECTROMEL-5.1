/**
 * ELECTROMEL — modules/panel/panel.render.js
 * Orquestador de render del panel principal.
 * Coordina store → filters → cards → stats → alerts.
 */

import { store, bus }     from '../../core/store.js';
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
