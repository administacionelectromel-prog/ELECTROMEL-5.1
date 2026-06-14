/**
 * ELECTROMEL — modules/agenda/index.js
 * Punto de entrada público del módulo Agenda.
 * Re-exporta toda la API pública para compatibilidad con app.js.
 */

export { initAgenda, renderAgenda, semanaAnterior, semanaSiguiente,
         filtrarAgendaBase, toggleAgendaIQ, abrirFormularioTurno,
         cerrarFormularioTurno, guardarTurnoHandler, abrirFeedbackTurno,
         confirmarFeedbackHandler, mount, unmount, destroy,
         updateCard, appendTurno, removeTurno, updateStats }   from './agenda.render.js';

export { scoreEvent, scoreEventAsync, evaluarTurno,
         evaluateTripToNQN, guardarTurno,
         confirmarFeedbackTurno }                              from './agenda.logic.js';

export { toggleIQPanel, renderIQPanel, renderSuggestions,
         renderOptimalWeek, updateIQStats }                    from './agenda.iq.js';

export { openAgendaView, openAgendaDetail,
         openAgendaConfig, backToAgenda }                      from './agenda.router.js';

export { getOffset, setOffset, getFiltroBase, setFiltroBase,
         getSugerencias, setSugerencias, isIQVisible,
         agendaSubscribe, clearSubscriptions }                  from './agenda.store.js';
