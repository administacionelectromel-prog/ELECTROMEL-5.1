/**
 * ELECTROMEL — utils.js
 * Funciones utilitarias puras (sin estado, sin efectos secundarios).
 * Seguras para usar en cualquier módulo.
 */

/* ── Moneda ─────────────────────────────────────────────── */
export function pesos(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/* ── Fechas ─────────────────────────────────────────────── */
export function fmtFechaCorta(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

export function fmtFechaLarga(iso) {
  if (!iso) return '—';
  try {
    const meses = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${String(d.getDate()).padStart(2,'0')} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  } catch { return iso; }
}

export function fmtHora(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return ''; }
}

export function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

export function getEdadHoras(fechaRef) {
  if (!fechaRef) return 0;
  const d = new Date(fechaRef);
  if (isNaN(d)) return 0;
  return Math.floor((Date.now() - d.getTime()) / 3600000);
}

export function getDiasDesde(fechaRef) {
  return Math.floor(getEdadHoras(fechaRef) / 24);
}

export function formatAntiguedad(horas) {
  if (horas < 1)   return 'hace menos de 1h';
  if (horas < 24)  return `hace ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7)    return `hace ${dias}d`;
  const semanas = Math.floor(dias / 7);
  if (semanas < 5) return `hace ${semanas} sem`;
  return `hace ${Math.floor(dias / 30)}m`;
}

/* ── Semáforo ────────────────────────────────────────────── */
export const SEMAFORO_REGLAS = {
  ingresado:           { verdeMaxH: 24,   amarilloMaxH: 72  },
  en_diagnostico:      { verdeMaxH: 48,   amarilloMaxH: 120 },
  presupuesto_enviado: { verdeMaxH: 72,   amarilloMaxH: 168 },
  aprobado:            { verdeMaxH: 24,   amarilloMaxH: 72  },
  espera_componentes:  { verdeMaxH: 168,  amarilloMaxH: 336 },
  en_reparacion:       { verdeMaxH: 48,   amarilloMaxH: 120 },
  reparado:            { verdeMaxH: 24,   amarilloMaxH: 72  },
  listo_para_retirar:  { verdeMaxH: 48,   amarilloMaxH: 120 },
  prep_envio:          { verdeMaxH: 24,   amarilloMaxH: 72  },
  enviado:             { verdeMaxH: 120,  amarilloMaxH: 240 },
  pendiente:           { verdeMaxH: 72,   amarilloMaxH: 168 },
  pendiente_pago:      { verdeMaxH: 48,   amarilloMaxH: 120 },
  pendiente_saldo:     { verdeMaxH: 48,   amarilloMaxH: 120 }
};

export const ESTADOS_FINALES = new Set([
  'entregado', 'pagado', 'rechazada_entregada', 'rechazado',
  'archivado_por_ott', 'archivado_por_ote'
]);

export function getColorSemaforo(estado, fechaRef) {
  if (ESTADOS_FINALES.has(estado)) return 'gris';
  const regla = SEMAFORO_REGLAS[estado];
  if (!regla) return 'gris';
  const horas = getEdadHoras(fechaRef);
  if (horas <= regla.verdeMaxH)    return 'verde';
  if (horas <= regla.amarilloMaxH) return 'amarillo';
  return 'rojo';
}

export const STORE_POR_TIPO = {
  ING: 'ingresos',
  OTT: 'ordenes',
  OTE: 'exteriors',
  PRE: 'presupuestos'
};

export function getTipoFromNumero(numero) {
  const prefix = String(numero).split('-')[0].toUpperCase();
  return prefix; // ING, OTT, OTE, PRE
}

export function getLabelEstado(estado) {
  const labels = {
    ingresado:            'Ingresado',
    retirado_sin_reparar: 'Retirado sin reparar',
    en_diagnostico:       'En diagnóstico',
    presupuesto_enviado:  'Presupuesto enviado',
    aprobado:             'Aprobado',
    espera_componentes:   'Espera componentes',
    en_reparacion:        'En reparación',
    reparado:             'Reparado',
    listo_para_retirar:   'Listo para retirar',
    prep_envio:           'Preparando envío',
    enviado:              'Enviado',
    entregado:            'Entregado',
    rechazada_entregada:  'Rechazada (entregada)',
    pendiente_pago:       'Pendiente de pago',
    pendiente_saldo:      'Pendiente de saldo',
    pagado:               'Pagado',
    pendiente:            'Pendiente',
    aprobado_pre:         'Aprobado',
    rechazado:            'Rechazado',
    archivado_por_ott:    'Convertido a OTT',
    archivado_por_ote:    'Convertido a OTE',
    /* Garantía */
    reingreso_garantia:   'Reingreso por garantía',
    garantia_en_proceso:  'Garantía en proceso',
    garantia_cerrada:     'Garantía cerrada'
  };
  return labels[estado] || estado || '—';
}

/* ── HTML / Seguridad ─────────────────────────────────── */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ── Teléfono ─────────────────────────────────────────── */
export function formatTelefono(tel) {
  if (!tel) return '';
  const digits = String(tel).replace(/\D/g, '');
  return digits.replace(/(\d{3,4})(\d{4})(\d{4})/, '$1 $2 $3') || digits;
}

export function buildWaPhone(tel) {
  if (!tel) return null;
  let t = String(tel).replace(/\D/g, '');
  if (!t || t.length < 6) return null;
  if (t.startsWith('549'))     return t;
  if (t.startsWith('54'))      return '549' + t.slice(2);
  return '549' + t;
}

/* ── Debounce ─────────────────────────────────────────── */
export function debounce(fn, ms) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ── Anti doble tap ──────────────────────────────────── */
const _btnLocks = new WeakMap();

export function btnGuard(btn, fn, opts = {}) {
  if (!btn || _btnLocks.get(btn)) return;
  const { loadingText = null, minMs = 0 } = opts;
  const originalText     = btn.textContent;
  const originalDisabled = btn.disabled;

  _btnLocks.set(btn, true);
  btn.disabled    = true;
  btn.style.opacity = '0.6';
  if (loadingText !== null) btn.textContent = loadingText;

  const start = Date.now();

  function release() {
    const elapsed = Date.now() - start;
    const delay   = Math.max(0, minMs - elapsed);
    setTimeout(() => {
      _btnLocks.delete(btn);
      btn.disabled    = originalDisabled;
      btn.style.opacity = '';
      if (loadingText !== null) btn.textContent = originalText;
    }, delay);
  }

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(release, release);
    } else {
      release();
    }
  } catch(e) {
    release();
    throw e;
  }
}

/* ── Modal ready (rAF doble) ──────────────────────────── */
export function modalReady(modalEl, fn, maxMs = 2000) {
  if (!modalEl) { fn(); return; }
  const deadline = Date.now() + maxMs;

  function waitVisible() {
    if (Date.now() > deadline) {
      console.warn('[modalReady] timeout:', modalEl.id);
      fn();
      return;
    }
    if (getComputedStyle(modalEl).display !== 'none') {
      requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
      requestAnimationFrame(waitVisible);
    }
  }
  waitVisible();
}

/* ── PDF sanitize (quitar emojis/no-Latin1) ─────────── */
export function pdfSanitize(txt) {
  if (!txt && txt !== 0) return '';
  return String(txt)
    .replace(/✓|✔|☑/g, 'OK')
    .replace(/✗|✘|✕|×/g, 'x')
    .replace(/→|➜|➡/g, '->')
    .replace(/←/g, '<-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/–|—/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F\u00C0-\u024F]/g, '')
    .trim();
}

/* ── Semana ───────────────────────────────────────────── */
export function semanaRango(offset = 0) {
  const hoy    = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dow    = hoy.getDay();
  const lunesDelta = dow === 0 ? -6 : 1 - dow;
  const lunes  = new Date(hoy);
  lunes.setDate(hoy.getDate() + lunesDelta + offset * 7);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }
  const domingo = dias[6];
  const fmt = d => `${new Date(d).getDate()}/${new Date(d).getMonth()+1}`;
  return {
    from:  dias[0],
    to:    domingo,
    dias,
    label: `${fmt(dias[0])} — ${fmt(domingo)}`
  };
}

/* ── Número a letras (para recibo) ─────────────────────── */
export function numeroALetras(n) {
  const unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                    'diez','once','doce','trece','catorce','quince','dieciséis',
                    'diecisiete','dieciocho','diecinueve'];
  const decenas  = ['','','veinte','treinta','cuarenta','cincuenta',
                    'sesenta','setenta','ochenta','noventa'];
  const centenas = ['','cien','doscientos','trescientos','cuatrocientos','quinientos',
                    'seiscientos','setecientos','ochocientos','novecientos'];

  function _grupo(n) {
    if (n === 0)   return '';
    if (n <= 19)   return unidades[n];
    if (n <= 29)   return 'veinti' + (n === 20 ? '' : unidades[n - 20]);
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return decenas[d] + (u ? ' y ' + unidades[u] : '');
    }
    const c = Math.floor(n / 100);
    const r = n % 100;
    if (n === 100) return 'cien';
    return centenas[c] + (r ? ' ' + _grupo(r) : '');
  }

  n = Math.floor(Math.abs(parseFloat(n)) || 0);
  if (n === 0) return 'cero';

  const millones  = Math.floor(n / 1000000);
  const miles     = Math.floor((n % 1000000) / 1000);
  const resto     = n % 1000;

  let result = '';
  if (millones)  result += (millones === 1 ? 'un millón' : _grupo(millones) + ' millones') + ' ';
  if (miles)     result += (miles    === 1 ? 'mil'        : _grupo(miles)    + ' mil')      + ' ';
  if (resto)     result += _grupo(resto);

  return result.trim();
}

/* ── mensajeAmigable ───────────────────────────────────────
   Traduce errores técnicos a mensajes claros para el usuario.
   Uso: showToast(mensajeAmigable(e), 'error') */
export function mensajeAmigable(error) {
  const msg = (error?.message || String(error || '')).toLowerCase();

  /* Base de datos no disponible */
  if (msg.includes('db no disponible') || msg.includes('base de datos no disponible')) {
    return 'La base de datos no está lista. Cerrá y volvé a abrir la app.';
  }
  /* Errores de IndexedDB / cuota */
  if (msg.includes('quota') || msg.includes('quotaexceeded')) {
    return 'No hay espacio suficiente en el teléfono. Liberá espacio o borrá fotos viejas.';
  }
  if (msg.includes('indexeddb') || msg.includes('objectstore') || msg.includes('transaction')) {
    return 'Hubo un problema al guardar los datos. Probá de nuevo; si sigue, reiniciá la app.';
  }
  /* Duplicados */
  if (msg.includes('ya registrado') || msg.includes('ya existe')) {
    return 'Este registro ya estaba guardado.';
  }
  /* Constraint / clave */
  if (msg.includes('constraint') || msg.includes('key')) {
    return 'Ese dato ya existe o entra en conflicto con otro. Revisá los datos.';
  }
  /* Red / fetch (para futuras funciones online) */
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Sin conexión a internet. Esta acción necesita estar conectado.';
  }
  /* Permisos de cámara */
  if (msg.includes('permission') || msg.includes('notallowed')) {
    return 'No se dio permiso para usar la cámara. Activalo en los ajustes del navegador.';
  }
  /* Si el mensaje ya es claro y corto (lo escribimos nosotros), mostrarlo */
  if (error?.message && error.message.length < 80 && !msg.includes('undefined') && !msg.includes('null')) {
    return error.message;
  }
  /* Genérico */
  return 'Ocurrió un error inesperado. Probá de nuevo.';
}
