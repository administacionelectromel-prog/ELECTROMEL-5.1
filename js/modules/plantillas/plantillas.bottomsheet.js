/**
 * ELECTROMEL — modules/plantillas/plantillas.bottomsheet.js
 * Mini-panel bottom-sheet de acceso rápido a plantillas.
 */

import { cargarPlantillas, incrementarUsos, setLastField } from './plantillas.store.js';
import { buildChipMini } from './plantillas.templates.js';
import { insertarEnTextarea } from './plantillas.render.js';
import { showToast } from '../../core/ui.js';

const MODAL_ID = 'modal-plantillas-mini';

const CAT_TITLES = {
  diagnostico: '🔍 Diagnóstico — Plantillas',
  trabajo:     '🔨 Trabajo — Plantillas',
  materiales:  '🛒 Materiales — Plantillas',
  notas:       '📝 Notas — Plantillas'
};

/**
 * Abre el bottom-sheet de plantillas para el textarea dado.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} categoria
 */
export function abrirMiniPanelPlantillas(textarea, categoria) {
  setLastField(textarea);
  const modal = _getOrCreateModal();
  document.getElementById('mini-panel-titulo').textContent =
    CAT_TITLES[categoria] || '📋 Plantillas';
  _renderMiniPanel(textarea, categoria);
  modal.classList.add('active');
}

function _getOrCreateModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id        = MODAL_ID;
  modal.className = 'modal modal-bottom';
  modal.innerHTML = `
    <div class="modal-header">
      <button class="modal-close" type="button"
        onclick="document.getElementById('${MODAL_ID}').classList.remove('active')">×</button>
      <div class="modal-title" id="mini-panel-titulo">📋 Plantillas</div>
    </div>
    <div class="modal-body" id="mini-panel-body"></div>`;
  document.body.appendChild(modal);
  return modal;
}

async function _renderMiniPanel(textarea, categoria) {
  const body = document.getElementById('mini-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="dim txt-sm" style="padding:8px;">Cargando...</div>';

  const todas    = await cargarPlantillas();
  const filtradas = todas
    .filter(p => p.categoria === categoria)
    .sort((a, b) => (b.usos || 0) - (a.usos || 0));

  body.innerHTML = '';

  /* Buscador interno */
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'padding:8px;position:sticky;top:0;background:var(--surface-1);z-index:1;';
  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.placeholder = 'Buscar plantilla...';
  searchInput.className   = 'search-bar';
  searchWrap.appendChild(searchInput);
  body.appendChild(searchWrap);

  const lista = document.createElement('div');
  lista.id = 'mini-panel-lista';
  body.appendChild(lista);

  function _renderItems(items) {
    lista.innerHTML = '';
    if (!items.length) {
      lista.innerHTML = '<div class="dim txt-sm" style="padding:8px;">Sin coincidencias.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(p => {
      const chip = buildChipMini(p, plantilla => {
        insertarEnTextarea(textarea, plantilla.texto);
        incrementarUsos(plantilla.id);
        document.getElementById(MODAL_ID)?.classList.remove('active');
        showToast('✓ Plantilla insertada', 'success');
      });
      frag.appendChild(chip);
    });
    lista.appendChild(frag);
  }

  _renderItems(filtradas);

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    _renderItems(q.length < 2 ? filtradas : filtradas.filter(p => p.texto.toLowerCase().includes(q)));
  });

  setTimeout(() => searchInput.focus(), 150);
}
