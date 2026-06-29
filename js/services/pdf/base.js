/**
 * ELECTROMEL — services/pdf/base.js
 * Constantes de layout A4, inicialización de jsPDF,
 * carga de datos de empresa y condiciones de servicio.
 * Sin efectos secundarios de UI salvo showToast en getJsPDF.
 */

import { store }          from '../../core/store.js';
import { getCfg }         from '../../core/db.js';
import { showToast }      from '../../core/ui.js';

/* ═══════════════════════════════════════════════════════════
   CONSTANTES DE LAYOUT A4
   ═══════════════════════════════════════════════════════════ */
export const PDF_A4 = {
  W:       210,
  H:       297,
  margin:   12,
  headerH:  38,
  pieH:     22,
  /* Colores */
  acento:     [232, 160,  32],
  acentoDark: [200, 130,  20],
  texto:      [ 30,  30,  30],
  texto2:     [100, 100, 100],
  texto3:     [160, 160, 160],
  banner:     [240, 240, 240],
  bannerLine: [200, 200, 200],
  separador:  [232, 160,  32]
};

/* ═══════════════════════════════════════════════════════════
   INSTANCIA DE jsPDF
   ═══════════════════════════════════════════════════════════ */

/** Obtiene la clase jsPDF del global CDN. Lanza toast si no está. */
export function getJsPDF() {
  const j = window.jspdf?.jsPDF || window.jsPDF;
  if (!j) showToast('⚠️ jsPDF no disponible. Verificá la conexión.', 'error');
  return j || null;
}

/* ═══════════════════════════════════════════════════════════
   DATOS DE EMPRESA
   ═══════════════════════════════════════════════════════════ */

/** Lee todos los campos de empresa desde IndexedDB (con defaults). */
export async function cargarDatosEmpresa() {
  const db = store.get('db');
  const keys = [
    'empresa_nombre','empresa_sub','empresa_cuit','empresa_iibb','empresa_iva',
    'empresa_domicilio','empresa_ciudad','empresa_provincia','empresa_tel','empresa_email',
    'tecnico_nombre','tecnico_titulo',
    'banco_nombre','banco_alias','banco_cbu',
    'leyenda_legal','condiciones_servicio','empresa_logo'
  ];
  const out = {};
  await Promise.all(keys.map(async k => {
    const v = await getCfg(db, k, '');
    out[k] = v ? String(v) : '';
  }));
  /* Aliases cortos para compatibilidad con código existente */
  out.banco = out.banco_nombre;
  out.alias = out.banco_alias;
  out.cbu   = out.banco_cbu;
  out.logo  = out.empresa_logo;
  /* Defaults */
  if (!out.empresa_nombre) out.empresa_nombre = 'ELECTROMEL';
  if (!out.empresa_sub)    out.empresa_sub    = 'Servicio Técnico especializado soldadoras inverter';
  if (!out.tecnico_nombre) out.tecnico_nombre = 'Mauro Ezequiel Luque';
  if (!out.tecnico_titulo) out.tecnico_titulo = 'Técnico Electromecánico';
  return out;
}

/* ═══════════════════════════════════════════════════════════
   CONDICIONES DE SERVICIO
   ═══════════════════════════════════════════════════════════ */

/** Lee las condiciones desde config; si no hay, devuelve el texto default. */
export async function getCondicionesServicio() {
  const db = store.get('db');
  const v  = await getCfg(db, 'condiciones_servicio', '');
  if (v) return v;
  return [
    'El ingreso del equipo implica aceptación del presente servicio técnico.',
    'La garantía cubre únicamente la reparación realizada y componentes reemplazados.',
    'No cubre daños por mal uso, humedad, golpes, sobrecarga o intervención de terceros.',
    'Los equipos serán probados antes de su entrega.',
    'Los presupuestos tienen validez de 7 días salvo aclaración.',
    'Los plazos pueden variar según complejidad y disponibilidad de repuestos.',
    'ELECTROMEL no se responsabiliza por daños o demoras de empresas de transporte.',
    'Equipos no retirados dentro de 30 días podrán generar cargos de almacenamiento.',
    'El retiro del equipo implica conformidad con el trabajo realizado.'
  ].join('\n');
}
