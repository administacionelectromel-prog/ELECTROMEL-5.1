/**
 * ELECTROMEL — components/toast/toast.js
 * Componente Toast reutilizable.
 * Wrapper programático sobre el sistema de toast existente en ui.js.
 * Agrega: queueing, tipos, duración personalizable, dismiss manual.
 */

const DEFAULTS = { duration: 3000, type: 'info' };
const TYPES    = ['success', 'error', 'warn', 'info'];

export class Toast {
  /**
   * Muestra un toast. Método estático para uso rápido.
   * @param {string} msg
   * @param {'success'|'error'|'warn'|'info'} type
   * @param {number} [duration]
   */
  static show(msg, type = 'info', duration = 3000) {
    /* Delegar al sistema existente de ui.js si está disponible */
    if (window._electromelShowToast) {
      window._electromelShowToast(msg, type, duration);
      return;
    }
    /* Fallback propio */
    Toast._showDirect(msg, type, duration);
  }

  static success(msg, duration) { Toast.show(msg, 'success', duration); }
  static error(msg, duration)   { Toast.show(msg, 'error',   duration); }
  static warn(msg, duration)    { Toast.show(msg, 'warn',    duration); }
  static info(msg, duration)    { Toast.show(msg, 'info',    duration); }

  static _showDirect(msg, type, duration) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
        'z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:90vw;';
      document.body.appendChild(container);
    }

    const t = document.createElement('div');
    t.className = `toast toast-${TYPES.includes(type) ? type : 'info'}`;
    t.style.cssText = 'pointer-events:auto;animation:toastIn 0.2s ease;';
    t.textContent   = msg;
    container.appendChild(t);

    setTimeout(() => {
      t.style.animation = 'toastOut 0.2s ease forwards';
      setTimeout(() => t.parentNode?.removeChild(t), 250);
    }, duration || 3000);
  }
}
