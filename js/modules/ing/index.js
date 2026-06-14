/**
 * ELECTROMEL — modules/ing/index.js
 * Punto de entrada público del módulo ING.
 * Re-exporta toda la API de ing.js para compatibilidad.
 */

export {
  abrirFormularioING,
  cerrarFormularioING,
  resetFormularioING,
  guardarIngreso,
  abrirConfirmacionING,
  cerrarConfirmacionING,
  imprimirING_Ticket,
  imprimirING_Etiqueta,
  addItem,
  removeItem,
  syncItemsHidden,
  crearFilaTabular,
  leerTabular,
  leerItems,
  poblarItems,
  init
} from '../ing.js';

export { imprimirING_A4 } from '../../services/pdf/ing.pdf.js';
