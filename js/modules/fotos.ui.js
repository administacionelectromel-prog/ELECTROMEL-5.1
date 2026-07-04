/**
 * ELECTROMEL — modules/fotos.ui.js
 * Galería de fotos por trabajo. Modal reutilizable (#modal-fotos).
 */

import { guardarFoto, fotosDeOrden, eliminarFoto } from '../services/fotos.js';
import { showToast, openModal, closeModal } from '../core/ui.js';

const $ = id => document.getElementById(id);

/* ── Abrir galería para una orden ──────────────────────── */
export async function abrirGaleriaFotos(ordenNumero) {
  const num = ordenNumero || '';
  const inp = $('fotos-orden-numero'); if (inp) inp.value = num;
  const lbl = $('fotos-orden-label');  if (lbl) lbl.textContent = num ? `Orden: ${num}` : 'Sin orden asociada';
  openModal('modal-fotos');
  await renderGaleria(num);
}

export function cerrarGaleriaFotos() {
  closeModal('modal-fotos');
}

/* ── Render de las miniaturas ──────────────────────────── */
async function renderGaleria(ordenNumero) {
  const cont = $('fotos-galeria');
  if (!cont) return;
  cont.innerHTML = '<div class="dim txt-sm">Cargando...</div>';
  let fotos = [];
  try { fotos = await fotosDeOrden(ordenNumero); }
  catch (e) { cont.innerHTML = '<div class="dim txt-sm">Error al cargar fotos.</div>'; return; }

  if (!fotos.length) {
    cont.innerHTML = '<div class="dim txt-sm" style="padding:8px 0;">Sin fotos todavía. Tocá "Agregar foto".</div>';
    return;
  }
  cont.innerHTML = fotos.map(f => `
    <div class="foto-item">
      <img src="${f.dataUrl}" alt="foto" loading="lazy" onclick="_verFotoGrande('${f.id}')">
      <button class="foto-del" type="button" onclick="_borrarFoto('${f.id}')">🗑️</button>
    </div>`).join('');
}

/* ── Procesar fotos seleccionadas/sacadas ──────────────── */
export async function _onFotosSeleccionadas(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  const num = $('fotos-orden-numero')?.value || '';
  showToast('Procesando fotos...', 'info');
  let ok = 0;
  for (const file of files) {
    try { await guardarFoto(num, file); ok++; }
    catch (e) { console.error('[foto]', e); }
  }
  event.target.value = '';
  await renderGaleria(num);
  showToast(`✓ ${ok} foto(s) guardada(s)`, 'success');
}

/* ── Borrar una foto ───────────────────────────────────── */
export async function _borrarFoto(id) {
  await eliminarFoto(id);
  const num = $('fotos-orden-numero')?.value || '';
  await renderGaleria(num);
  showToast('Foto eliminada', 'info');
}

/* ── Ver foto en grande (usa el visor existente si está) ─ */
export async function _verFotoGrande(id) {
  const num = $('fotos-orden-numero')?.value || '';
  const fotos = await fotosDeOrden(num).catch(() => []);
  const f = fotos.find(x => x.id === id);
  if (!f) return;
  /* En el APK no hay pestañas: se comparte/guarda la foto */
  if (window.Capacitor?.isNativePlatform?.()) {
    import('../services/files.js').then(x => x.descargarDataUrl(f.dataUrl, (num || 'foto') + '_' + id + '.jpg'));
    return;
  }
  /* Abrir en nueva pestaña como fallback simple */
  const w = window.open('');
  if (w) w.document.write(`<img src="${f.dataUrl}" style="max-width:100%;">`);
}
