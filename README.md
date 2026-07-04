# 🔧 ELECTROMEL ERP 2.0

Sistema de gestión del taller ELECTROMEL (San Martín de los Andes): soldadoras inverter, cintas de correr y equipos de gimnasio.

**2.0 = PWA + App Android.** El mismo código corre como web instalable (GitHub Pages) y como APK nativo (Capacitor), compilado automáticamente por GitHub Actions en cada actualización.

## Qué hace
Ingresos con etiqueta QR · Órdenes de taller (OTT) y exterior (OTE) · Presupuestos · Agenda de turnos con recordatorios (APK) · Caja con repuestos internos por orden · Por cobrar · PDFs para el cliente · WhatsApp integrado · 📈 Campañas (origen de clientes, costo por cliente y ROI) · Backups versionados con verificación de integridad · Modo Maestro con PIN · 100% offline.

## Stack
Vanilla JS (módulos ES6) · IndexedDB · Service Worker (web) · Capacitor 6 (Android). Sin frameworks, sin build para la web.

## Estructura
```
index.html · sw.js · manifest.json · libs/ (jsPDF, QR — locales)
js/
├─ core/        db, estado, utilidades, estados de órdenes
├─ services/    caja, PDFs, backup, seguridad, notificaciones, files, WhatsApp
├─ modules/     panel, agenda, ING/OTT/OTE/PRE, admin, campañas, config
├─ components/  piezas UI (modal, cámara, galería…)
└─ workers/     tareas en segundo plano
```

## APK
Cada push compila un APK debug vía `.github/workflows/build-apk.yml` y lo publica en **Releases**. También compilable localmente: `npm install` → copiar la web a `www/` → `npx cap add android && npx cap sync android` → Android Studio.

## Versionado
- Versión visible: **2.0** (cambia solo en saltos grandes)
- Cache del SW: `electromel-v2-0a` (sube una letra por iteración)
- Base de datos: `DB_VERSION 17` (sube solo si cambia el esquema; migración automática)
