/**
 * ELECTROMEL — modules/panel/index.js
 * Punto de entrada público del módulo panel.
 * Re-exporta toda la API pública para compatibilidad con app.js.
 */

export { renderPanelPrincipal, renderArchivados } from './panel.render.js';
export { filtrarPanel }                           from './panel.filters.js';
export { filtrarPanelAnio, poblarSelectorAnios }  from './panel.filters.js';
export { toggleArchivados }                       from './panel.filters.js';
export { abrirModalDetalle, cerrarModalDetalle,
         guardarCambiosDetalle }                  from './panel.detail.js';
export { abrirPagoParcial, cerrarPagoParcial,
         confirmarPagoParcial }                   from './panel.payments.js';
export { abrirPanelAlertasWA }                    from './panel.alerts.js';
export { bindPanelEvents, unbindPanelEvents }     from './panel.events.js';

/* ── initPanel ────────────────────────────────────────── */
import { bindPanelEvents }        from './panel.events.js';
import { renderPanelPrincipal }   from './panel.render.js';

export function initPanel() {
  bindPanelEvents();
  renderPanelPrincipal();
}
