/**
 * ELECTROMEL — whatsapp.js
 * Servicio WhatsApp: construcción de mensajes, apertura de wa.me,
 * fallback a portapapeles y card visual con preview.
 */

import { store }              from '../core/store.js';
import { getCfg }             from '../core/db.js';
import { pesos, buildWaPhone, escapeHtml } from '../core/utils.js';
import { WA_DEFAULTS, WA_FIELD_MAP, CFG_FIELDS, estadoToWaKey } from '../core/config.js';
import { showToast }          from '../core/ui.js';

/* ── getWhatsAppTemplate(estadoKey) → Promise<string> ──── */
export async function getWhatsAppTemplate(estadoKey) {
  const db       = store.get('db');
  const inputId  = WA_FIELD_MAP[estadoKey];
  const cfgKey   = inputId && CFG_FIELDS[inputId] ? CFG_FIELDS[inputId].key : null;
  const fallback = WA_DEFAULTS[estadoKey] || '';
  if (!cfgKey || !db) return fallback;
  const v = await getCfg(db, cfgKey, '');
  return (v && String(v).trim()) ? String(v) : fallback;
}

/* ── buildWhatsAppMessage(estadoOTemplate, vars) → Promise<string>
   Acepta:
   - estado-key  ('listo_retirar') → lee template de DB con fallback WA_DEFAULTS
   - plantilla directa ('Hola {cliente}...') → interpola directamente
   Variables: {cliente} {equipo} {numero} {total} {guia} {garantia} {saldo} {fecha}
   ─────────────────────────────────────────────────────────── */
export function buildWhatsAppMessage(estadoOTemplate, vars = {}) {
  function _interpolar(tmpl) {
    if (!tmpl) return '';
    const totalFmt = (vars.total !== undefined && vars.total !== null && vars.total !== '')
      ? (typeof vars.total === 'number' ? pesos(vars.total) : vars.total)
      : '';
    const saldoFmt = (vars.saldo !== undefined && vars.saldo !== null && vars.saldo !== '')
      ? (typeof vars.saldo === 'number' ? pesos(vars.saldo) : vars.saldo)
      : '';
    return String(tmpl)
      .replace(/\{cliente\}/g,   vars.cliente   || '')
      .replace(/\{equipo\}/g,    vars.equipo    || '')
      .replace(/\{numero\}/g,    vars.numero    || '')
      .replace(/\{total\}/g,     totalFmt)
      .replace(/\{saldo\}/g,     saldoFmt)
      .replace(/\{guia\}/g,      vars.guia      || '')
      .replace(/\{garantia\}/g,  vars.garantia  || '')
      .replace(/\{fecha\}/g,     vars.fecha     || '')
      .trim();
  }

  /* Detectar si es un estado-key: sin espacios ni llaves y existe en WA_DEFAULTS */
  const esEstadoKey = estadoOTemplate &&
    typeof estadoOTemplate === 'string' &&
    !/[{}\s]/.test(estadoOTemplate) &&
    WA_DEFAULTS[estadoOTemplate] !== undefined;

  if (esEstadoKey) {
    return getWhatsAppTemplate(estadoOTemplate).then(tmpl => _interpolar(tmpl));
  }

  /* Plantilla directa */
  return Promise.resolve(_interpolar(estadoOTemplate));
}

/* ── openWhatsApp(telefono, mensaje) ────────────────────── */
export function openWhatsApp(telefono, mensaje) {
  const tel = buildWaPhone(telefono);
  if (!tel) {
    _waFallback(mensaje, 'Sin teléfono registrado o inválido');
    return;
  }

  const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje || '');

  try {
    /* <a>.click() evita el bloqueo de popups en Android PWA instalada */
    const a = document.createElement('a');
    a.href   = url;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 300);
  } catch(e) {
    console.warn('[openWhatsApp]', e);
    _waFallback(mensaje, 'No se pudo abrir WhatsApp');
  }
}

/* ── waCopiar(mensaje, silencioso) ──────────────────────── */
export function waCopiar(mensaje, silencioso = false) {
  if (!mensaje) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(mensaje)
      .then(() => { if (!silencioso) showToast('📋 Mensaje copiado', 'success'); })
      .catch(() => _waFallbackLegacy(mensaje, silencioso));
  } else {
    _waFallbackLegacy(mensaje, silencioso);
  }
}

function _waFallbackLegacy(mensaje, silencioso) {
  try {
    const ta = document.createElement('textarea');
    ta.value = mensaje;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (!silencioso) showToast('📋 Mensaje copiado', 'success');
  } catch(e) {
    console.warn('[_waFallbackLegacy]', e);
  }
}

function _waFallback(mensaje, motivo) {
  showToast('⚠️ ' + (motivo || 'No se pudo abrir WhatsApp'), 'warn');
  if (mensaje) {
    waCopiar(mensaje, false);
    _abrirModalMensajeWA(mensaje);
  }
}

function _abrirModalMensajeWA(mensaje) {
  let m = document.getElementById('modal-wa-fallback');
  if (!m) {
    m = document.createElement('div');
    m.id        = 'modal-wa-fallback';
    m.className = 'modal';
    m.innerHTML =
      '<div class="modal-header">' +
        '<button class="modal-close" type="button" ' +
          'onclick="document.getElementById(\'modal-wa-fallback\').classList.remove(\'active\')">×</button>' +
        '<div class="modal-title">💬 Mensaje WhatsApp</div>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="dim txt-sm mb-6">El mensaje fue copiado. También podés leerlo acá:</div>' +
        '<textarea id="wa-fallback-texto" rows="8" style="width:100%;' +
          'background:var(--surface-3);color:var(--texto);border:1px solid var(--borde-2);' +
          'border-radius:var(--r-sm);padding:10px;font-size:13px;resize:vertical;" readonly></textarea>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-primary btn-block" type="button" ' +
          'onclick="import(\'./js/services/whatsapp.js\').then(m=>m.waCopiar(document.getElementById(\'wa-fallback-texto\').value,false))">📋 Copiar mensaje</button>' +
      '</div>';
    document.body.appendChild(m);
  }
  const ta = document.getElementById('wa-fallback-texto');
  if (ta) ta.value = mensaje;
  m.classList.add('active');
}

/* ── crearCardWhatsApp(reg) → HTMLElement ───────────────── */
/**
 * Crea la tarjeta de WhatsApp para el modal detalle.
 * Muestra preview del mensaje antes de enviarlo.
 * reg: el registro (ING/OTT/OTE/PRE) con sus datos.
 */
export function crearCardWhatsApp(reg) {
  const card = document.createElement('div');
  card.className = 'card';

  const titulo = document.createElement('div');
  titulo.className = 'card-title';
  titulo.textContent = '💬 WhatsApp al cliente';
  card.appendChild(titulo);

  /* Datos para la interpolación */
  const tel      = reg.cliente_telefono || '';
  const waKey    = estadoToWaKey(reg.estado || 'ingresado');
  const vars = {
    cliente:  reg.cliente_nombre,
    equipo:   reg.equipo_tipo || reg.tipo_servicio || '',
    numero:   reg.numero,
    total:    parseFloat(reg.total) || 0,
    guia:     reg.encomienda_retorno_guia || reg.encomienda_guia || '',
    garantia: reg.garantia || ''
  };

  /* Preview del mensaje */
  const preview = document.createElement('div');
  preview.style.cssText =
    'font-size:12px;color:var(--texto-2);margin-bottom:8px;padding:8px;' +
    'background:var(--surface-2);border-radius:var(--r-sm);border:1px solid var(--borde);min-height:40px;';
  preview.textContent = 'Cargando…';
  card.appendChild(preview);

  /* Precargar mensaje en preview */
  buildWhatsAppMessage(waKey, vars).then(msg => {
    preview.textContent = msg || '(sin plantilla configurada)';
  });

  /* Botones */
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';

  /* Botón enviar */
  const btnEnviar = document.createElement('button');
  btnEnviar.className = 'btn btn-success';
  btnEnviar.style.flex = '1';
  btnEnviar.type = 'button';
  btnEnviar.textContent = '📲 Enviar';
  btnEnviar.addEventListener('click', () => {
    if (!tel) { showToast('⚠️ Sin teléfono registrado', 'warn'); return; }
    const msg = preview.textContent;
    if (!msg || msg === 'Cargando…') {
      buildWhatsAppMessage(waKey, vars).then(m => openWhatsApp(tel, m));
    } else {
      openWhatsApp(tel, msg);
    }
  });

  /* Botón copiar */
  const btnCopiar = document.createElement('button');
  btnCopiar.className = 'btn btn-ghost';
  btnCopiar.type = 'button';
  btnCopiar.title = 'Copiar mensaje';
  btnCopiar.textContent = '📋';
  btnCopiar.addEventListener('click', () => {
    const msg = preview.textContent;
    if (msg && msg !== 'Cargando…') waCopiar(msg, false);
  });

  row.appendChild(btnEnviar);
  row.appendChild(btnCopiar);
  card.appendChild(row);

  return card;
}

/* ── crearCardAlertaWA(r, onEnviar) → HTMLElement ───────── */
/**
 * Card compacta para el panel de alertas WA.
 * r: registro resumido del panel (numero, cliente_nombre, estado, equipo_tipo, raw)
 */
export function crearCardAlertaWA(r, diasSinContacto) {
  const card = document.createElement('div');
  card.className = 'alerta-wa-item';

  const waKey = _getAlertaWaKey(r.estado, diasSinContacto);
  const vars  = {
    cliente:  r.cliente_nombre,
    equipo:   r.equipo_tipo,
    numero:   r.numero,
    total:    r.raw?.total || 0,
    guia:     r.raw?.encomienda_retorno_guia || r.raw?.encomienda_guia || ''
  };

  card.innerHTML =
    `<div class="alerta-wa-info">` +
      `<span class="mono bold">${escapeHtml(r.numero)}</span>` +
      `<span class="dim txt-sm">${escapeHtml(r.cliente_nombre)}</span>` +
      `<span class="dim txt-sm">${diasSinContacto}d sin contacto</span>` +
    `</div>`;

  const actions = document.createElement('div');
  actions.className = 'alerta-wa-actions';

  if (r.raw?.cliente_telefono) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-success btn-sm';
    btn.type = 'button';
    btn.textContent = '💬 WA';
    btn.addEventListener('click', () => {
      buildWhatsAppMessage(waKey, vars).then(msg => {
        openWhatsApp(r.raw.cliente_telefono, msg);
      });
    });
    actions.appendChild(btn);
  }

  card.appendChild(actions);
  return card;
}

function _getAlertaWaKey(estado, dias) {
  if (dias >= 120) return 'rec_120';
  if (dias >= 60)  return 'rec_60';
  if (dias >= 30)  return 'rec_30';
  if (dias >= 15)  return 'rec_15';
  return estadoToWaKey(estado);
}
