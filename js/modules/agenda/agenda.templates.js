/**
 * ELECTROMEL — agenda/agenda.templates.js
 * Templates HTML del módulo agenda.
 * Funciones puras que retornan strings HTML o crean elementos DOM.
 * Sin acceso a store ni efectos secundarios.
 */

import { pesos, escapeHtml } from '../../core/utils.js';

/* ═══════════════════════════════════════════════════════════
   MODAL BODY — FORMULARIO DE TURNO
   ═══════════════════════════════════════════════════════════ */
export function buildTurnoFormHTML() {
  return `
    <div class="field-row">
      <div class="field">
        <label class="field-label">Fecha *</label>
        <input type="date" id="turno-fecha" oninput="_recalcTurnoScore()">
      </div>
      <div class="field">
        <label class="field-label">Hora</label>
        <input type="time" id="turno-hora">
      </div>
    </div>
    <input type="hidden" id="turno-base" value="SMA">

    <div class="field-row">
      <div class="field">
        <label class="field-label">Estado</label>
        <select id="turno-estado">
          <option value="pendiente">Pendiente</option>
          <option value="confirmado">Confirmado</option>
          <option value="realizado">Realizado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>

    <div class="collapsible-section-title">👤 CLIENTE</div>
    <div class="field" style="position:relative;">
      <label class="field-label">Nombre / Razón Social *</label>
      <input type="text" id="turno-cliente-nombre" placeholder="Buscá un cliente o escribí uno nuevo" autocomplete="off">
      <div id="turno-cliente-suggestions" class="autocomplete-dropdown hide"></div>
    </div>
    <div class="field-row">
      <div class="field">
        <label class="field-label">CUIT / DNI</label>
        <input type="text" id="turno-cliente-cuit" placeholder="20-12345678-9" inputmode="numeric">
      </div>
      <div class="field">
        <label class="field-label">Teléfono</label>
        <input type="tel" id="turno-cliente-tel" placeholder="2944-555111" inputmode="tel">
      </div>
    </div>
    <div class="field">
      <label class="field-label">Dirección</label>
      <input type="text" id="turno-cliente-dir" placeholder="Dirección del trabajo">
    </div>
    <div class="field-row-3">
      <div class="field">
        <label class="field-label">CP</label>
        <input type="text" id="turno-cliente-cp" inputmode="numeric">
      </div>
      <div class="field">
        <label class="field-label">Ciudad</label>
        <input type="text" id="turno-cliente-ciudad" list="turno-ciudades-datalist" placeholder="Ciudad del trabajo" oninput="_recalcTurnoScore()">
        <datalist id="turno-ciudades-datalist"></datalist>
      </div>
      <div class="field">
        <label class="field-label">Provincia</label>
        <input type="text" id="turno-cliente-provincia">
      </div>
    </div>
    <div class="dim txt-sm" id="turno-ciudad-viaje" style="margin-top:4px;"></div>

    <div class="collapsible-section-title">🔧 SERVICIO</div>
    <div class="field">
      <label class="field-label">Tipo de servicio *</label>
      <select id="turno-servicio" onchange="_recalcTurnoScore()">
        <option value="">— Elegir —</option>
        <option value="Visita técnica">Visita técnica</option>
        <option value="Soldadora Inverter">Soldadora Inverter</option>
        <option value="Monopatín Eléctrico">Monopatín Eléctrico</option>
        <option value="Máquina Gym">Máquina Gym</option>
        <option value="Cinta de Correr">Cinta de Correr</option>
        <option value="Máquina Eléctrica">Máquina Eléctrica</option>
        <option value="Servicio de Urgencia">Servicio de Urgencia</option>
        <option value="Instalaciones Eléctricas">Instalaciones Eléctricas</option>
        <option value="Mantenimiento">Mantenimiento</option>
        <option value="Mantenimiento programado">Mantenimiento programado</option>
        <option value="Asesoramiento">Asesoramiento</option>
        <option value="Otro">Otro</option>
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label class="field-label">Ingreso estimado</label>
        <input type="number" id="turno-ingreso" placeholder="0" min="0" step="100" oninput="_recalcTurnoScore()">
      </div>
      <div class="field">
        <label class="field-label">Horas estimadas</label>
        <input type="number" id="turno-horas" placeholder="1" min="0.5" step="0.5" value="1" oninput="_recalcTurnoScore()">
      </div>
    </div>
    <div class="field">
      <label class="field-label">Notas</label>
      <textarea id="turno-notas" rows="2" placeholder="Descripción del trabajo, acceso, etc."></textarea>
    </div>

    <!-- SCORE CARD -->
    <div class="card turno-score-card">
      <div class="turno-score-row">
        <div id="turno-score-circle" class="turno-score-circle">
          <span id="turno-score-num">—</span>
        </div>
        <div class="turno-score-info">
          <div id="turno-decision" class="turno-decision">Completá el formulario</div>
          <div id="turno-decision-reason" class="dim txt-sm">—</div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   MODAL BODY — FEEDBACK DE TURNO REALIZADO
   ═══════════════════════════════════════════════════════════ */
export function buildFeedbackFormHTML(turno) {
  return `
    <div class="card">
      <div class="card-title">¿Cómo resultó el turno?</div>
      <div class="row-sb mb-6">
        <span class="dim txt-sm">Cliente</span>
        <span class="bold">${escapeHtml(turno?.cliente_nombre || '—')}</span>
      </div>
      <div class="row-sb mb-6">
        <span class="dim txt-sm">Servicio</span>
        <span>${escapeHtml(turno?.tipo_servicio || '—')}</span>
      </div>
      <div class="row-sb mb-6">
        <span class="dim txt-sm">Estimado</span>
        <span class="dim">${pesos(turno?.ingreso_estimado || 0)}</span>
      </div>
    </div>

    <div class="field">
      <label class="field-label">Ingreso real cobrado *</label>
      <input type="number" id="feedback-ingreso"
        placeholder="${turno?.ingreso_estimado || '0'}"
        value="${turno?.ingreso_estimado || ''}"
        min="0" step="100">
    </div>
    <div class="field">
      <label class="field-label">Costo real (materiales, gastos)</label>
      <input type="number" id="feedback-costo" placeholder="0" min="0" step="100">
    </div>
    <div class="field">
      <label class="field-label">Nota (opcional)</label>
      <input type="text" id="feedback-nota" placeholder="Observaciones del trabajo realizado">
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   CARD DE TURNO — vista en el panel de agenda
   ═══════════════════════════════════════════════════════════ */
export function buildTurnoCardHTML(t) {
  const estado = t.estado_turno || 'pendiente';
  const base   = (t.base || 'SMA').toLowerCase();
  const score  = parseInt(t.score, 10);
  const scoreHtml = !isNaN(score)
    ? `<span class="turno-card-score ${score >= 80 ? 'score-alto' : score >= 50 ? 'score-medio' : 'score-bajo'}">Score ${score}</span>`
    : '';

  const zonaTxt = t.zona || t.cliente_ciudad || '';
  const estaCerrado = estado === 'realizado' || estado === 'cancelado';
  const destinoMaps = [t.cliente_direccion, t.cliente_ciudad].filter(Boolean).join(', ');
  const mapsBtn = destinoMaps
    ? `<button class="turno-card-maps" type="button" onclick="event.stopPropagation(); abrirEnMaps('${destinoMaps.replace(/'/g, "\\'")}')" title="Ver en Maps">📍 Maps</button>`
    : '';
  const waBtn = t.cliente_telefono
    ? `<button class="turno-card-maps" type="button" onclick="event.stopPropagation(); _waTurno('${t.id || t.numero}')" title="Avisar por WhatsApp">💬 Avisar</button>`
    : '';

  /* Botón "Generar trabajo" — solo si el cliente NO tiene abono
     (los de abono ya tienen mantenimiento recurrente). */
  const generarBtn = (!t._tieneAbono && !estaCerrado)
    ? `<button class="turno-card-generar" type="button" onclick="event.stopPropagation(); generarDesdeTurno('${t.id || t.numero}')" title="Generar OTE, PRE o visita técnica">⚙️ Generar</button>`
    : '';

  /* Concluir / Cancelar en turnos activos; Reabrir en turnos cerrados */
  const cerrarBtns = !estaCerrado
    ? `<button class="turno-card-maps" type="button" onclick="event.stopPropagation(); concluirTurno('${t.id || t.numero}')" title="Marcar como realizado">✓ Concluir</button>
       <button class="turno-card-maps" type="button" onclick="event.stopPropagation(); cancelarTurno('${t.id || t.numero}')" title="Cancelar turno">✕ Cancelar</button>`
    : `<button class="turno-card-maps" type="button" onclick="event.stopPropagation(); reabrirTurno('${t.id || t.numero}')" title="Reabrir turno (volver a pendiente)">↩ Reabrir</button>`;

  return `
    <div class="turno-card-head">
      <span class="turno-card-hora">${t.hora || '—'}</span>
      ${zonaTxt ? `<span class="turno-card-zona">${escapeHtml(zonaTxt)}</span>` : ''}
      <span class="turno-card-estado estado-${estado}">${estado.toUpperCase()}</span>
    </div>
    <div class="turno-card-cliente">${escapeHtml(t.cliente_nombre || '—')}</div>
    ${t.tipo_servicio ? `<div class="turno-card-servicio">${escapeHtml(t.tipo_servicio)}</div>` : ''}
    <div class="turno-card-foot">
      <span class="turno-card-ingreso">${pesos(t.ingreso_estimado || 0)}</span>
      ${mapsBtn}
      ${waBtn}
      ${generarBtn}
      ${cerrarBtns}
      ${scoreHtml}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   CABECERA DE DÍA
   ═══════════════════════════════════════════════════════════ */
export function buildDiaHeadHTML(dia) {
  return `<span>${dia.label}</span><span class="agenda-dia-fecha">${dia.ddmm}</span>`;
}

/* ═══════════════════════════════════════════════════════════
   ITEM DE SUGERENCIA IQ
   ═══════════════════════════════════════════════════════════ */
export function buildSugerenciaHTML(s) {
  const btnAplicar = s.accion !== 'info'
    ? `<button class="btn btn-primary btn-sm" type="button" data-sug-id="${escapeHtml(s.id)}" data-sug-action="apply">
        ${s.accion === 'subir_precio' ? '✓ APLICAR' : s.accion === 'reagendar' ? '↻ EDITAR' : 'APLICAR'}
       </button>`
    : '';
  return `
    <div class="sugerencia-item" data-sug-id="${escapeHtml(s.id)}">
      <div class="sugerencia-item-titulo">${escapeHtml(s.titulo)}</div>
      <div class="sugerencia-item-detalle">${escapeHtml(s.detalle)}</div>
      <div class="sugerencia-item-acciones">
        ${btnAplicar}
        <button class="btn btn-ghost btn-sm" type="button" data-sug-id="${escapeHtml(s.id)}" data-sug-action="dismiss" title="Descartar">✕</button>
      </div>
    </div>
  `;
}
