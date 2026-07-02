/**
 * ELECTROMEL — components/camera/camera.js
 * Captura de fotos desde cámara móvil.
 *
 * Estrategia Android-first:
 *   1. getUserMedia (PWA instalada con HTTPS)
 *   2. <input type="file" capture="environment"> (fallback universal)
 *
 * Uso:
 *   const cam = new Camera({ onCapture: (blob, previewUrl) => { ... } });
 *   cam.open();
 */

export class Camera {
  /**
   * @param {Object} opts
   * @param {Function} opts.onCapture    - (blob, previewUrl) => void
   * @param {string}   [opts.facing='environment']  - 'environment'|'user'
   * @param {Object}   [opts.compress]  - opciones de compresión (pasadas a media.compress)
   */
  constructor(opts = {}) {
    this._opts    = { facing: 'environment', ...opts };
    this._stream  = null;
    this._modal   = null;
    this._built   = false;
  }

  /* ── Abrir cámara ─────────────────────────────────────── */
  async open() {
    /* Intentar getUserMedia primero */
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        await this._openUserMedia();
        return;
      } catch(e) {
        console.warn('[Camera] getUserMedia falló, usando input fallback:', e.message);
      }
    }
    /* Fallback: input file con capture */
    this._openInputFallback();
  }

  /* ── getUserMedia ─────────────────────────────────────── */
  async _openUserMedia() {
    this._buildModal();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this._opts.facing,
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    this._stream = stream;
    const video  = this._modal.querySelector('.cam-video');
    if (video)   { video.srcObject = stream; video.play(); }
    this._modal.classList.add('active');
  }

  _buildModal() {
    if (this._built) return;
    this._built = true;

    const el = document.createElement('div');
    el.className = 'modal cam-modal';
    el.innerHTML = `
      <div class="modal-header">
        <button class="modal-close cam-cancel" type="button">×</button>
        <div class="modal-title">📷 Tomar foto</div>
      </div>
      <div class="modal-body cam-body">
        <div class="cam-preview-wrap">
          <video class="cam-video" playsinline autoplay muted></video>
          <div class="cam-overlay-grid"></div>
        </div>
        <div class="cam-controls">
          <button class="btn btn-ghost cam-flip" type="button" title="Cambiar cámara">🔄</button>
          <button class="btn cam-shutter" type="button">📷</button>
          <div style="width:44px;"></div>
        </div>
      </div>`;

    document.body.appendChild(el);
    this._modal = el;

    const canvas = document.createElement('canvas');
    this._canvas = canvas;

    el.querySelector('.cam-cancel').addEventListener('click', () => this.close());
    el.querySelector('.cam-shutter').addEventListener('click', () => this._capture());
    el.querySelector('.cam-flip').addEventListener('click',   () => this._flipCamera());
  }

  async _capture() {
    const video = this._modal.querySelector('.cam-video');
    if (!video) return;

    this._canvas.width  = video.videoWidth  || 1280;
    this._canvas.height = video.videoHeight || 720;
    const ctx = this._canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    /* Comprimir vía media.compress si está disponible */
    let blob;
    try {
      const { compressCanvas } = await import('../../js/services/media/media.compress.js');
      blob = await compressCanvas(this._canvas, { quality: 0.82, format: 'webp' });
    } catch(e) {
      blob = await new Promise(r => this._canvas.toBlob(r, 'image/jpeg', 0.85));
    }

    const previewUrl = URL.createObjectURL(blob);
    this.close();
    this._opts.onCapture?.(blob, previewUrl);
  }

  _flipCamera() {
    this._opts.facing = this._opts.facing === 'environment' ? 'user' : 'environment';
    this.close();
    this.open();
  }

  /* ── Input fallback ───────────────────────────────────── */
  _openInputFallback() {
    let input = document.getElementById('_cam-input-fallback');
    if (!input) {
      input = document.createElement('input');
      input.type    = 'file';
      input.accept  = 'image/*';
      input.capture = this._opts.facing === 'user' ? 'user' : 'environment';
      input.id      = '_cam-input-fallback';
      input.style.display = 'none';
      document.body.appendChild(input);
    }

    input.value = '';
    input.onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      let blob = file;
      try {
        const { compressBlob } = await import('../../js/services/media/media.compress.js');
        blob = await compressBlob(file, { maxWidth: 1280, quality: 0.82 });
      } catch(e) { /* usar original */ }

      const previewUrl = URL.createObjectURL(blob);
      this._opts.onCapture?.(blob, previewUrl);
    };
    input.click();
  }

  /* ── Cerrar ────────────────────────────────────────────── */
  close() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._modal?.classList.remove('active');
  }

  destroy() {
    this.close();
    if (this._modal && document.body.contains(this._modal)) {
      document.body.removeChild(this._modal);
    }
    this._built = false;
  }
}
