/**
 * ELECTROMEL — agenda/agenda.events.js
 * Gestión centralizada de eventos del módulo agenda.
 * bind/unbind, delegación, cleanup en unmount.
 * No importa módulos de render directamente — usa callbacks inyectados.
 */

import { AgendaLogger } from '../../core/logger.js';
import { getAgendaDOM, $ } from './agenda.dom.js';
import { DOM_IDS, TIMINGS } from './agenda.constants.js';

/* ── Registro de listeners activos ──────────────────────── */
/** @type {Array<{ el: Element, type: string, fn: Function }>} */
const _listeners = [];

/**
 * Registra un event listener y lo guarda para poder removerlo luego.
 * @param {Element|Window|Document} target
 * @param {string} type
 * @param {Function} fn
 * @param {AddEventListenerOptions} [opts]
 */
function _on(target, type, fn, opts) {
  if (!target) return;
  target.addEventListener(type, fn, opts);
  _listeners.push({ el: target, type, fn });
}

/* ── Callbacks inyectados desde render ─────────────────── */
/** @type {Object.<string, Function>} */
let _handlers = {};

/**
 * Registra los handlers del módulo render.
 * Llamar desde agenda.render.js antes de bindAgendaEvents().
 * @param {Object} handlers
 */
export function registerHandlers(handlers) {
  _handlers = { ..._handlers, ...handlers };
  AgendaLogger.debug('Handlers registered', Object.keys(handlers));
}

/* ── Bind principal ──────────────────────────────────────── */

/**
 * bindAgendaEvents()
 * Registra todos los listeners del módulo agenda.
 * Idempotente: llama unbindAgendaEvents() primero.
 */
export function bindAgendaEvents() {
  unbindAgendaEvents();
  const dom = getAgendaDOM();

  /* Delegación en el contenedor de días */
  if (dom.dias) {
    _on(dom.dias, 'click', _handleDiasClick);
  }

  /* Botones de navegación de semana */
  _bindButton('btn-semana-anterior',  () => _handlers.semanaAnterior?.());
  _bindButton('btn-semana-siguiente', () => _handlers.semanaSiguiente?.());

  /* Filtros de base */
  const filtrosEl = $('[data-agenda-filtros]') || document.getElementById('agenda-filtros');
  if (filtrosEl) {
    _on(filtrosEl, 'click', _handleFiltrosClick);
  }

  /* Toggle IQ */
  _bindButton('btn-agenda-iq', () => _handlers.toggleIQ?.());
  _bindButton('btn-semana-optima', () => _handlers.generateOptimalWeek?.());

  /* Modal turno — submit */
  _bindButton('btn-guardar-turno', () => _handlers.guardarTurno?.());
  _bindButton('btn-cerrar-turno',  () => _handlers.cerrarTurno?.());

  /* Modal feedback */
  _bindButton('btn-confirmar-feedback', () => _handlers.confirmarFeedback?.());

  /* Recalc score — delegación en el modal de turno */
  if (dom.modalTurno) {
    _on(dom.modalTurno, 'input',  _handleScoreRecalc);
    _on(dom.modalTurno, 'change', _handleScoreRecalc);
  }

  /* Keyboard shortcuts (solo desktop / teclado físico) */
  _on(document, 'keydown', _handleKeydown);

  /* IQ sugerencias — delegación */
  const iqSug = document.getElementById(DOM_IDS.IQ_SUGERENCIAS);
  if (iqSug) {
    _on(iqSug, 'click', _handleSugerenciasClick);
  }

  AgendaLogger.debug(`bindAgendaEvents: ${_listeners.length} listeners activos`);
}

/**
 * unbindAgendaEvents()
 * Remueve todos los listeners registrados.
 */
export function unbindAgendaEvents() {
  _listeners.forEach(({ el, type, fn }) => {
    try { el.removeEventListener(type, fn); } catch(e) {}
  });
  _listeners.length = 0;
  AgendaLogger.debug('unbindAgendaEvents: todos los listeners removidos');
}

/* ── Handlers delegados ──────────────────────────────────── */

function _handleDiasClick(e) {
  /* Click en tarjeta de turno */
  const card = e.target.closest('.turno-card');
  if (card) {
    const id = card.dataset.id;
    if (id) _handlers.abrirTurno?.(id);
    return;
  }

  /* Click en feedback de turno */
  const fbBtn = e.target.closest('[data-turno-feedback]');
  if (fbBtn) {
    const id = fbBtn.dataset.turnoFeedback;
    if (id) _handlers.abrirFeedback?.(id);
    return;
  }
}

function _handleFiltrosClick(e) {
  const btn = e.target.closest('[data-base]');
  if (!btn) return;
  const base = btn.dataset.base;
  if (base) _handlers.filtrarBase?.(base);
}

/** Debounce del recalc de score */
let _scoreTimer = null;
function _handleScoreRecalc(e) {
  const CAMPOS_SCORE = [
    DOM_IDS.TURNO_BASE,
    DOM_IDS.TURNO_FECHA,
    DOM_IDS.TURNO_INGRESO,
    DOM_IDS.TURNO_HORAS,
    DOM_IDS.TURNO_SERVICIO
  ];
  if (!CAMPOS_SCORE.includes(e.target?.id)) return;
  clearTimeout(_scoreTimer);
  _scoreTimer = setTimeout(() => _handlers.recalcScore?.(), TIMINGS.SCORE_DEBOUNCE);
}

function _handleSugerenciasClick(e) {
  const btn = e.target.closest('[data-sug-action]');
  if (!btn) return;
  const action = btn.dataset.sugAction;
  const id     = btn.dataset.sugId;
  if (!id) return;
  if (action === 'apply')   _handlers.applySuggestion?.(id);
  if (action === 'dismiss') _handlers.dismissSuggestion?.(id);
}

function _handleKeydown(e) {
  /* Solo si el foco no está en un input/textarea */
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  switch(e.key) {
    case 'ArrowLeft':  _handlers.semanaAnterior?.();  break;
    case 'ArrowRight': _handlers.semanaSiguiente?.(); break;
    case 'n': case 'N':
      if (!e.ctrlKey && !e.metaKey) _handlers.nuevoTurno?.();
      break;
    case 'Escape':
      _handlers.cerrarTurno?.();
      _handlers.cerrarFeedback?.();
      break;
  }
}

/* ── Helpers privados ────────────────────────────────────── */

function _bindButton(id, fn) {
  const btn = document.getElementById(id);
  if (btn) _on(btn, 'click', fn);
}

/* ── Observers ───────────────────────────────────────────── */

/**
 * Observa cambios de visibilidad del tab agenda.
 * Cuando el tab se activa, dispara el handler de mount.
 * Retorna una función de cleanup.
 * @param {string} tabId
 * @param {Function} onVisible
 * @returns {Function} cleanup
 */
export function observeTabVisibility(tabId, onVisible) {
  const tabEl = document.getElementById(tabId);
  if (!tabEl) return () => {};

  const obs = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const active = tabEl.classList.contains('active');
        if (active) onVisible();
      }
    }
  });

  obs.observe(tabEl, { attributes: true, attributeFilter: ['class'] });
  AgendaLogger.debug(`observeTabVisibility: watching #${tabId}`);
  return () => obs.disconnect();
}
