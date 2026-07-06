/**
 * ELECTROMEL — services/pdf/helpers.js
 * Helpers de dibujo jsPDF reutilizables por todos los generadores.
 * Funciones puras sobre el objeto doc — sin acceso a DB ni store.
 */

import { PDF_A4 }              from './base.js';
import { pesos, fmtFechaCorta, fmtHora, pdfSanitize } from '../../core/utils.js';

/* ═══════════════════════════════════════════════════════════
   ENCABEZADO A4
   ═══════════════════════════════════════════════════════════ */

/**
 * pdfHeaderA4(doc, opts) → y
 * Dibuja logo, datos empresa, separador dorado, título + número.
 * opts: { cfg, tituloDoc, numero, numeroSecundario?, numeroSecundarioLabel?, fechaIso? }
 */
export function pdfHeaderA4(doc, opts) {
  const { W, margin, acento, texto, texto2, separador } = PDF_A4;
  const cfg  = opts.cfg || {};
  const yTop = 10;

  /* Logo */
  const logoSize = 24;
  try {
    if (cfg.logo && cfg.logo.length > 100) {
      const ext = cfg.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(cfg.logo, ext, margin, yTop, logoSize, logoSize);
    }
  } catch(e) { console.warn('[pdf] logo:', e); }

  /* Bloque empresa centrado a la derecha del logo */
  const textXLeft   = margin + logoSize + 5;
  const textXRight  = W - margin;
  const textXCenter = (textXLeft + textXRight) / 2;

  doc.setTextColor(...acento);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(pdfSanitize(cfg.empresa_nombre || 'ELECTROMEL'), textXCenter, yTop + 7, { align: 'center' });

  doc.setTextColor(...texto2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (cfg.empresa_sub) doc.text(pdfSanitize(cfg.empresa_sub), textXCenter, yTop + 12, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...texto);
  let yInfo = yTop + 17;

  const fiscal = [];
  if (cfg.empresa_cuit) fiscal.push('CUIT: ' + cfg.empresa_cuit);
  if (cfg.empresa_iibb) fiscal.push('IIIB: ' + cfg.empresa_iibb);
  if (cfg.empresa_iva)  fiscal.push(cfg.empresa_iva);
  if (fiscal.length) { doc.text(fiscal.join('  |  '), textXCenter, yInfo, { align: 'center' }); yInfo += 4; }

  const dom = [cfg.empresa_domicilio, cfg.empresa_ciudad].filter(Boolean).join(', ');
  if (dom) { doc.text(pdfSanitize(dom), textXCenter, yInfo, { align: 'center' }); yInfo += 4; }

  const contacto = [];
  if (cfg.empresa_tel)   contacto.push('Tel: ' + cfg.empresa_tel);
  if (cfg.empresa_email) contacto.push(cfg.empresa_email);
  if (contacto.length) { doc.text(pdfSanitize(contacto.join('  |  ')), textXCenter, yInfo, { align: 'center' }); yInfo += 4; }

  /* Separador dorado */
  const ySep = Math.max(yTop + logoSize, yInfo) + 4;
  doc.setDrawColor(...separador);
  doc.setLineWidth(0.8);
  doc.line(margin, ySep, W - margin, ySep);
  doc.setLineWidth(0.2);

  /* Título del documento */
  let yTitle = ySep + 8;
  doc.setTextColor(...texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  let tituloLinea = (opts.tituloDoc || 'DOCUMENTO') + '  N°:  ' + (opts.numero || '—');
  if (opts.numeroSecundario && opts.numeroSecundarioLabel) {
    tituloLinea += '    ' + opts.numeroSecundarioLabel + ' ' + opts.numeroSecundario;
  }
  doc.text(pdfSanitize(tituloLinea), margin, yTitle);

  yTitle += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...texto2);
  const fechaIso = opts.fechaIso || new Date().toISOString().slice(0, 10);
  doc.text(`Fecha: ${fmtFechaCorta(fechaIso)}    Hora: ${fmtHora(new Date())}`, margin, yTitle);

  return yTitle + 8;
}

/* ═══════════════════════════════════════════════════════════
   PIE DE PÁGINA
   ═══════════════════════════════════════════════════════════ */

/**
 * pdfPieA4(doc, opts)
 * Dibuja leyenda legal, "Gracias por confiar" y paginación.
 */
export function pdfPieA4(doc, opts = {}) {
  const { W, H, margin, pieH, acento, texto2, texto3, bannerLine } = PDF_A4;
  const cfg        = opts.cfg      || {};
  const pageNum    = opts.pageNum  || 1;
  const totalPages = opts.totalPages || 1;
  const yPie       = H - pieH;

  doc.setDrawColor(...bannerLine);
  doc.setLineWidth(0.3);
  doc.line(margin, yPie, W - margin, yPie);

  const leyenda = cfg.leyenda_legal ||
    'Los trabajos cuentan con garantía sobre el trabajo realizado. ' +
    'Pasados 30 días sin retirar el equipo se cobrará un recargo en concepto de almacenamiento. ' +
    'Pasados 120 días se considera abandono del equipo.';

  doc.setTextColor(...texto2);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  const lines = doc.splitTextToSize(pdfSanitize(leyenda), W - 2 * margin);
  doc.text(lines, W / 2, yPie + 4, { align: 'center' });

  doc.setTextColor(...acento);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('GRACIAS POR CONFIAR EN ELECTROMEL', W / 2, yPie + pieH - 5, { align: 'center' });

  doc.setTextColor(...texto3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Pag. ${pageNum} de ${totalPages}`, margin, yPie + pieH - 2);
  doc.text(`Emitido: ${new Date().toLocaleString('es-AR')}`, W - margin, yPie + pieH - 2, { align: 'right' });
}

/* ═══════════════════════════════════════════════════════════
   PAGINACIÓN AUTOMÁTICA
   ═══════════════════════════════════════════════════════════ */

/**
 * pdfCheckSpace(doc, y, needed, pageState) → y
 * Si no hay espacio, cierra la página y abre una nueva.
 * pageState: { page, total, cfg, headerOpts }
 */
export function pdfCheckSpace(doc, y, needed, pageState) {
  const yMax = PDF_A4.H - PDF_A4.pieH - 6;
  if (y + needed <= yMax) return y;
  pdfPieA4(doc, { cfg: pageState.cfg, pageNum: pageState.page, totalPages: pageState.total });
  doc.addPage();
  pageState.page++;
  return pdfHeaderA4(doc, pageState.headerOpts);
}

/* ═══════════════════════════════════════════════════════════
   SECCIÓN BANNER (banda gris + borde dorado)
   ═══════════════════════════════════════════════════════════ */
export function pdfSectionBanner(doc, y, titulo) {
  const { W, margin, banner, acento, texto } = PDF_A4;
  const h = 7;
  doc.setFillColor(...banner);
  doc.rect(margin, y, W - 2 * margin, h, 'F');
  doc.setFillColor(...acento);
  doc.rect(margin, y, 1.5, h, 'F');
  doc.setTextColor(...texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(pdfSanitize(titulo), margin + 4, y + 5);
  return y + h + 3;
}

/* ═══════════════════════════════════════════════════════════
   CAJA DE MONTO DESTACADA
   ═══════════════════════════════════════════════════════════ */
export function pdfMontoBox(doc, x, y, w, label, monto, opts = {}) {
  const h        = opts.h        || 14;
  const bg       = opts.bg       || PDF_A4.acento;
  const colLabel = opts.color    || [60, 40, 0];
  const colMonto = opts.color    || [30, 20, 0];
  const fontSize = opts.fontMonto || 16;

  doc.setFillColor(...bg);
  doc.rect(x, y, w, h, 'F');
  doc.setTextColor(...colLabel);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfSanitize(label), x + 3, y + 5);
  doc.setTextColor(...colMonto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text(pesos(monto), x + w - 3, y + h - 3, { align: 'right' });
  return y + h;
}

/* ═══════════════════════════════════════════════════════════
   BLOQUE DE FIRMAS
   ═══════════════════════════════════════════════════════════ */
export function pdfBloqueFirmas(doc, y, cfg) {
  const { W, margin, texto, texto2 } = PDF_A4;
  const half = (W - 2 * margin - 6) / 2;

  doc.setDrawColor(...texto2);
  doc.setLineWidth(0.3);
  doc.line(margin,            y, margin + half,            y);
  doc.line(margin + half + 6, y, W - margin,               y);

  doc.setTextColor(...texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Firma cliente / Aclaración', margin + half / 2,            y + 4, { align: 'center' });
  doc.text(
    pdfSanitize((cfg.tecnico_nombre || 'Mauro Ezequiel Luque') + ' — ' + (cfg.tecnico_titulo || 'Técnico Electromecánico')),
    margin + half + 6 + half / 2, y + 4, { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...texto2);
  doc.text('Fecha:  /  /',         margin + half / 2,            y + 9, { align: 'center' });
  doc.text('Técnico responsable',  margin + half + 6 + half / 2, y + 9, { align: 'center' });

  return y + 14;
}

/* ═══════════════════════════════════════════════════════════
   DATOS DEL CLIENTE
   ═══════════════════════════════════════════════════════════ */
export function pdfDatosCliente(doc, y, data = {}) {
  const { W, margin, texto } = PDF_A4;
  const LABEL_W = 44;

  y = pdfSectionBanner(doc, y, 'DATOS DEL CLIENTE');
  doc.setTextColor(...texto);
  doc.setFontSize(9);

  /* Nombre + CUIT en la misma línea */
  doc.setFont('helvetica', 'bold');
  doc.text(pdfSanitize('Cliente / Razon Social') + ':', margin, y);
  doc.setFont('helvetica', 'normal');
  const nomLines = doc.splitTextToSize(pdfSanitize(String(data.nombre || '—')), W - margin - LABEL_W - margin);
  doc.text(nomLines, margin + LABEL_W, y);
  if (data.cuit) {
    const xR = margin + 120;
    doc.setFont('helvetica', 'bold');   doc.text('CUIT/DNI:', xR, y);
    doc.setFont('helvetica', 'normal'); doc.text(pdfSanitize(String(data.cuit)), xR + 22, y);
  }
  y += 5;

  /* Dirección */
  const dirParts = [data.direccion, data.ciudad, data.provincia, data.cp ? 'CP ' + data.cp : '']
    .map(v => pdfSanitize(v || '')).filter(Boolean);
  doc.setFont('helvetica', 'bold');
  doc.text('Direccion:', margin, y);
  doc.setFont('helvetica', 'normal');
  const dirLines = doc.splitTextToSize(dirParts.join(', ') || '—', W - margin - LABEL_W - margin);
  doc.text(dirLines, margin + LABEL_W, y);
  y += Math.max(5, dirLines.length * 4.5);

  /* Teléfono */
  if (data.telefono) {
    doc.setFont('helvetica', 'bold');
    doc.text('Tel:', margin, y);
    doc.setFont('helvetica', 'normal');
    const telFmt = String(data.telefono).replace(/(\d{3,4})(\d{4})(\d{4})/, '$1 $2 $3');
    doc.text(pdfSanitize(telFmt), margin + LABEL_W, y);
    y += 5;
  }

  return y + 1;
}

/* ═══════════════════════════════════════════════════════════
   LÍNEA CAMPO — label: valor
   ═══════════════════════════════════════════════════════════ */
export function pdfLineaCampo(doc, y, label, value, x) {
  x = x === undefined ? PDF_A4.margin : x;
  doc.setTextColor(...PDF_A4.texto);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfSanitize(label) + ':', x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfSanitize(String(value || '—')), x + doc.getTextWidth(pdfSanitize(label) + ': '), y);
  return y + 5;
}

/* Dos campos en el mismo renglón (col. izquierda y col. derecha).
   Si algún valor es muy largo y no entra, cae a una línea por campo. */
export function pdfLineaCampoDoble(doc, y, labelA, valueA, labelB, valueB) {
  const { W, margin } = PDF_A4;
  const colB   = margin + (W - 2 * margin) / 2 + 4; /* mitad de la página */
  const anchoA = colB - margin - 4;
  doc.setFontSize(9);

  const wA = doc.getTextWidth(pdfSanitize(labelA + ': ')) + doc.getTextWidth(pdfSanitize(String(valueA || '—')));
  const wB = doc.getTextWidth(pdfSanitize(labelB + ': ')) + doc.getTextWidth(pdfSanitize(String(valueB || '—')));

  /* Si la columna izquierda se pasa de su ancho, usar líneas separadas */
  if (wA > anchoA || (colB + wB) > (W - margin)) {
    let yy = pdfLineaCampo(doc, y, labelA, valueA);
    return pdfLineaCampo(doc, yy, labelB, valueB);
  }

  pdfLineaCampo(doc, y, labelA, valueA, margin);
  pdfLineaCampo(doc, y, labelB, valueB, colB);
  return y + 5;
}

/* ═══════════════════════════════════════════════════════════
   DATOS DE PAGO (banco / alias / CBU)
   ═══════════════════════════════════════════════════════════ */
export function pdfDatosPago(doc, y, cfg) {
  if (!cfg.banco && !cfg.alias && !cfg.cbu && !cfg.titular) return y;
  const { W, margin, texto } = PDF_A4;

  doc.setTextColor(...texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DATOS DE PAGO:', margin, y);

  doc.setFont('helvetica', 'normal');
  const parts = [];
  if (cfg.titular) parts.push('Titular: ' + cfg.titular);
  if (cfg.banco) parts.push('Banco ' + cfg.banco);
  if (cfg.alias) parts.push('Alias: ' + cfg.alias);
  if (cfg.cbu)   parts.push('CBU: '   + cfg.cbu);

  const linea = parts.join('   |   ');
  if (doc.getTextWidth(pdfSanitize(linea)) < W - 2 * margin - 36) {
    doc.text(pdfSanitize(linea), margin + 34, y);
    return y + 6;
  }
  let yy = y;
  parts.forEach((p, i) => { doc.text(pdfSanitize(p), margin + (i === 0 ? 34 : 0), yy); yy += 4.5; });
  return yy + 2;
}

/* ═══════════════════════════════════════════════════════════
   CONDICIONES DE SERVICIO (con paginación automática)
   ═══════════════════════════════════════════════════════════ */
export function pdfCondiciones(doc, y, texto, cfg, pageState) {
  const { W, margin, H, pieH } = PDF_A4;
  const yMax = H - pieH - 6;

  y = pdfSectionBanner(doc, y, 'CONDICIONES DE SERVICIO');
  doc.setTextColor(...PDF_A4.texto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  for (const line of String(texto || '').split('\n')) {
    const l = line.trim();
    if (!l) { y += 2; continue; }
    for (const w of doc.splitTextToSize(l, W - 2 * margin - 4)) {
      if (y > yMax) {
        pdfPieA4(doc, { cfg, pageNum: pageState.page, totalPages: pageState.total });
        doc.addPage();
        pageState.page++;
        y = pdfHeaderA4(doc, pageState.headerOpts);
        y = pdfSectionBanner(doc, y, 'CONDICIONES DE SERVICIO (cont.)');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...PDF_A4.texto);
      }
      doc.text(w, margin + 2, y);
      y += 4.5;
    }
  }
  return y + 2;
}

/* ═══════════════════════════════════════════════════════════
   TABLA DE ITEMS (Cant / Detalle / P.Unit / Subtotal)
   ═══════════════════════════════════════════════════════════ */
export function pdfTablaItems(doc, y, items, pageState) {
  if (!items?.length) return y;

  const { W, margin, texto, banner, bannerLine } = PDF_A4;
  const colW  = { cant: 18, detalle: 95, precio: 30, subtotal: 30 };
  const rowH  = 6.5;
  const yMax  = PDF_A4.H - PDF_A4.pieH - 6;

  function _header(y) {
    doc.setFillColor(...banner);
    doc.rect(margin, y, W - 2 * margin, 7, 'F');
    doc.setTextColor(...texto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let x = margin + 2;
    doc.text('Cant.',    x, y + 5);                                x += colW.cant;
    doc.text('Detalle',  x, y + 5);                                x += colW.detalle;
    doc.text('P. Unit.', x, y + 5, { align: 'right' });
    doc.text('Subtotal', W - margin - 2, y + 5, { align: 'right' });
    return y + 9;
  }

  y = _header(y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  items.forEach((it, i) => {
    if (y + rowH > yMax) {
      pdfPieA4(doc, { cfg: pageState.cfg, pageNum: pageState.page, totalPages: pageState.total });
      doc.addPage();
      pageState.page++;
      y = pdfHeaderA4(doc, pageState.headerOpts);
      y = _header(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 1, W - 2 * margin, rowH, 'F');
    }

    doc.setTextColor(...texto);
    let x = margin + 2;
    doc.text(String(it.cantidad || ''),  x, y + 4);               x += colW.cant;
    const dLines = doc.splitTextToSize(pdfSanitize(it.detalle || ''), colW.detalle - 2);
    doc.text(dLines[0] || '', x, y + 4);                          x += colW.detalle;
    doc.text(pesos(it.precio   || 0), x + colW.precio,  y + 4, { align: 'right' });
    doc.text(pesos(it.subtotal || 0), W - margin - 2,   y + 4, { align: 'right' });
    y += rowH;
  });

  doc.setDrawColor(...bannerLine);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  doc.setLineWidth(0.2);

  return y + 3;
}

/* ═══════════════════════════════════════════════════════════
   BANDA DE GARANTÍA
   ═══════════════════════════════════════════════════════════ */
export function pdfGarantiaBanda(doc, y, garantia, tiempoEstimado) {
  if (!garantia && !tiempoEstimado) return y;
  const { W, margin } = PDF_A4;
  const h = 10;

  doc.setFillColor(40, 100, 60);
  doc.roundedRect(margin, y, W - 2 * margin, h, 2, 2, 'F');
  doc.setTextColor(220, 255, 220);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  const partes = [];
  if (garantia) {
    const gVal = String(garantia).trim();
    partes.push('GARANTIA: ' + (/^\d+$/.test(gVal) ? gVal + ' dias' : gVal).toUpperCase());
  }
  if (tiempoEstimado) {
    const tVal = pdfSanitize(String(tiempoEstimado));
    if (tVal) partes.push('ENTREGA: ' + tVal.toUpperCase());
  }

  doc.text(partes.join('        |        '), margin + (W - 2 * margin) / 2, y + 6.5, { align: 'center' });
  return y + h + 3;
}
