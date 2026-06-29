/**
 * ELECTROMEL — agenda/agenda.dom.js
 * Cache de referencias DOM del módulo agenda.
 * Evita querySelector repetidos — todas las referencias se obtienen una vez
 * y se invalidan al desmontar el módulo.
 *
 * Uso:
 *   import { $, $$, getAgendaDOM, invalidateDOMCache } from './agenda.dom.js';
 */

import { DOM_IDS } from './agenda.constants.js';
import { AgendaLogger } from '../../core/logger.js';

/** @type {import('./agenda.types.js').AgendaDOM} */
let _cache = null;

/* ── Cache principal ─────────────────────────────────────── */

/**
 * Obtiene (o construye) el cache de referencias DOM.
 * Cachea a nivel de módulo — llamar cuantas veces sea necesario.
 * @returns {import('./agenda.types.js').AgendaDOM}
 */
export function getAgendaDOM() {
  if (_cache) return _cache;

  _cache = {
    dias:          document.getElementById(DOM_IDS.DIAS),
    semanaLabel:   document.getElementById(DOM_IDS.SEMANA_LABEL),
    nqnBanner:     document.getElementById(DOM_IDS.NQN_BANNER),
    iqBody:        document.getElementById(DOM_IDS.IQ_BODY),
    iqResumen:     document.getElementById(DOM_IDS.IQ_RESUMEN),
    iqSugerencias: document.getElementById(DOM_IDS.IQ_SUGERENCIAS),
    iqIcon:        document.getElementById(DOM_IDS.IQ_ICON),
    modalTurno:    document.getElementById(DOM_IDS.MODAL_TURNO),
    modalFeedback: document.getElementById(DOM_IDS.MODAL_FEEDBACK),
  };

  AgendaLogger.debug('DOM cache built', Object.keys(_cache).filter(k => !_cache[k]).map(k => `${k}=null`));
  return _cache;
}

/**
 * Invalida el cache.
 * Llamar al desmontar el módulo o cuando el DOM cambia estructuralmente.
 */
export function invalidateDOMCache() {
  _cache = null;
  AgendaLogger.debug('DOM cache invalidated');
}

/* ── Selectores convenientes ─────────────────────────────── */

/**
 * querySelector con fallback seguro (no lanza).
 * @param {string} selector
 * @param {Element|Document} [context]
 * @returns {Element|null}
 */
export function $(selector, context = document) {
  try { return context.querySelector(selector); }
  catch(e) { AgendaLogger.warn(`$(${selector}) failed`, e); return null; }
}

/**
 * querySelectorAll como Array.
 * @param {string} selector
 * @param {Element|Document} [context]
 * @returns {Element[]}
 */
export function $$(selector, context = document) {
  try { return Array.from(context.querySelectorAll(selector)); }
  catch(e) { AgendaLogger.warn(`$$(${selector}) failed`, e); return []; }
}

/**
 * getElementById con fallback seguro.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $id(id) {
  return document.getElementById(id);
}

/* ── Helpers de DOM ──────────────────────────────────────── */

/**
 * Vacía un elemento de forma eficiente (sin innerHTML = '').
 * Más rápido en Android: eliminar nodos por la cola.
 * @param {Element} el
 */
export function clearElement(el) {
  if (!el) return;
  while (el.lastChild) el.removeChild(el.lastChild);
}

/**
 * Crea un DocumentFragment con los elementos hijos dados.
 * Usar para insertar múltiples nodos en un solo reflow.
 * @param {Element[]} children
 * @returns {DocumentFragment}
 */
export function createFragment(children) {
  const frag = document.createDocumentFragment();
  children.forEach(c => c && frag.appendChild(c));
  return frag;
}

/**
 * Aplica atributos a un elemento.
 * @param {Element} el
 * @param {Object.<string, string|number|boolean>} attrs
 */
export function setAttrs(el, attrs) {
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v === null || v === undefined) el.removeAttribute(k);
    else el.setAttribute(k, String(v));
  });
}

/**
 * Crea un elemento con clase y contenido opcional.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [textContent]
 * @returns {HTMLElement}
 */
export function el(tag, className, textContent) {
  const e = document.createElement(tag);
  if (className)   e.className   = className;
  if (textContent !== undefined) e.textContent = textContent;
  return e;
}

/* ── Scroll helpers ──────────────────────────────────────── */

/**
 * Scroll suave al elemento dado si está fuera de la vista.
 * @param {Element} element
 */
export function scrollIntoViewIfNeeded(element) {
  if (!element) return;
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch(e) {
    element.scrollIntoView();
  }
}

/* ── Visibilidad ─────────────────────────────────────────── */

/**
 * Muestra un elemento (remueve clase hide).
 * @param {Element|null} el
 */
export function show(el) { el?.classList.remove('hide'); }

/**
 * Oculta un elemento (agrega clase hide).
 * @param {Element|null} el
 */
export function hide(el) { el?.classList.add('hide'); }

/**
 * Toggle de visibilidad.
 * @param {Element|null} el
 * @param {boolean} [visible]
 */
export function toggle(el, visible) {
  if (!el) return;
  el.classList.toggle('hide', visible === undefined ? el.classList.contains('hide') : !visible);
}
