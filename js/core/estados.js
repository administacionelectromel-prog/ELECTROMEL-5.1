/**
 * ELECTROMEL — core/estados.js
 * Definiciones CENTRALIZADAS de los conjuntos de estados de las órdenes.
 *
 * Antes estas listas estaban repetidas (y desincronizadas) en metricas.js,
 * reporte.periodo.js, por.cobrar.js y garantia.js. Acá viven una sola vez.
 * Si se agrega o cambia un estado, se cambia SOLO acá.
 */

/* Estados que cuentan como "reparado / terminado" (trabajo cumplido) */
export const ESTADOS_REPARADO = [
  'entregado', 'terminado', 'reparado', 'finalizado',
  'cobrado', 'completado', 'pagado'
];

/* Estados que cuentan como "entregado al cliente" (ya salió del taller) */
export const ESTADOS_ENTREGADO = [
  'entregado', 'pagado', 'rechazada_entregada'
];

/* Estados que NO suman al "por cobrar" (ya cerraron o no están confirmados) */
export const ESTADOS_SIN_SALDO = [
  'pagado',                 // ya cobrado completo
  'rechazada_entregada',    // rechazado y devuelto
  'rechazado',
  'retirado_sin_reparar',   // se lo llevó sin reparar
  'ingresado',              // todavía no es trabajo confirmado
  'en_diagnostico',
  'presupuesto_enviado'     // esperando aprobación, no confirmado
];

/* Helper: ¿el estado (case-insensitive) está en la lista dada? */
export function esEstado(estado, lista) {
  return lista.includes(String(estado || '').toLowerCase());
}
