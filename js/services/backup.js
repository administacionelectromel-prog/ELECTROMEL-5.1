/* ═══════════════════════════════════════════════════════════
   💾 BACKUP VERSIONADO — Paso 1 de la migración
   Formato v1 con encabezado, checksums SHA-256 por store y
   verificación de integridad ANTES de restaurar (si el archivo
   está dañado, no se toca la base). Compatible con backups
   viejos (formato legacy { meta, data }). Incluye export de un
   trabajo individual (OTT/OTE/ING/PRE + sus relacionados).
   La lista de stores se deriva del esquema: nunca más un store
   olvidado (lección del defecto "campanias").
   ═══════════════════════════════════════════════════════════ */
import { store }  from '../core/store.js';
import { DB_SCHEMA, DB_VERSION, dbGetAll, dbGet, getCfg, setCfg,
         logEvent, invalidateCache } from '../core/db.js';
import { showToast, confirmarLindo } from '../core/ui.js';

export const BACKUP_FORMAT  = 'electromel-backup';
export const TRABAJO_FORMAT = 'electromel-trabajo';
export const BACKUP_VERSION = 1;
const APP_VERSION = '7.4';

/* Stores respaldables = todos los del esquema (derivado, no lista manual) */
export function storesRespaldables() {
  return Object.keys(DB_SCHEMA);
}

/* ── SHA-256 hex (Web Crypto nativo) ─────────────────────── */
export async function sha256hex(str) {
  try {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return 'nohash'; }
}

/* ═══════════════ FUNCIONES PURAS (testeables) ═══════════════ */

/* Armar el objeto de backup v1 a partir de { store: [registros] } */
export async function armarBackupV1(datosPorStore, opts = {}) {
  const { conFotos = true, appVersion = APP_VERSION, dbVersion = DB_VERSION } = opts;
  const stores = {}, checksums = {};
  let total = 0;
  for (const [s, regs] of Object.entries(datosPorStore)) {
    if (!conFotos && s === 'fotos') continue;
    stores[s] = Array.isArray(regs) ? regs : [];
    total += stores[s].length;
    checksums[s] = await sha256hex(JSON.stringify(stores[s]));
  }
  return {
    format:        BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion,
    dbVersion,
    createdAt:     new Date().toISOString(),
    meta:          { conFotos, totalRegistros: total },
    checksums,
    stores
  };
}

/* Normalizar: acepta v1 y legacy { meta, data } → estructura común */
export function normalizarBackup(dump) {
  if (dump && dump.format === BACKUP_FORMAT && dump.stores && typeof dump.stores === 'object') {
    return {
      formato: 'v1', backupVersion: dump.backupVersion || 1,
      dbVersion: dump.dbVersion ?? null, createdAt: dump.createdAt || null,
      checksums: dump.checksums || null, stores: dump.stores
    };
  }
  if (dump && dump.data && typeof dump.data === 'object') {
    return {
      formato: 'legacy', backupVersion: 0,
      dbVersion: dump.meta?.version ?? null, createdAt: dump.meta?.exported_at || null,
      checksums: null, stores: dump.data
    };
  }
  return null;
}

/* Verificar integridad SIN tocar la base.
   Devuelve { ok, formato, problemas[], avisos[], resumen{store:n}, total, createdAt } */
export async function verificarBackup(dump) {
  const inf = { ok: false, formato: null, problemas: [], avisos: [], resumen: {}, total: 0, createdAt: null };
  const n = normalizarBackup(dump);
  if (!n) { inf.problemas.push('Formato de backup no reconocido'); return inf; }
  inf.formato   = n.formato;
  inf.createdAt = n.createdAt;

  const conocidos = storesRespaldables();
  for (const [s, regs] of Object.entries(n.stores)) {
    if (!Array.isArray(regs)) { inf.problemas.push(`El store "${s}" no es una lista válida`); continue; }
    if (!conocidos.includes(s)) { inf.avisos.push(`Store "${s}" no existe en esta versión: se ignora`); continue; }
    inf.resumen[s] = regs.length;
    inf.total += regs.length;
  }
  if (n.checksums) {
    for (const [s, sum] of Object.entries(n.checksums)) {
      if (!(s in n.stores)) continue;
      const calc = await sha256hex(JSON.stringify(n.stores[s]));
      if (calc !== sum) inf.problemas.push(`Integridad dañada en "${s}" (checksum no coincide)`);
    }
  }
  if (n.dbVersion != null && n.dbVersion > DB_VERSION)
    inf.problemas.push(`El backup es de una base más nueva (v${n.dbVersion}) que esta app (v${DB_VERSION})`);

  inf.ok = inf.problemas.length === 0;
  return inf;
}

/* Armar paquete de UN trabajo (puro) */
export async function armarPaqueteTrabajo(numero, tipo, data) {
  const paquete = {
    format:     TRABAJO_FORMAT,
    version:    1,
    appVersion: APP_VERSION,
    dbVersion:  DB_VERSION,
    createdAt:  new Date().toISOString(),
    numero, tipo,
    data
  };
  paquete.checksum = await sha256hex(JSON.stringify(paquete.data));
  return paquete;
}

/* ═══════════════ OPERACIONES SOBRE LA BASE ═══════════════ */

export function descargarJSON(json, filename) {
  /* Delegado a la capa única services/files.js (web idéntica;
     en el APK usa guardado/compartir nativo). */
  import('./files.js').then(f => f.descargarJSON(json, filename));
}

/* Generar el backup completo desde la base real */
export async function generarBackupCompleto({ conFotos = true } = {}) {
  const db = store.get('db');
  if (!db) throw new Error('DB no disponible');
  const reales = Array.from(db.objectStoreNames);
  const datos  = {};
  await Promise.all(storesRespaldables().filter(s => reales.includes(s)).map(async s => {
    try { datos[s] = await dbGetAll(db, s, false); } catch (e) { datos[s] = []; }
  }));
  const dump  = await armarBackupV1(datos, { conFotos });
  const ahora = new Date();
  const filename = 'electromel_backup_' + ahora.toISOString().slice(0, 10) + '_' +
                   ahora.toTimeString().slice(0, 5).replace(':', '') + '.json';
  return { json: JSON.stringify(dump, null, 2), filename, dump };
}

/* Exportar (UI): respeta el checkbox "incluir fotos" si existe */
export async function exportarBackup() {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }
  const chk = document.getElementById('cfg-backup-fotos');
  const conFotos = chk ? !!chk.checked : true;
  showToast('Generando backup...', 'info');
  try {
    const { json, filename, dump } = await generarBackupCompleto({ conFotos });
    descargarJSON(json, filename);
    await setCfg(db, 'last_backup_ts', new Date().toISOString());
    await logEvent(db, { type: 'BACKUP_CREATED', message: 'Backup v1: ' + filename,
                         data: { total: dump.meta.totalRegistros, conFotos } }).catch(()=>{});
    showToast(`✅ Backup descargado (${dump.meta.totalRegistros} registros${conFotos ? '' : ', sin fotos'})`, 'success');
  } catch (e) {
    showToast('❌ Error al exportar: ' + e.message, 'error');
  }
}

/* Importar (UI): verificar → confirmar con resumen → restaurar */
export function importarBackup() {
  let fileInput = document.getElementById('cfg-backup-file');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
    fileInput.id = 'cfg-backup-file';
    document.body.appendChild(fileInput);
  }
  fileInput.value = '';
  fileInput.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dump = JSON.parse(await file.text());
      const inf  = await verificarBackup(dump);
      if (!inf.ok) {
        showToast('❌ Backup rechazado: ' + inf.problemas[0], 'error');
        console.warn('[importarBackup] problemas:', inf.problemas);
        return;
      }
      const fecha = inf.createdAt ? new Date(inf.createdAt).toLocaleDateString('es-AR') : 'desconocida';
      const ok = await confirmarLindo(
        `Backup verificado ✅\n\nFormato: ${inf.formato === 'v1' ? 'versionado v1' : 'anterior (compatible)'}\nFecha: ${fecha}\nRegistros: ${inf.total}\n\n⚠️ Esto REEMPLAZARÁ los datos actuales de los stores incluidos. ¿Continuar?`,
        { titulo: 'Restaurar backup', textoOk: 'Restaurar', peligro: true }
      );
      if (!ok) return;
      await _restaurar(normalizarBackup(dump).stores);
    } catch (err) {
      showToast('❌ Archivo inválido: ' + err.message, 'error');
    }
  };
  fileInput.click();
}

async function _restaurar(storesDump) {
  const db = store.get('db');
  showToast('Restaurando backup...', 'info');
  const reales    = Array.from(db.objectStoreNames);
  const conocidos = storesRespaldables();
  const stores    = Object.keys(storesDump).filter(s => conocidos.includes(s) && reales.includes(s));

  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const os = tx.objectStore(storeName);
        const cr = os.clear();
        cr.onsuccess = () => {
          const records = storesDump[storeName] || [];
          if (!records.length) { resolve(); return; }
          let pending = records.length;
          records.forEach(r => {
            const req = os.put(r);
            req.onsuccess = () => { if (--pending === 0) resolve(); };
            req.onerror   = () => reject(req.error);
          });
        };
        cr.onerror = () => reject(cr.error);
      } catch (e) { reject(e); }
    });
  }

  invalidateCache();
  await logEvent(db, { type: 'BACKUP_RESTORED', message: 'Backup importado (verificado)', data: { stores } }).catch(()=>{});
  showToast('✅ Backup restaurado — recargá la página', 'success');
  setTimeout(async () => {
    if (await confirmarLindo('¿Recargar ahora?', { titulo: 'Recargar', peligro: false, textoOk: 'Recargar' }))
      window.location.reload();
  }, 800);
}

/* ── Exportar UN trabajo (OTT/OTE/ING/PRE + relacionados) ── */
const _STORE_POR_PREFIJO = { OTT: 'ordenes', OTE: 'exteriors', ING: 'ingresos', PRE: 'presupuestos' };

export async function exportarTrabajo(numeroRaw) {
  const db = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }
  const numero = (numeroRaw || '').trim().toUpperCase();
  const pref   = numero.slice(0, 3);
  const storeName = _STORE_POR_PREFIJO[pref];
  if (!storeName) { showToast('Número inválido. Ej: OTT-00010, ING-00009', 'warn'); return; }

  try {
    const principal = await dbGet(db, storeName, numero);
    if (!principal) { showToast(`No existe ${numero}`, 'warn'); return; }

    /* Vinculado directo (ingreso de la OTT, o la OTT de un ingreso) */
    let vinculado = null;
    if (pref === 'OTT' && principal.numIngreso)
      vinculado = await dbGet(db, 'ingresos', principal.numIngreso).catch(() => null);
    if (pref === 'ING' && principal.convertido_a_ott)
      vinculado = await dbGet(db, 'ordenes', principal.convertido_a_ott).catch(() => null);

    const numeros = [numero, vinculado?.numero].filter(Boolean);

    /* Relacionados: movimientos de caja, fotos, rentabilidad */
    const [finanzas, fotos, renta] = await Promise.all([
      dbGetAll(db, 'finance_movements', false).catch(() => []),
      dbGetAll(db, 'fotos', false).catch(() => []),
      dbGetAll(db, 'rentabilidad_records', false).catch(() => [])
    ]);
    const data = {
      principal,
      vinculado,
      movimientos:  finanzas.filter(m => numeros.includes(m.related_order_id)),
      fotos:        fotos.filter(f => numeros.includes(f.orden_numero)),
      rentabilidad: renta.filter(r => numeros.includes(r.numero) || numeros.includes(r.orden) || numeros.includes(r.orden_numero))
    };
    const paquete = await armarPaqueteTrabajo(numero, pref, data);
    descargarJSON(JSON.stringify(paquete, null, 2), 'electromel_' + numero + '.json');
    await logEvent(db, { type: 'TRABAJO_EXPORTED', message: 'Export trabajo: ' + numero }).catch(()=>{});
    showToast(`✅ ${numero} exportado (${data.movimientos.length} mov., ${data.fotos.length} fotos)`, 'success');
  } catch (e) {
    showToast('❌ Error al exportar: ' + e.message, 'error');
  }
}

window.exportarTrabajoUI = () => {
  const inp = document.getElementById('cfg-export-trabajo');
  exportarTrabajo(inp?.value || '');
};
