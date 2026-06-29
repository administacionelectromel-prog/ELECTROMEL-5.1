/**
 * ELECTROMEL — agenda/agenda.constants.js
 * Constantes del módulo agenda.
 * Sin imports — sin efectos secundarios — importable desde cualquier archivo.
 */

/* ── Estados de turno ────────────────────────────────────── */
export const TURNO_ESTADOS = /** @type {const} */ ({
  PENDIENTE:   'pendiente',
  CONFIRMADO:  'confirmado',
  REALIZADO:   'realizado',
  CANCELADO:   'cancelado'
});

export const TURNO_ESTADO_LABELS = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  realizado:  'Realizado',
  cancelado:  'Cancelado'
};

/* ── Bases operativas ────────────────────────────────────── */
export const BASES = /** @type {const} */ ({
  SMA: 'SMA',
  NQN: 'NQN'
});

export const BASE_LABELS = {
  SMA: 'SMA — San Martín de los Andes',
  NQN: 'NQN — Neuquén'
};

/* ── Decisiones del motor ────────────────────────────────── */
export const DECISIONES = /** @type {const} */ ({
  ACEPTAR:   'ACEPTAR',
  REVISAR:   'REVISAR',
  RECHAZAR:  'RECHAZAR',
  REAGENDAR: 'REAGENDAR'
});

export const DECISION_ICONS = {
  aceptar:   '✓ ACEPTAR',
  revisar:   '⚠ REVISAR',
  rechazar:  '✕ RECHAZAR',
  reagendar: '↻ REAGENDAR'
};

export const DECISION_CLASS = {
  aceptar:   'decision-aceptar',
  revisar:   'decision-revisar',
  rechazar:  'decision-rechazar',
  reagendar: 'decision-reagendar'
};

/* ── Límites de score ────────────────────────────────────── */
export const SCORE_LIMITS = {
  ALTO:  80,   // ≥ 80 → score-alto (verde)
  MEDIO: 50,   // ≥ 50 → score-medio (amarillo)
  // < 50 → score-bajo (rojo)

  ACEPTA_MIN: 70,  // ≥ 70 → ACEPTAR
  REVISAR_MIN: 50  // ≥ 50 → REVISAR, < 50 → RECHAZAR
};

export const SCORE_CLASS = {
  alto:  'score-alto',
  medio: 'score-medio',
  bajo:  'score-bajo'
};

/** Devuelve la clase CSS para un valor de score */
export function scoreClass(score) {
  if (score >= SCORE_LIMITS.ALTO)  return SCORE_CLASS.alto;
  if (score >= SCORE_LIMITS.MEDIO) return SCORE_CLASS.medio;
  return SCORE_CLASS.bajo;
}

/* ── Peso de componentes del score ──────────────────────── */
export const SCORE_WEIGHTS = {
  PRECIO:   40,  // pts máximos por precio relativo al mínimo
  GANANCIA: 30,  // pts máximos por ganancia estimada
  POR_HORA: 30   // pts máximos por ingreso/hora
};

/* ── Fuentes del score ──────────────────────────────────── */
export const SCORE_FUENTES = {
  HISTORIAL:  'historial',  // calculado con datos reales
  CRUZADA:    'cruzada',    // estimado cruzando con otra base
  HEURISTICA: 'heuristica', // sin datos históricos
  NEUTRAL:    'neutral',    // sin turno
  SIN_DATOS:  'sin_datos'   // ingreso = 0
};

/* ── NQN ─────────────────────────────────────────────────── */
export const NQN_CONFIG = {
  RADIO_KM:    120,   // distancia aprox. SMA → NQN
  DIAS_MAX:      3,   // máx. días consecutivos en NQN en una semana
  TIPO_OK:      'ok',
  TIPO_REVISAR: 'revisar',
  TIPO_NO:      'no'
};

/* ── Semana ──────────────────────────────────────────────── */
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const OFFSET_LABELS = {
  [-1]: 'Semana anterior · ',
  [0]:  'Esta semana · ',
  [1]:  'Semana próxima · '
};

/* ── Tipos de sugerencia ─────────────────────────────────── */
export const SUGERENCIA_TIPOS = {
  AGENDA:  'agenda',
  VIAJE:   'viaje',
  PRECIO:  'precio',
  SCORE:   'score'
};

export const SUGERENCIA_ACCIONES = {
  INFO:         'info',
  SUBIR_PRECIO: 'subir_precio',
  REAGENDAR:    'reagendar'
};

/* ── IDs de elementos DOM ─────────────────────────────────── */
export const DOM_IDS = {
  // Agenda principal
  DIAS:          'agenda-dias',
  SEMANA_LABEL:  'agenda-semana-label',
  NQN_BANNER:    'nqn-banner',

  // IQ Panel
  IQ_BODY:       'agenda-iq-body',
  IQ_RESUMEN:    'agenda-iq-resumen',
  IQ_SUGERENCIAS:'agenda-iq-sugerencias',
  IQ_ICON:       'agenda-iq-icon',

  // Modal turno
  MODAL_TURNO:        'modal-turno',
  MODAL_TURNO_BODY:   'modal-turno-body',
  SCORE_NUM:          'turno-score-num',
  SCORE_CIRCLE:       'turno-score-circle',
  DECISION:           'turno-decision',
  DECISION_REASON:    'turno-decision-reason',

  // Modal feedback
  MODAL_FEEDBACK:      'modal-turno-feedback',
  MODAL_FEEDBACK_BODY: 'modal-turno-feedback-body',

  // Campos del formulario turno
  TURNO_FECHA:    'turno-fecha',
  TURNO_HORA:     'turno-hora',
  TURNO_BASE:     'turno-base',
  TURNO_ESTADO:   'turno-estado',
  TURNO_NOMBRE:   'turno-cliente-nombre',
  TURNO_TEL:      'turno-cliente-tel',
  TURNO_DIR:      'turno-cliente-dir',
  TURNO_SERVICIO: 'turno-servicio',
  TURNO_INGRESO:  'turno-ingreso',
  TURNO_HORAS:    'turno-horas',
  TURNO_NOTAS:    'turno-notas'
};

/* ── Timings (ms) ───────────────────────────────────────── */
export const TIMINGS = {
  SCORE_DEBOUNCE:   300,   // espera antes de recalcular score al tipear
  RAF_THRESHOLD:    100,   // ms mínimos entre renders via requestAnimationFrame
  TOAST_DELAY:       50    // delay mínimo antes de mostrar toast
};

/* ── Strings UI ─────────────────────────────────────────── */
export const UI_STRINGS = {
  SIN_TURNOS_SEMANA: 'Sin turnos en esta semana.',
  TURNO_NUEVO_TITLE: '📅 NUEVO TURNO',
  TURNO_EDITAR_TITLE:'📅 EDITAR TURNO',
  FORM_SIN_DATOS:    'Completá el formulario',
  SIN_SUGERENCIAS:   'Sin sugerencias. Buen trabajo 👍',
  SIN_ANALISIS:      'Sin turnos cargados en esta semana.'
};

/* ── Dev mode ────────────────────────────────────────────── */
export const DEV_MODE = typeof window !== 'undefined'
  ? (window.ELECTROMEL_DEV === true || window.location?.hostname === 'localhost')
  : false;
