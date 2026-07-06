/**
 * ELECTROMEL — services/pdf/ott.pdf.js
 * Generador de PDF A4 para Órdenes de Trabajo Taller (OTT).
 */

import { guardarPDF } from '../files.js';
import { store }            from '../../core/store.js';
import { dbGet, logEvent }  from '../../core/db.js';
import { showToast }        from '../../core/ui.js';
import { pesos, pdfSanitize, fmtFechaCorta } from '../../core/utils.js';
import { PDF_A4, getJsPDF, cargarDatosEmpresa } from './base.js';
import {
  pdfHeaderA4, pdfPieA4, pdfCheckSpace,
  pdfSectionBanner, pdfDatosCliente, pdfLineaCampo, pdfLineaCampoDoble,
  pdfMontoBox, pdfBloqueFirmas, pdfTablaItems, pdfGarantiaBanda, pdfDatosPago
} from './helpers.js';

/* ── imprimirOTT_A4 ──────────────────────────────────────── */
export async function imprimirOTT_A4(numero) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF || !numero) return;

  showToast('Generando PDF...', 'info');
  try {
    const orden = await dbGet(db, 'ordenes', numero);
    if (!orden) { showToast('❌ No encontrado: ' + numero, 'error'); return; }

    const cfg            = await cargarDatosEmpresa();
    const doc            = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin }  = PDF_A4;

    /* Título diferenciado si es garantía */
    const tituloDoc = orden.es_garantia
      ? (orden.es_garantia_convertida ? 'ORDEN TRABAJO TALLER' : 'TRABAJO EN GARANTÍA')
      : 'ORDEN TRABAJO TALLER';

    const headerOpts = {
      cfg,
      tituloDoc,
      numero:                 orden.numero,
      numeroSecundario:       orden.numIngreso || orden.ing_garantia,
      numeroSecundarioLabel:  orden.es_garantia ? 'ING GARANTÍA N°' : 'INGRESO N°',
      fechaIso:               orden.fecha
    };
    const pageState = { page: 1, total: 1, cfg, headerOpts };

    let y = pdfHeaderA4(doc, headerOpts);

    /* Banda de garantía — inmediata debajo del header */
    if (orden.es_garantia && !orden.es_garantia_convertida) {
      const { acento } = PDF_A4;
      doc.setFillColor(180, 30, 30);
      doc.rect(margin, y, W - 2 * margin, 10, 'F');
      doc.setFillColor(220, 60, 60);
      doc.rect(margin, y, 2, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const garTxt = orden.ott_garantia_origen
        ? `🛡️  TRABAJO EN GARANTÍA  —  OTT ORIGEN: ${orden.ott_garantia_origen}`
        : '🛡️  TRABAJO EN GARANTÍA';
      doc.text(pdfSanitize(garTxt), W / 2, y + 6.5, { align: 'center' });
      doc.setTextColor(...PDF_A4.texto);
      y += 14;

      /* Si hay cobro extra, mostrarlo */
      if (orden.cobro_extra > 0) {
        doc.setFillColor(255, 245, 200);
        doc.rect(margin, y, W - 2 * margin, 9, 'F');
        doc.setTextColor(100, 60, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const cobroTxt = `Cargo extra por falla no cubierta: ${pesos(orden.cobro_extra)}${orden.motivo_cobro_extra ? ' — ' + orden.motivo_cobro_extra : ''}`;
        doc.text(pdfSanitize(cobroTxt), W / 2, y + 5.5, { align: 'center' });
        doc.setTextColor(...PDF_A4.texto);
        y += 13;
      }
    }

    y = pdfDatosCliente(doc, y, {
      nombre:    orden.cliente_nombre,
      cuit:      orden.cliente_cuit,
      telefono:  orden.cliente_telefono,
      direccion: orden.cliente_direccion,
      ciudad:    orden.cliente_ciudad,
      provincia: orden.cliente_provincia,
      cp:        orden.cliente_cp
    });
    y += 2;

    /* Datos del equipo */
    y = pdfSectionBanner(doc, y, 'DATOS DEL EQUIPO');
    doc.setFontSize(9);
    y = pdfLineaCampoDoble(doc, y,
      'Equipo', orden.equipo_tipo || '—',
      'Marca/Modelo', [orden.equipo_marca, orden.equipo_modelo].filter(Boolean).join(' ') || '—');
    y = pdfLineaCampoDoble(doc, y,
      'Falla declarada', orden.equipo_falla || '—',
      'Error declarado', orden.equipo_error || 'Sin código');
    y += 2;

    /* Encomienda entrada */
    if (orden.encomienda_transporte || orden.encomienda_guia) {
      y = pdfSectionBanner(doc, y, 'RECEPCIÓN DE ENCOMIENDA');
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_A4.texto);
      const ep = [];
      if (orden.encomienda_transporte) ep.push(orden.encomienda_transporte);
      if (orden.encomienda_guia)       ep.push('N° envío: ' + orden.encomienda_guia);
      doc.text(pdfSanitize(ep.join('  |  ')), margin, y); y += 5;
      if (orden.encomienda_costo > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('Costo entrada:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(pesos(orden.encomienda_costo), margin + doc.getTextWidth('Costo entrada: '), y);
        y += 5;
      }
      y += 2;
    }

    /* Diagnóstico y trabajo */
    y = pdfCheckSpace(doc, y, 20, pageState);
    y = pdfSectionBanner(doc, y, 'DIAGNÓSTICO Y TRABAJO');
    doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);

    if (orden.diagnostico) {
      doc.setFont('helvetica', 'bold'); doc.text('Diagnóstico:', margin, y); y += 5;
      doc.setFont('helvetica', 'normal');
      for (const line of orden.diagnostico.split('\n')) {
        if (!line.trim()) continue;
        y = pdfCheckSpace(doc, y, 6, pageState);
        doc.text('• ' + pdfSanitize(line.trim()), margin + 2, y); y += 5;
      }
      y += 2;
    }
    if (orden.trabajo) {
      doc.setFont('helvetica', 'bold'); doc.text('Trabajo a realizar:', margin, y); y += 5;
      doc.setFont('helvetica', 'normal');
      for (const line of orden.trabajo.split('\n')) {
        if (!line.trim()) continue;
        y = pdfCheckSpace(doc, y, 6, pageState);
        doc.text('• ' + pdfSanitize(line.trim()), margin + 2, y); y += 5;
      }
      y += 2;
    }

    /* Materiales */
    if (orden.materiales_items?.length) {
      y = pdfCheckSpace(doc, y, 20, pageState);
      y = pdfSectionBanner(doc, y, 'MATERIALES / REPUESTOS');
      y = pdfTablaItems(doc, y, orden.materiales_items, pageState);
      y += 2;
    }

    /* Presupuesto */
    y = pdfCheckSpace(doc, y, 35, pageState);
    y = pdfSectionBanner(doc, y, 'PRESUPUESTO');

    const total    = parseFloat(orden.total)   || 0;
    const adelanto = parseFloat(orden.adelanto) || 0;
    const saldo    = Math.max(0, total - adelanto);
    const halfW    = (W - 2 * margin) / 2 - 2;

    y = pdfMontoBox(doc, margin, y, W - 2 * margin, 'TOTAL MANO DE OBRA Y REPUESTOS', total, { h: 14, fontMonto: 18 });
    y += 3;
    if (adelanto > 0 || saldo > 0) {
      const pctGuardado = parseFloat(orden.adelanto_pct) || 0;
      const pct = pctGuardado > 0 ? pctGuardado
                : (total > 0 ? Math.round(adelanto / total * 100) : 0);
      const etiquetaAdelanto = pct > 0 ? `ADELANTO INICIAL (${pct}%)` : 'ADELANTO INICIAL';
      pdfMontoBox(doc, margin,            y, halfW, etiquetaAdelanto,    adelanto, { h: 12, bg: [180, 140, 30] });
      pdfMontoBox(doc, margin + halfW + 4, y, halfW, 'SALDO CONTRAENTREGA', saldo,   { h: 12, bg: [160, 120, 20] });
      y += 15;
    }

    /* Garantía */
    y = pdfGarantiaBanda(doc, y, orden.garantia, orden.tiempo_estimado);

    /* Retorno */
    if (orden.encomienda_retorno_transporte || orden.encomienda_retorno_guia) {
      y += 2;
      y = pdfSectionBanner(doc, y, 'DATOS DE RETORNO / ENVÍO');
      doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);
      const rp = [];
      if (orden.encomienda_retorno_transporte) rp.push(orden.encomienda_retorno_transporte);
      if (orden.encomienda_retorno_guia)       rp.push('Guía: ' + orden.encomienda_retorno_guia);
      if (orden.encomienda_retorno_costo > 0)  rp.push('Costo: ' + pesos(orden.encomienda_retorno_costo));
      doc.setFont('helvetica', 'normal');
      doc.text(pdfSanitize(rp.join('  |  ')), margin, y); y += 6;
    }

    /* Fotos del trabajo (si hay) */
    try {
      const { fotosDeOrden } = await import('../fotos.js');
      const fotos = await fotosDeOrden(numero);
      if (fotos && fotos.length) {
        y += 6;
        y = pdfCheckSpace(doc, y, 50, pageState);
        y = pdfSectionBanner(doc, y, '📷 FOTOS DEL TRABAJO');
        y += 4;
        const fotoW = 55, fotoH = 41, gap = 6;
        const porFila = Math.floor((W - 2 * margin + gap) / (fotoW + gap));
        let col = 0;
        let x = margin;
        for (let i = 0; i < fotos.length; i++) {
          if (col >= porFila) { col = 0; x = margin; y += fotoH + gap; }
          y = pdfCheckSpace(doc, y, fotoH + gap, pageState);
          try {
            doc.addImage(fotos[i].dataUrl, 'JPEG', x, y, fotoW, fotoH);
          } catch (e) { /* foto inválida, saltar */ }
          x += fotoW + gap;
          col++;
        }
        y += fotoH + 6;
      }
    } catch (e) { console.warn('[OTT PDF fotos]', e); }

    /* Datos de pago (banco / alias / CBU) */
    y += 4;
    y = pdfCheckSpace(doc, y, 12, pageState);
    y = pdfDatosPago(doc, y, cfg);

    /* Firmas */
    y += 8;
    y = pdfCheckSpace(doc, y, 20, pageState);
    pdfBloqueFirmas(doc, y, cfg);
    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });

    guardarPDF(doc, `${orden.numero}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'OTT A4: ' + numero, ref: numero });
    showToast('✅ PDF generado', 'success');

  } catch(e) {
    console.error('[imprimirOTT_A4]', e);
    showToast('❌ Error: ' + e.message, 'error');
  }
}
