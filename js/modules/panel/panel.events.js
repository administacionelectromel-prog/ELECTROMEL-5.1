/**
 * ELECTROMEL — modules/panel/panel.events.js
 * Gestión de eventos del panel: delegación, búsqueda, lifecycle.
 */

import { store, bus }     from '../../core/store.js';
import { renderPanelPrincipal, renderArchivados } from './panel.render.js';
import { filtrarPanel, toggleArchivados as _toggleArch } from './panel.filters.js';

/* ── Listeners activos ────────────────────────────────── */
const _listeners = [];
function _on(el, type, fn, opts) {
  if (!el) return;
  el.addEventListener(type, fn, opts);
  _listeners.push({ el, type, fn });
}

/* ── Bind ─────────────────────────────────────────────── */
export function bindPanelEvents() {
  unbindPanelEvents();

  /* Búsqueda */
  let _searchTimer = null;
  const searchEl = document.getElementById('panel-search');
  if (searchEl) {
    _on(searchEl, 'input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => renderPanelPrincipal(), 250);
    });
  }

  /* Filtros de tipo — delegación */
  const filtrosEl = document.querySelector('[data-panel-filtros]');
  if (filtrosEl) {
    _on(filtrosEl, 'click', e => {
      const btn = e.target.closest('[data-filtro]');
      if (btn) { filtrarPanel(btn.dataset.filtro); renderPanelPrincipal(); }
    });
  }

  /* Archivados toggle */
  const archBtn = document.getElementById('btn-toggle-archivados');
  if (archBtn) {
    _on(archBtn, 'click', () => {
      const visible = _toggleArch();
      if (visible) renderArchivados();
    });
  }

  /* Bus */
  bus.on('panel:refresh', _onRefresh);
  bus.on('db:ready',      _onDbReady);
}

export function unbindPanelEvents() {
  _listeners.forEach(({ el, type, fn }) => {
    try { el.removeEventListener(type, fn); } catch(e) {}
  });
  _listeners.length = 0;
  bus.off?.('panel:refresh', _onRefresh);
  bus.off?.('db:ready',      _onDbReady);
}

function _onRefresh() {
  if (store.get('currentTab') === 'panel') renderPanelPrincipal();
}
function _onDbReady() { renderPanelPrincipal(); }
