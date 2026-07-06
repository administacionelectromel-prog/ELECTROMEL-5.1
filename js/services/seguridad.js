/* ═══════════════════════════════════════════════════════════
   🔑 SEGURIDAD — Modo Usuario / Maestro (Paso 6)
   · Opt-in: sin PIN creado, la app funciona como siempre.
   · Con PIN: las pestañas Config y Admin (backup, restauración,
     exportaciones, estadísticas, administración) quedan detrás
     de un candado. El uso diario (panel, agenda, órdenes,
     cobros en ficha) sigue libre.
   · El PIN se guarda HASHEADO (SHA-256 + salt aleatorio),
     nunca en texto plano. Con código de recuperación de un
     solo vistazo para no quedar afuera.
   · Re-bloqueo automático si la app queda en segundo plano
     más de 5 minutos.
   ═══════════════════════════════════════════════════════════ */
import { store, bus }        from '../core/store.js';
import { getCfg, setCfg }    from '../core/db.js';
import { showToast, confirmarLindo, showTab } from '../core/ui.js';
import { escapeHtml }        from '../core/utils.js';

const TABS_PROTEGIDOS = ['config', 'admin'];
const REBLOQUEO_MS    = 5 * 60 * 1000;   /* 5 minutos en segundo plano */

let _desbloqueado = false;
let _ocultoDesde  = 0;

/* ── Primitivas (puras, testeables) ──────────────────────── */
export async function _hash(salt, texto) {
  const data = new TextEncoder().encode(String(salt) + String(texto));
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function _saltAleatorio() {
  const u8 = new Uint8Array(16);
  crypto.getRandomValues(u8);
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function _codigoRecuperacion() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; /* sin 0/O/1/I */
  const u8  = new Uint8Array(8);
  crypto.getRandomValues(u8);
  return Array.from(u8).map(b => abc[b % abc.length]).join('');
}

/* ── Estado ──────────────────────────────────────────────── */
export async function hayPin() {
  const db = store.get('db');
  if (!db) return false;
  return !!(await getCfg(db, 'seg_hash', ''));
}

export function estaDesbloqueado() { return _desbloqueado; }

export async function verificarPin(pin) {
  const db   = store.get('db');
  const hash = await getCfg(db, 'seg_hash', '');
  const salt = await getCfg(db, 'seg_salt', '');
  if (!hash || !salt) return false;
  return (await _hash(salt, pin)) === hash;
}

/* ── Operaciones ─────────────────────────────────────────── */
export async function crearPin(pin, hint) {
  const db   = store.get('db');
  const salt = _saltAleatorio();
  await setCfg(db, 'seg_hash', await _hash(salt, pin));
  await setCfg(db, 'seg_salt', salt);
  await setCfg(db, 'seg_hint', (hint || '').trim());
  const codigo  = _codigoRecuperacion();
  const recSalt = _saltAleatorio();
  await setCfg(db, 'seg_rec_hash', await _hash(recSalt, codigo));
  await setCfg(db, 'seg_rec_salt', recSalt);
  _desbloqueado = true;
  return codigo; /* Se muestra UNA sola vez */
}

export async function quitarPin() {
  const db = store.get('db');
  await setCfg(db, 'seg_hash', '');
  await setCfg(db, 'seg_salt', '');
  await setCfg(db, 'seg_hint', '');
  await setCfg(db, 'seg_rec_hash', '');
  await setCfg(db, 'seg_rec_salt', '');
  _desbloqueado = false;
}

export async function verificarRecuperacion(codigo) {
  const db   = store.get('db');
  const hash = await getCfg(db, 'seg_rec_hash', '');
  const salt = await getCfg(db, 'seg_rec_salt', '');
  if (!hash || !salt) return false;
  return (await _hash(salt, (codigo || '').trim().toUpperCase())) === hash;
}

export function bloquear() {
  _desbloqueado = false;
  const tab = store.get('currentTab');
  if (TABS_PROTEGIDOS.includes(tab)) _mostrarCandado(tab);
  showToast('🔒 Modo Maestro bloqueado', 'info');
}

/* ── Overlay de candado ──────────────────────────────────── */
function _quitarCandado() {
  document.getElementById('seg-overlay')?.remove();
}

async function _mostrarCandado(tab) {
  _quitarCandado();
  const db   = store.get('db');
  const hint = await getCfg(db, 'seg_hint', '');
  const div  = document.createElement('div');
  div.id = 'seg-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:var(--fondo,#0d1117);z-index:9999;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = `
    <div style="max-width:300px;width:88%;text-align:center;">
      <div style="font-size:44px;">🔒</div>
      <div class="bold" style="font-size:17px;margin:8px 0 4px;">Modo Maestro</div>
      <div class="dim txt-sm" style="margin-bottom:12px;">Esta sección está protegida. Ingresá tu PIN.</div>
      <input id="seg-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN"
        style="width:100%;text-align:center;font-size:20px;letter-spacing:6px;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:10px;padding:12px;color:var(--texto);">
      <div id="seg-error" class="peligro txt-xs" style="min-height:16px;margin:6px 0;"></div>
      <button class="btn btn-primary" type="button" style="width:100%;" onclick="segDesbloquear()">Desbloquear</button>
      <button class="btn btn-ghost btn-sm" type="button" style="width:100%;margin-top:8px;" onclick="showTab('panel')">← Volver al panel</button>
      <button class="btn btn-ghost btn-sm" type="button" style="width:100%;margin-top:4px;opacity:.7;" onclick="segOlvide()">Olvidé mi PIN</button>
      ${hint ? `<div class="dim txt-xs" style="margin-top:10px;">💡 Pista: ${escapeHtml(hint)}</div>` : ''}
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => document.getElementById('seg-pin')?.focus(), 100);
  document.getElementById('seg-pin').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.segDesbloquear();
  });
}

window.segDesbloquear = async () => {
  const pin = document.getElementById('seg-pin')?.value || '';
  if (await verificarPin(pin)) {
    _desbloqueado = true;
    _quitarCandado();
    showToast('🔓 Modo Maestro activo', 'success');
    /* Re-disparar la carga de la pestaña actual */
    const tab = store.get('currentTab');
    bus.emit('tab:cambio', { from: tab, to: tab });
  } else {
    const err = document.getElementById('seg-error');
    if (err) err.textContent = 'PIN incorrecto';
    const inp = document.getElementById('seg-pin');
    if (inp) { inp.value = ''; inp.focus(); }
  }
};

window.segOlvide = async () => {
  const codigo = prompt('Ingresá tu código de recuperación (8 caracteres, te lo mostré al crear el PIN):');
  if (codigo == null) return;
  if (await verificarRecuperacion(codigo)) {
    await quitarPin();
    _quitarCandado();
    showToast('✅ Protección quitada. Creá un PIN nuevo en Config.', 'success');
    const tab = store.get('currentTab');
    bus.emit('tab:cambio', { from: tab, to: tab });
  } else {
    showToast('Código incorrecto', 'error');
  }
};

/* ── Card de configuración (se llena en Config) ──────────── */
export async function renderSeguridadCard() {
  const cont = document.getElementById('seguridad-card');
  if (!cont) return;
  const activo = await hayPin();

  if (!activo) {
    cont.innerHTML = `
      <div class="dim txt-xs" style="margin-bottom:8px;">Protegé Config y Admin (backup, exportaciones, estadísticas) con un PIN. El uso diario del taller queda libre. El PIN se guarda cifrado, nunca en texto plano.</div>
      <input type="password" id="seg-nuevo1" inputmode="numeric" placeholder="Nuevo PIN (mín. 4)" style="width:100%;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:9px;color:var(--texto);font-size:14px;margin-bottom:6px;">
      <input type="password" id="seg-nuevo2" inputmode="numeric" placeholder="Repetir PIN" style="width:100%;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:9px;color:var(--texto);font-size:14px;margin-bottom:6px;">
      <input type="text" id="seg-hint" placeholder="Pista (opcional, se muestra en el candado)" style="width:100%;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:9px;color:var(--texto);font-size:12px;margin-bottom:8px;">
      <button class="btn btn-primary btn-block btn-sm" type="button" onclick="segCrear()">🔑 Activar Modo Maestro</button>`;
  } else {
    cont.innerHTML = `
      <div class="ok txt-sm" style="margin-bottom:8px;">✅ Protección activa — Config y Admin piden PIN.</div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="segBloquearAhora()" style="margin-bottom:6px;">🔒 Bloquear ahora</button>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="segQuitar()">Quitar protección (pide PIN)</button>`;
  }
}

window.segCrear = async () => {
  const p1 = document.getElementById('seg-nuevo1')?.value || '';
  const p2 = document.getElementById('seg-nuevo2')?.value || '';
  const hint = document.getElementById('seg-hint')?.value || '';
  if (p1.length < 4) { showToast('El PIN debe tener al menos 4 caracteres', 'warn'); return; }
  if (p1 !== p2)     { showToast('Los PIN no coinciden', 'warn'); return; }
  const codigo = await crearPin(p1, hint);
  await renderSeguridadCard();
  await confirmarLindo(
    `🔑 Modo Maestro activado.\n\nTu CÓDIGO DE RECUPERACIÓN es:\n\n${codigo}\n\n⚠️ Anotalo en un lugar seguro (papel, no en el teléfono). Es la ÚNICA forma de entrar si olvidás el PIN. No se vuelve a mostrar.`,
    { titulo: 'Guardá este código', textoOk: 'Ya lo anoté', peligro: false }
  );
};

window.segBloquearAhora = () => bloquear();

window.segQuitar = async () => {
  const pin = prompt('Ingresá tu PIN actual para quitar la protección:');
  if (pin == null) return;
  if (!(await verificarPin(pin))) { showToast('PIN incorrecto', 'error'); return; }
  const ok = await confirmarLindo('¿Quitar el Modo Maestro? Config y Admin quedan libres.', { titulo: 'Quitar protección', textoOk: 'Quitar', peligro: true });
  if (!ok) return;
  await quitarPin();
  await renderSeguridadCard();
  showToast('Protección quitada', 'success');
};

/* ── Init: candado en tabs protegidos + re-bloqueo ───────── */
export function initSeguridad() {
  bus.on('tab:cambio', async ({ to }) => {
    if (!TABS_PROTEGIDOS.includes(to)) { _quitarCandado(); return; }
    if (_desbloqueado) return;
    if (await hayPin()) _mostrarCandado(to);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { _ocultoDesde = Date.now(); return; }
    if (_desbloqueado && _ocultoDesde && (Date.now() - _ocultoDesde) > REBLOQUEO_MS) {
      _desbloqueado = false;
      const tab = store.get('currentTab');
      if (TABS_PROTEGIDOS.includes(tab)) _mostrarCandado(tab);
    }
    _ocultoDesde = 0;
  });
}
