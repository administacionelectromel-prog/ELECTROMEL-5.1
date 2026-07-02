/**
 * ELECTROMEL — modules/plantillas/plantillas.events.js
 * Lifecycle e inicialización del módulo plantillas.
 */

import { bus }               from '../../core/store.js';
import { getCatActiva }      from './plantillas.store.js';
import { renderListaConfig } from './plantillas.render.js';
import { plantillasFiltrar } from './plantillas.config.js';

export function initPlantillas() {
  bus.on('tab:cambio', ({ to }) => {
    if (to === 'config') {
      setTimeout(() => plantillasFiltrar(getCatActiva()), 150);
    }
  });
}
