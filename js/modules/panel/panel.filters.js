/**
 * ELECTROMEL — modules/panel/panel.filters.js
 * Filtrado, búsqueda y toggle de archivados.
 */

import { store }          from '../../core/store.js';
import { getColorSemaforo, getEdadHoras, ESTADOS_FINALES } from '../../core/utils.js';
import { getFiltroActivo, setFiltroActivo, setArchivadosVisible,
         isArchivadosVisible, cargarTodos, filtrar, ordenarPorSemaforo,
         setAnioActivo } from './panel.store.js';

/* ── filtrarPanel ─────────────────────────────────────── */
export function filtrarPanel(filtro) {
  setFiltroActivo(filtro);
  document.querySelectorAll('.panel-filtro').forEach(b => {
    b.classList.toggle('active', b.dataset.filtro === filtro);
  });
  /* Re-renderizar la lista con el nuevo filtro */
  import('./panel.render.js').then(m => m.renderPanelPrincipal()).catch(() => {});
}

/* ── filtrarPanelAnio ─────────────────────────────────── */
export function filtrarPanelAnio(anio) {
  setAnioActivo(anio);
  import('./panel.render.js').then(m => m.renderPanelPrincipal()).catch(() => {});
}

/* ── poblarSelectorAnios: llena el <select> con los años con datos ── */
export async function poblarSelectorAnios() {
  const sel = document.getElementById('panel-anio');
  if (!sel) return;
  try {
    const todos = await cargarTodos();
    const anios = new Set();
    todos.forEach(r => {
      const a = r.anio || parseInt(String(r.creado_at || r.fecha || '').slice(0, 4));
      if (a && a > 2000) anios.add(a);
    });
    const ordenados = Array.from(anios).sort((a, b) => b - a);
    const actual = sel.value || 'TODOS';
    sel.innerHTML = '<option value="TODOS">📅 Todos los años</option>' +
      ordenados.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = actual;
  } catch (e) { /* no crítico */ }
}

/* ── toggleArchivados ─────────────────────────────────── */
export function toggleArchivados() {
  const visible = !isArchivadosVisible();
  setArchivadosVisible(visible);
  const body = document.getElementById('panel-archivados');
  const icon = document.getElementById('archivados-icon');
  if (body) body.classList.toggle('hide', !visible);
  if (icon) icon.textContent = visible ? '▼' : '▶';
  /* Si se abre, renderizar la lista de archivados */
  if (visible) {
    import('./panel.render.js').then(m => m.renderArchivados()).catch(() => {});
  }
  return visible;
}

/* ── Preparar activos con color y horas ──────────────── */
export async function prepararActivos() {
  const todos      = await cargarTodos();
  const activos    = todos.filter(r => !ESTADOS_FINALES.has(r.estado));
  const archivados = todos.filter(r =>  ESTADOS_FINALES.has(r.estado));
  const filtrados  = filtrar(activos);

  filtrados.forEach(r => {
    const fechaRef = r.actualizado_at || r.creado_at;
    r._color = getColorSemaforo(r.estado, fechaRef);
    r._horas = getEdadHoras(fechaRef);
  });

  return {
    todos,
    activos,
    archivados,
    filtrados: ordenarPorSemaforo(filtrados)
  };
}

/* ── Preparar archivados ─────────────────────────────── */
export async function prepararArchivados() {
  const todos      = await cargarTodos();
  const archivados = filtrar(todos.filter(r => ESTADOS_FINALES.has(r.estado)));
  archivados.sort((a, b) => (b.creado_at || '').localeCompare(a.creado_at || ''));
  return archivados.map(r => ({
    ...r,
    _color: 'gris',
    _horas: getEdadHoras(r.creado_at)
  }));
}

/* ── Re-export para panel.render.js ──────────────────── */
export { isArchivadosVisible } from './panel.store.js';
