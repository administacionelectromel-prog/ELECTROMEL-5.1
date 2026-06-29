/**
 * ELECTROMEL — services/pdf/recibo.pdf.js
 * Recibo de pago:
 *   - Modal de captura de datos
 *   - Generador PDF con diseño oscuro industrial
 *   - Contador correlativo persistido en IndexedDB
 */

import { store }          from '../../core/store.js';
import { dbGet, dbPut }   from '../../core/db.js';
import { showToast }      from '../../core/ui.js';
import { pesos, numeroALetras, pdfSanitize } from '../../core/utils.js';
import { getJsPDF }       from './base.js';

/* ═══════════════════════════════════════════════════════════
   MODAL DE CAPTURA
   ═══════════════════════════════════════════════════════════ */
export function abrirModalRecibo(numero, tipo) {
  let m = document.getElementById('modal-recibo');
  if (!m) { m = _crearModal(); document.body.appendChild(m); }
  _cargarDatos(numero, tipo);
  m.classList.add('active');
}

function _crearModal() {
  const m = document.createElement('div');
  m.id = 'modal-recibo'; m.className = 'modal';
  m.innerHTML = `
    <div class="modal-header">
      <button class="modal-close" type="button"
        onclick="document.getElementById('modal-recibo').classList.remove('active')">×</button>
      <div class="modal-title">🧾 Recibo de Pago</div>
    </div>
    <div class="modal-body">
      <div class="field">
        <label class="field-label">N° de Recibo</label>
        <input type="text" id="recibo-numero" placeholder="R-0001">
      </div>
      <div class="field">
        <label class="field-label">Fecha</label>
        <input type="date" id="recibo-fecha">
      </div>
      <div class="field">
        <label class="field-label">Recibí de</label>
        <input type="text" id="recibo-cliente" placeholder="Nombre del cliente">
      </div>
      <div class="field">
        <label class="field-label">La suma de $ (monto)</label>
        <input type="number" id="recibo-monto" placeholder="0.00" min="0" step="0.01"
          oninput="window._recalcReciboLetras()">
      </div>
      <div class="field">
        <label class="field-label">En concepto de</label>
        <textarea id="recibo-concepto" rows="2" placeholder="Reparación de soldadora inverter..."></textarea>
      </div>
      <div class="field">
        <label class="field-label">Forma de pago</label>
        <select id="recibo-metodo">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia bancaria">Transferencia bancaria</option>
          <option value="Tarjeta de débito">Tarjeta de débito</option>
          <option value="Tarjeta de crédito">Tarjeta de crédito</option>
          <option value="Mercado Pago">Mercado Pago</option>
          <option value="Cheque">Cheque</option>
        </select>
      </div>
      <div class="card" style="background:var(--surface-2);border-color:var(--acento);">
        <div class="dim txt-sm" style="margin-bottom:4px;">Monto en letras:</div>
        <div id="recibo-letras" class="bold" style="font-size:12px;">—</div>
      </div>
      <div class="field">
        <label class="field-label">Observaciones (opcional)</label>
        <input type="text" id="recibo-obs" placeholder="Anticipo / Saldo total / etc.">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" type="button"
        onclick="document.getElementById('modal-recibo').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" type="button"
        onclick="window._generarReciboImpreso()">🖨️ Generar PDF</button>
    </div>`;
  return m;
}

async function _cargarDatos(numero, tipo) {
  const db = store.get('db');
  if (!db) return;
  try {
    const storeMap = { ING: 'ingresos', OTT: 'ordenes', OTE: 'exteriors', PRE: 'presupuestos' };
    const reg = numero ? await dbGet(db, storeMap[tipo] || 'ordenes', numero) : null;

    const hoy = new Date().toISOString().slice(0, 10);
    const s   = (id, v) => { const e = document.getElementById(id); if (e && v) e.value = v; };

    s('recibo-fecha',   hoy);
    if (reg) {
      s('recibo-cliente',  reg.cliente_nombre);
      if (reg.total) {
        s('recibo-monto', reg.total);
        window._recalcReciboLetras?.();
      }
      const desc   = reg.equipo_tipo || reg.tipo_servicio || '';
      const modelo = reg.equipo_modelo || reg.equipo_marca || '';
      s('recibo-concepto', `Servicio técnico: ${desc}${modelo ? ' ' + modelo : ''} (${numero || ''})`.trim());
    }
    await _autoNro();
  } catch(e) { console.warn('[_cargarDatos recibo]', e); }
}

async function _autoNro() {
  const db = store.get('db');
  if (!db) return;
  try {
    const rec = await dbGet(db, 'config', 'counter_RECIBO');
    const n   = (rec?.value || 0) + 1;
    const el  = document.getElementById('recibo-numero');
    if (el) el.value = 'R-' + String(n).padStart(4, '0');
  } catch(e) {}
}

/* Expuestas en window para onclick/oninput inline */
window._recalcReciboLetras = function() {
  const el  = document.getElementById('recibo-monto');
  const out = document.getElementById('recibo-letras');
  if (!el || !out) return;
  const n = parseFloat(el.value) || 0;
  if (n === 0) { out.textContent = '—'; return; }
  const entero   = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let txt = numeroALetras(entero).toUpperCase();
  if (centavos > 0) txt += ' CON ' + String(centavos).padStart(2, '0') + '/100';
  out.textContent = txt + ' PESOS';
};

/* ═══════════════════════════════════════════════════════════
   GENERADOR PDF
   ═══════════════════════════════════════════════════════════ */
window._generarReciboImpreso = async function() {
  const db    = store.get('db');
  const jsPDF = getJsPDF();
  if (!jsPDF) return;

  const nroRecibo = document.getElementById('recibo-numero')?.value?.trim()    || 'S/N';
  const fecha     = document.getElementById('recibo-fecha')?.value             || new Date().toISOString().slice(0, 10);
  const cliente   = document.getElementById('recibo-cliente')?.value?.trim()   || '—';
  const montoNum  = parseFloat(document.getElementById('recibo-monto')?.value) || 0;
  const concepto  = document.getElementById('recibo-concepto')?.value?.trim()  || '—';
  const metodo    = document.getElementById('recibo-metodo')?.value            || 'Efectivo';
  const obs       = document.getElementById('recibo-obs')?.value?.trim()       || '';
  const letras    = document.getElementById('recibo-letras')?.textContent      || '';

  if (montoNum <= 0) { showToast('⚠️ Ingresá un monto válido', 'warn'); return; }

  const cfg = await _leerEmpresa(db);

  /* Incrementar contador */
  try {
    const rec = await dbGet(db, 'config', 'counter_RECIBO');
    await dbPut(db, 'config', { key: 'counter_RECIBO', value: (rec?.value || 0) + 1 });
  } catch(e) {}

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 14;

  /* Header oscuro */
  doc.setFillColor(45, 45, 45); doc.rect(0, 0, W, 45, 'F');
  doc.setFillColor(232, 160, 32); doc.rect(0, 0, 3, 45, 'F');

  if (cfg.logo) { try { doc.addImage(cfg.logo, 'JPEG', 8, 5, 32, 32); } catch(e) {} }

  doc.setTextColor(232, 160, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(pdfSanitize(cfg.nombre || 'ELECTROMEL'), 46, 13);

  doc.setTextColor(200, 200, 200); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSanitize(cfg.sub || ''), 46, 19);

  doc.setFontSize(7.5); doc.setTextColor(170, 170, 170);
  let yE = 24;
  if (cfg.cuit) { doc.text('CUIT: ' + cfg.cuit, 46, yE); yE += 4; }
  if (cfg.iibb) { doc.text('IIIB: ' + cfg.iibb, 46, yE); yE += 4; }
  if (cfg.iva)  { doc.text('Cond. IVA: ' + cfg.iva, 46, yE); }

  doc.setTextColor(200, 200, 200);
  let yR = 13;
  if (cfg.tel)       { doc.text('Tel: ' + pdfSanitize(cfg.tel),                                         W - margin, yR, { align: 'right' }); yR += 4; }
  if (cfg.email)     { doc.text(pdfSanitize(cfg.email),                                                   W - margin, yR, { align: 'right' }); yR += 4; }
  if (cfg.domicilio) { doc.text(pdfSanitize(cfg.domicilio + (cfg.ciudad ? ', ' + cfg.ciudad : '')),       W - margin, yR, { align: 'right' }); }

  /* Banda título */
  doc.setFillColor(232, 160, 32); doc.rect(0, 45, W, 12, 'F');
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('RECIBO DE PAGO', W / 2, 53, { align: 'center' });

  /* N° y fecha */
  doc.setFillColor(28, 28, 28); doc.rect(0, 57, W, 9, 'F');
  doc.setTextColor(232, 160, 32); doc.setFont('courier', 'bold'); doc.setFontSize(11);
  doc.text(pdfSanitize(nroRecibo), margin, 63);
  doc.setTextColor(200, 200, 200); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Fecha: ' + _fmtFecha(fecha), W - margin, 63, { align: 'right' });

  /* Cuerpo */
  let y = 75;
  const lineH = 7.5;
  doc.setTextColor(40, 40, 40); doc.setFontSize(9.5);

  const linea = (label, valor, bold = false) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(pdfSanitize(label) + ':', margin, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(pdfSanitize(String(valor || '—')), W - margin - 44);
    doc.text(lines, margin + 44, y);
    y += Math.max(lineH, lines.length * 5.5);
  };

  linea('Recibí de', cliente);
  y += 2;

  /* Caja de monto dorada */
  doc.setFillColor(232, 160, 32);
  doc.roundedRect(margin, y, W - margin * 2, 16, 2, 2, 'F');
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);  doc.text('LA SUMA DE:', margin + 4, y + 6.5);
  doc.setFontSize(16); doc.text(pesos(montoNum), W - margin - 4, y + 11, { align: 'right' });
  y += 21;

  linea('Son pesos',       letras,   true);  y += 2;
  linea('En concepto de',  concepto);         y += 2;
  linea('Forma de pago',   metodo);
  if (obs) { y += 2; linea('Observaciones', obs); }

  /* Separador */
  y += 8;
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.4);
  doc.line(margin, y, W - margin, y);

  /* Firmas */
  y += 18;
  const midW = W / 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(80, 80, 80); doc.setDrawColor(100, 100, 100);
  doc.line(margin,     y, midW - 8,  y);
  doc.line(midW + 8,   y, W - margin, y);
  doc.text('Firma del cliente / Aclaración',               margin,   y + 5);
  doc.text(pdfSanitize(cfg.tecnico || cfg.nombre || 'ELECTROMEL'), midW + 8, y + 5);
  doc.setFontSize(8);
  doc.text('Firma del responsable', midW + 8, y + 9);

  /* Pie */
  doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'italic');
  doc.text('Este recibo es válido como comprobante de pago.', W / 2, 289, { align: 'center' });

  doc.save(`Recibo-${nroRecibo.replace(/\//g, '-')}.pdf`);
  document.getElementById('modal-recibo')?.classList.remove('active');
  showToast('✅ Recibo generado', 'success');
};

/* ── Helpers privados ───────────────────────────────────── */
async function _leerEmpresa(db) {
  const keys = [
    'empresa_nombre','empresa_sub','empresa_cuit','empresa_iibb',
    'empresa_domicilio','empresa_ciudad','empresa_tel','empresa_email',
    'empresa_iva','tecnico_nombre','empresa_logo'
  ];
  const vals = await Promise.all(keys.map(k => dbGet(db, 'config', k)));
  const o = {};
  keys.forEach((k, i) => {
    const simple = k.replace('empresa_','').replace('tecnico_','');
    const raw    = vals[i];
    o[simple]    = raw ? (raw.value !== undefined ? raw.value : raw) : '';
  });
  return o;
}

function _fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
