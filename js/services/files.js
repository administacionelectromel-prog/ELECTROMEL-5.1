/* ═══════════════════════════════════════════════════════════
   🗂️ FILES — Capa única de guardado/descarga de archivos
   Paso 3 de la migración a APK.

   · En la WEB se comporta EXACTAMENTE igual que siempre
     (Blob + <a download> / doc.save de jsPDF).
   · En el APK (Capacitor) usa Filesystem + Share nativos:
     guarda el archivo y abre el menú de compartir (WhatsApp,
     Archivos, imprimir, etc.).
   · Si el camino nativo falla, cae al camino web.

   Todos los PDFs, la etiqueta JPG, el CSV y los backups pasan
   por acá: un solo punto de mantenimiento.
   ═══════════════════════════════════════════════════════════ */

/* ¿Estamos corriendo dentro del APK (Capacitor nativo)? */
export function esNativo() {
  try {
    const C = window.Capacitor;
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  } catch (e) { return false; }
}

/* ── Camino WEB (el de siempre) ──────────────────────────── */
function _descargaWeb(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Camino NATIVO (Capacitor: Filesystem + Share) ───────── */
function _blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

async function _guardarNativo(blob, filename) {
  const P  = window.Capacitor?.Plugins;
  const FS = P?.Filesystem;
  if (!FS) throw new Error('Filesystem nativo no disponible');
  const data = await _blobABase64(blob);
  const res  = await FS.writeFile({ path: filename, data, directory: 'CACHE', recursive: true });
  const uri  = res?.uri || (await FS.getUri({ path: filename, directory: 'CACHE' }))?.uri;
  const SH   = P?.Share;
  if (SH && uri) {
    await SH.share({ title: filename, url: uri, dialogTitle: 'Guardar o compartir ' + filename });
  }
  return uri;
}

/* ── API pública ─────────────────────────────────────────── */

/* Punto único: recibe un Blob y lo entrega al usuario. */
export async function descargarBlob(blob, filename) {
  if (esNativo()) {
    try { await _guardarNativo(blob, filename); return; }
    catch (e) { console.warn('[files] nativo falló, uso web:', e); }
  }
  _descargaWeb(blob, filename);
}

/* Desde un dataURL (ej: canvas de la etiqueta JPG). */
export async function descargarDataUrl(dataUrl, filename) {
  try {
    const arr  = dataUrl.split(',');
    const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    await descargarBlob(new Blob([u8], { type: mime }), filename);
  } catch (e) {
    /* Último recurso: link directo al dataURL */
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    a.click();
  }
}

/* Texto plano / CSV. */
export async function descargarTexto(texto, filename, mime = 'text/plain;charset=utf-8') {
  await descargarBlob(new Blob([texto], { type: mime }), filename);
}

/* JSON (backups, export de trabajos). */
export async function descargarJSON(json, filename) {
  await descargarBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), filename);
}

/* PDF de jsPDF: en web usa doc.save (idéntico a siempre);
   en el APK convierte a Blob y va por el camino nativo. */
export async function guardarPDF(doc, filename) {
  if (!esNativo()) { doc.save(filename); return; }
  try {
    const blob = doc.output('blob');
    await _guardarNativo(blob, filename);
  } catch (e) {
    console.warn('[files] PDF nativo falló, uso doc.save:', e);
    doc.save(filename);
  }
}
