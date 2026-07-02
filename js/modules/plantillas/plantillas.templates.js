/**
 * ELECTROMEL — modules/plantillas/plantillas.templates.js
 * Builders de elementos DOM para plantillas.
 * Funciones puras — sin efectos secundarios.
 */

import { escapeHtml } from '../../core/utils.js';

/**
 * Construye un chip de plantilla para el panel Config.
 * @param {Object} p - plantilla
 * @param {Function} onClick
 * @param {Function} onDelete
 */
export function buildChip(p, onClick, onDelete) {
  const chip = document.createElement('div');
  chip.className = 'plantilla-chip' +
    (p.usos >= 10 ? ' uso-alto' : p.usos >= 3 ? ' uso-medio' : '');

  const txt = document.createElement('span');
  txt.className   = 'plantilla-chip-texto';
  txt.textContent = p.texto;

  const uso = document.createElement('span');
  uso.className   = 'plantilla-chip-uso';
  uso.textContent = p.usos > 0 ? '×' + p.usos : '';

  const del = document.createElement('button');
  del.className   = 'plantilla-chip-del';
  del.type        = 'button';
  del.textContent = '✕';
  del.title       = 'Eliminar';
  del.addEventListener('click', e => { e.stopPropagation(); onDelete(p.id); });

  chip.appendChild(txt);
  chip.appendChild(uso);
  chip.appendChild(del);
  chip.addEventListener('click', () => onClick(p));
  return chip;
}

/**
 * Construye un chip para el mini-panel bottom-sheet (sin botón eliminar).
 * @param {Object} p
 * @param {Function} onClick
 */
export function buildChipMini(p, onClick) {
  const chip = document.createElement('div');
  chip.className = 'plantilla-chip' +
    (p.usos >= 10 ? ' uso-alto' : p.usos >= 3 ? ' uso-medio' : '');
  chip.style.margin = '4px 0';

  const txt = document.createElement('span');
  txt.className   = 'plantilla-chip-texto';
  txt.textContent = p.texto;

  const uso = document.createElement('span');
  uso.className   = 'plantilla-chip-uso';
  uso.textContent = p.usos > 0 ? '×' + p.usos : '';

  chip.appendChild(txt);
  chip.appendChild(uso);
  chip.addEventListener('click', () => onClick(p));
  return chip;
}

/**
 * Construye un item del dropdown inline con texto resaltado.
 * @param {Object} p
 * @param {string} query - término de búsqueda para resaltar
 * @param {Function} onMousedown
 */
export function buildInlineItem(p, query, onMousedown) {
  const item = document.createElement('div');
  item.className       = 'pli-item';
  item.dataset.id      = p.id;
  item.dataset.texto   = p.texto;
  item.setAttribute('role', 'option');

  /* Resaltar coincidencia */
  const lo    = p.texto.toLowerCase();
  const start = lo.indexOf(query.toLowerCase());
  if (start >= 0 && query) {
    item.innerHTML =
      escapeHtml(p.texto.slice(0, start)) +
      '<mark>' + escapeHtml(p.texto.slice(start, start + query.length)) + '</mark>' +
      escapeHtml(p.texto.slice(start + query.length));
  } else {
    item.textContent = p.texto;
  }

  if (p.usos >= 3) {
    const badge = document.createElement('span');
    badge.className   = 'pli-usos';
    badge.textContent = '×' + p.usos;
    item.appendChild(badge);
  }

  item.addEventListener('mousedown', e => { e.preventDefault(); onMousedown(p.id, p.texto); });
  return item;
}

/**
 * Empty state para la lista del panel Config.
 */
export function buildEmptyList() {
  const div = document.createElement('div');
  div.className   = 'dim txt-sm';
  div.style.padding = '8px';
  div.textContent = 'Sin plantillas. Agregá una abajo.';
  return div;
}
