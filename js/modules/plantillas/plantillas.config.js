/**
 * ELECTROMEL — modules/plantillas/plantillas.config.js
 * Integración con el panel de configuración.
 */

import { showToast }   from '../../core/ui.js';
import { getCatActiva, setCatActiva, agregarPlantillaStore } from './plantillas.store.js';
import { renderListaConfig } from './plantillas.render.js';

/* ── plantillasFiltrar ────────────────────────────────── */
export function plantillasFiltrar(cat) {
  setCatActiva(cat);
  document.querySelectorAll('#plantillas-tabs .tab-inner').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  renderListaConfig();
}

/* ── agregarPlantilla ─────────────────────────────────── */
export async function agregarPlantilla() {
  const catEl  = document.getElementById('nueva-plantilla-cat');
  const texEl  = document.getElementById('nueva-plantilla-texto');
  if (!catEl || !texEl) return;
  const cat   = catEl.value;
  const texto = texEl.value.trim();
  if (!texto) { showToast('⚠️ Escribí el texto', 'warn'); texEl.focus(); return; }

  const ok = await agregarPlantillaStore(cat, texto);
  if (!ok) { showToast('Ya existe esta plantilla', 'warn'); return; }

  texEl.value = '';
  plantillasFiltrar(cat);
  showToast('✓ Plantilla agregada', 'success');
}

/* ── abrirPlantillasRapidas ───────────────────────────── */
export function abrirPlantillasRapidas(categoriaHint) {
  window.showTab?.('config');
  setTimeout(() => {
    plantillasFiltrar(categoriaHint || 'diagnostico');
    const sec = document.querySelector('[data-cfg-title="🔖 Plantillas Inteligentes"]');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const wrap = sec.closest('.collapsible');
      if (wrap && !wrap.classList.contains('open')) wrap.classList.add('open');
    }
  }, 200);
}
