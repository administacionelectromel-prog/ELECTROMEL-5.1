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
  const { openFirst = false, remember = false } = opts;
  const container = document.getElementById(containerId);
  if (!container) return;

  /* Leer estado guardado de qué secciones quedaron abiertas (si remember) */
  let abiertasGuardadas = null;
  if (remember) {
    try {
      const raw = window._collapsibleState && window._collapsibleState[containerId];
      if (raw) abiertasGuardadas = raw;
    } catch (e) { /* sin estado */ }
  }

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

    /* ¿Debe abrirse? Por estado guardado, o por openFirst en la primera */
    let shouldOpen = openFirst && i === 0;
    if (abiertasGuardadas && abiertasGuardadas.includes(title)) shouldOpen = true;

    if (!shouldOpen) body.classList.add('hide');
    else header.querySelector('.collapsible-icon').textContent = '▼';

    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('hide');
      body.classList.toggle('hide', isOpen);
      header.querySelector('.collapsible-icon').textContent = isOpen ? '▶' : '▼';
      /* Guardar el nuevo estado de secciones abiertas */
      if (remember) _guardarEstadoCollapsibles(containerId, container);
    });
  });
}

/* Guarda en memoria + IndexedDB qué secciones están abiertas */
async function _guardarEstadoCollapsibles(containerId, container) {
  try {
    const abiertas = [];
    container.querySelectorAll('[data-collapsible="true"]').forEach(section => {
      const body = section.querySelector('.collapsible-body');
      const title = section.dataset.title;
      if (body && !body.classList.contains('hide') && title) abiertas.push(title);
    });
    if (!window._collapsibleState) window._collapsibleState = {};
    window._collapsibleState[containerId] = abiertas;
    /* Persistir en IndexedDB (este entorno no permite localStorage) */
    const { store } = await import('./store.js');
    const db = store.get('db');
    if (db) {
      const { setCfg } = await import('./db.js');
      await setCfg(db, 'collapsible_' + containerId, JSON.stringify(abiertas));
    }
  } catch (e) { /* no crítico */ }
}

/* Carga el estado guardado desde IndexedDB a memoria (llamar antes de buildCollapsibles) */
export async function cargarEstadoCollapsibles(containerId) {
  try {
    const { store } = await import('./store.js');
    const db = store.get('db');
    if (!db) return;
    const { getCfg } = await import('./db.js');
    const raw = await getCfg(db, 'collapsible_' + containerId, null);
    if (raw) {
      if (!window._collapsibleState) window._collapsibleState = {};
      window._collapsibleState[containerId] = JSON.parse(raw);
    }
  } catch (e) { /* sin estado guardado */ }
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

/* ── Indicador de base (obsoleto) ───────────────────────────
   El negocio dejó de manejar dos bases (SMA/NQN): ahora la base
   es única (San Martín). El badge del header queda oculto. */
export async function actualizarBaseHeader() {
  const el = document.getElementById('header-base');
  if (el) el.style.display = 'none';
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

/* ════════════════════════════════════════════════════════════════
   confirmarLindo — reemplazo lindo del confirm() del navegador.
   Devuelve una Promise<boolean>. Uso: if (await confirmarLindo('...'))
   ──────────────────────────────────────────────────────────────── */
export function confirmarLindo(mensaje, opts = {}) {
  return new Promise(resolve => {
    const modal   = document.getElementById('modal-confirmar');
    const msgEl   = document.getElementById('modal-confirmar-msg');
    const titEl   = document.getElementById('modal-confirmar-titulo');
    const okBtn   = document.getElementById('modal-confirmar-ok');
    if (!modal || !msgEl || !okBtn) { resolve(window.confirm(mensaje)); return; }

    titEl.textContent = opts.titulo || 'Confirmar';
    msgEl.textContent = mensaje;
    okBtn.textContent = opts.textoOk || 'Confirmar';
    okBtn.className   = 'btn btn-block ' + (opts.peligro === false ? 'btn-primary' : 'btn-danger');

    const cerrar = (val) => {
      modal.classList.remove('active');
      okBtn.onclick = null;
      window._resolverConfirmar = null;
      resolve(val);
    };
    okBtn.onclick = () => cerrar(true);
    window._resolverConfirmar = (val) => cerrar(val);

    modal.classList.add('active');
  });
}
