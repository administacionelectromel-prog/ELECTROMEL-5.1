/**
 * ELECTROMEL — modules/plantillas/plantillas.autocomplete.js
 * Dropdown inline de sugerencias al escribir en textareas.
 */

import { cargarPlantillas, incrementarUsos } from './plantillas.store.js';
import { buildInlineItem } from './plantillas.templates.js';

const DEBOUNCE_MS = 180;
const MAX_ITEMS   = 6;

/**
 * Conecta un textarea a sugerencias inline de plantillas.
 * Idempotente — se puede llamar múltiples veces.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} categoria
 */
export function initPlantillasInline(textarea, categoria) {
  if (!textarea || textarea._plantillasInlineInit) return;
  textarea._plantillasInlineInit = true;

  /* Crear dropdown */
  const dropdown = document.createElement('div');
  dropdown.className = 'plantillas-inline-dropdown hide';
  dropdown.setAttribute('role', 'listbox');
  const parent = textarea.parentNode;
  parent.style.position = 'relative';
  parent.appendChild(dropdown);

  let _timer    = null;
  let _lastQuery = '';

  textarea.addEventListener('input', () => {
    clearTimeout(_timer);
    _timer = setTimeout(() => _buscarYMostrar(), DEBOUNCE_MS);
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hide'), 200);
  });

  textarea.addEventListener('focus', () => {
    if ((textarea.value || '').trim().length >= 2) _buscarYMostrar();
  });

  /* Navegación con teclado */
  textarea.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.pli-item');
    if (!items.length || dropdown.classList.contains('hide')) return;
    const active = dropdown.querySelector('.pli-item.pli-active');
    let idx = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('pli-active', i === idx));
      items[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('pli-active', i === idx));
      items[idx]?.scrollIntoView({ block: 'nearest' });
    } else if ((e.key === 'Enter' || e.key === 'Tab') && active) {
      e.preventDefault();
      _seleccionar(active.dataset.id, active.dataset.texto);
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hide');
    }
  });

  async function _buscarYMostrar() {
    const lines = (textarea.value || '').split('\n');
    const query = lines[lines.length - 1].trim().toLowerCase();
    if (query.length < 2) { dropdown.classList.add('hide'); return; }
    if (query === _lastQuery) return;
    _lastQuery = query;

    const todas    = await cargarPlantillas();
    const filtradas = todas
      .filter(p => p.categoria === categoria && p.texto.toLowerCase().includes(query))
      .sort((a, b) => (b.usos || 0) - (a.usos || 0))
      .slice(0, MAX_ITEMS);

    if (!filtradas.length) { dropdown.classList.add('hide'); return; }

    dropdown.innerHTML = '';
    const frag = document.createDocumentFragment();
    filtradas.forEach((p, i) => {
      const item = buildInlineItem(p, query, _seleccionar);
      if (i === 0) item.classList.add('pli-active');
      frag.appendChild(item);
    });
    dropdown.appendChild(frag);
    dropdown.classList.remove('hide');
  }

  function _seleccionar(id, texto) {
    const lines = (textarea.value || '').split('\n');
    lines[lines.length - 1] = texto;
    textarea.value = lines.join('\n');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    dropdown.classList.add('hide');
    _lastQuery = '';
    incrementarUsos(id);
  }
}
