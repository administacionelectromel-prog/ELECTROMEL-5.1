/**
 * ELECTROMEL — modules/plantillas/index.js
 * Punto de entrada público del módulo plantillas.
 */

export { initPlantillasInline }       from './plantillas.autocomplete.js';
export { abrirMiniPanelPlantillas }   from './plantillas.bottomsheet.js';
export { plantillasFiltrar, agregarPlantilla,
         abrirPlantillasRapidas }     from './plantillas.config.js';
export { initPlantillas }             from './plantillas.events.js';
export { insertarEnTextarea }         from './plantillas.render.js';
