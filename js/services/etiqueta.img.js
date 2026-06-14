/**
 * ELECTROMEL — services/etiqueta.img.js
 * Genera la ETIQUETA y el TICKET como IMAGEN PNG en blanco y negro,
 * y abre el diálogo de impresión directo.
 *
 * Motivo: las impresoras térmicas toman mejor una imagen B/N que un PDF.
 * Todo se dibuja en canvas con negro puro sobre blanco (sin grises).
 */

import { store } from '../core/store.js';
import { dbGet, getCfg, logEvent } from '../core/db.js';
import { showToast } from '../core/ui.js';
import { cargarDatosEmpresa } from './pdf/base.js';
import { fmtFechaCorta } from '../core/utils.js';

/* Factor de resolución: más alto = más nítido en la térmica */
const DPI = 8;   // px por mm aprox

/* ── Dibujar QR en un canvas dado ───────────────────────── */
function _dibujarQR(ctx, texto, x, y, size) {
  if (!window.qrcode) return false;
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const cells = qr.getModuleCount();
    const cell = size / cells;
    ctx.fillStyle = '#000';
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
    return true;
  } catch (e) { console.warn('[QR img]', e); return false; }
}

/* ── Enviar una imagen (dataURL) a impresión ────────────── */
function _imprimirImagen(dataUrl, titulo) {
  const win = window.open('', '_blank');
  if (!win) {
    showToast('Permití las ventanas emergentes para imprimir', 'warn');
    return;
  }
  win.document.write(`
    <html><head><title>${titulo}</title>
    <style>
      @media print { @page { margin: 0; } body { margin: 0; } }
      body { display:flex; justify-content:center; align-items:flex-start; background:#fff; margin:0; }
      img { max-width:100%; image-rendering:pixelated; }
    </style></head>
    <body><img src="${dataUrl}" onload="setTimeout(function(){window.print();}, 200);"></body>
    </html>`);
  win.document.close();
}

/* ── ETIQUETA como imagen (70 × 40 mm) ──────────────────── */
export async function etiquetaImagenING(numero) {
  const db = store.get('db');
  numero = numero || store.get('ing.guardadoId');
  if (!numero) { showToast('⚠️ Sin ingreso', 'warn'); return; }

  showToast('Generando etiqueta...', 'info');
  try {
    const ing = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado', 'error'); return; }
    const cfg = await cargarDatosEmpresa();

    const Wmm = 70, Hmm = 40;
    const W = Wmm * DPI, H = Hmm * DPI;
    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d');

    /* Fondo blanco */
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';

    /* Borde */
    ctx.lineWidth = 2; ctx.strokeStyle = '#000';
    ctx.strokeRect(DPI, DPI, W - 2 * DPI, H - 2 * DPI);

    /* Header negro con nombre empresa */
    const headH = 7 * DPI;
    ctx.fillStyle = '#000';
    ctx.fillRect(DPI, DPI, W - 2 * DPI, headH);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${5 * DPI}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((cfg.empresa_nombre || 'ELECTROMEL').toUpperCase(), W / 2, DPI + headH / 2);

    /* QR a la ficha (deep-link) */
    const baseUrl = (location.origin + location.pathname).replace(/index\.html$/, '');
    const fichaUrl = baseUrl + '#equipo=' + (ing.numero || '');
    const qrSize = 26 * DPI;
    const qrX = W - qrSize - 2 * DPI;
    const qrY = headH + 2 * DPI;
    _dibujarQR(ctx, fichaUrl, qrX, qrY, qrSize);
    ctx.fillStyle = '#000';
    ctx.font = `${2.6 * DPI}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('Escaneá: ficha', qrX + qrSize / 2, qrY + qrSize + 2.5 * DPI);

    /* Info izquierda */
    const infoX = 3 * DPI;
    let y = headH + 4 * DPI;
    ctx.textAlign = 'left'; ctx.fillStyle = '#000';

    ctx.font = `bold ${6.5 * DPI}px monospace`;
    ctx.fillText(ing.numero, infoX, y); y += 6 * DPI;

    ctx.font = `${3.4 * DPI}px Arial`;
    ctx.fillText(fmtFechaCorta(ing.fecha), infoX, y); y += 4.5 * DPI;

    ctx.font = `bold ${3.4 * DPI}px Arial`;
    ctx.fillText('Cliente: ', infoX, y);
    const cliW = ctx.measureText('Cliente: ').width;
    ctx.font = `${3.4 * DPI}px Arial`;
    ctx.fillText(_recortar(ctx, ing.cliente_nombre || '—', qrX - infoX - cliW - DPI), infoX + cliW, y);
    y += 4.5 * DPI;

    if (ing.cliente_telefono) {
      ctx.font = `bold ${3.4 * DPI}px Arial`;
      ctx.fillText('Tel: ', infoX, y);
      const telW = ctx.measureText('Tel: ').width;
      ctx.font = `${3.4 * DPI}px Arial`;
      ctx.fillText(ing.cliente_telefono, infoX + telW, y);
      y += 4.5 * DPI;
    }

    ctx.font = `bold ${3.4 * DPI}px Arial`;
    ctx.fillText('Equipo: ', infoX, y);
    const eqW = ctx.measureText('Equipo: ').width;
    ctx.font = `${3.4 * DPI}px Arial`;
    ctx.fillText(_recortar(ctx, ing.equipo_tipo || '', qrX - infoX - eqW - DPI), infoX + eqW, y);
    y += 4.5 * DPI;

    const mm = [ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ');
    if (mm) {
      ctx.fillText(_recortar(ctx, mm, qrX - infoX - DPI), infoX, y);
    }

    _imprimirImagen(cvs.toDataURL('image/png'), 'Etiqueta ' + numero);
    await logEvent(db, { type: 'IMG_GENERATED', message: 'ING etiqueta img: ' + numero, ref: numero }).catch(()=>{});
    showToast('🏷️ Etiqueta lista para imprimir', 'success');
  } catch (err) {
    console.error('[etiquetaImagenING]', err);
    showToast('❌ Error al generar etiqueta', 'error');
  }
}

/* ── TICKET como imagen (57 mm de ancho) ────────────────── */
export async function ticketImagenING(numero) {
  const db = store.get('db');
  numero = numero || store.get('ing.guardadoId');
  if (!numero) { showToast('⚠️ Sin ingreso', 'warn'); return; }

  showToast('Generando ticket...', 'info');
  try {
    const ing = await dbGet(db, 'ingresos', numero);
    if (!ing) { showToast('❌ No encontrado', 'error'); return; }
    const cfg = await cargarDatosEmpresa();

    const Wmm = 57;
    const W = Wmm * DPI;
    const pad = 3 * DPI;
    /* Altura dinámica: se calcula según el contenido */
    const lineas = [];
    const push = (txt, opts = {}) => lineas.push({ txt, ...opts });

    push((cfg.empresa_nombre || 'ELECTROMEL').toUpperCase(), { size: 5, bold: true, center: true });
    if (cfg.empresa_telefono) push(cfg.empresa_telefono, { size: 3, center: true });
    push('────────────────', { size: 3, center: true });
    push('COMPROBANTE DE INGRESO', { size: 3.4, bold: true, center: true });
    push(ing.numero, { size: 5, bold: true, center: true, mono: true });
    push(fmtFechaCorta(ing.fecha), { size: 3, center: true });
    push('────────────────', { size: 3, center: true });
    push('Cliente: ' + (ing.cliente_nombre || '—'), { size: 3.4 });
    if (ing.cliente_telefono) push('Tel: ' + ing.cliente_telefono, { size: 3.4 });
    push('', { size: 1.5 });
    push('Equipo: ' + (ing.equipo_tipo || ''), { size: 3.4, bold: true });
    const mm = [ing.equipo_marca, ing.equipo_modelo].filter(Boolean).join(' ');
    if (mm) push(mm, { size: 3.4 });
    if (ing.equipo_falla) {
      push('Falla declarada:', { size: 3.4, bold: true });
      push(ing.equipo_falla, { size: 3.2, wrap: true });
    }
    push('────────────────', { size: 3, center: true });
    push('Conservá este comprobante', { size: 2.8, center: true });
    push('para retirar tu equipo', { size: 2.8, center: true });

    /* Calcular altura total */
    const ctxM = document.createElement('canvas').getContext('2d');
    let totalH = pad * 2;
    const lineHeights = lineas.map(l => {
      const sz = (l.size || 3.4) * DPI;
      ctxM.font = `${sz}px Arial`;
      if (l.wrap) {
        const wrapped = _wrapText(ctxM, l.txt, W - pad * 2);
        return { ...l, wrapped, h: wrapped.length * (sz * 1.3) };
      }
      return { ...l, h: sz * 1.4 };
    });
    totalH += lineHeights.reduce((a, l) => a + l.h, 0);

    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = Math.ceil(totalH);
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cvs.height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';

    let y = pad;
    for (const l of lineHeights) {
      const sz = (l.size || 3.4) * DPI;
      ctx.font = `${l.bold ? 'bold ' : ''}${sz}px ${l.mono ? 'monospace' : 'Arial'}`;
      ctx.textAlign = l.center ? 'center' : 'left';
      const x = l.center ? W / 2 : pad;
      if (l.wrap && l.wrapped) {
        for (const wl of l.wrapped) { ctx.fillText(wl, x, y); y += sz * 1.3; }
      } else {
        ctx.fillText(l.txt, x, y); y += l.h;
      }
    }

    _imprimirImagen(cvs.toDataURL('image/png'), 'Ticket ' + numero);
    await logEvent(db, { type: 'IMG_GENERATED', message: 'ING ticket img: ' + numero, ref: numero }).catch(()=>{});
    showToast('🧾 Ticket listo para imprimir', 'success');
  } catch (err) {
    console.error('[ticketImagenING]', err);
    showToast('❌ Error al generar ticket', 'error');
  }
}

/* ── Helpers ────────────────────────────────────────────── */
function _recortar(ctx, txt, maxW) {
  txt = String(txt || '');
  if (ctx.measureText(txt).width <= maxW) return txt;
  while (txt.length > 1 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
  return txt + '…';
}

function _wrapText(ctx, txt, maxW) {
  const palabras = String(txt || '').split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? actual + ' ' + p : p;
    if (ctx.measureText(prueba).width > maxW && actual) {
      lineas.push(actual); actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}
