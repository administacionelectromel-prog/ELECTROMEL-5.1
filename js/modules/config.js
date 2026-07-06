/**
 * ELECTROMEL — config.js (módulo)
 * Panel de Configuración: datos empresa, WhatsApp, inteligente,
 * base de períodos, logo, backup, reset completo.
 */

import { store, bus }          from '../core/store.js';
import { dbGet, dbPut, dbGetAll, dbDelete, dbCount, getCfg, setCfg,
         getNextNumber, peekNextNumber, logEvent, invalidateCache,
         DB_VERSION } from '../core/db.js';
import { showToast, actualizarBaseHeader, actualizarInfoSistema, confirmarLindo } from '../core/ui.js';
import { escapeHtml, fmtFechaCorta } from '../core/utils.js';
import { CFG_FIELDS, BUSINESS_CONFIG } from '../core/config.js';

/* ── Helpers de campo ──────────────────────────────────── */
function _readField(id) {
  const el  = document.getElementById(id);
  if (!el) return null;
  const cfg = CFG_FIELDS[id];
  const t   = cfg?.type || 'string';
  if (t === 'bool')    return !!el.checked;
  if (t === 'number')  { const v = parseFloat(el.value); return isFinite(v) ? v : null; }
  if (t === 'percent') { const v = parseFloat(el.value); return isFinite(v) ? v / 100 : null; }
  return el.value || '';
}

function _writeField(id, value) {
  const el  = document.getElementById(id);
  if (!el) return;
  const cfg = CFG_FIELDS[id];
  const t   = cfg?.type || 'string';
  if (t === 'bool')    { el.checked = !!value; return; }
  if (t === 'percent') { el.value = (value !== null && value !== undefined && value !== '') ? Math.round(parseFloat(value) * 100) : ''; return; }
  el.value = (value !== null && value !== undefined) ? value : '';
}

/* ═══════════════════════════════════════════════════════════
   GUARDAR / CARGAR CONFIG
   ═══════════════════════════════════════════════════════════ */
export async function guardarConfig() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  try {
    await Promise.all(
      Object.entries(CFG_FIELDS).map(([id, cfg]) => {
        const v = _readField(id);
        if (cfg.biz && v !== null) BUSINESS_CONFIG[cfg.biz] = v;
        return setCfg(db, cfg.key, v);
      })
    );

    /* Guardar base de períodos */
    await guardarBasesPeriodos();

    /* Guardar logo si hay uno pendiente */
    await _guardarLogoPendiente();

    await logEvent(db, { type: 'CONFIG_CHANGED', message: 'Configuración actualizada' });
    showToast('✅ Configuración guardada', 'success');
    actualizarBaseHeader();
    actualizarInfoSistema();
  } catch(e) {
    console.error('[guardarConfig]', e);
    showToast('❌ Error al guardar: ' + e.message, 'error');
  }
}

export async function cargarConfig() {
  const db = store.get('db');
  if (!db) return;
  await Promise.all(
    Object.entries(CFG_FIELDS).map(async ([id, cfg]) => {
      let v = await getCfg(db, cfg.key, null);
      if ((v === null || v === undefined || v === '') && cfg.default !== undefined) v = cfg.default;
      _writeField(id, v);
    })
  );
  await cargarBasePeriodos();
  await _cargarLogoPreview();

  /* Gasto Operativo v6.8: cargar precio nafta y lista de ciudades */
  try {
    const cop = await import('./ciudades.op.ui.js');
    await cop.cargarNaftaGlobal();
    await cop.renderCiudadesOpList();
  } catch (e) { /* no crítico */ }
}

export async function cargarInteligenteCfg() {
  const db = store.get('db');
  if (!db) return;
  await Promise.all(
    Object.entries(CFG_FIELDS).map(async ([id, cfg]) => {
      if (!cfg.biz) return;
      const v = await getCfg(db, cfg.key, null);
      if (v !== null && v !== undefined && v !== '') BUSINESS_CONFIG[cfg.biz] = v;
    })
  );
}

/* ═══════════════════════════════════════════════════════════
   BASE DE PERÍODOS
   ═══════════════════════════════════════════════════════════ */
export function agregarBasePeriodo() {
  const list = document.getElementById('cfg-baseperiodos-list');
  if (!list) return;
  list.appendChild(_crearItemBP({ zona: '', from: '', to: '', costo_dia: '', pasaje: '' }));
  _poblarDatalistZonas();
}

/* Poblar el datalist con las ciudades configuradas en zonas */
function _poblarDatalistZonas() {
  const dl = document.getElementById('bp-zonas-datalist');
  if (!dl) return;
  import('../services/zonas.js').then(z => {
    const data = z.zonasCache();
    const ciudades = Object.values(data.ciudades || {});
    dl.innerHTML = ciudades.map(c => `<option value="${c.nombre}">`).join('');
  }).catch(() => {});
}

export async function guardarBasesPeriodos() {
  const db   = store.get('db');
  const list = document.getElementById('cfg-baseperiodos-list');
  if (!list || !db) return;

  for (const item of list.querySelectorAll('.bp-item')) {
    const zona = item.querySelector('.bp-zona')?.value?.trim();
    const from = item.querySelector('.bp-from')?.value;
    const to   = item.querySelector('.bp-to')?.value;
    if (!from || !to) continue;
    const costoDia = parseFloat(item.querySelector('.bp-costo-dia')?.value) || 0;
    const pasaje   = parseFloat(item.querySelector('.bp-pasaje')?.value) || 0;
    const id  = item.dataset.bpId;
    /* base queda 'SMA' fijo (modelo de base única); la zona es el destino del viaje */
    const rec = { base: 'SMA', zona: zona || '', from, to, hasta: to, costo_dia: costoDia, pasaje };
    if (id) {
      rec.id = parseInt(id);
      await dbPut(db, 'basePeriodos', rec);
    } else {
      const newId = await _dbAdd(db, 'basePeriodos', rec);
      item.dataset.bpId = String(newId);
    }
  }
}

async function _dbAdd(db, storeName, record) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function cargarBasePeriodos() {
  const db   = store.get('db');
  const list = document.getElementById('cfg-baseperiodos-list');
  if (!list || !db) return;
  list.innerHTML = '';
  const arr = await dbGetAll(db, 'basePeriodos', false);
  arr.sort((a, b) => (b.from||'').localeCompare(a.from||''));
  arr.forEach(p => list.appendChild(_crearItemBP(p)));
  _poblarDatalistZonas();
}

function _crearItemBP(p) {
  const item = document.createElement('div');
  item.className = 'bp-item bp-viaje';
  if (p?.id) item.dataset.bpId = String(p.id);

  /* Zona destino (texto libre con sugerencias de ciudades configuradas) */
  const zonaI = document.createElement('input');
  zonaI.type = 'text'; zonaI.className = 'bp-zona';
  zonaI.placeholder = 'Zona / ciudad (ej: Neuquén)';
  zonaI.setAttribute('list', 'bp-zonas-datalist');
  if (p?.zona || p?.base) zonaI.value = p.zona || (p.base === 'NQN' ? 'Neuquén' : '');

  const fromI = document.createElement('input');
  fromI.type = 'date'; fromI.className = 'bp-from';
  if (p?.from || p?.desde) fromI.value = p.from || p.desde;

  const toI = document.createElement('input');
  toI.type = 'date'; toI.className = 'bp-to';
  if (p?.to || p?.hasta) toI.value = p.to || p.hasta;

  /* Gastos del viaje */
  const costoDiaI = document.createElement('input');
  costoDiaI.type = 'number'; costoDiaI.className = 'bp-costo-dia';
  costoDiaI.placeholder = 'Costo/día $ (hospedaje+comida)'; costoDiaI.min = '0'; costoDiaI.step = '500';
  costoDiaI.inputMode = 'numeric';
  if (p?.costo_dia != null) costoDiaI.value = p.costo_dia;

  const pasajeI = document.createElement('input');
  pasajeI.type = 'number'; pasajeI.className = 'bp-pasaje';
  pasajeI.placeholder = 'Pasaje/combustible $ (ida+vuelta)'; pasajeI.min = '0'; pasajeI.step = '500';
  pasajeI.inputMode = 'numeric';
  if (p?.pasaje != null) pasajeI.value = p.pasaje;

  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'bp-remove btn btn-ghost btn-sm'; rm.textContent = '× Eliminar viaje';
  rm.addEventListener('click', () => _eliminarItemBP(item, p?.id));

  item.appendChild(zonaI);
  const fechas = document.createElement('div'); fechas.className = 'bp-fechas-row';
  fechas.appendChild(fromI); fechas.appendChild(toI);
  item.appendChild(fechas);
  const gastos = document.createElement('div'); gastos.className = 'bp-gastos-row';
  gastos.appendChild(costoDiaI); gastos.appendChild(pasajeI);
  item.appendChild(gastos);
  item.appendChild(rm);
  return item;
}

async function _eliminarItemBP(item, dbId) {
  const db = store.get('db');
  item?.parentNode?.removeChild(item);
  if (dbId && db) {
    await dbDelete(db, 'basePeriodos', parseInt(dbId)).catch(() => {});
    actualizarBaseHeader();
    showToast('Período eliminado', 'info');
  }
}

/* ═══════════════════════════════════════════════════════════
   LOGO DINÁMICO
   ═══════════════════════════════════════════════════════════ */
let _logoPendiente = null;

export function initLogoUpload() {
  const input = document.getElementById('cfg-logo-input');
  if (!input) return;
  input.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showToast('⚠️ El logo no debe superar 3MB', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      _logoPendiente = ev.target.result;
      /* Preview */
      const prev = document.getElementById('cfg-logo-preview');
      if (prev) { prev.src = _logoPendiente; prev.classList.remove('hide'); }
      /* También actualizar header y PDFs en runtime */
      document.querySelectorAll('.empresa-logo').forEach(img => {
        img.src = _logoPendiente; img.classList.remove('hide');
      });
      showToast('✓ Logo cargado — guardá la configuración para persistirlo', 'success');
    };
    reader.readAsDataURL(file);
  });
}

async function _guardarLogoPendiente() {
  if (!_logoPendiente) return;
  const db = store.get('db');
  await setCfg(db, 'empresa_logo', _logoPendiente);
  _logoPendiente = null;
}

async function _cargarLogoPreview() {
  const db = store.get('db');
  if (!db) return;
  const logo = await getCfg(db, 'empresa_logo', null);
  if (!logo) return;
  const prev = document.getElementById('cfg-logo-preview');
  if (prev) { prev.src = logo; prev.classList.remove('hide'); }
  document.querySelectorAll('.empresa-logo').forEach(img => {
    img.src = logo; img.classList.remove('hide');
  });
}

/* ═══════════════════════════════════════════════════════════
   BACKUP
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   BACKUP — la lógica vive en services/backup.js (formato
   versionado v1 + verificación de integridad). Acá quedan los
   wrappers (mantienen las globales) y el backup de fotos.
   ═══════════════════════════════════════════════════════════ */
export async function exportarBackup() {
  const svc = await import('../services/backup.js');
  await svc.exportarBackup();
  _actualizarLabelBackup();
}

async function _descargarJSON(json, filename) {
  const svc = await import('../services/backup.js');
  svc.descargarJSON(json, filename);
}

/* ── Backup de FOTOS por separado (son pesadas) ────────── */
export async function exportarBackupFotos() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }
  showToast('Generando backup de fotos...', 'info');
  try {
    const fotos = await dbGetAll(db, 'fotos', false).catch(() => []);
    if (!fotos.length) { showToast('No hay fotos para respaldar', 'info'); return; }
    const dump = {
      meta: { app: 'ELECTROMEL', tipo: 'fotos', version: DB_VERSION, exported_at: new Date().toISOString() },
      fotos
    };
    const _fecha = new Date().toISOString().slice(0, 10);
    _descargarJSON(JSON.stringify(dump), 'electromel_fotos_' + _fecha + '.json');
    showToast(`✅ Backup de fotos descargado (${fotos.length})`, 'success');
  } catch (e) {
    showToast('❌ Error al exportar fotos: ' + e.message, 'error');
  }
}

/* ── Restaurar SOLO fotos desde archivo ────────────────── */
export function importarBackupFotos() {
  let fileInput = document.getElementById('cfg-fotos-file');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
    fileInput.id = 'cfg-fotos-file';
    document.body.appendChild(fileInput);
  }
  fileInput.value = '';
  fileInput.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const db = store.get('db');
    showToast('Restaurando fotos...', 'info');
    try {
      const dump = JSON.parse(await file.text());
      if (dump.meta?.tipo !== 'fotos' || !Array.isArray(dump.fotos)) {
        showToast('❌ Ese archivo no es un backup de fotos', 'error');
        return;
      }
      let n = 0;
      for (const foto of dump.fotos) { await dbPut(db, 'fotos', foto).catch(() => {}); n++; }
      showToast(`✅ Restauradas ${n} fotos. Recargá la app.`, 'success');
    } catch (err) {
      showToast('❌ Archivo inválido: ' + err.message, 'error');
    }
  };
  fileInput.click();
}

export async function reindexarClientesUI() {
  showToast('Reconstruyendo índice de clientes...', 'info');
  try {
    const { reindexarClientes } = await import('../services/clientes.js');
    const res = await reindexarClientes();
    if (res.creados > 0) {
      showToast(`✓ ${res.creados} cliente(s) agregado(s) al índice. Total: ${res.total}`, 'success');
    } else {
      showToast(`Índice al día. ${res.total} clientes, ${res.revisados} órdenes revisadas.`, 'success');
    }
  } catch (e) {
    showToast('Error al reindexar: ' + e.message, 'error');
  }
}

export function importarBackup() {
  /* Delegado al servicio: verifica integridad (checksums) antes de
     restaurar y acepta también el formato viejo. */
  import('../services/backup.js').then(svc => svc.importarBackup());
}

/* La restauración vive en services/backup.js (con verificación previa). */

function _actualizarLabelBackup() {
  const db = store.get('db');
  if (!db) return;
  getCfg(db, 'last_backup_ts', null).then(ts => {
    const el = document.getElementById('cfg-last-backup');
    const elTop = document.getElementById('cfg-last-backup-top');
    let txt;
    if (!ts) {
      txt = 'Sin backups previos.';
    } else {
      const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
      const fecha = new Date(ts).toLocaleDateString('es-AR');
      txt = days === 0 ? 'Último backup: hoy' : days === 1 ? 'Último backup: ayer' : `Último backup: ${fecha} (hace ${days} días)`;
    }
    if (el) el.textContent = txt;
    if (elTop) {
      elTop.textContent = txt;
      /* Si hace más de 7 días (o nunca), resaltar en alerta */
      const days = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 999;
      elTop.classList.toggle('cfg-backup-alerta', days >= 7);
    }
  }).catch(() => {});
}

export function checkAutoBackup() {
  const db = store.get('db');
  if (!db) return;
  getCfg(db, 'autobackup_enabled', false).then(enabled => {
    if (!enabled) return;
    return getCfg(db, 'last_backup_ts', null).then(ts => {
      const days = ts ? (Date.now() - new Date(ts).getTime()) / 86400000 : 999;
      if (days >= 7) showToast('💾 Backup semanal disponible — Config → Exportar', 'warn');
    });
  }).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════
   RESET COMPLETO
   ═══════════════════════════════════════════════════════════ */
const RESET_ALWAYS = ['ingresos','ordenes','exteriors','presupuestos','finance_movements','system_logs','rentabilidad_records'];
const RESET_COUNTERS = ['counter_ING','counter_OTT','counter_OTE','counter_PRE'];

export async function ejecutarResetCompleto() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'error'); return; }

  const input = document.getElementById('reset-confirma-texto');
  if (!input || input.value.trim() !== 'RESETEAR') {
    showToast('Escribí RESETEAR para confirmar', 'warn'); return;
  }

  const incluirClientes = !!document.getElementById('reset-incluir-clientes')?.checked;
  const btn = document.getElementById('btn-reset-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Trabajando…'; }

  try {
    /* 1. Backup automático pre-reset (versionado, con integridad) */
    showToast('📦 Generando backup previo...', 'info');
    const svc = await import('../services/backup.js');
    const fname  = 'electromel_backup_pre_reset_' + new Date().toISOString().slice(0,10) + '.json';
    const backup = await svc.generarBackupCompleto({ conFotos: true });
    svc.descargarJSON(backup.json, fname);
    await setCfg(db, 'last_backup_ts', new Date().toISOString());
    await new Promise(r => setTimeout(r, 600));

    /* 2. Vaciar stores */
    showToast('🧹 Borrando datos...', 'info');
    const toWipe = [...RESET_ALWAYS];
    if (incluirClientes) toWipe.push('clientes');

    for (const storeName of toWipe) {
      await new Promise((resolve, reject) => {
        try {
          const tx  = db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).clear();
          req.onsuccess = resolve;
          req.onerror   = () => reject(req.error);
        } catch(e) { reject(e); }
      });
    }

    /* 3. Resetear contadores */
    for (const k of RESET_COUNTERS) await setCfg(db, k, 0);

    invalidateCache();

    await logEvent(db, {
      type: 'SYSTEM_RESET',
      message: 'Reset completo' + (incluirClientes ? ' (incluye clientes)' : ''),
      data: { stores_wiped: toWipe, backup_file: backup.filename }
    });

    document.getElementById('modal-reset')?.classList.remove('active');
    actualizarInfoSistema();
    actualizarBaseHeader();
    showToast('✅ Reset completo. Backup descargado.', 'success');

  } catch(e) {
    console.error('[ejecutarResetCompleto]', e);
    showToast('❌ Error durante el reset: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ CONFIRMAR RESET'; }
  }
}

/* ═══════════════════════════════════════════════════════════
   RENDER DEL PANEL CONFIG
   ═══════════════════════════════════════════════════════════ */
function _buildConfigPanel() {
  const cont = document.getElementById('config-content');
  if (!cont || cont.dataset.built) return;
  cont.dataset.built = '1';

  cont.innerHTML = `
    <!-- ── ACCESO RÁPIDO A BACKUP (fijo arriba) ─────────── -->
    <div class="cfg-backup-rapido">
      <div class="cfg-backup-rapido-info">
        <div class="cfg-backup-rapido-titulo">💾 Backup</div>
        <div class="dim txt-sm" id="cfg-last-backup-top">—</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button" onclick="exportarBackup()">📥 Exportar ahora</button>
    </div>
    <div class="cfg-section" data-cfg-title="💾 Opciones de backup">
      <label class="row center txt-sm" style="gap:8px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" id="cfg-backup-fotos" checked> Incluir fotos en el backup completo
      </label>
      <div style="border-top:1px solid var(--borde);margin-top:8px;padding-top:10px;">
        <div class="txt-sm bold" style="margin-bottom:4px;">📤 Exportar un trabajo</div>
        <div class="dim txt-xs" style="margin-bottom:6px;">Genera un archivo con esa orden y sus datos vinculados (ingreso, pagos, fotos). Ideal para compartir con otro técnico o soporte.</div>
        <div class="row center" style="gap:6px;">
          <input type="text" id="cfg-export-trabajo" placeholder="Ej: OTT-00010" style="flex:1;background:var(--surface-2);border:1px solid var(--borde-2);border-radius:8px;padding:8px;color:var(--texto);font-size:13px;text-transform:uppercase;">
          <button class="btn btn-ghost btn-sm" type="button" onclick="exportarTrabajoUI()">📤 Exportar</button>
        </div>
      </div>
    </div>
    <div class="cfg-section" data-cfg-title="🔔 Recordatorios de turnos">
      <div id="notif-card">
        <div class="dim txt-sm">Cargando…</div>
      </div>
    </div>
    <div class="cfg-section" data-cfg-title="🔑 Modo Maestro">
      <div id="seguridad-card">
        <div class="dim txt-sm">Cargando…</div>
      </div>
    </div>
    <div class="cfg-section" data-cfg-title="🩺 Diagnóstico de la base">
      <div class="dim txt-xs" style="margin-bottom:8px;">Verifica stores, índices, conteos y consistencia. Solo lectura: no modifica nada. Recomendado antes de exportar un backup.</div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="correrDiagnostico()">🩺 Analizar base</button>
      <div id="diag-resultado"></div>
    </div>

    <!-- ── LOGO ────────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="🖼️ Logo de la empresa">
      <div class="dim txt-sm mb-6">El logo aparece en todos los PDFs generados. PNG/JPG, máx. 3MB.</div>
      <div class="field">
        <img id="cfg-logo-preview" class="hide" src="" alt="Logo" style="max-height:80px;max-width:200px;object-fit:contain;border-radius:var(--r-sm);margin-bottom:8px;">
        <label class="btn btn-ghost btn-block" style="cursor:pointer;">
          📁 Elegir logo
          <input type="file" id="cfg-logo-input" accept="image/*" style="display:none;">
        </label>
      </div>
    </div>

    <!-- ── EMPRESA ─────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="🏭 Datos de la empresa">
      <div class="field"><label class="field-label">Nombre *</label><input type="text" id="cfg-empresa-nombre" placeholder="ELECTROMEL"></div>
      <div class="field"><label class="field-label">Subtítulo</label><input type="text" id="cfg-empresa-sub" placeholder="Servicio Técnico..."></div>
      <div class="field-row">
        <div class="field"><label class="field-label">CUIT</label><input type="text" id="cfg-empresa-cuit" placeholder="20-12345678-9"></div>
        <div class="field"><label class="field-label">IIBB</label><input type="text" id="cfg-empresa-iibb"></div>
      </div>
      <div class="field"><label class="field-label">Condición IVA</label><input type="text" id="cfg-empresa-iva" placeholder="Monotributo"></div>
      <div class="field"><label class="field-label">Domicilio</label><input type="text" id="cfg-empresa-domicilio" placeholder="Calle y número"></div>
      <div class="field-row">
        <div class="field"><label class="field-label">Ciudad</label><input type="text" id="cfg-empresa-ciudad"></div>
        <div class="field"><label class="field-label">Provincia</label><input type="text" id="cfg-empresa-provincia"></div>
        <div class="field" style="max-width:90px;"><label class="field-label">CP</label><input type="text" id="cfg-empresa-cp"></div>
      </div>
      <div class="field"><label class="field-label">Teléfono</label><input type="tel" id="cfg-empresa-tel"></div>
      <div class="field"><label class="field-label">Email</label><input type="email" id="cfg-empresa-email"></div>
    </div>

    <!-- ── PERSONAL ────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="👤 Personal">
      <div class="field"><label class="field-label">Nombre del técnico</label><input type="text" id="cfg-tecnico-nombre" placeholder="Nombre completo"></div>
      <div class="field"><label class="field-label">Título</label><input type="text" id="cfg-tecnico-titulo" placeholder="Técnico Electromecánico"></div>
    </div>

    <!-- ── BANCO ───────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="🏦 Datos bancarios">
      <div class="field"><label class="field-label">Titular de la cuenta</label><input type="text" id="cfg-banco-titular" placeholder="A nombre de quién está la cuenta"></div>
      <div class="field"><label class="field-label">Banco</label><input type="text" id="cfg-banco-nombre" placeholder="Nombre del banco"></div>
      <div class="field"><label class="field-label">Alias</label><input type="text" id="cfg-banco-alias"></div>
      <div class="field"><label class="field-label">CBU</label><input type="text" id="cfg-banco-cbu"></div>
    </div>

    <!-- ── CONDICIONES ─────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="📋 Condiciones de servicio">
      <div class="field"><label class="field-label">Leyenda en PDF</label><textarea id="cfg-leyenda-legal" rows="3" placeholder="Texto que aparece al pie de los PDFs..."></textarea></div>
      <div class="field"><label class="field-label">Garantía por defecto</label><input type="text" id="cfg-garantia-default" placeholder="30 días" value="30 días"></div>
      <div class="field"><label class="field-label">Días almacenamiento gratuito</label><input type="number" id="cfg-dias-almacenamiento" min="0" value="30"></div>
    </div>

    <!-- ── BASE PERÍODOS ───────────────────────────────── -->
    <!-- ── DIRECCIÓN DE LA BASE ───────────────────────────── -->
    <div class="cfg-section" data-cfg-title="🏠 Dirección de la base (SMA)">
      <div class="dim txt-sm mb-6">Dirección de referencia de tu base en San Martín de los Andes.</div>
      <div class="card">
        <div class="field"><label class="field-label">Dirección de referencia</label><input type="text" id="cfg-base-sma-dir" placeholder="Calle y número"></div>
      </div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="guardarBasesInfo()">💾 Guardar dirección</button>
    </div>

    <!-- ── CIUDADES Y GASTO OPERATIVO ─────────────────────── -->
    <div class="cfg-section" data-cfg-title="🚗 Ciudades y Gasto Operativo">
      <div class="dim txt-sm mb-6">Configurá el precio de la nafta una sola vez y las ciudades a las que viajás con sus gastos. El combustible se calcula solo según los km y el precio de nafta.</div>

      <div class="card">
        <div class="card-title">⛽ Combustible global</div>
        <div class="field-row">
          <div class="field"><label class="field-label">Precio nafta / litro $</label><input type="number" id="cfg-nafta-precio" min="0" placeholder="1200" inputmode="numeric"></div>
          <div class="field"><label class="field-label">Rendimiento km / L</label><input type="number" id="cfg-nafta-rend" min="1" placeholder="12" inputmode="numeric"></div>
        </div>
        <div class="txt-xs dim mb-6">Aplica a todos los viajes en auto. Lo actualizás una sola vez.</div>
        <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="guardarNaftaGlobal()">💾 Guardar precio nafta</button>
      </div>

      <div class="card-title" style="margin-top:14px;">🏙️ Ciudades configuradas</div>
      <div id="cfg-ciudades-op-list" class="bp-list"><div class="dim txt-sm">Cargando ciudades...</div></div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="abrirFormularioCiudadOp()">+ Agregar ciudad</button>
    </div>

    <!-- ── GOOGLE DRIVE (fotos) ────────────────────────── -->
    <div class="cfg-section" data-cfg-title="☁️ Google Drive (fotos)">
      <div class="dim txt-sm mb-6">Conectá Google Drive para respaldar las fotos de los trabajos. Las fotos se guardan en el teléfono y, cuando actives Drive, se podrán subir automáticamente. (Subida automática: próximamente.)</div>
      <div class="field"><label class="field-label">Client ID</label><input type="text" id="cfg-drive-clientid" placeholder="xxxxx.apps.googleusercontent.com"></div>
      <div class="field"><label class="field-label">API Key</label><input type="text" id="cfg-drive-key" placeholder="API Key de Google"></div>
      <div class="field"><label class="field-label">Carpeta destino (ID)</label><input type="text" id="cfg-drive-folder" placeholder="ID de la carpeta en Drive"></div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="guardarConfigDrive()">💾 Guardar datos de Drive</button>
    </div>

    <!-- ── WHATSAPP ────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="💬 Mensajes WhatsApp">
      <div class="dim txt-sm mb-6">Personalizá los mensajes. Usá {cliente}, {equipo}, {total}, {guia}, {garantia}.</div>
      ${_cfgWaField('cfg-wa-ingreso', 'Ingreso recibido')}
      ${_cfgWaField('cfg-wa-diagnostico', 'En diagnóstico')}
      ${_cfgWaField('cfg-wa-presupuesto', 'Presupuesto enviado')}
      ${_cfgWaField('cfg-wa-aprobado', 'Presupuesto aprobado')}
      ${_cfgWaField('cfg-wa-reparado', 'Reparado — listo')}
      ${_cfgWaField('cfg-wa-listo', 'Listo para retirar')}
      ${_cfgWaField('cfg-wa-enviado', 'Enviado por encomienda')}
      ${_cfgWaField('cfg-wa-entregado', 'Entregado')}
      ${_cfgWaField('cfg-wa-rechazado', 'Presupuesto rechazado')}
      ${_cfgWaField('cfg-wa-rec-15', 'Recordatorio 15 días')}
      ${_cfgWaField('cfg-wa-rec-30', 'Recordatorio 30 días')}
      ${_cfgWaField('cfg-wa-rec-60', 'Recordatorio 60 días')}
      ${_cfgWaField('cfg-wa-rec-120', 'Recordatorio 120 días / Abandono')}
      ${_cfgWaField('cfg-wa-mantenimiento', 'Mantenimiento próximo')}
      ${_cfgWaField('cfg-wa-abono-cobro', 'Recordatorio cobro de abono')}
      ${_cfgWaField('cfg-wa-ing-recibido', 'Ingreso recibido (con datos)')}
      ${_cfgWaField('cfg-wa-doc-completo', 'Presupuesto/Orden completo (con datos bancarios)')}
      ${_cfgWaField('cfg-wa-pago-confirmado', 'Confirmación de pago')}
      ${_cfgWaField('cfg-wa-turno', 'Recordatorio de turno (al agendar)')}
      ${_cfgWaField('cfg-wa-turno-hoy', 'Recordatorio el día del turno')}
    </div>

    <!-- ── PLANTILLAS ──────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="🔖 Plantillas Inteligentes">
      <div class="dim txt-sm mb-6">Textos de uso frecuente ordenados por cantidad de usos. Tappá una para insertarla en el campo activo.</div>
      <div class="tabs-inner" id="plantillas-tabs">
        <button class="tab-inner active" type="button" data-cat="diagnostico" onclick="plantillasFiltrar('diagnostico')">Diagnóstico</button>
        <button class="tab-inner" type="button" data-cat="trabajo" onclick="plantillasFiltrar('trabajo')">Trabajo</button>
        <button class="tab-inner" type="button" data-cat="materiales" onclick="plantillasFiltrar('materiales')">Materiales</button>
        <button class="tab-inner" type="button" data-cat="notas" onclick="plantillasFiltrar('notas')">Notas</button>
      </div>
      <div id="plantillas-lista" style="margin-top:8px;"></div>
      <div class="card" style="background:var(--surface-2);margin-top:12px;">
        <div class="field-row">
          <div class="field">
            <label class="field-label">Categoría</label>
            <select id="nueva-plantilla-cat">
              <option value="diagnostico">Diagnóstico</option>
              <option value="trabajo">Trabajo</option>
              <option value="materiales">Materiales</option>
              <option value="notas">Notas</option>
            </select>
          </div>
        </div>
        <div class="field"><label class="field-label">Texto *</label><textarea id="nueva-plantilla-texto" rows="2" placeholder="Texto de la plantilla..."></textarea></div>
        <button class="btn btn-primary btn-block" type="button" onclick="agregarPlantilla()">➕ Agregar plantilla</button>
      </div>
    </div>

    <!-- ── BACKUP ──────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="💾 Backup y restauración">
      <div class="dim txt-sm" id="cfg-last-backup" style="margin-bottom:8px;">Sin backups previos.</div>
      <div class="field">
        <label class="toggle-label">
          <input type="checkbox" id="cfg-autobackup"> Recordatorio de backup semanal automático
        </label>
      </div>
      <button class="btn btn-primary btn-block" type="button" onclick="exportarBackup()">📥 Exportar backup JSON</button>
      <button class="btn btn-ghost btn-block" type="button" onclick="importarBackup()" style="margin-top:6px;">📤 Restaurar desde backup</button>
      <div class="divider" style="margin:10px 0;"></div>
      <div class="dim txt-sm" style="margin-bottom:6px;">Las fotos se respaldan por separado (son pesadas). Guardá los dos archivos para tener todo.</div>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="exportarBackupFotos()">📷 Exportar fotos</button>
      <button class="btn btn-ghost btn-block btn-sm" type="button" onclick="importarBackupFotos()" style="margin-top:6px;">📷 Restaurar fotos</button>
    </div>

    <!-- ── CLIENTES ─────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="👥 Clientes">
      <div class="dim txt-sm" style="margin-bottom:8px;">Si al cargar un ingreso no te aparecen clientes que ya tenés, tocá acá: reconstruye la lista de clientes a partir de todos tus ingresos y órdenes. Es seguro y no borra nada.</div>
      <button class="btn btn-primary btn-block" type="button" onclick="reindexarClientesUI()">🔄 Reconstruir lista de clientes</button>
    </div>

    <!-- ── INFORMACIÓN DEL SISTEMA ─────────────────────── -->
    <div class="cfg-section" data-cfg-title="ℹ️ Información del sistema">
      <div class="dim txt-sm">Próximos números: <span id="info-next-ing">—</span> · <span id="info-next-ott">—</span> · <span id="info-next-ote">—</span> · <span id="info-next-pre">—</span></div>
      <div class="dim txt-sm" style="margin-top:4px;">App versión: <span id="info-app-version">2.0</span></div>
      <div class="dim txt-sm" style="margin-top:4px;">DB versión: <span id="info-db-version">${DB_VERSION}</span></div>
    </div>

    <!-- ── RESET ───────────────────────────────────────── -->
    <div class="cfg-section" data-cfg-title="⚠️ Reset del sistema">
      <div class="dim txt-sm" style="color:var(--peligro);margin-bottom:8px;">Borra todos los datos operativos. La config de empresa se mantiene.</div>
      <div class="field">
        <label class="field-label">Escribí RESETEAR para confirmar</label>
        <input type="text" id="reset-confirma-texto" placeholder="RESETEAR" oninput="document.getElementById('btn-reset-confirmar').disabled=this.value.trim()!=='RESETEAR'">
      </div>
      <div class="field">
        <label class="toggle-label">
          <input type="checkbox" id="reset-incluir-clientes"> También borrar base de clientes
        </label>
      </div>
      <div id="reset-contadores-grid" class="dim txt-sm"></div>
      <button id="btn-reset-confirmar" class="btn btn-peligro btn-block" type="button" disabled onclick="ejecutarResetCompleto()">🗑️ CONFIRMAR RESET</button>
    </div>

    <!-- GUARDAR TODO -->
    <div style="padding:16px 0;">
      <button class="btn btn-primary btn-block btn-lg" type="button" onclick="guardarConfig()">💾 GUARDAR CONFIGURACIÓN</button>
    </div>
  `;

  /* Inicializar collapsibles */
  _buildCollapsibles();
  /* Logo upload */
  initLogoUpload();
}

function _cfgWaField(id, label) {
  return `<div class="field"><label class="field-label">${label}</label><textarea id="${id}" rows="2"></textarea></div>`;
}

function _buildCollapsibles() {
  const panel = document.getElementById('config-content');
  if (!panel || panel.dataset.colbuilt) return;
  panel.dataset.colbuilt = '1';

  panel.querySelectorAll('.cfg-section').forEach((sec, idx) => {
    const titulo = sec.dataset.cfgTitle || `Sección ${idx+1}`;
    const wrap   = document.createElement('div');
    wrap.className = 'collapsible'; /* todas cerradas: menos scroll, abrís lo que necesitás */

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    header.innerHTML = `<div class="collapsible-header-title">${titulo}</div><div class="collapsible-arrow">▼</div>`;
    header.onclick = () => wrap.classList.toggle('open');

    const body = document.createElement('div');
    body.className = 'collapsible-body';

    sec.parentNode.insertBefore(wrap, sec);
    body.appendChild(sec);
    wrap.appendChild(header);
    wrap.appendChild(body);
  });
}

/* ═══════════════════════════════════════════════════════════
   INICIALIZACIÓN
   ═══════════════════════════════════════════════════════════ */
export function initConfig() {
  bus.on('tab:cambio', async ({ to }) => {
    if (to !== 'config') return;
    _buildConfigPanel();
    await cargarConfig();
    _actualizarLabelBackup();
    actualizarInfoSistema();
    /* Cargar plantillas en el panel */
    const { plantillasFiltrar } = await import('./plantillas/index.js');
    plantillasFiltrar('diagnostico');
    /* Cargar sección de bases y zonas */
    import('./zonas.ui.js').then(m => m.renderZonasConfig()).catch(() => {});
    /* Cargar módulo de diagnóstico (define las globales del botón) */
    import('../services/diagnostico.js').catch(() => {});
    /* Cargar servicio de backup (define exportarTrabajoUI) */
    import('../services/backup.js').catch(() => {});
    /* Card de Modo Maestro */
    import('../services/seguridad.js').then(m => m.renderSeguridadCard()).catch(() => {});
    /* Card de notificaciones */
    import('../services/notificaciones.js').then(m => m.renderNotifCard()).catch(() => {});
  });
}
