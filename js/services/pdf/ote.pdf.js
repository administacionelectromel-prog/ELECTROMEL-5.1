/**
 * ELECTROMEL — services/pdf/ote.pdf.js
 * Generadores de PDF A4 para:
 *   - Órdenes de Trabajo Exterior (OTE)
 *   - Presupuestos (PRE)
 *   - Lista de materiales del cliente (PRE)
 */

import { store }            from '../../core/store.js';
import { dbGet, logEvent }  from '../../core/db.js';
import { showToast }        from '../../core/ui.js';
import { pesos, pdfSanitize, fmtFechaCorta } from '../../core/utils.js';
import { PDF_A4, getJsPDF, cargarDatosEmpresa } from './base.js';
import {
  pdfHeaderA4, pdfPieA4, pdfCheckSpace,
  pdfSectionBanner, pdfDatosCliente, pdfLineaCampo,
  pdfMontoBox, pdfBloqueFirmas, pdfTablaItems, pdfDatosPago
} from './helpers.js';

/* ── imprimirOTE_A4 ──────────────────────────────────────── */
export async function imprimirOTE_A4(numero) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF || !numero) return;

  showToast('Generando PDF...', 'info');
  try {
    const ote = await dbGet(db, 'exteriors', numero);
    if (!ote) { showToast('❌ No encontrado: ' + numero, 'error'); return; }

    const cfg           = await cargarDatosEmpresa();
    const doc           = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin } = PDF_A4;

    const headerOpts = { cfg, tituloDoc: 'ORDEN TRABAJO EXTERIOR', numero: ote.numero, fechaIso: ote.fecha };
    const pageState  = { page: 1, total: 1, cfg, headerOpts };

    let y = pdfHeaderA4(doc, headerOpts);

    y = pdfDatosCliente(doc, y, {
      nombre:    ote.cliente_nombre,
      cuit:      ote.cliente_cuit,
      telefono:  ote.cliente_telefono,
      direccion: ote.cliente_direccion,
      ciudad:    ote.cliente_ciudad,
      provincia: ote.cliente_provincia
    });
    y += 2;

    /* Servicio */
    y = pdfSectionBanner(doc, y, 'DATOS DEL SERVICIO');
    doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);
    y = pdfLineaCampo(doc, y, 'Tipo', ote.tipo_servicio || '—');
    if (ote.fecha) y = pdfLineaCampo(doc, y, 'Fecha', fmtFechaCorta(ote.fecha));
    y += 2;

    /* Descripción bullet list */
    if (ote.descripcion) {
      y = pdfSectionBanner(doc, y, 'DESCRIPCIÓN DEL SERVICIO');
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_A4.texto);
      for (const line of ote.descripcion.split('\n')) {
        if (!line.trim()) continue;
        y = pdfCheckSpace(doc, y, 6, pageState);
        doc.text('• ' + pdfSanitize(line.trim()), margin + 2, y); y += 5;
      }
      y += 2;
    }

    /* Trabajo realizado */
    if (ote.trabajo_items?.length) {
      y = pdfCheckSpace(doc, y, 20, pageState);
      y = pdfSectionBanner(doc, y, 'TRABAJO REALIZADO');
      y = pdfTablaItems(doc, y, ote.trabajo_items, pageState);
      y += 2;
    }

    /* Materiales */
    if (ote.materiales_items?.length) {
      y = pdfCheckSpace(doc, y, 20, pageState);
      y = pdfSectionBanner(doc, y, 'MATERIALES UTILIZADOS');
      y = pdfTablaItems(doc, y, ote.materiales_items, pageState);
      y += 2;
    }

    /* Costos */
    y = pdfCheckSpace(doc, y, 40, pageState);
    y = pdfSectionBanner(doc, y, 'COSTOS');
    doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);

    const subTrab = parseFloat(ote.sub_trabajo)   || 0;
    const subMat  = parseFloat(ote.sub_materiales) || 0;
    const mo      = parseFloat(ote.mano_obra)      || 0;
    const via     = parseFloat(ote.viatico)        || 0;
    const total   = parseFloat(ote.total)          || 0;

    if (subTrab > 0) y = pdfLineaCampo(doc, y, 'Subtotal trabajo',    pesos(subTrab));
    if (subMat  > 0) y = pdfLineaCampo(doc, y, 'Subtotal materiales', pesos(subMat));
    if (mo      > 0) y = pdfLineaCampo(doc, y, 'Mano de obra',        pesos(mo));
    if (via     > 0) y = pdfLineaCampo(doc, y, 'Viatico',             pesos(via));
    y += 2;
    y = pdfMontoBox(doc, margin, y, W - 2 * margin, 'TOTAL GENERAL', total, { h: 14, fontMonto: 18 });
    y += 6;

    y = pdfDatosPago(doc, y, cfg);

    /* Firmas */
    y += 8;
    y = pdfCheckSpace(doc, y, 20, pageState);
    pdfBloqueFirmas(doc, y, cfg);
    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });

    doc.save(`OTE-${ote.numero}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'OTE A4: ' + numero, ref: numero });
    showToast('✅ PDF generado', 'success');

  } catch(e) {
    console.error('[imprimirOTE_A4]', e);
    showToast('❌ Error: ' + e.message, 'error');
  }
}

/* ── imprimirPRE_A4 ──────────────────────────────────────── */
export async function imprimirPRE_A4(numero) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF || !numero) return;

  showToast('Generando PDF...', 'info');
  try {
    const pre = await dbGet(db, 'presupuestos', numero);
    if (!pre) { showToast('❌ No encontrado: ' + numero, 'error'); return; }

    const cfg           = await cargarDatosEmpresa();
    const doc           = new jsPDF({ unit: 'mm', format: 'a4' });
    const { W, margin } = PDF_A4;

    const estadoLabel = { pendiente: 'PRESUPUESTO', aprobado: 'APROBADO', rechazado: 'RECHAZADO' }[pre.estado]
      || pre.estado?.toUpperCase() || 'PRESUPUESTO';
    const headerOpts  = { cfg, tituloDoc: estadoLabel, numero: pre.numero, fechaIso: pre.fecha };
    const pageState   = { page: 1, total: 1, cfg, headerOpts };

    let y = pdfHeaderA4(doc, headerOpts);

    y = pdfDatosCliente(doc, y, {
      nombre:    pre.cliente_nombre,
      cuit:      pre.cliente_cuit,
      telefono:  pre.cliente_telefono,
      direccion: pre.cliente_direccion,
      ciudad:    pre.cliente_ciudad,
      provincia: pre.cliente_provincia
    });
    y += 2;

    /* Servicio */
    y = pdfSectionBanner(doc, y, 'SERVICIO SOLICITADO');
    doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);
    y = pdfLineaCampo(doc, y, 'Tipo', pre.tipo_servicio || '—');
    if (pre.equipo_modelo) y = pdfLineaCampo(doc, y, 'Equipo', pre.equipo_modelo);
    y += 2;

    /* Descripción */
    if (pre.descripcion) {
      y = pdfSectionBanner(doc, y, 'DESCRIPCIÓN DEL SERVICIO');
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_A4.texto);
      for (const line of pre.descripcion.split('\n')) {
        if (!line.trim()) continue;
        y = pdfCheckSpace(doc, y, 6, pageState);
        doc.text('• ' + pdfSanitize(line.trim()), margin + 2, y); y += 5;
      }
      y += 2;
    }

    /* Trabajo presupuestado */
    if (pre.trabajo_items?.length) {
      y = pdfCheckSpace(doc, y, 20, pageState);
      y = pdfSectionBanner(doc, y, 'TRABAJO PRESUPUESTADO');
      y = pdfTablaItems(doc, y, pre.trabajo_items, pageState);
      y += 2;
    }

    /* Materiales */
    if (pre.materiales_items?.length) {
      y = pdfCheckSpace(doc, y, 20, pageState);
      y = pdfSectionBanner(doc, y, 'MATERIALES');
      y = pdfTablaItems(doc, y, pre.materiales_items, pageState);
      y += 2;
    }

    /* Totales */
    y = pdfCheckSpace(doc, y, 40, pageState);
    y = pdfSectionBanner(doc, y, 'TOTALES');
    doc.setFontSize(9); doc.setTextColor(...PDF_A4.texto);

    const mo   = parseFloat(pre.mano_obra) || 0;
    const via  = parseFloat(pre.viatico)   || 0;
    const tot  = parseFloat(pre.total)     || 0;
    const desc = parseFloat(pre.descuento_pct) || 0;

    if (mo  > 0) y = pdfLineaCampo(doc, y, 'Mano de obra', pesos(mo));
    if (via > 0) y = pdfLineaCampo(doc, y, 'Viatico',      pesos(via));
    if (desc > 0) {
      const sinDesc = tot / (1 - desc / 100);
      y = pdfLineaCampo(doc, y, 'Subtotal sin descuento', pesos(sinDesc));
      y = pdfLineaCampo(doc, y, 'Descuento aplicado', '-' + desc + '%');
    }
    y += 2;
    y = pdfMontoBox(doc, margin, y, W - 2 * margin, 'TOTAL PRESUPUESTADO', tot, { h: 14, fontMonto: 18 });
    y += 4;

    /* Condiciones de validez / garantía */
    const cond = [];
    if (pre.garantia) {
      const gVal = String(pre.garantia).trim();
      cond.push('Garantia: ' + (/^\d+$/.test(gVal) ? gVal + ' dias' : gVal));
    }
    if (pre.tiempo_estimado) cond.push('Tiempo estimado: ' + pdfSanitize(pre.tiempo_estimado));
    if (pre.vigencia_dias)   cond.push('Validez: ' + pre.vigencia_dias + ' dias');
    if (cond.length) {
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_A4.texto2);
      doc.setFont('helvetica', 'normal');
      doc.text(cond.join('    |    '), margin, y); y += 6;
    }

    y = pdfDatosPago(doc, y, cfg);

    /* Firmas */
    y += 8;
    y = pdfCheckSpace(doc, y, 20, pageState);
    pdfBloqueFirmas(doc, y, cfg);
    pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });

    doc.save(`PRE-${pre.numero}.pdf`);
    await logEvent(db, { type: 'PDF_GENERATED', message: 'PRE A4: ' + numero, ref: numero });
    showToast('✅ PDF generado', 'success');

  } catch(e) {
    console.error('[imprimirPRE_A4]', e);
    showToast('❌ Error: ' + e.message, 'error');
  }
}

/* ── imprimirPRE_ListaMateriales ─────────────────────────── */
export async function imprimirPRE_ListaMateriales(numero) {
  const db = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF || !numero) return;

  showToast('Generando PDF...', 'info');
  try {
    const pre = await dbGet(db, 'presupuestos', numero);
    if (!pre) { showToast('❌ No encontrado: ' + numero, 'error'); return; }

    const items = pre.materiales_cliente || [];
    if (!items.length) { showToast('Sin materiales del cliente', 'warn'); return; }

    const cfg           = await cargarDatosEmpresa();
    const doc           = new jsPDF({ unit: 'mm', format: 'a4' });
    const { margin }    = PDF_A4;

    const headerOpts = { cfg, tituloDoc: 'LISTA DE MATERIALES', numero: pre.numero, fechaIso: pre.fecha };
    const pageState  = { page: 1, total: 1, cfg, headerOpts };

    let y = pdfHeaderA4(doc, headerOpts);

    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_A4.texto);
    doc.text(pdfSanitize(`Cliente: ${pre.cliente_nombre || '—'}`), margin, y); y += 6;
    doc.text('Los siguientes materiales deben ser provistos por el cliente para realizar el trabajo.', margin, y);
    y += 8;

    y = pdfSectionBanner(doc, y, 'MATERIALES A PROVEER');
    y = pdfTablaItems(doc, y, items, pageState);

    pdfPieA4(doc, { cfg, pageNum: 1, totalPages: 1 });
    doc.save(`MatCliente-${pre.numero}.pdf`);
    showToast('✅ PDF generado', 'success');

  } catch(e) {
    console.error('[imprimirPRE_ListaMateriales]', e);
    showToast('❌ Error: ' + e.message, 'error');
  }
}
