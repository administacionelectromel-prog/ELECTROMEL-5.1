/**
 * ELECTROMEL — services/pdf/checklist.pdf.js
 * Genera el OTE de constancia del checklist de mantenimiento de una flota.
 */

import { guardarPDF } from '../files.js';
import { store } from '../../core/store.js';
import { logEvent } from '../../core/db.js';
import { showToast } from '../../core/ui.js';
import { pdfSanitize, fmtFechaCorta } from '../../core/utils.js';
import { PDF_A4, getJsPDF, cargarDatosEmpresa } from './base.js';
import { pdfHeaderA4, pdfPieA4, pdfCheckSpace, pdfSectionBanner } from './helpers.js';

const ESTADO_TXT = { ok: 'OK', obs: 'OBSERVACIÓN', baja: 'BAJA' };

export async function imprimirChecklistPDF(data) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) { showToast('PDF no disponible', 'error'); return; }

  showToast('Generando constancia...', 'info');
  try {
    const cfg = await cargarDatosEmpresa();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin } = PDF_A4;
    const hoy = new Date().toISOString().slice(0, 10);

    const headerOpts = {
      cfg,
      tituloDoc: 'CONSTANCIA DE MANTENIMIENTO',
      numero: fmtFechaCorta(hoy),
      fechaIso: hoy
    };
    const pageState = { page: 1, total: 1, cfg, headerOpts };
    let y = pdfHeaderA4(doc, headerOpts);
    y += 4;

    /* Datos del cliente */
    y = pdfSectionBanner(doc, y, 'CLIENTE'); y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text(pdfSanitize(data.cliente || '—'), margin, y); y += 6;
    if (data.equipo) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      doc.text(pdfSanitize(data.equipo), margin, y); y += 5;
    }
    if (data.zona) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      doc.text('Zona: ' + pdfSanitize(data.zona), margin, y); y += 5;
    }
    y += 3;

    /* Tabla de máquinas */
    y = pdfSectionBanner(doc, y, 'MÁQUINAS REVISADAS'); y += 2;
    const colDer = W - margin;

    /* Encabezado de tabla */
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('✓', margin, y);
    doc.text('Máquina', margin + 10, y);
    doc.text('N°', margin + 100, y);
    doc.text('Estado', colDer, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, colDer, y); y += 4;

    for (const m of (data.detalle || [])) {
      y = pdfCheckSpace(doc, y, 7, pageState);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
      /* Tilde */
      doc.text(m.hecho ? 'SI' : '-', margin, y);
      /* Nombre */
      const nombre = [m.marca, m.modelo].filter(Boolean).join(' ') || 'Sin marca';
      doc.text(pdfSanitize(nombre.slice(0, 42)), margin + 10, y);
      /* Número */
      doc.text(pdfSanitize(m.numero || '—'), margin + 100, y);
      /* Estado con color */
      const col = m.estado === 'baja' ? [200, 60, 60] : m.estado === 'obs' ? [200, 140, 30] : [40, 140, 80];
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
      doc.text(ESTADO_TXT[m.estado] || 'OK', colDer, y, { align: 'right' });
      y += 6;
    }

    /* Resumen */
    y += 2;
    const det = data.detalle || [];
    const hechas = det.filter(d => d.hecho).length;
    const obs = det.filter(d => d.estado === 'obs').length;
    const bajas = det.filter(d => d.estado === 'baja').length;
    y = pdfCheckSpace(doc, y, 8, pageState);
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, colDer, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
    doc.text(pdfSanitize(`Total: ${hechas} con service · ${obs} con observación · ${bajas} de baja`), margin, y);
    y += 10;

    /* Firma */
    y = pdfCheckSpace(doc, y, 25, pageState);
    doc.setDrawColor(120, 120, 120);
    doc.line(margin, y + 12, margin + 70, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('Firma / Aclaración del cliente', margin, y + 17);

    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });
    guardarPDF(doc, `Constancia_${(data.cliente || 'cliente').replace(/\s+/g, '_')}_${hoy}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: `Constancia mantenimiento: ${data.cliente}` }).catch(()=>{});
    showToast('✅ Constancia generada', 'success');
  } catch (err) {
    console.error('[imprimirChecklistPDF]', err);
    showToast('❌ Error al generar la constancia', 'error');
  }
}
