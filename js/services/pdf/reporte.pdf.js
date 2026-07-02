/**
 * ELECTROMEL — services/pdf/reporte.pdf.js
 * Genera el PDF del reporte contable/operativo de un período.
 */

import { guardarPDF } from '../files.js';
import { store } from '../../core/store.js';
import { logEvent } from '../../core/db.js';
import { showToast } from '../../core/ui.js';
import { pesos, pdfSanitize, fmtFechaCorta } from '../../core/utils.js';
import { PDF_A4, getJsPDF, cargarDatosEmpresa } from './base.js';
import { pdfHeaderA4, pdfPieA4, pdfCheckSpace, pdfSectionBanner } from './helpers.js';
import { datosReportePeriodo } from '../reporte.periodo.js';

export async function imprimirReportePeriodo(desde, hasta) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) { showToast('PDF no disponible', 'error'); return; }
  if (!desde || !hasta) { showToast('Elegí el período', 'warn'); return; }

  showToast('Generando reporte...', 'info');
  try {
    const d = await datosReportePeriodo(desde, hasta);
    if (!d) { showToast('Sin datos', 'error'); return; }

    const cfg = await cargarDatosEmpresa();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin } = PDF_A4;

    const headerOpts = {
      cfg,
      tituloDoc: 'REPORTE DE PERÍODO',
      numero: `${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}`,
      fechaIso: new Date().toISOString().slice(0, 10)
    };
    const pageState = { page: 1, total: 1, cfg, headerOpts };
    let y = pdfHeaderA4(doc, headerOpts);
    y += 4;

    const colDer = W - margin;
    const linea = (lbl, val, opts = {}) => {
      y = pdfCheckSpace(doc, y, 7, pageState);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(opts.size || 10);
      if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(20, 20, 20);
      doc.text(pdfSanitize(lbl), margin + (opts.indent || 0), y);
      if (val != null) {
        doc.text(pdfSanitize(String(val)), colDer, y, { align: 'right' });
      }
      y += opts.gap || 6;
      doc.setTextColor(20, 20, 20);
    };

    /* ── EQUIPOS ──────────────────────────────────────────── */
    y = pdfSectionBanner(doc, y, 'EQUIPOS DEL PERÍODO'); y += 2;
    linea('Equipos que ingresaron', d.equipos.entraron, { bold: true });
    linea('Equipos reparados / entregados', d.equipos.reparados, { bold: true });
    y += 3;

    /* ── PLATA ────────────────────────────────────────────── */
    y = pdfSectionBanner(doc, y, 'RESUMEN ECONÓMICO'); y += 2;
    linea('Ingresos', pesos(d.plata.ingresos), { bold: true, color: [40, 140, 80] });
    linea('Egresos', pesos(d.plata.egresos), { bold: true, color: [200, 60, 60] });
    linea('GANANCIA', pesos(d.plata.ganancia), { bold: true, size: 12,
      color: d.plata.ganancia >= 0 ? [40, 140, 80] : [200, 60, 60] });
    y += 3;

    /* ── POR ZONA ─────────────────────────────────────────── */
    if (d.porZona.length) {
      y = pdfSectionBanner(doc, y, 'POR ZONA DE TRABAJO'); y += 2;
      for (const z of d.porZona) {
        linea(`${z.zona} (${z.cantidad} trab.)`, pesos(z.ingresos));
      }
      y += 3;
    }

    /* ── ABONOS ───────────────────────────────────────────── */
    y = pdfSectionBanner(doc, y, 'ABONOS'); y += 2;
    linea('Cobrado en el período', pesos(d.abonos.cobrado), { bold: true, color: [40, 140, 80] });
    linea('Adeudado (a la fecha)', pesos(d.abonos.adeudado), { bold: true, color: [200, 60, 60] });
    y += 3;

    /* ── DETALLE DE TRABAJOS ──────────────────────────────── */
    if (d.listaTrabajos.length) {
      y = pdfSectionBanner(doc, y, 'DETALLE DE TRABAJOS'); y += 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
      y = pdfCheckSpace(doc, y, 6, pageState);
      doc.text('Fecha', margin, y);
      doc.text('N°', margin + 22, y);
      doc.text('Cliente', margin + 48, y);
      doc.text('Zona', margin + 110, y);
      doc.text('Total', colDer, y, { align: 'right' });
      y += 4;
      doc.setDrawColor(200, 200, 200); doc.line(margin, y - 2, colDer, y - 2);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
      for (const t of d.listaTrabajos) {
        y = pdfCheckSpace(doc, y, 5.5, pageState);
        doc.setFontSize(8);
        doc.text(pdfSanitize(fmtFechaCorta(t.fecha) || '—'), margin, y);
        doc.text(pdfSanitize(t.numero || '—'), margin + 22, y);
        doc.text(pdfSanitize((t.cliente || '—').slice(0, 32)), margin + 48, y);
        doc.text(pdfSanitize((t.zona || '—').slice(0, 18)), margin + 110, y);
        doc.text(pesos(t.total), colDer, y, { align: 'right' });
        y += 5;
      }
    }

    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });
    guardarPDF(doc, `Reporte_${desde}_${hasta}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: `Reporte ${desde}/${hasta}` }).catch(()=>{});
    showToast('✅ Reporte generado', 'success');
  } catch (err) {
    console.error('[imprimirReportePeriodo]', err);
    showToast('❌ Error al generar el reporte', 'error');
  }
}
