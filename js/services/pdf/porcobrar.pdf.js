/**
 * ELECTROMEL — services/pdf/porcobrar.pdf.js
 * Exporta el listado de "Por cobrar" a PDF para imprimir o compartir.
 */

import { guardarPDF } from '../files.js';
import { store } from '../../core/store.js';
import { logEvent } from '../../core/db.js';
import { showToast } from '../../core/ui.js';
import { pesos, pdfSanitize, fmtFechaCorta } from '../../core/utils.js';
import { PDF_A4, getJsPDF, cargarDatosEmpresa } from './base.js';
import { pdfHeaderA4, pdfPieA4, pdfCheckSpace, pdfSectionBanner } from './helpers.js';
import { calcularPorCobrar } from '../por.cobrar.js';

export async function imprimirPorCobrarPDF() {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) { showToast('PDF no disponible', 'error'); return; }

  showToast('Generando PDF...', 'info');
  try {
    const { total, items, cantidad, porZona } = await calcularPorCobrar();
    if (!cantidad) { showToast('No hay trabajos por cobrar', 'info'); return; }

    const cfg = await cargarDatosEmpresa();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin } = PDF_A4;
    const hoy = new Date().toISOString().slice(0, 10);

    const headerOpts = { cfg, tituloDoc: 'POR COBRAR', numero: fmtFechaCorta(hoy), fechaIso: hoy };
    const pageState = { page: 1, total: 1, cfg, headerOpts };
    let y = pdfHeaderA4(doc, headerOpts);
    y += 4;

    const colDer = W - margin;

    /* Total */
    y = pdfSectionBanner(doc, y, 'TOTAL POR COBRAR'); y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(40, 140, 80);
    doc.text(pesos(total), margin, y);
    doc.setFontSize(10); doc.setTextColor(90, 90, 90);
    doc.text(`${cantidad} trabajo(s)`, colDer, y, { align: 'right' });
    y += 8;

    /* Por zona */
    if (porZona && porZona.length > 1) {
      y = pdfSectionBanner(doc, y, 'POR ZONA'); y += 2;
      doc.setFontSize(10); doc.setTextColor(20, 20, 20);
      for (const z of porZona) {
        y = pdfCheckSpace(doc, y, 6, pageState);
        doc.setFont('helvetica', 'normal');
        doc.text(pdfSanitize(`${z.zona} (${z.cantidad})`), margin, y);
        doc.setFont('helvetica', 'bold');
        doc.text(pesos(z.total), colDer, y, { align: 'right' });
        y += 6;
      }
      y += 3;
    }

    /* Detalle */
    y = pdfSectionBanner(doc, y, 'DETALLE'); y += 2;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('Cliente', margin, y);
    doc.text('N°', margin + 70, y);
    doc.text('Total', margin + 105, y);
    doc.text('Saldo', colDer, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, colDer, y); y += 4;

    for (const it of items) {
      y = pdfCheckSpace(doc, y, 6, pageState);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
      doc.text(pdfSanitize((it.cliente || '—').slice(0, 32)), margin, y);
      doc.text(pdfSanitize(it.numero || '—'), margin + 70, y);
      doc.setFontSize(8); doc.setTextColor(110, 110, 110);
      doc.text(pesos(it.total), margin + 105, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(200, 140, 30);
      doc.text(pesos(it.saldo), colDer, y, { align: 'right' });
      y += 6;
    }

    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });
    guardarPDF(doc, `PorCobrar_${hoy}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'Por cobrar PDF' }).catch(()=>{});
    showToast('✅ PDF generado', 'success');
  } catch (err) {
    console.error('[imprimirPorCobrarPDF]', err);
    showToast('❌ Error al generar el PDF', 'error');
  }
}
