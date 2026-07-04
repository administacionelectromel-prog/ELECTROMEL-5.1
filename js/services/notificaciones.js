/* ═══════════════════════════════════════════════════════════
   🔔 NOTIFICACIONES LOCALES — Paso 7 (solo en el APK)
   Recordatorios de turnos aunque la app esté cerrada:
   · Turno con hora → aviso 1 hora antes.
   · Turno sin hora → aviso a las 8:00 del día.
   Se reprograman al abrir la app y al salir de la Agenda.
   En la web no hace nada (las notificaciones programadas con la
   app cerrada son una capacidad del APK).
   ═══════════════════════════════════════════════════════════ */
import { store, bus }     from '../core/store.js';
import { dbGetAll, getCfg, setCfg } from '../core/db.js';
import { showToast }      from '../core/ui.js';

function esNativo() {
  try { return !!window.Capacitor?.isNativePlatform?.(); } catch (e) { return false; }
}
function _plugin() { return window.Capacitor?.Plugins?.LocalNotifications || null; }

/* ── PURA (testeable): decide qué avisos programar ───────── */
export function calcularNotifsTurnos(turnos, ahoraMs) {
  const out = [];
  (turnos || []).forEach((t, i) => {
    if (!t.es_turno) return;
    const e = (t.estado_turno || 'pendiente').toLowerCase();
    if (e.includes('cancel') || e.includes('realizado')) return;
    if (!t.fecha) return;

    let at, titulo, cuerpo;
    const lugar = t.zona || t.cliente_ciudad || '';
    if (t.hora && /^\d{1,2}:\d{2}/.test(t.hora)) {
      const inicio = new Date(t.fecha + 'T' + t.hora.padStart(5, '0') + ':00');
      at     = new Date(inicio.getTime() - 60 * 60 * 1000);
      titulo = '📅 Turno en 1 hora (' + t.hora + ')';
    } else {
      at     = new Date(t.fecha + 'T08:00:00');
      titulo = '📅 Turno de hoy';
    }
    if (isNaN(at.getTime()) || at.getTime() <= ahoraMs) return;

    cuerpo = (t.cliente_nombre || 'Cliente') +
             (t.equipo_tipo ? ' · ' + t.equipo_tipo : '') +
             (lugar ? ' · ' + lugar : '');
    out.push({ id: 9000 + (i % 900), title: titulo, body: cuerpo, at });
  });
  return out.sort((a, b) => a.at - b.at).slice(0, 20);
}

/* ── Reprogramar contra el sistema ───────────────────────── */
export async function reprogramarNotifs() {
  if (!esNativo()) return;
  const LN = _plugin();
  if (!LN) return;
  const db = store.get('db');
  if (!db) return;
  try {
    const on = await getCfg(db, 'notif_turnos_on', '1');
    /* Limpiar lo pendiente siempre (si se apagó, quedan canceladas) */
    const pend = await LN.getPending().catch(() => null);
    if (pend?.notifications?.length) {
      await LN.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) }).catch(() => {});
    }
    if (on !== '1') return;

    const todos  = await dbGetAll(db, 'exteriors').catch(() => []);
    const notifs = calcularNotifsTurnos(todos, Date.now());
    if (!notifs.length) return;
    await LN.schedule({
      notifications: notifs.map(n => ({
        id: n.id, title: n.title, body: n.body,
        schedule: { at: n.at }
      }))
    }).catch(e => console.warn('[notif] schedule', e));
  } catch (e) { console.warn('[notif]', e); }
}

/* ── Card en Config ──────────────────────────────────────── */
export async function renderNotifCard() {
  const cont = document.getElementById('notif-card');
  if (!cont) return;
  if (!esNativo()) {
    cont.innerHTML = `
      <div class="card-title">🔔 Recordatorios de turnos</div>
      <div class="dim txt-xs">Disponible en la app instalada (APK): te avisa los turnos del día aunque la app esté cerrada.</div>`;
    return;
  }
  const db = store.get('db');
  const on = (await getCfg(db, 'notif_turnos_on', '1')) === '1';
  cont.innerHTML = `
    <div class="card-title">🔔 Recordatorios de turnos</div>
    <label class="row center txt-sm" style="gap:8px;margin:6px 0;cursor:pointer;">
      <input type="checkbox" id="notif-turnos-chk" ${on ? 'checked' : ''}> Avisarme los turnos (1 h antes, o a las 8:00 si no tienen hora)
    </label>
    <div class="dim txt-xs">Funciona aunque la app esté cerrada.</div>`;
  document.getElementById('notif-turnos-chk')?.addEventListener('change', async e => {
    await setCfg(db, 'notif_turnos_on', e.target.checked ? '1' : '0');
    await reprogramarNotifs();
    showToast(e.target.checked ? '🔔 Recordatorios activados' : '🔕 Recordatorios apagados', 'success');
  });
}

/* ── Init ────────────────────────────────────────────────── */
export function initNotificaciones() {
  if (!esNativo()) return;
  const LN = _plugin();
  if (!LN) return;
  LN.requestPermissions().catch(() => {});
  reprogramarNotifs();
  /* Al salir de la Agenda (donde se crean/cambian turnos), reprogramar */
  bus.on('tab:cambio', ({ from }) => { if (from === 'agenda') reprogramarNotifs(); });
}
