/**
 * ELECTROMEL ERP — Service Worker v3
 * Estrategias:
 *   - App shell (JS/CSS propios): stale-while-revalidate
 *   - CDN libs (jsPDF, qrcode): cache-first permanente
 *   - IndexedDB: no interceptado (local)
 *
 * v3 agrega:
 *   - SHELL_ASSETS actualizado (subdirectorios panel/, plantillas/, pdf/, agenda/)
 *   - Monolitos eliminados (agenda.js, recibo.js, pdf.js, panel.js, plantillas.js)
 *   - Soporte mensaje CLEAR_CACHE
 */

const CACHE_VERSION = 'electromel-v2-0s';
const CDN_CACHE     = 'electromel-cdn-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  /* Libs locales (sin CDN) */
  './libs/jspdf.umd.min.js',
  './libs/jspdf.plugin.autotable.min.js',
  './libs/qrcode.min.js',
  /* CSS */
  './css/variables.css',
  './css/reset.css',
  './css/layout.css',
  './css/components.css',
  './css/modals.css',
  './css/panels.css',
  './css/agenda.css',
  /* JS core */
  './js/app.js',
  './js/core/db.js',
  './js/core/store.js',
  './js/core/estados.js',
  './js/core/utils.js',
  './js/core/config.js',
  './js/core/ui.js',
  /* JS services */
  './js/services/finance.js',
  './js/services/whatsapp.js',
  './js/services/whatsapp.vars.js',
  './js/services/clientes.js',
  './js/services/rentabilidad.js',
  './js/services/garantia.js',
  './js/services/mantenimientos.js',
  './js/services/zonas.js',
  './js/services/migracion.js',
  './js/services/analisis.zonas.js',
  './js/services/etiqueta.img.js',
  './js/services/abonos.js',
  './js/services/flota.js',
  './js/services/por.cobrar.js',
  './js/services/metricas.js',
  './js/modules/flota.ui.js',
  './js/modules/checklist.ui.js',
  './js/services/pdf/checklist.pdf.js',
  './js/services/reporte.periodo.js',
  './js/services/pdf/reporte.pdf.js',
  './js/services/pdf/porcobrar.pdf.js',
  './js/modules/abonos.ui.js',
  './js/services/fotos.js',
  './js/services/gasto.operativo.js',
  './js/modules/ciudades.op.ui.js',
  './js/modules/viajes.op.ui.js',
  './js/modules/viajes.archivo.ui.js',
  './js/modules/campanias.js',
  './js/core/ciudades.js',
  './js/services/diagnostico.js',
  './js/services/backup.js',
  './js/services/files.js',
  './js/services/seguridad.js',
  './js/services/notificaciones.js',
  /* JS services/pdf */
  './js/services/pdf/base.js',
  './js/services/pdf/helpers.js',
  './js/services/pdf/ing.pdf.js',
  './js/services/pdf/ott.pdf.js',
  './js/services/pdf/ote.pdf.js',
  './js/services/pdf/recibo.pdf.js',
  /* JS modules */
  './js/modules/ing.js',
  './js/modules/ott.js',
  './js/modules/ote.js',
  './js/modules/pre.js',
  './js/modules/admin.js',
  './js/modules/config.js',
  './js/modules/fallas.js',
  './js/modules/mantenimientos.ui.js',
  './js/modules/zonas.ui.js',
  './js/modules/fotos.ui.js',
  './js/modules/qr.scanner.js',
  /* JS modules/panel */
  './js/modules/panel/index.js',
  './js/modules/panel/panel.store.js',
  './js/modules/panel/panel.filters.js',
  './js/modules/panel/panel.cards.js',
  './js/modules/panel/panel.templates.js',
  './js/modules/panel/panel.render.js',
  './js/modules/panel/panel.detail.js',
  './js/modules/panel/panel.payments.js',
  './js/modules/panel/panel.alerts.js',
  './js/modules/panel/panel.events.js',
  './js/modules/panel/panel.router.js',
  /* JS modules/plantillas */
  './js/modules/plantillas/index.js',
  './js/modules/plantillas/plantillas.store.js',
  './js/modules/plantillas/plantillas.autocomplete.js',
  './js/modules/plantillas/plantillas.bottomsheet.js',
  './js/modules/plantillas/plantillas.config.js',
  './js/modules/plantillas/plantillas.render.js',
  './js/modules/plantillas/plantillas.events.js',
  './js/modules/plantillas/plantillas.templates.js',
  /* JS modules/agenda */
  './js/modules/agenda/agenda.store.js',
  './js/modules/agenda/agenda.logic.js',
  './js/modules/agenda/agenda.render.js',
  './js/modules/agenda/agenda.analytics.js',
  './js/modules/agenda/agenda.templates.js',
  './js/modules/agenda/agenda.iq.js',
  './js/modules/agenda/agenda.events.js',
  './js/modules/agenda/agenda.router.js',
  './js/modules/agenda/agenda.dom.js',
  './js/modules/agenda/agenda.constants.js',
  './js/modules/agenda/agenda.logger.js',
  './js/modules/agenda/agenda.types.js',
  /* core additions */
  './js/core/logger.js',
  /* search service */
  /* module indexes */
  './js/modules/agenda/index.js',
  /* virtual list component */
  './components/virtual-list/virtual-list.js',
  /* components */
  './components/index.js',
  './components/modal/modal.js',
  './components/toast/toast.js',
  './components/bottom-sheet/bottom-sheet.js',
  './components/autocomplete/autocomplete.js',
  './components/cards/card.js',
  './components/tabs/tabs.js',
  './components/fab/fab.js',
  './components/image-viewer/image-viewer.js',
  './components/gallery/gallery.js',
  './components/camera/camera.js',
  /* services/media */
  './js/services/media/index.js',
  './js/services/media/media.compress.js',
  './js/services/media/media.store.js',
  './js/services/media/media.camera.js',
  './js/services/media/media.gallery.js',
  './js/services/media/media.viewer.js',
  './js/services/media/media.utils.js',
  /* JS services/garantia */
  './js/services/garantia.js',
];

/* ── INSTALL ─────────────────────────────────────────── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(cache) {
        return Promise.all(
          SHELL_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] No se pudo cachear:', url, err.message);
            });
          })
        );
      })
      .then(function() { return self.skipWaiting(); })
  );
});

/* ── ACTIVATE ────────────────────────────────────────── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== CACHE_VERSION && key !== CDN_CACHE) {
            console.log('[SW] Eliminando cache viejo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ── FETCH ───────────────────────────────────────────── */
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  if (url.includes('cdnjs.cloudflare.com')) {
    e.respondWith(cdnCacheFirst(e.request));
    return;
  }
  if (isShellRequest(url)) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function() { return caches.match(e.request); })
  );
});

/* ── ESTRATEGIAS ─────────────────────────────────────── */
function cdnCacheFirst(request) {
  return caches.open(CDN_CACHE).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(resp) {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_VERSION).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var fetchPromise = fetch(request).then(function(resp) {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      }).catch(function() { return null; });
      return cached || fetchPromise;
    });
  });
}

function isShellRequest(url) {
  return url.startsWith(self.location.origin);
}

/* ── MENSAJES ────────────────────────────────────────── */
self.addEventListener('message', function(e) {
  if (!e.data) return;

  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (e.data.type === 'PRECACHE_CDN') {
    var urls = e.data.urls || [];
    e.waitUntil(
      caches.open(CDN_CACHE).then(function(cache) {
        return Promise.all(urls.map(function(url) {
          return cache.match(url).then(function(cached) {
            if (cached) return;
            return fetch(url).then(function(resp) {
              if (resp && resp.ok) cache.put(url, resp);
            }).catch(function() {});
          });
        }));
      })
    );
  }

  /* Forzar limpieza de cache (útil en deploy) */
  if (e.data.type === 'CLEAR_CACHE') {
    e.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
      }).then(function() {
        console.log('[SW] Cache limpiada.');
      })
    );
  }
});
