# ELECTROMEL ERP v7.0

Sistema de gestión para taller electromecánico.  
PWA offline-first · Vanilla JS · ES Modules · IndexedDB · Android-first

---

## Historial de versiones

| Versión | Descripción |
|---------|-------------|
| v1 | Monolito HTML + JS inline |
| v2 | Modularización inicial (ES Modules) |
| v3 | Subdivisión panel/, plantillas/, agenda/, pdf/ |
| v4 | Sistema multimedia offline, components/, workers/ |
| v5 | queue.js, logger.js, search, virtual-list, módulos ing/ ott/ |
| v5.1 | Fix imports a símbolos inexistentes |
| v5.2 | Fix freeze, FAB, formularios, filtros, bases corregidas |
| v5.3 | Mantenimientos programados + Visita técnica rápida (DB v12) |

---

## Arquitectura actual

```
electromel/
│
├── index.html              ← App shell principal
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker v5.2 (cache-first + stale-while-revalidate)
├── generate-icons.js       ← Generador de íconos PWA (Node.js)
│
├── icons/                  ← 10 PNGs del logo real ELECTROMEL
│   ├── icon-72/96/128/144/152/192/384/512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
│
├── css/                    ← 7 archivos CSS (~2.400 líneas)
│   ├── variables.css       ← Paleta, tokens, z-index
│   ├── reset.css           ← Reset universal + utilidades
│   ├── layout.css          ← Header, nav, FAB
│   ├── components.css      ← Cards, botones, fields, plantillas inline
│   ├── panels.css          ← Panel, admin, detalle, alertas WA
│   ├── modals.css          ← Modales fullscreen, toast, collapsibles
│   └── agenda.css          ← Agenda, config, plantillas
│
├── components/             ← Componentes reutilizables
│   ├── index.js
│   ├── modal/              ← Modal programático con lifecycle
│   ├── toast/              ← Toast notifications
│   ├── bottom-sheet/       ← Bottom-sheet con swipe-to-close
│   ├── autocomplete/       ← Dropdown genérico reutilizable
│   ├── cards/              ← Card builder
│   ├── tabs/               ← Tabs dinámicos
│   ├── fab/                ← Floating Action Button
│   ├── image-viewer/       ← Visor fullscreen con swipe y zoom
│   ├── gallery/            ← Galería horizontal lazy-loading
│   ├── camera/             ← Captura getUserMedia + fallback Android
│   └── virtual-list/       ← Virtual scroll para listas grandes
│
├── workers/                ← Web Workers (arquitectura preparada)
│   ├── image-compress.worker.js  ← Compresión offline (OffscreenCanvas)
│   ├── pdf.worker.js             ← Generación PDF en background
│   └── analytics.worker.js       ← Analytics Agenda IQ
│
└── js/
    │
    ├── app.js              ← Entry point, boot, globals
    │
    ├── core/               ← Infraestructura base
    │   ├── db.js           ← IndexedDB v11, CRUD, migraciones
    │   ├── store.js        ← Store reactivo (subscribe, batch, select) + event bus
    │   ├── utils.js        ← Funciones puras (fechas, pesos, semáforo, etc.)
    │   ├── config.js       ← BUSINESS_CONFIG, WA_DEFAULTS, CFG_FIELDS
    │   ├── ui.js           ← Toast, tabs, modales, collapsibles
    │   ├── queue.js        ← Task queue con requestIdleCallback
    │   └── logger.js       ← Logger unificado DEV/PROD
    │
    ├── services/           ← Lógica de negocio
    │   ├── finance.js      ← Movimientos financieros
    │   ├── whatsapp.js     ← Templates WA, openWhatsApp
    │   ├── clientes.js     ← upsertCliente, autocomplete
    │   ├── rentabilidad.js ← Estimados, cierre real, rankings
    │   ├── garantia.js     ← Validar garantía, vincular reingreso
    │   ├── pdf/            ← Generadores PDF A4
    │   │   ├── base.js     ← PDF_A4, getJsPDF, cargarDatosEmpresa
    │   │   ├── helpers.js  ← 12 helpers de dibujo reutilizables
    │   │   ├── ing.pdf.js  ← imprimirING_A4
    │   │   ├── ott.pdf.js  ← imprimirOTT_A4 (con banda garantía)
    │   │   ├── ote.pdf.js  ← imprimirOTE_A4 + PRE_A4 + ListaMateriales
    │   │   └── recibo.pdf.js ← Modal recibo + PDF recibo de pago
    │   ├── media/          ← Sistema multimedia offline-first
    │   │   ├── index.js
    │   │   ├── media.compress.js ← WEBP/JPEG, thumb/preview/full
    │   │   ├── media.store.js    ← IndexedDB separado, LRU cleanup
    │   │   ├── media.camera.js   ← getUserMedia + fallback Android
    │   │   ├── media.gallery.js  ← mountPhotoWidget() para formularios
    │   │   ├── media.viewer.js   ← openViewer() lazy-loaded
    │   │   └── media.utils.js    ← Config, AI hooks preparados
    │   └── search/         ← Motor de búsqueda
    │       └── search.js   ← Incremental, fuzzy, debounce, ranking
    │
    └── modules/            ← Módulos funcionales
        ├── ing.js          ← ING — formulario ingreso, ticket, etiqueta, garantía
        ├── ing/index.js    ← Entry point ING
        ├── ott.js          ← OTT — formulario OT Taller, garantía
        ├── ott/index.js    ← Entry point OTT
        ├── ote.js          ← OTE — OT Exterior + crearOTEdesdePRE
        ├── pre.js          ← PRE — Presupuestos + conversión a OTE
        ├── admin.js        ← Contabilidad, stock, alquileres, audit
        ├── config.js       ← Config panel, backup, reset
        ├── fallas.js       ← Referencia técnica de fallas
        ├── panel/          ← Panel principal (11 archivos)
        │   ├── index.js
        │   ├── panel.store.js    ← Estado, constantes, normalización
        │   ├── panel.filters.js  ← filtrarPanel, toggleArchivados
        │   ├── panel.cards.js    ← renderTarjetas, actualizarStats
        │   ├── panel.templates.js ← DOM builders para cards y detalle
        │   ├── panel.render.js   ← Orquestador con RAF batcher
        │   ├── panel.detail.js   ← Modal detalle universal
        │   ├── panel.payments.js ← Pagos parciales
        │   ├── panel.alerts.js   ← Alertas WA, card WhatsApp
        │   ├── panel.events.js   ← bind/unbind, búsqueda debounce
        │   └── panel.router.js   ← Impresión, navegación a formularios
        ├── plantillas/     ← Plantillas inteligentes (8 archivos)
        │   ├── index.js
        │   ├── plantillas.store.js       ← CRUD IndexedDB, 36 defaults
        │   ├── plantillas.autocomplete.js ← Dropdown inline al escribir
        │   ├── plantillas.bottomsheet.js  ← Mini-panel bottom-sheet
        │   ├── plantillas.config.js       ← Panel Config integration
        │   ├── plantillas.render.js       ← insertarEnTextarea, renderLista
        │   ├── plantillas.events.js       ← Lifecycle
        │   └── plantillas.templates.js    ← DOM builders chips/items
        └── agenda/         ← Agenda IQ (12 archivos)
            ├── index.js
            ├── agenda.store.js     ← Estado reactivo, rangos de semana
            ├── agenda.logic.js     ← Score engine, evaluarTurno, NQN
            ├── agenda.render.js    ← Render semanal, lifecycle mount/unmount
            ├── agenda.templates.js ← HTML builders turnos y feedback
            ├── agenda.analytics.js ← Análisis semanal con memoización
            ├── agenda.iq.js        ← Panel IQ lazy-loaded
            ├── agenda.events.js    ← bind/unbind, delegación
            ├── agenda.dom.js       ← Cache DOM, fragment helpers
            ├── agenda.constants.js ← Magic numbers, estados, DOM_IDS
            ├── agenda.types.js     ← JSDoc typedefs completos
            ├── agenda.logger.js    ← Logger del módulo
            └── agenda.router.js    ← openAgendaView/Detail/Config
```

---

## Instalación en GitHub Pages

### 1. Crear repositorio

```bash
git init electromel
cd electromel
git remote add origin https://github.com/TU_USUARIO/electromel.git
```

### 2. Copiar todos los archivos del ZIP

### 3. Subir a GitHub

```bash
git add .
git commit -m "ELECTROMEL ERP v5.2"
git push origin main
```

### 4. Activar GitHub Pages

- Settings → Pages → Deploy from branch → `main` → `/ (root)`
- La app estará en: `https://TU_USUARIO.github.io/electromel/`

---

## Instalar como PWA en Android

1. Abrir la URL en Chrome Android
2. Menú ⋮ → "Agregar a pantalla de inicio"
3. Confirmar instalación
4. La app funciona como app nativa (fullscreen, sin barras de Chrome)

---

## Personalización

### Datos de la empresa y logo
- Config → Datos de la Empresa
- El logo se guarda en IndexedDB y aparece en todos los PDFs

### Cambiar colores
```css
/* css/variables.css */
--acento:  #e8a020;  /* Dorado principal */
--bg:      #0f0f0f;  /* Fondo oscuro */
--exito:   #4caf7d;  /* Verde */
--peligro: #e05050;  /* Rojo */
```

### Configuración inteligente
- Config → Motor inteligente
- Ajustar mínimos de ganancia, precio por base (SMA/NQN), horas/día

---

## Módulos del sistema

| Módulo | Acceso | Descripción |
|--------|--------|-------------|
| ING | FAB → Ingreso | Recepción de equipos, ticket 57mm, etiqueta QR |
| OTT | Desde ING | Orden de Trabajo Taller, diagnóstico, garantía |
| OTE | FAB → Exterior | Orden de Trabajo Exterior (viajes NQN/SMA) |
| PRE | FAB → Presupuesto | Presupuestos con conversión a OTE |
| Agenda | Tab Agenda | Turnos, score IQ, evaluación viaje NQN |
| Panel | Tab Panel | Vista semáforo de todos los trabajos activos |
| Admin | Tab Admin | Contabilidad, stock, alquileres, audit log |
| Config | Tab Config | Empresa, WA, plantillas, backup, reset |

---

## Sistema de garantías

- Al entregar una OTT se calcula automáticamente `fecha_fin_garantia`
- Al ingresar un equipo: checkbox "Reingreso por garantía" → verificación en vivo
- El sistema autocompleta datos del cliente y equipo desde la OTT original
- PDF de OTT con garantía incluye banda roja diferenciada
- La OTT de garantía puede convertirse en OTT normal con cobro

---

## Sistema multimedia (offline)

```js
// Montar widget de fotos en cualquier formulario
mountPhotoWidget(containerEl, 'OTT-0042', 'OTT');

// Abrir visor fullscreen
openViewer('OTT-0042', 0);
```

- Hasta 7 fotos por registro
- Compresión automática: thumb 200px · preview 800px · full 1920px (WEBP/JPEG)
- DB separada `electromelMediaDB` — no interfiere con datos del ERP
- Limpieza LRU automática al superar 200MB

---

## Arquitectura técnica

### Sin bundler, sin build

- Chrome Android 80+ soporta `type="module"` nativamente
- GitHub Pages sirve estático sin compilación
- Service Worker v5.2 cachea todos los 85+ módulos individualmente

### Offline-first

1. Primera carga (con internet): SW cachea app shell + CDN libs
2. Desde la segunda carga: 100% offline, cero red
3. PDF, QR, WhatsApp: funcionan sin conexión
4. Datos en IndexedDB local — nunca salen del dispositivo

### Performance Android

- Task queue con `requestIdleCallback` → sin freeze de UI
- RAF batcher en renders de panel → sin repaints duplicados
- Virtual scroll preparado para 1000+ registros
- Lazy import de módulos pesados (IQ analytics, PDF, viewer)
- Memory LRU para Blob URLs de imágenes

---

## Créditos

Sistema desarrollado para **ELECTROMEL**  
Servicio Técnico & Electrónica Industrial  
San Martín de los Andes / Neuquén, Argentina
