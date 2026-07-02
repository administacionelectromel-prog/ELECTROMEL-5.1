/**
 * ELECTROMEL — agenda/agenda.router.js
 * Navegación modular del módulo agenda.
 * Controla qué vista está activa dentro del tab de agenda.
 * Preparado para un futuro router de SPA sin cambiar la API pública.
 */

import { store }        from '../../core/store.js';
import { AgendaLogger } from '../../core/logger.js';
import { getAgendaDOM, show, hide, $ } from './agenda.dom.js';

/* ── Vistas disponibles ──────────────────────────────────── */
export const AGENDA_VIEWS = /** @type {const} */ ({
  SEMANAL: 'semanal',
  DETALLE: 'detalle',
  CONFIG:  'config'
});

/** @type {string} */
let _currentView = AGENDA_VIEWS.SEMANAL;

/** @type {Function[]} */
const _beforeLeave = [];

/* ── API pública ─────────────────────────────────────────── */

/**
 * Abre la vista semanal principal.
 * @param {Object} [params]
 * @param {number} [params.offset] - semana offset a mostrar
 */
export async function openAgendaView(params = {}) {
  if (params.offset !== undefined) {
    const { setOffset } = await import('./agenda.store.js');
    setOffset(params.offset);
  }
  await _navigateTo(AGENDA_VIEWS.SEMANAL);
}

/**
 * Abre la vista de detalle de un turno específico.
 * Equivalente a abrir el formulario de edición.
 * @param {string} turnoId
 */
export async function openAgendaDetail(turnoId) {
  await _navigateTo(AGENDA_VIEWS.DETALLE, { turnoId });
}

/**
 * Abre la vista de configuración de agenda / IQ.
 */
export async function openAgendaConfig() {
  await _navigateTo(AGENDA_VIEWS.CONFIG);
}

/**
 * Retorna a la vista semanal desde cualquier sub-vista.
 */
export async function backToAgenda() {
  await openAgendaView();
}

/* ── Vista actual ────────────────────────────────────────── */
export function getCurrentView() { return _currentView; }

/* ── Registro de hooks ───────────────────────────────────── */

/**
 * Registra un hook que se ejecuta antes de abandonar la vista actual.
 * Útil para confirmar guardado de cambios no guardados.
 * @param {Function} fn - retorna false para bloquear navegación
 */
export function onBeforeLeave(fn) {
  _beforeLeave.push(fn);
}

/* ── Navegación interna ──────────────────────────────────── */

async function _navigateTo(view, params = {}) {
  /* Ejecutar hooks before-leave */
  for (const fn of _beforeLeave) {
    const ok = await Promise.resolve(fn(_currentView, view));
    if (ok === false) {
      AgendaLogger.debug(`Navigation blocked: ${_currentView} → ${view}`);
      return;
    }
  }

  const prev = _currentView;
  _currentView = view;

  AgendaLogger.info(`Navigate: ${prev} → ${view}`, params);

  switch(view) {
    case AGENDA_VIEWS.SEMANAL:
      _showSection('agenda-vista-semanal');
      _hideSection('agenda-vista-detalle');
      _hideSection('agenda-vista-config');
      const { renderAgenda } = await import('./agenda.render.js');
      await renderAgenda();
      break;

    case AGENDA_VIEWS.DETALLE:
      if (params.turnoId) {
        const { abrirFormularioTurno } = await import('./agenda.render.js');
        const db = store.get('db');
        const { dbGet } = await import('../../core/db.js');
        const turno = await dbGet(db, 'exteriors', params.turnoId).catch(() => null);
        if (turno) abrirFormularioTurno(turno);
      }
      break;

    case AGENDA_VIEWS.CONFIG:
      _showSection('agenda-vista-config');
      _hideSection('agenda-vista-semanal');
      break;
  }
}

function _showSection(id) {
  const el = document.getElementById(id);
  if (el) show(el);
}

function _hideSection(id) {
  const el = document.getElementById(id);
  if (el) hide(el);
}
