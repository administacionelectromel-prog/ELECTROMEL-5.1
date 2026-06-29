/**
 * ELECTROMEL — workers/analytics.worker.js
 * Web Worker para analytics pesados (agenda IQ, rentabilidad).
 *
 * ⚠️  ARQUITECTURA PREPARADA — NO ACTIVO TODAVÍA.
 *
 * Actualmente analyzeWeeklyAgenda() y generateWeeklySuggestions()
 * corren en el hilo principal. En Android baratos pueden tardar 200-500ms.
 * Este worker los ejecutará en background.
 *
 * La función _pureAnalysis() en agenda.analytics.js ya está
 * preparada para ser importada desde aquí (recibe datos serializados,
 * no accede al DOM ni al store).
 *
 * Protocolo:
 *
 * App → Worker:
 *   { type: 'ANALYZE_WEEK', id, payload: { turnos, rango, config } }
 *   { type: 'GENERATE_SUGGESTIONS', id, payload: { analisis, config } }
 *   { type: 'GENERATE_OPTIMAL', id, payload: { analisis, config } }
 *
 * Worker → App:
 *   { type: 'ANALYZE_DONE',     id, result: AnalisisSemanal }
 *   { type: 'SUGGESTIONS_DONE', id, result: Sugerencia[] }
 *   { type: 'OPTIMAL_DONE',     id, result: ResultadoOptimal }
 *   { type: 'ERROR',            id, error: string }
 */

self.addEventListener('message', async (e) => {
  const { type, id, payload } = e.data || {};

  if (type === 'PING') {
    self.postMessage({ type: 'PONG', id, status: 'analytics-worker-ready' });
    return;
  }

  if (type === 'ANALYZE_WEEK') {
    try {
      /**
       * TODO cuando se active:
       * import { _pureAnalysis } from '../js/modules/agenda/agenda.analytics.js';
       * const result = _pureAnalysis(payload.rango, payload.turnos);
       * self.postMessage({ type: 'ANALYZE_DONE', id, result });
       */
      self.postMessage({
        type: 'ERROR', id,
        error: 'analytics.worker.js no implementado todavía. Usar analyzeWeeklyAgenda() en hilo principal.'
      });
    } catch(err) {
      self.postMessage({ type: 'ERROR', id, error: err.message });
    }
    return;
  }

  if (type === 'GENERATE_SUGGESTIONS') {
    self.postMessage({ type: 'ERROR', id, error: 'No implementado.' });
  }
});
