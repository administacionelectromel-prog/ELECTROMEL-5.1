/**
 * ELECTROMEL — modules/qr.scanner.js
 * Lector de QR dentro de la app, usando la cámara.
 * Usa BarcodeDetector (nativo en Chrome Android). Si no está disponible,
 * avisa al usuario que use la cámara normal del teléfono.
 *
 * Al detectar un QR con #equipo=XXX-000, abre la ficha de ese equipo.
 */

import { showToast } from '../core/ui.js';

let _stream = null;
let _scanning = false;

export async function abrirLectorQR() {
  const overlay = document.getElementById('modal-qr-scanner');
  const video   = document.getElementById('qr-video');
  if (!overlay || !video) { showToast('Lector no disponible', 'error'); return; }

  /* Verificar soporte */
  if (!('BarcodeDetector' in window)) {
    showToast('Tu navegador no tiene lector integrado. Usá la cámara normal del teléfono para escanear el QR.', 'warn');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('No se puede acceder a la cámara', 'error');
    return;
  }

  overlay.classList.add('active');

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = _stream;
    await video.play();
    _scanning = true;
    _loopDeteccion(video);
  } catch (e) {
    console.error('[qr] cámara:', e);
    showToast('No se pudo abrir la cámara: ' + e.message, 'error');
    cerrarLectorQR();
  }
}

async function _loopDeteccion(video) {
  let detector;
  try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); }
  catch (e) { showToast('Lector no soportado', 'error'); cerrarLectorQR(); return; }

  const tick = async () => {
    if (!_scanning) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length) {
        const valor = codes[0].rawValue || '';
        _procesarQR(valor);
        return;   // detenemos al primer match
      }
    } catch (e) { /* seguir intentando */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function _procesarQR(valor) {
  /* Buscar patrón #equipo=XXX-000 o el número directo */
  let numero = null;
  const m = valor.match(/equipo=([A-Za-z]+-\d+)/);
  if (m) numero = m[1];
  else {
    const m2 = valor.match(/\b([A-Za-z]{3}-\d+)\b/);
    if (m2) numero = m2[1];
  }

  if (!numero) {
    showToast('QR no reconocido', 'warn');
    cerrarLectorQR();
    return;
  }

  cerrarLectorQR();
  const tipo = numero.split('-')[0].toUpperCase();
  showToast('Abriendo ' + numero + '...', 'success');
  setTimeout(() => {
    if (window.abrirModalDetalle) window.abrirModalDetalle(numero, tipo);
  }, 300);
}

export function cerrarLectorQR() {
  _scanning = false;
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  const overlay = document.getElementById('modal-qr-scanner');
  if (overlay) overlay.classList.remove('active');
  const video = document.getElementById('qr-video');
  if (video) video.srcObject = null;
}
