/**
 * ELECTROMEL — agenda/agenda.types.js
 * Definiciones de tipos JSDoc para el módulo agenda.
 * Sin código ejecutable — solo typedefs para autocompletado y documentación.
 *
 * @module agenda.types
 */

/**
 * Turno de trabajo en la agenda.
 * @typedef {Object} Turno
 * @property {string}  id              - Identificador único (igual que numero)
 * @property {string}  numero          - N° de orden (ej. "OTE-0042")
 * @property {string}  cliente_nombre  - Nombre del cliente
 * @property {string}  [cliente_telefono]
 * @property {string}  [cliente_direccion]
 * @property {string}  tipo_servicio   - Tipo de servicio (ej. "Soldadora Inverter")
 * @property {'SMA'|'NQN'} base       - Base operativa
 * @property {string}  fecha           - ISO date "YYYY-MM-DD"
 * @property {string}  [hora]          - "HH:MM"
 * @property {string}  [notas]
 * @property {number}  horas_estimadas
 * @property {number}  ingreso_estimado
 * @property {string}  estado_turno    - Ver TURNO_ESTADOS
 * @property {number}  [score]         - 0-100
 * @property {boolean} es_turno        - Siempre true para turnos
 * @property {string}  [creado_at]     - ISO datetime
 * @property {string}  [actualizado_at]
 * @property {number}  [ingreso_real]
 * @property {number}  [costo_real]
 * @property {number}  [ganancia_real]
 * @property {string}  [realizado_at]
 */

/**
 * Día de la semana con metadatos de visualización.
 * @typedef {Object} DiaSemana
 * @property {string}  iso    - "YYYY-MM-DD"
 * @property {boolean} esHoy
 * @property {string}  label  - "Lun" | "Mar" | "Mié" | "Jue" | "Vie" | "Sáb" | "Dom"
 * @property {string}  ddmm   - "DD/MM"
 */

/**
 * Rango de semana enriquecido.
 * @typedef {Object} RangoSemana
 * @property {string}     from  - ISO date inicio
 * @property {string}     to    - ISO date fin
 * @property {string}     label - Ej. "21/07 - 27/07"
 * @property {DiaSemana[]} dias - 7 días con metadatos
 */

/**
 * Mapa de turnos agrupados por día ISO.
 * @typedef {Object.<string, Turno[]>} TurnosPorDia
 */

/**
 * Resultado del score engine.
 * @typedef {Object} ScoreResult
 * @property {number} score       - 0-100
 * @property {ScoreBreakdown} breakdown
 */

/**
 * Desglose del cálculo de score.
 * @typedef {Object} ScoreBreakdown
 * @property {number} [p1]       - Puntos por precio
 * @property {number} [p2]       - Puntos por ganancia
 * @property {number} [p3]       - Puntos por $/hora
 * @property {string} fuente     - 'historial'|'cruzada'|'heuristica'|'neutral'|'sin_datos'
 * @property {number} [sample_n] - Cantidad de muestras históricas usadas
 */

/**
 * Resultado de la evaluación de un turno.
 * @typedef {Object} EvaluacionTurno
 * @property {'ACEPTAR'|'REVISAR'|'RECHAZAR'|'REAGENDAR'} decision
 * @property {string} razon
 */

/**
 * Resultado del análisis de viaje NQN.
 * @typedef {Object} EvaluacionNQN
 * @property {boolean} hasTrips
 * @property {number}  [nqnEventCount]
 * @property {number}  [total_income]
 * @property {number}  [total_cost]
 * @property {number}  [travel_cost]
 * @property {number}  [trip_profit]
 * @property {boolean} [isWorth]
 * @property {boolean} [meetsTarget]
 * @property {number}  [missing]
 * @property {string}  [alerta]
 * @property {'ok'|'revisar'|'no'} [tipo]
 */

/**
 * Análisis completo de una semana.
 * @typedef {Object} AnalisisSemanal
 * @property {RangoSemana}   rango
 * @property {Turno[]}       turnos
 * @property {TurnosPorDia}  porDia
 * @property {number}        totalTurnos
 * @property {number}        totalIngreso
 * @property {number}        promedioPorTurno
 * @property {string[]}      diasVacios
 * @property {string[]}      diasSaturados
 * @property {number}        scoreAvg
 * @property {Turno[]}       turnosBajos
 * @property {EvaluacionNQN} evalNQN
 */

/**
 * Sugerencia accionable del motor IQ.
 * @typedef {Object} Sugerencia
 * @property {string}  id
 * @property {string}  tipo     - Ver SUGERENCIA_TIPOS
 * @property {string}  titulo
 * @property {string}  detalle
 * @property {string}  accion   - Ver SUGERENCIA_ACCIONES
 * @property {string}  [target]
 * @property {string}  [target_id]
 * @property {number}  [nuevoIngreso]
 */

/**
 * Estado interno del módulo agenda.
 * @typedef {Object} AgendaState
 * @property {number}   semanaOffset  - 0 = esta semana, -1 anterior, +1 siguiente
 * @property {string}   filtroBase    - 'TODOS' | 'SMA' | 'NQN'
 * @property {boolean}  iqVisible
 * @property {string|null} editandoId
 * @property {string|null} feedbackId
 * @property {Sugerencia[]} sugerencias
 */

/**
 * Resultado de la propuesta de semana óptima.
 * @typedef {Object} ResultadoSemanaOptima
 * @property {string}  texto     - Texto formateado para mostrar
 * @property {Object}  propuesta - Mapa de días con turnos asignados
 * @property {AnalisisSemanal} analisis
 */

/**
 * Payload del mensaje para futuro Web Worker.
 * @typedef {Object} WorkerMessage
 * @property {'ANALYZE'|'SUGGEST'|'OPTIMAL'} type
 * @property {Object} payload
 */

/**
 * Respuesta del futuro Web Worker.
 * @typedef {Object} WorkerResponse
 * @property {'ANALYZE'|'SUGGEST'|'OPTIMAL'} type
 * @property {boolean} success
 * @property {*}       result
 * @property {string}  [error]
 */

/**
 * Cache de referencias DOM del módulo agenda.
 * @typedef {Object} AgendaDOM
 * @property {HTMLElement|null} dias
 * @property {HTMLElement|null} semanaLabel
 * @property {HTMLElement|null} nqnBanner
 * @property {HTMLElement|null} iqBody
 * @property {HTMLElement|null} iqResumen
 * @property {HTMLElement|null} iqSugerencias
 * @property {HTMLElement|null} modalTurno
 * @property {HTMLElement|null} modalFeedback
 */

/**
 * Contexto completo del lifecycle del módulo.
 * @typedef {Object} AgendaLifecycle
 * @property {boolean} mounted
 * @property {boolean} destroyed
 * @property {Function[]} cleanupFns  - Funciones a ejecutar en unmount
 */

/* ── Tipos utilitarios ───────────────────────────────────── */

/**
 * Callback de suscripción al store.
 * @template T
 * @callback StoreSubscriber
 * @param {T} newValue
 * @param {T} oldValue
 */

/**
 * Handler de evento de agenda.
 * @callback AgendaEventHandler
 * @param {Event} event
 * @param {Turno} [turno]
 */
