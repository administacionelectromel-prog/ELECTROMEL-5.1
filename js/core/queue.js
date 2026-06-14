/**
 * ELECTROMEL — core/queue.js
 * Task Queue con requestIdleCallback para tareas en background.
 * Evita freeze de UI al comprimir fotos, generar thumbnails, analytics.
 *
 * Uso:
 *   import { queue } from './core/queue.js';
 *   queue.add(() => compressAll(blob), { priority: 'low', label: 'compress' });
 *   queue.add(() => generarPDF(num),   { priority: 'high', label: 'pdf' });
 */

const PRIORITY = { high: 0, normal: 1, low: 2 };

class TaskQueue {
  constructor() {
    this._tasks    = [];   /* [{ fn, priority, label, resolve, reject }] */
    this._running  = false;
    this._paused   = false;
    this._stats    = { enqueued: 0, completed: 0, errors: 0 };
  }

  /* ── API pública ──────────────────────────────────────── */

  /**
   * Encola una tarea.
   * @param {Function} fn - async () => result
   * @param {Object} [opts]
   * @param {'high'|'normal'|'low'} [opts.priority='normal']
   * @param {string}  [opts.label]
   * @returns {Promise<*>}
   */
  add(fn, opts = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        fn, resolve, reject,
        priority: PRIORITY[opts.priority] ?? PRIORITY.normal,
        label:    opts.label || 'task',
        added_at: Date.now()
      };
      this._tasks.push(task);
      this._tasks.sort((a, b) => a.priority - b.priority);
      this._stats.enqueued++;
      this._schedule();
    });
  }

  /** Pausa el procesamiento (la tarea en curso termina normalmente). */
  pause()  { this._paused = true; }

  /** Reanuda el procesamiento. */
  resume() { this._paused = false; this._schedule(); }

  /** Vacía la cola (las tareas pendientes son rechazadas). */
  clear()  {
    const pending = this._tasks.splice(0);
    pending.forEach(t => t.reject(new Error('Queue cleared')));
  }

  /** Estadísticas. */
  get stats() { return { ...this._stats, pending: this._tasks.length, running: this._running }; }

  /* ── Internos ─────────────────────────────────────────── */

  _schedule() {
    if (this._running || this._paused || !this._tasks.length) return;

    const run = () => {
      if (this._paused || !this._tasks.length) { this._running = false; return; }
      this._running = true;
      const task = this._tasks.shift();
      this._runTask(task).finally(() => {
        this._running = false;
        if (this._tasks.length) this._scheduleNext(run);
      });
    };

    this._scheduleNext(run);
  }

  _scheduleNext(run) {
    /* Usar requestIdleCallback si disponible, sino requestAnimationFrame */
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      requestAnimationFrame(run);
    }
  }

  async _runTask(task) {
    try {
      const result = await task.fn();
      this._stats.completed++;
      task.resolve(result);
    } catch(e) {
      this._stats.errors++;
      console.warn(`[queue] Task "${task.label}" failed:`, e.message);
      task.reject(e);
    }
  }
}

/* ── Instancia global singleton ──────────────────────── */
export const queue = new TaskQueue();

/* ── Instancias especializadas ───────────────────────── */
export const mediaQueue    = new TaskQueue(); /* para comprimir imágenes */
export const analyticsQueue = new TaskQueue(); /* para calcular analytics */
export const pdfQueue      = new TaskQueue();  /* para generar PDFs */

/**
 * Atajo para encolar compresión de imágenes (baja prioridad).
 * @param {Function} fn
 * @returns {Promise}
 */
export function enqueueMediaTask(fn, label = 'media') {
  return mediaQueue.add(fn, { priority: 'low', label });
}

/**
 * Atajo para tareas de alta prioridad (respuesta de usuario).
 * @param {Function} fn
 * @returns {Promise}
 */
export function enqueueUrgent(fn, label = 'urgent') {
  return queue.add(fn, { priority: 'high', label });
}
