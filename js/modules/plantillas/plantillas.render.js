/**
 * ELECTROMEL — modules/plantillas/plantillas.render.js
 * Helper de inserción en textarea y render del panel Config.
 */

import { store }   from '../../core/store.js';
import { showToast } from '../../core/ui.js';
import { cargarPlantillas, incrementarUsos, eliminarPlantillaStore,
         getCatActiva, setCatActiva, getLastField } from './plantillas.store.js';
import { buildChip, buildEmptyList } from './plantillas.templates.js';

/* ── insertarEnTextarea ───────────────────────────────── */
export function insertarEnTextarea(textarea, texto) {
  if (!textarea) return;
  const cur = textarea.value;
  const sep = cur && !cur.endsWith('\n') ? '\n' : '';
  textarea.value = cur + sep + texto;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  textarea.scrollTop = textarea.scrollHeight;
}

/* ── usarPlantilla (desde Config — target = lastActiveField) ── */
export function usarPlantilla(p) {
  const target = getLastField();
  if (target && document.body.contains(target)) {
    insertarEnTextarea(target, p.texto);
    incrementarUsos(p.id);
    showToast('✓ Plantilla insertada', 'success');
  } else {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(p.texto).then(() => showToast('📋 Texto copiado', 'info'));
    } else {
      showToast('📋 No hay campo activo', 'info');
    }
    incrementarUsos(p.id);
  }
}

/* ── Render lista en panel Config ──────────────────────── */
export async function renderListaConfig() {
  const cont = document.getElementById('plantillas-lista');
  if (!cont) return;
  const catActiva = getCatActiva();
  const todas     = await cargarPlantillas();
  const filtradas  = todas
    .filter(p => p.categoria === catActiva)
    .sort((a, b) => (b.usos || 0) - (a.usos || 0));

  cont.innerHTML = '';
  if (!filtradas.length) { cont.appendChild(buildEmptyList()); return; }

  const frag = document.createDocumentFragment();
  filtradas.forEach(p => {
    frag.appendChild(buildChip(p,
      plantilla => usarPlantilla(plantilla),
      id        => _eliminar(id)
    ));
  });
  cont.appendChild(frag);
}

async function _eliminar(id) {
  await eliminarPlantillaStore(id);
  renderListaConfig();
  showToast('Plantilla eliminada', 'info');
}
