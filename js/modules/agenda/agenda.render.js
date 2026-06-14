/**
 * ELECTROMEL — agenda/agenda.render.js
 * Todo lo que toca el DOM del módulo agenda.
 * Incluye lifecycle (mount/unmount/destroy), render incremental,
 * RAF-batched updates y delegación de eventos via agenda.events.js.
 */

import { store, bus }         from '../../core/store.js';
import { showToast }           from '../../core/ui.js';
import { escapeHtml, pesos }   from '../../core/utils.js';
import { BUSINESS_CONFIG }     from '../../core/config.js';
import { initAutocompletado }  from '../../services/clientes.js';
import { getBaseForDate }      from '../../core/db.js';
import { AgendaLogger }        from './agenda.logger.js';
import { getAgendaDOM, clearElement, createFragment, el,
         show, hide, invalidateDOMCache } from './agenda.dom.js';
import { OFFSET_LABELS, TIMINGS, UI_STRINGS, DOM_IDS,
         scoreClass, SCORE_LIMITS } from './agenda.constants.js';

import {
  getOffset, setOffset, getFiltroBase, setFiltroBase,
  getEditandoId, setEditandoId, setFeedbackId,
  isIQVisible, setIQVisible, agendaSubscribe, clearSubscriptions,
  semanaRangoAgenda, cargarTurnosSemana, agruparPorDia
} from './agenda.store.js';

import {
  scoreEvent, scoreEventAsync, evaluarTurno,
  evaluateTripToNQN, guardarTurno, confirmarFeedbackTurno
} from './agenda.logic.js';

import {
  buildTurnoFormHTML, buildFeedbackFormHTML,
  buildTurnoCardHTML, buildDiaHeadHTML
} from './agenda.templates.js';

import { bindAgendaEvents, unbindAgendaEvents, registerHandlers } from './agenda.events.js';
import { invalidateAnalyticsCache } from './agenda.analytics.js';

/* ── Lifecycle ───────────────────────────────────────────── */
/** @type {import('./agenda.types.js').AgendaLifecycle} */
const _lifecycle = { mounted: false, destroyed: false, cleanupFns: [] };

/** @type {Function[]} unsubscribers del store */
const _unsubscribers = [];

/* ═══════════════════════════════════════════════════════════
   LIFECYCLE
   ═══════════════════════════════════════════════════════════ */

/**
 * agenda.mount() — registra handlers, listeners y suscripciones.
 * Idempotente.
 */
export function mount() {
  if (_lifecycle.mounted || _lifecycle.destroyed) return;
  _lifecycle.mounted = true;

  /* Registrar handlers de eventos */
  registerHandlers({
    semanaAnterior:       semanaAnterior,
    semanaSiguiente:      semanaSiguiente,
    filtrarBase:          filtrarAgendaBase,
    toggleIQ:             toggleAgendaIQ,
    abrirTurno:           id => _abrirTurnoPorId(id),
    nuevoTurno:           () => abrirFormularioTurno(null),
    cerrarTurno:          cerrarFormularioTurno,
    guardarTurno:         guardarTurnoHandler,
    abrirFeedback:        abrirFeedbackTurno,
    cerrarFeedback:       () => document.getElementById(DOM_IDS.MODAL_FEEDBACK)?.classList.remove('active'),
    confirmarFeedback:    confirmarFeedbackHandler,
    recalcScore:          recalcTurnoScore,
    applySuggestion:      id => import('./agenda.iq.js').then(m => m._applySuggestion?.(id)),
    dismissSuggestion:    id => import('./agenda.iq.js').then(m => m._dismissSuggestion?.(id)),
    generateOptimalWeek:  () => import('./agenda.iq.js').then(m => m.renderOptimalWeek()),
  });

  bindAgendaEvents();

  /* Suscribirse a cambios de estado */
  _unsubscribers.push(agendaSubscribe('offset', () => renderAgenda()));
  _unsubscribers.push(agendaSubscribe('filtroBase', () => renderAgenda()));

  AgendaLogger.info('agenda mounted');
}

/**
 * agenda.unmount() — remueve listeners pero preserva el estado.
 * Para pausa temporal (cambio de tab).
 */
export function unmount() {
  if (!_lifecycle.mounted) return;
  _lifecycle.mounted = false;
  unbindAgendaEvents();
  _unsubscribers.forEach(fn => fn());
  _unsubscribers.length = 0;
  AgendaLogger.info('agenda unmounted');
}

/**
 * agenda.destroy() — limpieza completa.
 * Para futura navegación tipo SPA con destrucción de vistas.
 */
export function destroy() {
  unmount();
  clearSubscriptions();
  invalidateDOMCache();
  _lifecycle.cleanupFns.forEach(fn => fn());
  _lifecycle.cleanupFns.length = 0;
  _lifecycle.destroyed = true;
  AgendaLogger.info('agenda destroyed');
}

/* ─── Helper: abrir turno por ID ────────────────────────── */
async function _abrirTurnoPorId(id) {
  const db = store.get('db');
  if (!db) return;
  const { dbGet } = await import('../../core/db.js');
  const turno = await dbGet(db, 'exteriors', id).catch(() => null);
  if (turno) abrirFormularioTurno(turno);
}

/* ── RAF batcher ─────────────────────────────────────────── */
let _rafPending = false;
let _rafCallback = null;

/**
 * Encola un render para el próximo frame.
 * Evita repaints redundantes si se disparan múltiples updates en el mismo tick.
 * @param {Function} fn
 */
function _scheduleRender(fn) {
  _rafCallback = fn;
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    _rafCallback?.();
    _rafCallback = null;
  });
}

/* ═══════════════════════════════════════════════════════════
   NAVEGACIÓN
   ═══════════════════════════════════════════════════════════ */
export function semanaAnterior()  { setOffset(getOffset() - 1); }
export function semanaSiguiente() { setOffset(getOffset() + 1); }

export function filtrarAgendaBase(zona) {
  /* Mantiene el nombre por compatibilidad, pero ahora filtra por zona */
  setFiltroBase(zona);
  document.querySelectorAll('.agenda-filtros .panel-filtro').forEach(b => {
    b.classList.toggle('active', b.dataset.zona === zona);
  });
  renderAgenda();
}
export const filtrarAgendaZona = filtrarAgendaBase;

/* ═══════════════════════════════════════════════════════════
   RENDER VISTA SEMANAL — incremental
   ═══════════════════════════════════════════════════════════ */
export async function renderAgenda() {
  const db = store.get('db');
  if (!db) return;

  const dom    = getAgendaDOM();
  const offset = getOffset();
  const rango  = semanaRangoAgenda(offset);

  /* Label de semana */
  if (dom.semanaLabel) {
    const prefix = OFFSET_LABELS[offset] || `Semana ${offset > 0 ? '+' : ''}${offset} · `;
    dom.semanaLabel.textContent = prefix + rango.label;
  }

  try {
    const turnos    = await cargarTurnosSemana(rango);
    const filtrado  = getFiltroBase();
    const filtrados = turnos.filter(t => filtrado === 'TODOS' || (t.zona || t.cliente_ciudad) === filtrado);
    const porDia    = agruparPorDia(rango, filtrados);

    if (!dom.dias) return;

    if (!filtrados.length) {
      /* Empty state — un solo innerHTML está bien para un string pequeño */
      dom.dias.innerHTML =
        '<div class="empty"><div class="empty-icon">📅</div>' +
        `<div class="empty-text">${UI_STRINGS.SIN_TURNOS_SEMANA}<br>` +
        'Tocá <span class="acento bold">+ Turno</span> para agregar uno.</div></div>';
    } else {
      /* Construir todos los días en un DocumentFragment → un solo reflow */
      const dayEls = rango.dias.map(d => _crearDia(d, porDia[d.iso] || []));
      clearElement(dom.dias);
      dom.dias.appendChild(createFragment(dayEls));
    }

    _actualizarBannerNQN(filtrados);
    if (isIQVisible()) {
      import('./agenda.iq.js').then(m => m.renderIQPanel());
    }

  } catch(e) {
    AgendaLogger.error('renderAgenda', e);
  }
}

/* ── Render incremental: actualizar una tarjeta sin rerender el día ── */

/**
 * updateCard(turnoId, turnoData) — actualiza una sola tarjeta en el DOM.
 * Evita rerender completo al editar un turno.
 * @param {string} turnoId
 * @param {import('./agenda.types.js').Turno} turnoData
 */
export function updateCard(turnoId, turnoData) {
  const dom = getAgendaDOM();
  if (!dom.dias) return;
  const card = dom.dias.querySelector(`.turno-card[data-id="${CSS.escape(turnoId)}"]`);
  if (!card) return;
  _scheduleRender(() => {
    card.innerHTML = buildTurnoCardHTML(turnoData);
  });
  AgendaLogger.debug('updateCard', turnoId);
}

/**
 * appendTurno(dia, turno) — agrega una tarjeta a un día sin rerender el panel.
 * @param {string} diaIso
 * @param {import('./agenda.types.js').Turno} turno
 */
export function appendTurno(diaIso, turno) {
  const dom = getAgendaDOM();
  if (!dom.dias) return;
  const diaEl = dom.dias.querySelector(`.agenda-dia[data-fecha="${CSS.escape(diaIso)}"]`);
  if (!diaEl) { renderAgenda(); return; } /* fallback */
  const card = _crearTarjetaTurno(turno);
  _scheduleRender(() => {
    /* Remover empty state si existe */
    diaEl.querySelector('.agenda-dia-empty')?.remove();
    diaEl.appendChild(card);
  });
}

/**
 * removeTurno(turnoId) — elimina una tarjeta del DOM.
 * @param {string} turnoId
 */
export function removeTurno(turnoId) {
  const dom = getAgendaDOM();
  if (!dom.dias) return;
  const card = dom.dias.querySelector(`.turno-card[data-id="${CSS.escape(turnoId)}"]`);
  if (!card) return;
  const dia = card.closest('.agenda-dia');
  _scheduleRender(() => {
    card.remove();
    /* Si el día quedó vacío, mostrar empty state */
    if (dia && !dia.querySelector('.turno-card')) {
      const empty = el('div', 'agenda-dia-empty', 'Sin turnos');
      dia.appendChild(empty);
    }
  });
}

/**
 * updateStats() — recalcula el banner NQN sin rerender turnos.
 */
export async function updateStats() {
  const rango    = semanaRangoAgenda(getOffset());
  const turnos   = await cargarTurnosSemana(rango);
  const filtrado = getFiltroBase();
  const filtrados = turnos.filter(t => filtrado === 'TODOS' || (t.zona || t.cliente_ciudad) === filtrado);
  _scheduleRender(() => _actualizarBannerNQN(filtrados));
}

function _crearDia(dia, turnos) {
  const card = el('div', 'agenda-dia' + (dia.esHoy ? ' hoy' : ''));
  card.dataset.fecha = dia.iso;   /* ← para updateCard/appendTurno */

  const head = el('div', 'agenda-dia-head' + (dia.esHoy ? ' hoy-badge' : ''));
  head.innerHTML = buildDiaHeadHTML(dia);
  card.appendChild(head);

  if (!turnos.length) {
    card.appendChild(el('div', 'agenda-dia-empty', 'Sin turnos'));
  } else {
    card.appendChild(createFragment(turnos.map(t => _crearTarjetaTurno(t))));
  }
  return card;
}

function _crearTarjetaTurno(t) {
  const card   = el('div', 'turno-card');
  card.dataset.id = t.id || t.numero;
  card.innerHTML  = buildTurnoCardHTML(t);
  /* Sin addEventListener individual — delegado en agenda.events.js via .turno-card */
  return card;
}

/* ═══════════════════════════════════════════════════════════
   BANNER NQN
   ═══════════════════════════════════════════════════════════ */
function _actualizarBannerNQN(turnos) {
  const dom = getAgendaDOM();
  if (!dom.nqnBanner) return;
  const ev = evaluateTripToNQN(turnos);

  if (!ev.hasTrips) { dom.nqnBanner.classList.add('hide'); return; }

  dom.nqnBanner.classList.remove('hide', 'viaje-conviene', 'viaje-revisar', 'viaje-no-conviene');
  dom.nqnBanner.classList.add(
    ev.tipo === 'ok' ? 'viaje-conviene' : ev.tipo === 'revisar' ? 'viaje-revisar' : 'viaje-no-conviene'
  );

  const iconEl   = document.getElementById('nqn-banner-icon');
  const titleEl  = document.getElementById('nqn-banner-title');
  const detailEl = document.getElementById('nqn-banner-detail');
  if (iconEl)   iconEl.textContent   = ev.tipo === 'ok' ? '✅' : ev.tipo === 'revisar' ? '⚠️' : '❌';
  if (titleEl)  titleEl.textContent  = `Viaje NQN: ${ev.nqnEventCount} turno(s) · ganancia ${pesos(ev.trip_profit)}`;
  if (detailEl) detailEl.textContent = ev.alerta;
}

/* ═══════════════════════════════════════════════════════════
   FORMULARIO DE TURNO
   ═══════════════════════════════════════════════════════════ */
export function abrirFormularioTurno(turnoExistente) {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  const modal = document.getElementById('modal-turno');
  if (!modal) return;

  /* Poblar body si aún no tiene el form */
  const body = document.getElementById('modal-turno-body');
  if (body && !body.querySelector('#turno-fecha')) {
    body.innerHTML = buildTurnoFormHTML();
  }

  /* Poblar el datalist de ciudades configuradas (para el cálculo de viaje) */
  import('../../services/zonas.js').then(z => {
    const dl = document.getElementById('turno-ciudades-datalist');
    if (!dl) return;
    const data = z.zonasCache();
    const ciudades = Object.values(data.ciudades || {});
    dl.innerHTML = ciudades.map(c => `<option value="${c.nombre}">`).join('');
  }).catch(() => {});

  _resetFormularioTurno();

  const titleEl = modal.querySelector('.modal-title');

  if (turnoExistente && (turnoExistente.id || turnoExistente.numero)) {
    setEditandoId(turnoExistente.id || turnoExistente.numero);
    if (titleEl) titleEl.textContent = '📅 EDITAR TURNO';
    const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    v('turno-cliente-nombre', turnoExistente.cliente_nombre);
    v('turno-cliente-cuit',   turnoExistente.cliente_cuit);
    v('turno-cliente-tel',    turnoExistente.cliente_telefono);
    v('turno-cliente-dir',    turnoExistente.cliente_direccion);
    v('turno-cliente-cp',     turnoExistente.cliente_cp);
    v('turno-cliente-ciudad', turnoExistente.cliente_ciudad);
    v('turno-cliente-provincia', turnoExistente.cliente_provincia);
    v('turno-servicio',       turnoExistente.tipo_servicio);
    v('turno-base',           turnoExistente.base || 'SMA');
    v('turno-fecha',          turnoExistente.fecha);
    v('turno-hora',           turnoExistente.hora);
    v('turno-notas',          turnoExistente.notas);
    v('turno-horas',          turnoExistente.horas_estimadas || 1);
    v('turno-ingreso',        turnoExistente.ingreso_estimado || 0);
    v('turno-estado',         turnoExistente.estado_turno || 'pendiente');
  } else {
    setEditandoId(null);
    if (titleEl) titleEl.textContent = '📅 NUEVO TURNO';
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaEl = document.getElementById('turno-fecha');
    if (fechaEl) fechaEl.value = hoy;
    getBaseForDate(db, hoy).then(base => {
      const sel = document.getElementById('turno-base');
      if (sel && (base === 'SMA' || base === 'NQN')) sel.value = base;
    }).catch(() => {});
  }

  initAutocompletado('turno');
  setTimeout(recalcTurnoScore, 100);
  modal.classList.add('active');
}

export function cerrarFormularioTurno() {
  document.getElementById('modal-turno')?.classList.remove('active');
  setEditandoId(null);
}

function _resetFormularioTurno() {
  ['turno-cliente-nombre','turno-cliente-cuit','turno-cliente-tel','turno-cliente-dir',
   'turno-cliente-cp','turno-cliente-ciudad','turno-cliente-provincia',
   'turno-servicio','turno-fecha','turno-hora','turno-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set('turno-base', 'SMA'); set('turno-horas', '1');
  set('turno-ingreso', '0'); set('turno-estado', 'pendiente');

  const numEl   = document.getElementById('turno-score-num');
  const decEl   = document.getElementById('turno-decision');
  const rsEl    = document.getElementById('turno-decision-reason');
  const circle  = document.getElementById('turno-score-circle');
  if (numEl)  numEl.textContent   = '—';
  if (decEl)  { decEl.textContent = 'Completá el formulario'; decEl.className = 'turno-decision'; }
  if (rsEl)   rsEl.textContent    = '—';
  if (circle) circle.className    = 'turno-score-circle';
}

/* ── Recalc score en vivo ────────────────────────────── */
export async function recalcTurnoScore() {
  const db = store.get('db');
  const turno = {
    base:             document.getElementById('turno-base')?.value,
    fecha:            document.getElementById('turno-fecha')?.value,
    horas_estimadas:  parseFloat(document.getElementById('turno-horas')?.value)   || 1,
    ingreso_estimado: parseFloat(document.getElementById('turno-ingreso')?.value) || 0,
    tipo_servicio:    document.getElementById('turno-servicio')?.value,
    cliente_ciudad:   document.getElementById('turno-cliente-ciudad')?.value || ''
  };

  let score, breakdown;
  try { const r = await scoreEventAsync(turno); score = r.score; breakdown = r.breakdown; }
  catch(e) { score = scoreEvent(turno); breakdown = { fuente: 'heuristica' }; }

  /* Turnos del mismo día (para detectar saturación) */
  let delDia = [];
  const editandoId = getEditandoId();
  if (db && turno.fecha) {
    try {
      const { dbGetAll } = await import('../../core/db.js');
      const todos = await dbGetAll(db, 'exteriors');
      delDia = todos.filter(t =>
        t.es_turno && t.fecha === turno.fecha &&
        t.id !== editandoId && t.numero !== editandoId
      );
    } catch(e) {}
  }
  const eval_ = await evaluarTurno(turno, delDia);

  /* Pintar score */
  const numEl  = document.getElementById('turno-score-num');
  const circle = document.getElementById('turno-score-circle');
  const decEl  = document.getElementById('turno-decision');
  const rsEl   = document.getElementById('turno-decision-reason');

  if (numEl)  numEl.textContent  = String(score);
  if (circle) circle.className   = 'turno-score-circle ' + (score >= 80 ? 'score-alto' : score >= 50 ? 'score-medio' : 'score-bajo');

  if (decEl) {
    const d = eval_.decision.toLowerCase();
    const icons = { aceptar: '✓ ACEPTAR', revisar: '⚠ REVISAR', rechazar: '✕ RECHAZAR', reagendar: '↻ REAGENDAR' };
    decEl.textContent = icons[d] || eval_.decision;
    decEl.className   = 'turno-decision decision-' + d;
  }

  if (rsEl) {
    let txt = eval_.razon;
    if (breakdown.fuente === 'historial' && breakdown.sample_n > 0)
      txt += ` · (basado en ${breakdown.sample_n} trabajo(s) previos)`;
    else if (breakdown.fuente === 'cruzada')
      txt += ' · (estimación cruzada con otra base)';
    else if (breakdown.fuente === 'heuristica')
      txt += ' · (sin historial, estimación heurística)';
    rsEl.textContent = txt;
  }
}
window._recalcTurnoScore = recalcTurnoScore;

/* ═══════════════════════════════════════════════════════════
   FEEDBACK DE TURNO REALIZADO
   ═══════════════════════════════════════════════════════════ */
export async function abrirFeedbackTurno(turnoId) {
  const db = store.get('db');
  if (!db || !turnoId) return;

  setFeedbackId(turnoId);

  const modal = document.getElementById('modal-turno-feedback');
  if (!modal) return;

  /* Cargar datos del turno para pre-poblar el form */
  const { dbGet } = await import('../../core/db.js');
  const turno = await dbGet(db, 'exteriors', turnoId).catch(() => null);

  const body = document.getElementById('modal-turno-feedback-body');
  if (body) body.innerHTML = buildFeedbackFormHTML(turno);

  modal.classList.add('active');
}

export async function confirmarFeedbackHandler() {
  try {
    await confirmarFeedbackTurno();
    document.getElementById('modal-turno-feedback')?.classList.remove('active');
    renderAgenda();
    showToast('✓ Turno completado y registrado', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Toggle IQ — delega al módulo agenda.iq.js (lazy) ────── */
export function toggleAgendaIQ() {
  import('./agenda.iq.js').then(m => m.toggleIQPanel());
}

/* ── Guardar turno ────────────────────────────────────────── */
export async function guardarTurnoHandler() {
  try {
    const result = await guardarTurno();
    if (!result) return;
    invalidateAnalyticsCache();
    cerrarFormularioTurno();
    renderAgenda();
    showToast('✓ Turno guardado', 'success');
  } catch(e) {
    showToast('Error al guardar: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   INICIALIZACIÓN
   ═══════════════════════════════════════════════════════════ */
export function initAgenda() {
  bus.on('tab:cambio', ({ to, from }) => {
    if (to === 'agenda') {
      mount();
      renderAgenda();
    } else if (from === 'agenda') {
      unmount();
    }
  });
  bus.on('db:ready', () => {
    if (store.get('currentTab') === 'agenda') {
      mount();
      renderAgenda();
    }
  });
}
