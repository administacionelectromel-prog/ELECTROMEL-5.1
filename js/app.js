/**
 * ELECTROMEL ERP — app.js  (v3)
 * Punto de entrada principal.
 * Arquitectura completamente modular — sin monolitos.
 *
 * Cambios v3:
 *   - panel.js → modules/panel/index.js
 *   - plantillas.js → modules/plantillas/index.js
 *   - agenda.js eliminado → modules/agenda/agenda.render.js
 *   - recibo.js eliminado → services/pdf/recibo.pdf.js
 *   - services/pdf.js eliminado → services/pdf/*.js
 */

import { openDB, pruneSystemLogs, logEvent } from './core/db.js';
import { store, bus }   from './core/store.js';
import { showToast, showTab, actualizarBaseHeader, actualizarInfoSistema,
         initSWUpdateBanner, cargarLogoEmpresa, reloadApp } from './core/ui.js';
import { cargarBusinessConfig } from './core/config.js';
import { btnGuard }     from './core/utils.js';
import { initCiudadesCP } from './core/ciudades.js';

/* ── Módulos — nuevas subcarpetas ──────────────────────── */
import { initPanel, renderPanelPrincipal,
         filtrarPanel, toggleArchivados, filtrarPanelAnio, poblarSelectorAnios,
         abrirModalDetalle, cerrarModalDetalle, guardarCambiosDetalle,
         confirmarCobroEntrega, cerrarCobroEntrega, avanzarEstadoRapido,
         abrirPagoParcial, cerrarPagoParcial, confirmarPagoParcial,
         abrirPanelAlertasWA }           from './modules/panel/index.js';

import { initPlantillas, plantillasFiltrar, agregarPlantilla,
         abrirPlantillasRapidas,
         initPlantillasInline,
         abrirMiniPanelPlantillas }      from './modules/plantillas/index.js';

import { initAgenda }                    from './modules/agenda/agenda.render.js';
import * as agendaRender                 from './modules/agenda/agenda.render.js';
import * as agendaLogic                  from './modules/agenda/agenda.logic.js';
import * as agendaIQ                     from './modules/agenda/agenda.iq.js';
import * as agendaRouter                 from './modules/agenda/agenda.router.js';

import { initAdmin }                     from './modules/admin.js';
import { initConfig, guardarConfig, cargarConfig,
         exportarBackup, importarBackup, exportarBackupFotos, importarBackupFotos, reindexarClientesUI,
         ejecutarResetCompleto, guardarBasesPeriodos,
         agregarBasePeriodo }            from './modules/config.js';

/* ── Módulos formularios ───────────────────────────────── */
import * as ingMod    from './modules/ing.js';
import * as etiquetaImg from './services/etiqueta.img.js';
import * as ottMod    from './modules/ott.js';
import * as oteMod    from './modules/ote.js';
import * as preMod    from './modules/pre.js';
import * as adminMod  from './modules/admin.js';

/* ── PDF — solo desde services/pdf/ ───────────────────── */
import { imprimirING_A4 }  from './services/pdf/ing.pdf.js';
import { imprimirOTT_A4 }  from './services/pdf/ott.pdf.js';
import { imprimirOTE_A4, imprimirPRE_A4,
         imprimirPRE_ListaMateriales } from './services/pdf/ote.pdf.js';
import { abrirModalRecibo } from './services/pdf/recibo.pdf.js';

/* ── Standalone ────────────────────────────────────────── */
import { abrirModalFallas } from './modules/fallas.js';
import * as mantMod from './modules/mantenimientos.ui.js';
import { initZonas } from './services/zonas.js';
import * as zonasUI from './modules/zonas.ui.js';
import * as fotosUI from './modules/fotos.ui.js';
import * as qrScanner from './modules/qr.scanner.js';
import * as abonosUI  from './modules/abonos.ui.js';
import * as flotaUI   from './modules/flota.ui.js';
import * as checklistUI from './modules/checklist.ui.js';
import * as ciudadesOpUI from './modules/ciudades.op.ui.js';
import * as viajesOpUI from './modules/viajes.op.ui.js';

/* ── Media (lazy — solo se carga cuando se usa) ────────── */
// import { mountPhotoWidget } from './services/media/index.js';
// import { cleanupOldPhotos } from './services/media/index.js';

/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER
   ═══════════════════════════════════════════════════════════ */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    /* En el APK (Capacitor) NO se registra el SW: los archivos ya
       van empaquetados adentro y un cache duplicado solo estorba. */
    if (window.Capacitor?.isNativePlatform?.()) return;
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('[SW] Registrado, scope:', reg.scope);
    initSWUpdateBanner();
    const CDN_URLS = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
    ];
    if (reg.active) reg.active.postMessage({ type: 'PRECACHE_CDN', urls: CDN_URLS });
  } catch(e) {
    console.warn('[SW] No se pudo registrar:', e.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   BASE DE DATOS
   ═══════════════════════════════════════════════════════════ */
async function initDB() {
  try {
    const db = await openDB();
    store.set('db', db);
    bus.emit('db:ready', { db });
    return db;
  } catch(e) {
    showToast('❌ Error al inicializar base de datos: ' + e.message, 'error', 8000);
    throw e;
  }
}

/* ═══════════════════════════════════════════════════════════
   GLOBALS — exponer al HTML (onclick="...")
   ═══════════════════════════════════════════════════════════ */
function exposeGlobals() {
  const g = window;

  /* ── Navegación ─────────────────────────────────────────── */
  g.showTab = showTab;
  g.reloadApp = reloadApp;

  /* ── ING ────────────────────────────────────────────────── */
  g.abrirFormularioING  = ingMod.abrirFormularioING;
  g.cerrarFormularioING = ingMod.cerrarFormularioING;
  g.cerrarConfirmacionING = ingMod.cerrarConfirmacionING;
  g.guardarIngreso      = () => btnGuard(
    document.querySelector('#modal-ing .btn-primary'),
    ingMod.guardarIngreso, { loadingText: 'Guardando...', minMs: 800 }
  );

  /* ── OTT ────────────────────────────────────────────────── */
  g.abrirFormularioOTT     = ottMod.abrirFormularioOTT;
  g.cerrarFormularioOTT    = ottMod.cerrarFormularioOTT;
  g.guardarOTT             = () => btnGuard(
    document.querySelector('#modal-ott .btn-primary'),
    ottMod.guardarOTT, { loadingText: 'Guardando...', minMs: 800 }
  );
  g.crearOTTdesdeING       = ottMod.crearOTTdesdeING;
  g.crearOTTdesdeINGActual = ottMod.crearOTTdesdeINGActual;

  /* ── OTE ────────────────────────────────────────────────── */
  g.abrirFormularioOTE     = oteMod.abrirFormularioOTE;
  g.cerrarFormularioOTE    = oteMod.cerrarFormularioOTE;
  g.guardarOTE             = () => btnGuard(
    document.querySelector('#modal-ote .btn-primary'),
    oteMod.guardarOTE, { loadingText: 'Guardando...', minMs: 800 }
  );
  g.crearOTEdesdePRE       = oteMod.crearOTEdesdePRE;
  g.crearOTEdesdePREActual = oteMod.crearOTEdesdePREActual;
  g.abrirFormularioVisita  = oteMod.abrirFormularioVisita;

  /* ── Mantenimientos programados ────────────────────────── */
  g.abrirFormularioMantenimiento  = mantMod.abrirFormularioMantenimiento;
  g.cerrarFormularioMantenimiento = mantMod.cerrarFormularioMantenimiento;
  g.renderMantenimientos          = mantMod.renderMantenimientos;
  g.guardarMantenimientoForm      = mantMod.guardarMantenimientoForm;
  g._onMantTipoChange             = mantMod._onMantTipoChange;
  g._recalcMantFecha              = mantMod._recalcMantFecha;
  g.editarMantenimiento           = mantMod.editarMantenimiento;
  g.completarMantenimiento        = mantMod.completarMantenimiento;
  g.borrarMantenimiento           = mantMod.borrarMantenimiento;
  g.generarOTEdesdeMant           = mantMod.generarOTEdesdeMant;
  g.agendarTurnoDesdeMant         = mantMod.agendarTurnoDesdeMant;
  g._programarMantDesde           = mantMod._programarMantDesde;

  /* ── Bases y zonas (Config) ────────────────────────────── */
  g.guardarBasesInfo       = zonasUI.guardarBasesInfo;
  g.abrirFormularioCiudad  = zonasUI.abrirFormularioCiudad;

  /* Gasto Operativo v6.8 — ciudades */
  g.guardarNaftaGlobal        = ciudadesOpUI.guardarNaftaGlobal;
  g.abrirFormularioCiudadOp   = ciudadesOpUI.abrirFormularioCiudadOp;
  g.cerrarFormularioCiudadOp  = ciudadesOpUI.cerrarFormularioCiudadOp;
  g.guardarCiudadOpForm       = ciudadesOpUI.guardarCiudadOpForm;
  g.editarCiudadOp            = ciudadesOpUI.editarCiudadOp;
  g.eliminarCiudadOp          = ciudadesOpUI.eliminarCiudadOp;

  /* Gasto Operativo v6.8 — viajes */
  g.abrirFormularioViajeOp    = viajesOpUI.abrirFormularioViajeOp;
  g.cerrarFormularioViajeOp   = viajesOpUI.cerrarFormularioViajeOp;
  g.guardarViajeOpForm        = viajesOpUI.guardarViajeOpForm;
  g.editarViajeOp             = viajesOpUI.editarViajeOp;
  g.eliminarViajeOp           = viajesOpUI.eliminarViajeOp;
  g.verDetalleViajeOp         = viajesOpUI.verDetalleViajeOp;
  g.abrirGastosRapido         = viajesOpUI.abrirGastosRapido;
  g.crearViajeDesdeSugerencia = viajesOpUI.crearViajeDesdeSugerencia;
  g.agregarGastoExtraViaje    = viajesOpUI.agregarGastoExtraViaje;
  g.quitarGastoExtraViaje     = viajesOpUI.quitarGastoExtraViaje;
  g._recalcViajeOpPreview     = viajesOpUI._recalcViajeOpPreview;
  g.gestionarTrabajosViaje    = viajesOpUI.gestionarTrabajosViaje;
  g._toggleTrabajoViaje       = viajesOpUI._toggleTrabajoViaje;
  g.agregarGastoDiarioViaje   = viajesOpUI.agregarGastoDiarioViaje;
  g.quitarItemGastoViaje      = viajesOpUI.quitarItemGastoViaje;
  g.limpiarRubroViaje         = viajesOpUI.limpiarRubroViaje;
  g.ajustarPeriodoViaje       = viajesOpUI.ajustarPeriodoViaje;
  g._ajustarRegresoRapido     = viajesOpUI._ajustarRegresoRapido;
  g.guardarAjustePeriodo      = viajesOpUI.guardarAjustePeriodo;
  g.cerrarFormularioCiudad = zonasUI.cerrarFormularioCiudad;
  g.guardarCiudadForm      = zonasUI.guardarCiudadForm;
  g.editarCiudad           = zonasUI.editarCiudad;
  g.borrarCiudad           = zonasUI.borrarCiudad;

  /* ── Fotos de trabajos ─────────────────────────────────── */
  g.abrirGaleriaFotos      = fotosUI.abrirGaleriaFotos;
  g.cerrarGaleriaFotos     = fotosUI.cerrarGaleriaFotos;
  g._onFotosSeleccionadas  = fotosUI._onFotosSeleccionadas;
  g._borrarFoto            = fotosUI._borrarFoto;
  g._verFotoGrande         = fotosUI._verFotoGrande;

  /* ── Lector QR ─────────────────────────────────────────── */
  g.abrirLectorQR          = qrScanner.abrirLectorQR;
  g.cerrarLectorQR         = qrScanner.cerrarLectorQR;

  /* ── Abonos ────────────────────────────────────────────── */
  g.renderAbonos           = abonosUI.renderAbonos;
  g.buscarAbonos           = abonosUI.buscarAbonos;
  g.abrirFormularioAbono   = abonosUI.abrirFormularioAbono;
  g.guardarAbonoUI         = abonosUI.guardarAbonoUI;

  /* ── Flota de máquinas ─────────────────────────────────── */
  g.abrirFlota             = flotaUI.abrirFlota;
  g.abrirChecklist         = checklistUI.abrirChecklist;

  /* ── PRE ────────────────────────────────────────────────── */
  g.abrirFormularioPRE  = preMod.abrirFormularioPRE;
  g.cerrarFormularioPRE = preMod.cerrarFormularioPRE;
  g.guardarPRE          = () => btnGuard(
    document.querySelector('#modal-pre .btn-primary'),
    preMod.guardarPRE, { loadingText: 'Guardando...', minMs: 800 }
  );
  g.abrirEdicionPRE     = preMod.abrirEdicionPRE;

  /* ── Panel ──────────────────────────────────────────────── */
  g.filtrarPanel          = filtrarPanel;
  g.filtrarPanelAnio      = filtrarPanelAnio;
  g.toggleArchivados      = toggleArchivados;
  g.abrirModalDetalle     = abrirModalDetalle;
  g.cerrarModalDetalle    = cerrarModalDetalle;
  g.guardarCambiosDetalle = guardarCambiosDetalle;
  g.confirmarCobroEntrega = confirmarCobroEntrega;
  g.cerrarCobroEntrega    = cerrarCobroEntrega;
  g.avanzarEstadoRapido   = avanzarEstadoRapido;
  g.abrirPagoParcial      = abrirPagoParcial;
  g.cerrarPagoParcial     = cerrarPagoParcial;
  g.confirmarPagoParcial  = () => btnGuard(
    document.querySelector('#modal-pago-parcial .btn-success'),
    confirmarPagoParcial, { loadingText: 'Registrando...', minMs: 600 }
  );
  g.abrirPanelAlertasWA   = abrirPanelAlertasWA;

  /* ── Agenda ─────────────────────────────────────────────── */
  g.abrirFormularioTurno   = agendaRender.abrirFormularioTurno;
  g.cerrarFormularioTurno  = agendaRender.cerrarFormularioTurno;
  g.guardarTurno           = agendaRender.guardarTurnoHandler;
  g.semanaAnterior         = agendaRender.semanaAnterior;
  g.semanaSiguiente        = agendaRender.semanaSiguiente;
  g.agendaIrAHoy           = agendaRender.agendaIrAHoy;
  g.filtrarAgendaBase      = agendaRender.filtrarAgendaBase;
  g.filtrarAgendaZona      = agendaRender.filtrarAgendaBase;

  /* Abrir una dirección/ciudad en Google Maps */
  g.abrirEnMaps = (destino) => {
    if (!destino) return;
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(destino);
    window.open(url, '_blank');
  };

  /* Generar reporte de período en PDF */
  g.generarReportePeriodoUI = async () => {
    const desde = document.getElementById('reporte-desde')?.value;
    const hasta = document.getElementById('reporte-hasta')?.value;
    if (!desde || !hasta) {
      const { showToast } = await import('./core/ui.js');
      showToast('Elegí las fechas Desde y Hasta', 'warn');
      return;
    }
    if (desde > hasta) {
      const { showToast } = await import('./core/ui.js');
      showToast('La fecha Desde no puede ser mayor que Hasta', 'warn');
      return;
    }
    const { imprimirReportePeriodo } = await import('./services/pdf/reporte.pdf.js');
    await imprimirReportePeriodo(desde, hasta);
  };

  /* Exportar Por cobrar a PDF */
  g._exportarPorCobrarPDF = async () => {
    const { imprimirPorCobrarPDF } = await import('./services/pdf/porcobrar.pdf.js');
    await imprimirPorCobrarPDF();
  };

  /* Avisar turno por WhatsApp desde la tarjeta de agenda */
  g._waTurno = async (turnoId) => {
    try {
      const { dbGetAll } = await import('./core/db.js');
      const db = store.get('db');
      const exteriors = await dbGetAll(db, 'exteriors', false).catch(() => []);
      const t = exteriors.find(x => (x.id || x.numero) === turnoId);
      if (!t) return;
      if (!t.cliente_telefono) { const { showToast } = await import('./core/ui.js'); showToast('Sin teléfono', 'warn'); return; }
      const { buildWhatsAppMessage, openWhatsApp } = await import('./services/whatsapp.js');
      const hoy = new Date().toISOString().slice(0, 10);
      const esHoy = (t.fecha || '').slice(0, 10) === hoy;
      const plantilla = esHoy ? 'turno_hoy' : 'turno';
      const fechaHora = [t.fecha, t.hora].filter(Boolean).join(' a las ');
      const msg = await buildWhatsAppMessage(plantilla, {
        cliente: t.cliente_nombre,
        fecha:   esHoy ? (t.hora ? 'a las ' + t.hora : 'hoy') : (fechaHora || t.fecha || ''),
        equipo:  t.equipo || t.tipo_servicio || 'equipo'
      });
      openWhatsApp(t.cliente_telefono, msg);
    } catch (e) { console.warn('[_waTurno]', e); }
  };
  g.toggleAgendaIQ         = agendaRender.toggleAgendaIQ;
  g.confirmarFeedbackTurno = agendaRender.confirmarFeedbackHandler;
  g.abrirFeedbackTurno     = agendaRender.abrirFeedbackTurno;
  g.evaluarTurno           = agendaLogic.evaluarTurno;
  g.generateOptimalWeek    = () => agendaIQ.renderOptimalWeek();
  g.openAgendaView         = agendaRouter.openAgendaView;
  g.openAgendaDetail       = agendaRouter.openAgendaDetail;

  /* ── Config ─────────────────────────────────────────────── */
  g.guardarConfig          = guardarConfig;
  g.guardarConfigDrive     = guardarConfig;
  g.cargarConfig           = cargarConfig;
  g.exportarBackup         = exportarBackup;
  g.importarBackup         = importarBackup;
  g.exportarBackupFotos    = exportarBackupFotos;
  g.importarBackupFotos    = importarBackupFotos;
  g.reindexarClientesUI    = reindexarClientesUI;
  g.ejecutarResetCompleto  = ejecutarResetCompleto;
  g.guardarBasesPeriodos   = guardarBasesPeriodos;
  g.agregarBasePeriodo     = agregarBasePeriodo;

  /* ── Admin ──────────────────────────────────────────────── */
  g.exportarCSVMovs        = adminMod.exportarCSVMovs;
  g.borrarMovimientoCaja   = adminMod.borrarMovimientoCaja;
  g.guardarEgresoManual    = adminMod.guardarEgresoManual;
  g.agregarStock           = adminMod.agregarStock;
  g.eliminarStock          = adminMod.eliminarStock;
  g.agregarAlquiler        = adminMod.agregarAlquiler;
  g.eliminarAlquiler       = adminMod.eliminarAlquiler;
  g.pagarAlquiler          = adminMod.pagarAlquiler;
  g.renderAdminAsistente   = adminMod.renderAdminAsistente;
  g.renderAdminJefe        = adminMod.renderAdminJefe;
  g.renderAdminClientes    = adminMod.renderAdminClientes;
  g.renderAdminAuditLog    = adminMod.renderAdminAuditLog;
  g.verHistorialCliente    = adminMod.verHistorialCliente;

  /* ── Plantillas ─────────────────────────────────────────── */
  g.plantillasFiltrar      = plantillasFiltrar;
  g.agregarPlantilla       = agregarPlantilla;
  g.abrirPlantillasRapidas = abrirPlantillasRapidas;

  /* ── Helpers de items ───────────────────────────────────── */
  g._addItem               = ottMod.addItem;
  g._removeItem            = ingMod.removeItem;
  g._syncItemsHidden       = ottMod.syncItemsHidden;
  g._recalcOTETotal        = oteMod.recalcOTETotal;
  g._recalcPRETotal        = preMod.recalcPRETotal;
  g.addDescItemOTE         = oteMod.addDescItemOTE;
  g.addDescItemPRE         = preMod.addDescItemPRE;

  /* Funciones de filas de tabla — el HTML las llama con guion bajo */
  g._addTrabajoOTE         = oteMod.addTrabajoOTE;
  g._addMaterialOTE        = oteMod.addMaterialOTE;
  g._addTrabajoPRE         = preMod.addTrabajoPRE;
  g._addMaterialPRE        = preMod.addMaterialPRE;
  g._addMaterialClientePRE = preMod.addMaterialClientePRE;

  /* ── Standalone ─────────────────────────────────────────── */
  g.abrirModalFallas       = abrirModalFallas;
  g.abrirModalRecibo       = abrirModalRecibo;

  /* ── PDF ────────────────────────────────────────────────── */
  g.imprimirING_A4              = imprimirING_A4;
  g.imprimirING_Ticket          = ingMod.imprimirING_Ticket;
  g.imprimirING_Etiqueta        = ingMod.imprimirING_Etiqueta;
  g.ticketImagenING             = etiquetaImg.ticketImagenING;
  g.etiquetaImagenING           = etiquetaImg.etiquetaImagenING;
  g.imprimirOTT_A4              = imprimirOTT_A4;
  g.imprimirOTE_A4              = imprimirOTE_A4;
  g.imprimirPRE_A4              = imprimirPRE_A4;
  g.imprimirPRE_ListaMateriales = imprimirPRE_ListaMateriales;

  /* ── Media (global para formularios) ───────────────────── */
  g.mountPhotoWidget = async (container, ref, tipo) => {
    const { mountPhotoWidget } = await import('./services/media/index.js');
    return mountPhotoWidget(container, ref, tipo);
  };
  g.openViewer = async (ref, index) => {
    const { openViewer } = await import('./services/media/index.js');
    return openViewer(ref, index);
  };
}

/* ═══════════════════════════════════════════════════════════
   INICIALIZAR MÓDULOS
   ═══════════════════════════════════════════════════════════ */
async function initModules(db) {
  await Promise.all([
    cargarBusinessConfig(db),
    cargarLogoEmpresa(),
    actualizarBaseHeader(),
    actualizarInfoSistema()
  ].map(p => p.catch(e => console.warn('[initModules]', e))));

  /* Cada init en su propio try/catch: si uno falla, los demás siguen */
  try { await initPanel(); } catch(e) { console.error('[initPanel]', e); }
  try { initAgenda();      } catch(e) { console.error('[initAgenda]', e); }
  try { initAdmin();       } catch(e) { console.error('[initAdmin]', e); }
  try { initConfig();      } catch(e) { console.error('[initConfig]', e); }
  try { initPlantillas();  } catch(e) { console.error('[initPlantillas]', e); }
  try { mantMod.initMantenimientos(); } catch(e) { console.error('[initMantenimientos]', e); }
  try { await initZonas(); } catch(e) { console.error('[initZonas]', e); }
  try { await initCiudadesCP(); } catch(e) { console.error('[initCiudadesCP]', e); }

  /* Migración de datos v14: NQN→SMA+zona, agregar año (una sola vez) */
  try {
    const { migrarBaseAZona } = await import('./services/migracion.js');
    const res = await migrarBaseAZona();
    if (res.ok && res.convertidos > 0) {
      console.log(`[migración v14] ${res.convertidos} registros NQN→SMA+zona`);
    }
  } catch(e) { console.error('[migración v14]', e); }

  /* Poblar datalist global de zonas y filtros de zona de la agenda */
  try { await _poblarZonasGlobal(); } catch(e) { console.warn('[zonas global]', e); }

  /* Refrescar la lista de mantenimientos al entrar a Agenda */
  bus.on('tab:cambio', ({ to }) => {
    if (to === 'agenda') {
      mantMod.renderMantenimientos().catch(() => {});
      viajesOpUI.renderViajesOp().catch(() => {});
    }
    if (to === 'abonos') abonosUI.renderAbonos().catch(() => {});
  });

  showTab('panel');
}

/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */
async function boot() {
  registerSW();

  /* Exponer globals SIEMPRE primero — así los botones del HTML responden
     aunque la base de datos falle al inicializar. */
  exposeGlobals();

  let db = null;
  try {
    db = await initDB();
  } catch(e) {
    console.error('[boot] initDB falló:', e);
    /* No abortamos el boot — la UI sigue usable y mostramos el error */
  }

  try {
    await initModules(db);
  } catch(e) {
    console.error('[boot] initModules falló:', e);
  }

  if (db) {
    logEvent(db, { type: 'APP_START', message: 'ELECTROMEL ERP v7.4 iniciado' }).catch(()=>{});
  }

  /* Mantenimiento diferido */
  setTimeout(() => {
    pruneSystemLogs(db, 500).catch(() => {});
    /* Cleanup de media si supera límite */
    import('./services/media/index.js').then(m => m.cleanupOldPhotos()).catch(() => {});
  }, 5000);

  /* Navegación inferior */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  /* Double-tap prevention Android */
  let lastTouch = 0;
  document.addEventListener('touchstart', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  /* Track campo activo para plantillas */
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if ((el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
        !el.id?.includes('nueva-plantilla') &&
        !el.id?.includes('falla-nueva')) {
      store.set('ui.lastActiveField', el);
    }
  }, true);

  console.log('[ELECTROMEL] App v7.4 lista ✓');

  /* Deep-link desde QR: #equipo=OTT-00005 abre la ficha del equipo */
  _procesarDeepLink();
  window.addEventListener('hashchange', _procesarDeepLink);

  /* Aviso de mantenimientos por vencer (después del arranque) */
  setTimeout(_avisarMantenimientos, 1500);
  setTimeout(_avisarAbonos, 2200);
  setTimeout(_avisarGarantias, 2900);
  setTimeout(_avisarTurnosHoy, 3600);
}

async function _poblarZonasGlobal() {  const { zonasCache } = await import('./services/zonas.js');
  const data = zonasCache();
  const ciudades = Object.values(data.ciudades || {}).map(c => c.nombre).filter(Boolean);
  const zonas = Array.from(new Set(ciudades)).sort();

  const dl = document.getElementById('zonas-datalist-global');
  if (dl) dl.innerHTML = zonas.map(z => `<option value="${z}">`).join('');

  const cont = document.getElementById('agenda-filtros-zona');
  if (cont) {
    const existentes = new Set(Array.from(cont.querySelectorAll('[data-zona]')).map(b => b.dataset.zona));
    zonas.forEach(z => {
      if (existentes.has(z)) return;
      const b = document.createElement('button');
      b.className = 'panel-filtro';
      b.dataset.zona = z;
      b.textContent = z;
      b.setAttribute('onclick', `filtrarAgendaZona('${z.replace(/'/g, "\\'")}')`);
      cont.appendChild(b);
    });
  }
}

async function _avisarMantenimientos() {
  try {
    const { mantenimientosPorVencer } = await import('./services/mantenimientos.js');
    const pendientes = await mantenimientosPorVencer();
    if (!pendientes.length) return;
    const vencidos = pendientes.filter(m => m._estado_calc === 'vencido').length;
    const porVencer = pendientes.length - vencidos;
    let msg = '🔧 ';
    if (vencidos > 0)  msg += `${vencidos} mantenimiento(s) vencido(s)`;
    if (vencidos > 0 && porVencer > 0) msg += ' y ';
    if (porVencer > 0) msg += `${porVencer} por vencer`;
    msg += '. Revisá la Agenda.';
    const { showToast } = await import('./core/ui.js');
    showToast(msg, vencidos > 0 ? 'warn' : 'info');
  } catch (e) {
    console.warn('[aviso mantenimientos]', e);
  }
}

async function _avisarAbonos() {
  try {
    const { abonosPorCobrar, abonosConVisitaPendiente } = await import('./services/abonos.js');
    const { showToast } = await import('./core/ui.js');

    /* Aviso de cobros */
    const pendientes = await abonosPorCobrar();
    if (pendientes.length) {
      const deben = pendientes.filter(p => p.estado === 'debe');
      const totalDeuda = deben.reduce((a, p) => a + p.deuda, 0);
      let msg = '💳 ';
      if (deben.length > 0) {
        const { pesos } = await import('./core/utils.js');
        msg += `${deben.length} abono(s) con deuda (${pesos(totalDeuda)})`;
      } else {
        msg += `${pendientes.length} abono(s) por cobrar este mes`;
      }
      msg += '. Revisá Abonos.';
      showToast(msg, deben.length > 0 ? 'warn' : 'info');
    }

    /* Aviso de visitas que tocan */
    const visitas = await abonosConVisitaPendiente();
    if (visitas.length) {
      setTimeout(() => {
        showToast(`📅 ${visitas.length} abono(s) con visita pendiente. Agendalas desde Abonos.`, 'info');
      }, 800);
    }
  } catch (e) {
    console.warn('[aviso abonos]', e);
  }
}

async function _avisarGarantias() {
  try {
    const { garantiasPorVencer } = await import('./services/garantia.js');
    const pendientes = await garantiasPorVencer(15);
    if (!pendientes.length) return;
    const { showToast } = await import('./core/ui.js');
    const prox = pendientes[0];
    let msg = `🛡️ ${pendientes.length} garantías por vencer (próximos 15 días)`;
    if (pendientes.length === 1) {
      msg = `🛡️ Garantía de ${prox.cliente} vence en ${prox.dias} día(s)`;
    }
    showToast(msg, 'info');
  } catch (e) {
    console.warn('[aviso garantias]', e);
  }
}

async function _avisarTurnosHoy() {
  try {
    const { dbGetAll, getCfg, setCfg } = await import('./core/db.js');
    const { store } = await import('./core/store.js');
    const db = store.get('db');
    if (!db) return;
    const exteriors = await dbGetAll(db, 'exteriors', false).catch(() => []);
    const hoy = new Date().toISOString().slice(0, 10);
    const turnosHoy = exteriors.filter(t => t.es_turno && (t.fecha || '').slice(0, 10) === hoy);
    if (!turnosHoy.length) return;

    const { showToast } = await import('./core/ui.js');
    const t = turnosHoy[0];
    let msg = `📅 Tenés ${turnosHoy.length} turno(s) hoy`;
    if (turnosHoy.length === 1) {
      msg = `📅 Hoy: turno con ${t.cliente_nombre}${t.hora ? ' a las ' + t.hora : ''}`;
    }
    showToast(msg, 'info');

    /* Memoria: qué turnos ya avisé hoy (para no repetir el confirm cada vez).
       Se guarda como "fecha|id1,id2,..." en la config. */
    let avisados = [];
    const guardado = await getCfg(db, 'turnos_avisados_wa').catch(() => '');
    if (guardado && guardado.startsWith(hoy + '|')) {
      avisados = guardado.slice(hoy.length + 1).split(',').filter(Boolean);
    }

    /* Turnos con teléfono que TODAVÍA no avisé hoy */
    const conTel = turnosHoy.filter(x => x.cliente_telefono);
    const pendientes = conTel.filter(x => !avisados.includes(String(x.id || x.numero)));
    if (!pendientes.length) return;   // ya avisé todos hoy, no molesto más

    setTimeout(async () => {
      const quien = pendientes.length === 1 ? pendientes[0].cliente_nombre : `${pendientes.length} clientes`;
      const ok = confirm(`¿Avisar por WhatsApp que hoy pasás? (${quien})`);

      /* Marcar como avisados (haya o no mandado, para no repreguntar) */
      const nuevosIds = pendientes.map(x => String(x.id || x.numero));
      const todosAvisados = [...new Set([...avisados, ...nuevosIds])];
      await setCfg(db, 'turnos_avisados_wa', hoy + '|' + todosAvisados.join(',')).catch(() => {});

      if (!ok) return;
      try {
        const { buildWhatsAppMessage, openWhatsApp } = await import('./services/whatsapp.js');
        for (const turno of pendientes) {
          const m = await buildWhatsAppMessage('turno_hoy', {
            cliente: turno.cliente_nombre,
            fecha:   turno.hora ? ('a las ' + turno.hora) : 'hoy',
            equipo:  turno.equipo || turno.tipo_servicio || 'equipo'
          });
          openWhatsApp(turno.cliente_telefono, m);
          if (pendientes.length > 1) await new Promise(r => setTimeout(r, 1500));
        }
      } catch (e) { /* no crítico */ }
    }, 600);
  } catch (e) {
    console.warn('[aviso turnos hoy]', e);
  }
}

function _procesarDeepLink() {
  try {
    const hash = window.location.hash || '';
    const m = hash.match(/equipo=([A-Za-z]+-\d+)/);
    if (!m) return;
    const numero = m[1];
    const tipo = numero.split('-')[0].toUpperCase();   // ING, OTT, OTE, PRE
    /* Limpiar el hash para no reabrir al refrescar */
    history.replaceState(null, '', window.location.pathname);
    /* Ir al panel y abrir la ficha */
    setTimeout(() => {
      if (window.abrirModalDetalle) window.abrirModalDetalle(numero, tipo);
    }, 400);
  } catch (e) {
    console.warn('[deep-link]', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
