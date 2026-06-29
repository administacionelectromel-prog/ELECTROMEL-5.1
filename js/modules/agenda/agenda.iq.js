/**
 * ELECTROMEL — agenda/agenda.iq.js
 * Panel de Inteligencia de Agenda (IQ).
 * Cargado de forma lazy — solo cuando el usuario abre el panel IQ.
 * Separado de agenda.render.js para no cargar analytics en el boot.
 */

import { store }           from '../../core/store.js';
import { pesos }           from '../../core/utils.js';
import { BUSINESS_CONFIG } from '../../core/config.js';
import { showToast }       from '../../core/ui.js';
import { AgendaLogger }    from './agenda.logger.js';
import { getAgendaDOM, clearElement, el, createFragment, show, hide } from './agenda.dom.js';
import { getOffset, getSugerencias, setSugerencias, isIQVisible, setIQVisible } from './agenda.store.js';
import { SUGERENCIA_ACCIONES, UI_STRINGS } from './agenda.constants.js';
import { buildSugerenciaHTML } from './agenda.templates.js';

/** @type {import('./agenda.analytics.js')|null} */
let _analyticsModule = null;

/**
 * Carga lazy del módulo analytics.
 * @returns {Promise<typeof import('./agenda.analytics.js')>}
 */
async function _loadAnalytics() {
  if (!_analyticsModule) {
    AgendaLogger.debug('Lazy loading agenda.analytics.js');
    _analyticsModule = await import('./agenda.analytics.js');
  }
  return _analyticsModule;
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE
   ═══════════════════════════════════════════════════════════ */
export function toggleIQPanel() {
  const visible = !isIQVisible();
  setIQVisible(visible);
  const dom = getAgendaDOM();
  if (dom.iqBody) dom.iqBody.classList.toggle('hide', !visible);
  if (dom.iqIcon) dom.iqIcon.textContent = visible ? '▼' : '▶';
  if (visible) renderIQPanel();
}

/* ═══════════════════════════════════════════════════════════
   RENDER PRINCIPAL DEL PANEL IQ
   ═══════════════════════════════════════════════════════════ */
export async function renderIQPanel() {
  const dom = getAgendaDOM();
  if (!dom.iqResumen || !dom.iqSugerencias) return;

  const offset = getOffset();

  try {
    const analytics = await _loadAnalytics();
    const analisis  = await AgendaLogger.time('analyzeWeeklyAgenda', () =>
      analytics.analyzeWeeklyAgenda(offset)
    );

    if (!analisis || !analisis.totalTurnos) {
      dom.iqResumen.textContent = UI_STRINGS.SIN_ANALISIS;
      clearElement(dom.iqSugerencias);
      return;
    }

    await updateIQStats(analisis);
    await renderSuggestions(offset, analisis);

  } catch(e) {
    AgendaLogger.error('renderIQPanel', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════════ */

/**
 * Actualiza el bloque de resumen numérico del panel IQ.
 * @param {import('./agenda.types.js').AnalisisSemanal} analisis
 */
export async function updateIQStats(analisis) {
  const dom = getAgendaDOM();
  if (!dom.iqResumen) return;

  const minSemanal = BUSINESS_CONFIG.min_jobs_week || 4;

  /* Desglose por zona real del trabajo (ya no por base SMA/NQN) */
  const porZona = {};
  for (const t of analisis.turnos) {
    const z = (t.zona || t.cliente_ciudad || 'Sin zona').trim() || 'Sin zona';
    porZona[z] = (porZona[z] || 0) + 1;
  }
  const zonasTxt = Object.entries(porZona)
    .sort((a, b) => b[1] - a[1])
    .map(([z, n]) => `${z}: ${n}`)
    .join(' · ');

  const lines = [
    `Turnos: ${analisis.totalTurnos}${zonasTxt ? ' · ' + zonasTxt : ''}`,
    `Ingreso semanal estimado: ${pesos(analisis.totalIngreso)}`,
    `Promedio por turno: ${pesos(analisis.promedioPorTurno)}`,
    analisis.scoreAvg > 0 ? `Score promedio: ${Math.round(analisis.scoreAvg)}/100` : null,
    analisis.totalTurnos < minSemanal
      ? `⚠️ Por debajo del mínimo semanal (${minSemanal} trabajos)` : null,
    analisis.diasVacios.length > 0
      ? `Días sin turnos: ${analisis.diasVacios.length}` : null,
    analisis.diasSaturados.length > 0
      ? `Días saturados: ${analisis.diasSaturados.length}` : null
  ].filter(Boolean);

  dom.iqResumen.innerHTML = lines.join('<br>');
  AgendaLogger.debug('IQ stats updated', { turnos: analisis.totalTurnos });
}

/* ═══════════════════════════════════════════════════════════
   SUGERENCIAS
   ═══════════════════════════════════════════════════════════ */

/**
 * Renderiza la lista de sugerencias del panel IQ.
 * @param {number} offset
 * @param {import('./agenda.types.js').AnalisisSemanal} [analisis]
 */
export async function renderSuggestions(offset, analisis) {
  const dom = getAgendaDOM();
  if (!dom.iqSugerencias) return;

  try {
    const analytics   = await _loadAnalytics();
    const sugerencias = await analytics.generateWeeklySuggestions(offset);

    clearElement(dom.iqSugerencias);

    if (!sugerencias.length) {
      const empty = el('div', 'dim txt-sm', UI_STRINGS.SIN_SUGERENCIAS);
      dom.iqSugerencias.appendChild(empty);
      return;
    }

    /* Construir todos los items en un fragment → un solo reflow */
    const items = sugerencias.map(s => _buildSugerenciaEl(s));
    dom.iqSugerencias.appendChild(createFragment(items));

    AgendaLogger.debug(`renderSuggestions: ${sugerencias.length} sugerencias`);
  } catch(e) {
    AgendaLogger.error('renderSuggestions', e);
  }
}

function _buildSugerenciaEl(s) {
  /* Usar el template existente y parsear en un nodo real */
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildSugerenciaHTML(s);
  const item = wrapper.firstElementChild;

  /* Delegar eventos via data-attributes (sin listeners individuales) */
  item.querySelectorAll('[data-sug-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.sugAction;
      const id     = btn.dataset.sugId;
      if (!id) return;

      if (action === SUGERENCIA_ACCIONES.INFO) return;

      if (action === 'dismiss') {
        await _dismissSuggestion(id);
        return;
      }

      if (action === 'apply') {
        await _applySuggestion(id);
      }
    });
  });

  return item;
}

/* ── Apply / Dismiss ─────────────────────────────────────── */

async function _applySuggestion(id) {
  try {
    const analytics = await _loadAnalytics();
    const result    = await analytics.applySuggestion(id);
    if (result === 'refresh') {
      /* Disparar refresh del render principal */
      const { renderAgenda } = await import('./agenda.render.js');
      renderAgenda();
    } else if (result?.openTurno) {
      const { abrirFormularioTurno } = await import('./agenda.render.js');
      abrirFormularioTurno(result.openTurno);
    }
    await renderIQPanel();
  } catch(e) {
    showToast('Error al aplicar sugerencia', 'error');
    AgendaLogger.error('_applySuggestion', e);
  }
}

async function _dismissSuggestion(id) {
  setSugerencias(getSugerencias().filter(s => s.id !== id));
  await renderSuggestions(getOffset());
}

/* ═══════════════════════════════════════════════════════════
   SEMANA ÓPTIMA
   ═══════════════════════════════════════════════════════════ */
export async function renderOptimalWeek() {
  showToast('Calculando semana óptima...', 'info');
  try {
    const analytics = await _loadAnalytics();
    const result    = await analytics.generateOptimalWeek(getOffset());
    if (!result) { showToast('Sin turnos para optimizar', 'warn'); return; }
    /* Mostrar en modal o alert según disponibilidad */
    const modal = document.getElementById('modal-semana-optima');
    if (modal) {
      const body = modal.querySelector('.modal-body');
      if (body) {
        body.innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;">${result.texto}</pre>`;
      }
      modal.classList.add('active');
    } else {
      alert(result.texto);
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    AgendaLogger.error('renderOptimalWeek', e);
  }
}
