/**
 * ELECTROMEL — services/pdf/ing.pdf.js
 * Generador de PDF A4 para Ingresos (ING).
 * Ticket 57mm y Etiqueta QR están en modules/ing.js (dependen del DOM del formulario).
 */

import { store }            from '../../core/store.js';
import { dbGet, logEvent }  from '../../core/db.js';
import { showToast }        from '../../core/ui.js';
import { getJsPDF, cargarDatosEmpresa, getCondicionesServicio } from './base.js';
import {
  pdfHeaderA4, pdfPieA4, pdfCheckSpace,
  pdfSectionBanner, pdfDatosCliente, pdfLineaCampo,
  pdfBloqueFirmas, pdfCondiciones
} from './helpers.js';

/* ── imprimirING_A4 ──────────────────────────────────────── */
export async function imprimirING_A4(numero) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF || !numero) return;

  showToast('Generando PDF...', 'info');
  try {
    const ing = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado: ' + numero, 'error'); return; }

    const cfg         = await cargarDatosEmpresa();
    const condiciones = await getCondicionesServicio();
    const doc         = new jsPDF({ unit: 'mm', format: 'a4' });
    const { margin }  = (await import('./base.js')).PDF_A4;

    const headerOpts = { cfg, tituloDoc: 'RECIBO DE INGRESO', numero: ing.numero, fechaIso: ing.fecha };
    const pageState  = { page: 1, total: 1, cfg, headerOpts };

    let y = pdfHeaderA4(doc, headerOpts);

    y = pdfDatosCliente(doc, y, {
      nombre:    ing.cliente_nombre,
      cuit:      ing.cliente_cuit,
      telefono:  ing.cliente_telefono,
      direccion: ing.cliente_direccion,
      ciudad:    ing.cliente_ciudad,
      provincia: ing.cliente_provincia,
      cp:        ing.cliente_cp
    });
    y += 2;

    /* Datos del equipo */
    y = pdfSectionBanner(doc, y, 'DATOS DEL EQUIPO');
    doc.setFontSize(9);
    y = pdfLineaCampo(doc, y, 'Equipo',       ing.equipo_tipo || '—');
    y = pdfLineaCampo(doc, y, 'Marca/Modelo', [ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ') || '—');
    if (ing.equipo_serie) y = pdfLineaCampo(doc, y, 'N° de serie', ing.equipo_serie);
    y = pdfLineaCampo(doc, y, 'Falla declarada', ing.equipo_falla  || '—');
    y = pdfLineaCampo(doc, y, 'Error declarado',  ing.equipo_error || 'Sin código');
    y += 2;

    /* Encomienda entrada */
    if (ing.encomienda) {
      y = pdfSectionBanner(doc, y, 'RECEPCIÓN DE ENCOMIENDA');
      doc.setFontSize(9);
      const parts = [];
      if (ing.encomienda_transporte) parts.push(ing.encomienda_transporte);
      if (ing.encomienda_guia)       parts.push('N° de envío: ' + ing.encomienda_guia);
      doc.setFont('helvetica', 'normal');
      const { pdfSanitize } = await import('../../core/utils.js');
      doc.text(pdfSanitize(parts.join('  |  ') || '—'), margin, y);
      y += 5;
      if (ing.encomienda_costo > 0) {
        const { pesos } = await import('../../core/utils.js');
        doc.setFont('helvetica', 'bold');
        doc.text('Costo envio entrada:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(pesos(ing.encomienda_costo), margin + doc.getTextWidth('Costo envio entrada: '), y);
        y += 5;
      }
      y += 2;
    }

    /* Condiciones + firmas */
    y = pdfCheckSpace(doc, y, 100, pageState);
    y = pdfCondiciones(doc, y, condiciones, cfg, pageState);
    y += 30;
    y = pdfCheckSpace(doc, y, 20, pageState);
    pdfBloqueFirmas(doc, y, cfg);
    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });

    doc.save(`ING-${ing.numero}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'ING A4: ' + numero, ref: numero });
    showToast('✅ PDF generado', 'success');

  } catch(e) {
    console.error('[imprimirING_A4]', e);
    showToast('❌ Error: ' + e.message, 'error');
  }
}
