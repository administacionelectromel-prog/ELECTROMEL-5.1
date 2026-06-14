/**
 * ELECTROMEL — ui.js
 * Componentes de UI reutilizables: toast, navegación por tabs,
 * collapsibles dinámicos, modal helpers.
 */

import { store, bus } from './store.js';

/* ── Toast ───────────────────────────────────────────────── */
let _toastQueue   = [];
let _toastRunning = false;

export function showToast(msg, type = 'info', durationMs = 2800) {
  _toastQueue.push({ msg, type, durationMs });
  if (!_toastRunning) _nextToast();
}

function _nextToast() {
  if (!_toastQueue.length) { _toastRunning = false; return; }
  _toastRunning = true;
  const { msg, type, durationMs } = _toastQueue.shift();

  let cont = document.getElementById('toast-container');
  if (!cont) { console.log('[TOAST]', msg); _nextToast(); return; }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  cont.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });

  setTimeout(() => {
    el.classList.remove('visible');
    el.addEventListener('transitionend', () => {
      el.remove();
      setTimeout(_nextToast, 80);
    }, { once: true });
    setTimeout(() => { el.remove(); setTimeout(_nextToast, 80); }, 500);
  }, durationMs);
}

/* ── Tabs ────────────────────────────────────────────────── */
const TAB_PANELS = {
  panel:         'panel-panel',
  agenda:        'panel-agenda',
  abonos:        'panel-abonos',
  contabilidad:  'panel-contabilidad',
  config:        'panel-config'
};

export function showTab(name) {
  const prev = store.get('currentTab');
  if (prev === name) return;

  /* Ocultar todos los paneles */
  Object.values(TAB_PANELS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  /* Activar el solicitado */
  const panelId = TAB_PANELS[name];
  if (panelId) {
    const el = document.getElementById(panelId);
    if (el) el.classList.add('active');
  }

  /* Actualizar nav inferior */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  /* El FAB (+) solo tiene sentido en Panel y Agenda */
  const fab = document.getElementById('fab-container');
  if (fab) {
    const mostrarFab = (name === 'panel' || name === 'agenda');
    fab.style.display = mostrarFab ? '' : 'none';
    /* Si se oculta, cerrar el menú por las dudas */
    if (!mostrarFab) {
      const menu = document.getElementById('fab-menu');
      const btn  = document.getElementById('fab-btn');
      if (menu) menu.classList.add('hide');
      if (btn)  { btn.textContent = '+'; btn.classList.remove('fab-open'); }
    }
  }

  store.set('currentTab', name);
  bus.emit('tab:cambio', { from: prev, to: name });
}

/* ── Collapsibles ────────────────────────────────────────── */
export function buildCollapsibles(containerId, opts = {}) {
  const { openFirst = false } = opts;
  const container = document.getElementById(containerId);
  if (!container) return;

  const sections = container.querySelectorAll('[data-collapsible="true"]');
  sections.forEach((section, i) => {
    const title = section.dataset.title || 'Sección';
    const body  = section.querySelector('[id$="-body"], .admin-section-body, :first-child');
    if (!body) return;

    /* Crear wrapper si no existe */
    if (section.dataset.builtCollapsible) return;
    section.dataset.builtCollapsible = '1';

    const header = document.createElement('button');
    header.className = 'collapsible-header';
    header.type = 'button';
    header.innerHTML = `<span class="collapsible-icon">▶</span><span>${title}</span>`;

    section.insertBefore(header, body);
    body.classList.add('collapsible-body');

    const shouldOpen = openFirst && i === 0;
    if (!shouldOpen) body.classList.add('hide');
    else header.querySelector('.collapsible-icon').textContent = '▼';

    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('hide');
      body.classList.toggle('hide', isOpen);
      header.querySelector('.collapsible-icon').textContent = isOpen ? '▶' : '▼';
    });
  });
}

/* ── Modal helpers ───────────────────────────────────────── */
export function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

export function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
}

/* ── Indicador de base (SMA/NQN en el header) ───────────── */
export async function actualizarBaseHeader() {
  try {
    const { getBaseForDate } = await import('./db.js');
    const base = await getBaseForDate(store.get('db'), new Date().toISOString().slice(0,10));
    const el = document.getElementById('header-base');
    if (el) {
      el.textContent = base;
      el.className = 'header-base base-' + base.toLowerCase();
    }
  } catch(e) {
    console.warn('[actualizarBaseHeader]', e);
  }
}

/* ── Actualizar info del sistema (panel Config) ─────────── */
export async function actualizarInfoSistema() {
  const db = store.get('db');
  if (!db) return;
  try {
    const { peekNextNumber, dbCount } = await import('./db.js');
    for (const tipo of ['ING', 'OTT', 'OTE', 'PRE']) {
      const num = await peekNextNumber(db, tipo);
      const elInfo = document.getElementById(`info-next-${tipo.toLowerCase()}`);
      const elCfg  = document.getElementById(`cfg-next-${tipo}`);
      if (elInfo) elInfo.textContent = num;
      if (elCfg)  elCfg.textContent  = num;
    }
    const nClientes = await dbCount(db, 'clientes');
    const nMovs     = await dbCount(db, 'finance_movements');
    const el1 = document.getElementById('info-clientes-count');
    const el2 = document.getElementById('info-movs-count');
    if (el1) el1.textContent = nClientes;
    if (el2) el2.textContent = nMovs;
  } catch(e) {
    console.warn('[actualizarInfoSistema]', e);
  }
}

/* ── SW update notification ────────────────────────────── */
export function initSWUpdateBanner() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const banner = document.getElementById('sw-update-banner');
    if (banner) banner.classList.remove('hide');
  });
}

export function reloadApp() {
  window.location.reload();
}

/* ── Logo dinámico ────────────────────────────────────────── */
export async function cargarLogoEmpresa() {
  const db = store.get('db');
  if (!db) return;
  try {
    const { getCfg } = await import('./db.js');
    const logoData = await getCfg(db, 'empresa_logo', null);
    if (logoData) {
      const imgs = document.querySelectorAll('.empresa-logo');
      imgs.forEach(img => { img.src = logoData; img.classList.remove('hide'); });
    }
  } catch(e) {
    console.warn('[cargarLogoEmpresa]', e);
  }
}
