/**
 * ELECTROMEL — modules/ott/index.js
 * Punto de entrada público del módulo OTT.
 * Re-exporta toda la API de ott.js para compatibilidad con app.js.
 */

export {
  addItem,
  removeItem,
  syncItemsHidden,
  abrirFormularioOTT,
  cerrarFormularioOTT,
  guardarOTT,
  crearOTTdesdeING,
  crearOTTdesdeINGActual
} from '../ott.js';

export { imprimirOTT_A4 } from '../../services/pdf/ott.pdf.js';
