/**
 * ELECTROMEL — modules/panel/panel.alerts.js
 * Alertas de WhatsApp por antigüedad y card WA en detalle.
 */

import { escapeHtml, getLabelEstado, getDiasDesde } from '../../core/utils.js';
import { buildWhatsAppMessage, openWhatsApp, waCopiar } from '../../services/whatsapp.js';
import { estadoToWaKey } from '../../core/config.js';
import { TIPO_ICONOS, UMBRALES_WA, ESTADOS_RECORDATORIO, cargarTodos } from './panel.store.js';
import { abrirModalDetalle } from './panel.detail.js';

/* ═══════════════════════════════════════════════════════════
   CARD WHATSAPP — modal detalle
   ═══════════════════════════════════════════════════════════ */
export function buildCardWhatsApp(reg) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="card-title">💬 WhatsApp al cliente</div>';

  const waKey = estadoToWaKey(reg.estado || 'ingresado');
  const vars  = {
    cliente:  reg.cliente_nombre,
    equipo:   reg.equipo_tipo || reg.tipo_servicio || '',
    numero:   reg.numero,
    total:    parseFloat(reg.total) || 0,
    guia:     reg.encomienda_retorno_guia || reg.encomienda_guia || '',
    garantia: reg.garantia || ''
  };

  const preview = document.createElement('div');
  preview.style.cssText = 'font-size:12px;color:var(--texto-2);margin-bottom:8px;padding:8px;' +
    'background:var(--surface-2);border-radius:var(--r-sm);border:1px solid var(--borde);min-height:40px;';
  preview.textContent = 'Cargando…';
  card.appendChild(preview);
  buildWhatsAppMessage(waKey, vars).then(msg => { preview.textContent = msg || '(sin plantilla)'; });

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';

  const btnSend = document.createElement('button');
  btnSend.className = 'btn btn-success'; btnSend.style.flex = '1';
  btnSend.type = 'button'; btnSend.textContent = '📲 Enviar';
  btnSend.addEventListener('click', () => {
    if (!reg.cliente_telefono) { import('../../core/ui.js').then(m => m.showToast('⚠️ Sin teléfono', 'warn')); return; }
    const msg = preview.textContent;
    if (!msg || msg === 'Cargando…') buildWhatsAppMessage(waKey, vars).then(m => openWhatsApp(reg.cliente_telefono, m));
    else openWhatsApp(reg.cliente_telefono, msg);
  });

  const btnCopy = document.createElement('button');
  btnCopy.className = 'btn btn-ghost'; btnCopy.type = 'button'; btnCopy.title = 'Copiar'; btnCopy.textContent = '📋';
  btnCopy.addEventListener('click', () => {
    const msg = preview.textContent;
    if (msg && msg !== 'Cargando…') waCopiar(msg, false);
  });

  row.appendChild(btnSend); row.appendChild(btnCopy);
  card.appendChild(row);
  return card;
}

/* ═══════════════════════════════════════════════════════════
   BANNER + MODAL ALERTAS WA
   ═══════════════════════════════════════════════════════════ */
export async function calcularAlertasWA() {
  const { ESTADOS_FINALES } = await import('../../core/utils.js');
  const todos = await cargarTodos();
  const alertas = [];
  todos.forEach(r => {
    if (ESTADOS_FINALES?.has?.(r.estado)) return;
    if (!ESTADOS_RECORDATORIO.has(r.estado)) return;
    const dias = getDiasDesde(r.creado_at);
    if (dias < UMBRALES_WA[0]) return;
    let umbral = 0;
    for (let i = UMBRALES_WA.length - 1; i >= 0; i--) {
      if (dias >= UMBRALES_WA[i]) { umbral = UMBRALES_WA[i]; break; }
    }
    alertas.push({ registro: r, dias, umbral, abandono: dias > 120 });
  });
  alertas.sort((a, b) => b.dias - a.dias);
  return { alertas, total: alertas.length };
}

export async function actualizarBannerWA() {
  const banner = document.getElementById('alertas-wa-banner');
  if (!banner) return;
  try {
    /* Importar ESTADOS_FINALES de forma dinámica para evitar dependencia circular */
    const { ESTADOS_FINALES, getDiasDesde } = await import('../../core/utils.js');
    const todos = await cargarTodos();
    const alertas = [];
    todos.forEach(r => {
      if (ESTADOS_FINALES.has(r.estado)) return;
      if (!ESTADOS_RECORDATORIO.has(r.estado)) return;
      const dias = getDiasDesde(r.creado_at);
      if (dias < UMBRALES_WA[0]) return;
      let umbral = 0;
      for (let i = UMBRALES_WA.length - 1; i >= 0; i--) {
        if (dias >= UMBRALES_WA[i]) { umbral = UMBRALES_WA[i]; break; }
      }
      alertas.push({ registro: r, dias, umbral, abandono: dias > 120 });
    });

    if (!alertas.length) { banner.classList.add('hide'); return; }

    document.getElementById('alertas-wa-count').textContent = String(alertas.length);
    const counts = { 15: 0, 30: 0, 60: 0, 120: 0, abandono: 0 };
    alertas.forEach(a => { if (a.abandono) counts.abandono++; else counts[a.umbral]++; });
    const parts = [];
    if (counts[15])      parts.push(counts[15]      + ' a 15d');
    if (counts[30])      parts.push(counts[30]      + ' a 30d');
    if (counts[60])      parts.push(counts[60]      + ' a 60d');
    if (counts[120])     parts.push(counts[120]     + ' a 120d');
    if (counts.abandono) parts.push(counts.abandono + ' abandono');
    document.getElementById('alertas-wa-detail').textContent = parts.join(' · ');
    banner.classList.remove('hide');
  } catch(e) { banner.classList.add('hide'); }
}

export async function abrirPanelAlertasWA() {
  const modal = document.getElementById('modal-alertas-wa');
  if (!modal) return;
  await renderAlertasWA();
  modal.classList.add('active');
}

export async function renderAlertasWA() {
  const body = document.getElementById('modal-alertas-wa-body');
  if (!body) return;
  body.innerHTML = '';

  const { ESTADOS_FINALES, getDiasDesde, getLabelEstado } = await import('../../core/utils.js');
  const todos = await cargarTodos();
  const alertas = [];
  todos.forEach(r => {
    if (ESTADOS_FINALES.has(r.estado)) return;
    if (!ESTADOS_RECORDATORIO.has(r.estado)) return;
    const dias = getDiasDesde(r.creado_at);
    if (dias < UMBRALES_WA[0]) return;
    let umbral = 0;
    for (let i = UMBRALES_WA.length - 1; i >= 0; i--) {
      if (dias >= UMBRALES_WA[i]) { umbral = UMBRALES_WA[i]; break; }
    }
    alertas.push({ registro: r, dias, umbral, abandono: dias > 120 });
  });
  alertas.sort((a, b) => b.dias - a.dias);

  if (!alertas.length) {
    body.innerHTML = '<div class="empty"><div class="empty-icon">✓</div><div class="empty-text">Sin recordatorios pendientes.</div></div>';
    return;
  }

  const titulo = document.createElement('div');
  titulo.className   = 'card-title';
  titulo.textContent = `${alertas.length} orden(es) requieren contactar al cliente`;
  body.appendChild(titulo);

  const frag = document.createDocumentFragment();
  alertas.forEach(({ registro: r, dias, umbral, abandono }) => {
    const item = document.createElement('div');
    item.className = 'alerta-item';
    item.innerHTML =
      `<div class="alerta-item-head">
        <span>${TIPO_ICONOS[r.tipo] || ''}</span>
        <span class="alerta-item-numero">${escapeHtml(r.numero)}</span>
        <span class="reg-card-estado estado-amarillo">${getLabelEstado(r.estado)}</span>
        <span class="alerta-item-dias ${abandono ? 'abandono' : 'umbral-' + umbral}">
          ${abandono ? 'ABANDONO' : dias + ' días'}
        </span>
      </div>
      <div class="alerta-item-cliente">${escapeHtml(r.cliente_nombre)}</div>`;

    const eqParts = [r.equipo_tipo, r.equipo_marca, r.equipo_modelo].filter(Boolean);
    if (eqParts.length) {
      const eq = document.createElement('div');
      eq.className = 'alerta-item-equipo'; eq.textContent = eqParts.join(' · ');
      item.appendChild(eq);
    }

    const actions = document.createElement('div');
    actions.className = 'alerta-item-actions';
    if (r.raw?.cliente_telefono) {
      const btnWa = document.createElement('button');
      btnWa.className = 'btn btn-success btn-sm'; btnWa.type = 'button'; btnWa.textContent = '💬 WhatsApp';
      btnWa.addEventListener('click', () => {
        const waKey = estadoToWaKey(r.estado);
        buildWhatsAppMessage(waKey, { cliente: r.cliente_nombre, equipo: r.equipo_tipo,
          numero: r.numero, total: r.total, guia: r.raw.encomienda_retorno_guia || r.raw.encomienda_guia || '' })
          .then(msg => openWhatsApp(r.raw.cliente_telefono, msg));
      });
      actions.appendChild(btnWa);
    }
    const btnVer = document.createElement('button');
    btnVer.className = 'btn btn-ghost btn-sm'; btnVer.type = 'button'; btnVer.textContent = 'Ver';
    btnVer.addEventListener('click', () => {
      document.getElementById('modal-alertas-wa')?.classList.remove('active');
      abrirModalDetalle(r.numero, r.tipo);
    });
    actions.appendChild(btnVer);
    item.appendChild(actions);
    frag.appendChild(item);
  });
  body.appendChild(frag);
}
