/**
 * ELECTROMEL — config.js
 * Configuración de negocio, constantes de la app y
 * mapeo de campos de configuración.
 */

/* ── BUSINESS_CONFIG (motor de decisión) ────────────────── */
export let BUSINESS_CONFIG = {
  min_ganancia_trabajo:     15000,
  max_viatico_ratio:        0.15,
  max_material_sin_aprob:   50000,
  score_acepta_min:         60,
  score_revisar_min:        35,
  horas_dia_max:            8,
  km_nqn:                   120,
  costo_km:                 350,
  dias_aviso_alquiler:      7,
  dias_aviso_vencimiento:   7
};

export async function cargarBusinessConfig(db) {
  if (!db) return;
  try {
    const { getCfg } = await import('./db.js');
    const keys = Object.keys(BUSINESS_CONFIG);
    await Promise.all(keys.map(async k => {
      const v = await getCfg(db, k, null);
      if (v !== null && v !== '') BUSINESS_CONFIG[k] = parseFloat(v) || v;
    }));
  } catch(e) {
    console.warn('[cargarBusinessConfig]', e);
  }
}

/* ── WA_DEFAULTS ─────────────────────────────────────────── */
export const WA_DEFAULTS = {
  ingreso:       'Hola {cliente}! Recibimos tu equipo ({equipo}) en nuestro taller. Te notificaremos cuando tengamos el diagnóstico. Gracias por confiar en ELECTROMEL.',
  diagnostico:   'Hola {cliente}! Estamos analizando tu {equipo}. En breve te enviamos el presupuesto.',
  presupuesto:   'Hola {cliente}! Ya tenemos el diagnóstico de tu {equipo}. El presupuesto es de {total}. Esperamos tu confirmación para comenzar.',
  aprobado:      'Hola {cliente}! Aprobaste el presupuesto de tu {equipo}. ¡Comenzamos la reparación!',
  componentes:   'Hola {cliente}! Estamos esperando los repuestos para tu {equipo}. Te avisamos cuando lleguen.',
  reparacion:    'Hola {cliente}! Tu {equipo} está en reparación. En breve te confirmamos la fecha de entrega.',
  reparado:      'Hola {cliente}! Tu {equipo} ya está reparado y probado. Coordinamos la entrega.',
  listo_retirar: 'Hola {cliente}! Tu {equipo} está listo para retirar. El monto a abonar es {total}. Te esperamos!',
  prep_envio:    'Hola {cliente}! Estamos preparando el envío de tu {equipo}. El número de guía es {guia}. El monto es {total}.',
  enviado:       'Hola {cliente}! Tu {equipo} fue enviado. Guía de seguimiento: {guia}.',
  entregado:     'Hola {cliente}! Gracias por confiar en ELECTROMEL. Recuerda que tu {equipo} tiene {garantia} de garantía. ¡Hasta la próxima!',
  rechazado:     'Hola {cliente}! Lamentablemente el presupuesto de tu {equipo} fue rechazado. Coordinamos la devolución.',
  rec_15:        'Hola {cliente}! Te recordamos que tu equipo {equipo} lleva 15 días en retiro. Por favor coordina la retirada.',
  rec_30:        'Hola {cliente}! Han pasado 30 días. Tu {equipo} está esperando ser retirado. A partir de los 45 días se aplica costo de almacenamiento.',
  rec_60:        'AVISO IMPORTANTE: Tu equipo {equipo} lleva 60 días sin retirar. Última notificación antes de proceder según condiciones de servicio.',
  rec_120:       'AVISO FINAL: Tu equipo {equipo} lleva 120 días sin retirar. Según las condiciones aceptadas al ingreso, el equipo puede ser declarado abandonado.',
  lista:         'Hola {cliente}! Tu {equipo} está listo. Monto a abonar: {total}.',
  turno:         'Hola {cliente}! Te recordamos tu turno para el {fecha}. Cualquier consulta escribinos.',
  turno_hoy:     'Hola {cliente}! Te recordamos que hoy {fecha} pasamos a hacer el servicio de tu {equipo}. Cualquier cosa escribinos. Gracias!',
  mantenimiento: 'Hola {cliente}! Se acerca el mantenimiento programado de tu {equipo}. Coordinemos una fecha para pasar a hacer el service. Cualquier consulta escribinos.',
  abono_cobro:   'Hola {cliente}! Te recordamos la cuota de tu abono de mantenimiento ({equipo}). Monto: {total}. Gracias por confiar en ELECTROMEL.',
  ing_recibido:  'Hola {cliente}! Recibimos tu equipo en ELECTROMEL.\n\n📋 Ingreso N°: {numero}\n🔧 Equipo: {equipo}\n📦 Guía: {guia}\n🛡️ Garantía: {garantia}\n\nTe avisamos cuando tengamos el diagnóstico. Gracias!',
  doc_completo:  'Hola {cliente}! Te pasamos el detalle de tu equipo.\n\n📋 N°: {numero}\n🔧 Equipo: {equipo}\n\n🔍 Diagnóstico: {diagnostico}\n🛠️ Trabajo: {trabajo}\n\n💰 Presupuesto: {total}\n💵 Seña inicial: {adelanto}\n💳 Contra entrega: {contra_entrega}\n\n🛡️ Garantía: {garantia}\n📅 Entrega estimada: {dias_entrega}\n\nDatos para transferir:\n{banco}\n\nCualquier consulta escribinos!',
  pago_confirmado: 'Hola {cliente}! Confirmamos la recepción de tu pago.\n\n📋 Orden: {numero}\n💵 Pago recibido: {total}\n💳 Saldo pendiente: {saldo}\n\nGracias!',
  saldo_pendiente: 'Hola {cliente}! Te recordamos que tu {equipo} ({numero}) tiene un saldo pendiente de {saldo}. Cualquier consulta escribinos. Gracias!'
};

/* ── WA_FIELD_MAP (campos en Config → keys de templates) ── */
export const WA_FIELD_MAP = {
  ingreso:       'cfg-wa-ingreso',
  diagnostico:   'cfg-wa-diagnostico',
  presupuesto:   'cfg-wa-presupuesto',
  aprobado:      'cfg-wa-aprobado',
  componentes:   'cfg-wa-componentes',
  reparacion:    'cfg-wa-reparacion',
  reparado:      'cfg-wa-reparado',
  listo_retirar: 'cfg-wa-listo',
  prep_envio:    'cfg-wa-prepenvio',
  enviado:       'cfg-wa-enviado',
  entregado:     'cfg-wa-entregado',
  rechazado:     'cfg-wa-rechazado',
  rec_15:        'cfg-wa-rec-15',
  rec_30:        'cfg-wa-rec-30',
  rec_60:        'cfg-wa-rec-60',
  rec_120:       'cfg-wa-rec-120',
  lista:         'cfg-wa-lista',
  turno:         'cfg-wa-turno',
  turno_hoy:     'cfg-wa-turno-hoy',
  mantenimiento: 'cfg-wa-mantenimiento',
  abono_cobro:   'cfg-wa-abono-cobro',
  ing_recibido:  'cfg-wa-ing-recibido',
  doc_completo:  'cfg-wa-doc-completo',
  pago_confirmado: 'cfg-wa-pago-confirmado'
};

/* ── Estado → WA key ─────────────────────────────────────── */
export function estadoToWaKey(estado) {
  const map = {
    ingresado:           'ingreso',
    en_diagnostico:      'diagnostico',
    presupuesto_enviado: 'presupuesto',
    aprobado:            'aprobado',
    espera_componentes:  'componentes',
    en_reparacion:       'reparacion',
    reparado:            'reparado',
    listo_para_retirar:  'listo_retirar',
    prep_envio:          'prep_envio',
    enviado:             'enviado',
    entregado:           'entregado',
    pagado:              'entregado',
    rechazado:           'rechazado',
    rechazada_entregada: 'rechazado',
    pendiente_pago:      'listo_retirar',
    pendiente_saldo:     'listo_retirar'
  };
  return map[estado] || 'ingreso';
}

/* ── CFG_FIELDS (mapeo campo HTML → clave DB) ────────────── */
export const CFG_FIELDS = {
  /* Empresa */
  'cfg-empresa-nombre':     { key: 'empresa_nombre' },
  'cfg-empresa-sub':        { key: 'empresa_sub' },
  'cfg-empresa-cuit':       { key: 'empresa_cuit' },
  'cfg-empresa-iibb':       { key: 'empresa_iibb' },
  'cfg-empresa-iva':        { key: 'empresa_iva' },
  'cfg-empresa-domicilio':  { key: 'empresa_domicilio' },
  'cfg-empresa-ciudad':     { key: 'empresa_ciudad' },
  'cfg-empresa-provincia':  { key: 'empresa_provincia' },
  'cfg-empresa-cp':         { key: 'empresa_cp' },
  'cfg-empresa-tel':        { key: 'empresa_tel' },
  'cfg-empresa-email':      { key: 'empresa_email' },
  'cfg-banco-titular':      { key: 'banco_titular' },
  'cfg-banco-nombre':       { key: 'banco_nombre' },
  'cfg-banco-alias':        { key: 'banco_alias' },
  'cfg-banco-cbu':          { key: 'banco_cbu' },
  'cfg-drive-clientid':     { key: 'drive_clientid' },
  'cfg-drive-key':          { key: 'drive_key' },
  'cfg-drive-folder':       { key: 'drive_folder' },
  /* Personal */
  'cfg-tecnico-nombre':     { key: 'tecnico_nombre' },
  'cfg-tecnico-titulo':     { key: 'tecnico_titulo' },
  /* Condiciones */
  'cfg-leyenda-legal':      { key: 'leyenda_legal' },
  'cfg-garantia-default':   { key: 'garantia_default' },
  'cfg-dias-almacenamiento':{ key: 'dias_almacenamiento', type: 'number' },
  /* WhatsApp */
  'cfg-wa-ingreso':         { key: 'wa_ingreso' },
  'cfg-wa-diagnostico':     { key: 'wa_diagnostico' },
  'cfg-wa-presupuesto':     { key: 'wa_presupuesto' },
  'cfg-wa-aprobado':        { key: 'wa_aprobado' },
  'cfg-wa-componentes':     { key: 'wa_componentes' },
  'cfg-wa-reparacion':      { key: 'wa_reparacion' },
  'cfg-wa-reparado':        { key: 'wa_reparado' },
  'cfg-wa-listo':           { key: 'wa_listo_retirar' },
  'cfg-wa-prepenvio':       { key: 'wa_prep_envio' },
  'cfg-wa-enviado':         { key: 'wa_enviado' },
  'cfg-wa-entregado':       { key: 'wa_entregado' },
  'cfg-wa-rechazado':       { key: 'wa_rechazado' },
  'cfg-wa-rec-15':          { key: 'wa_rec_15' },
  'cfg-wa-rec-30':          { key: 'wa_rec_30' },
  'cfg-wa-rec-60':          { key: 'wa_rec_60' },
  'cfg-wa-rec-120':         { key: 'wa_rec_120' },
  'cfg-wa-lista':           { key: 'wa_lista' },
  'cfg-wa-turno':           { key: 'wa_turno' },
  'cfg-wa-turno-hoy':       { key: 'wa_turno_hoy' },
  'cfg-wa-mantenimiento':   { key: 'wa_mantenimiento' },
  'cfg-wa-abono-cobro':     { key: 'wa_abono_cobro' },
  'cfg-wa-ing-recibido':    { key: 'wa_ing_recibido' },
  'cfg-wa-doc-completo':    { key: 'wa_doc_completo' },
  'cfg-wa-pago-confirmado': { key: 'wa_pago_confirmado' },
  /* Inteligente */
  'cfg-ganancia-min-trabajo': { key: 'min_ganancia_trabajo', type: 'number' },
  'cfg-max-viatico-ratio':    { key: 'max_viatico_ratio',    type: 'number' },
  'cfg-score-acepta-min':     { key: 'score_acepta_min',     type: 'number' },
  'cfg-horas-dia-max':        { key: 'horas_dia_max',        type: 'number' },
  'cfg-km-nqn':               { key: 'km_nqn',              type: 'number' },
  'cfg-costo-km':             { key: 'costo_km',            type: 'number' },
  /* Backup */
  'cfg-autobackup':           { key: 'autobackup_enabled', type: 'bool' },
};

/* ── Condiciones de servicio defaults ────────────────────── */
export const CONDICIONES_DEFAULT = [
  'El ingreso del equipo implica aceptación del presente servicio técnico.',
  'La garantía cubre únicamente la reparación realizada y componentes reemplazados.',
  'No cubre daños por mal uso, humedad, golpes, sobrecarga o intervención de terceros.',
  'Los equipos serán probados antes de su entrega.',
  'Los presupuestos tienen validez de 7 días salvo aclaración.',
  'Los plazos pueden variar según complejidad y disponibilidad de repuestos.',
  'ELECTROMEL no se responsabiliza por daños o demoras de empresas de transporte.',
  'Equipos no retirados dentro de 30 días podrán generar cargos de almacenamiento.',
  'El retiro del equipo implica conformidad con el trabajo realizado.'
];
