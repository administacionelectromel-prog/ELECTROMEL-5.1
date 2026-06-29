# 🎯 ELECTROMEL ERP — Plan hacia la v6 (app terminada)

## Meta

Llegar a la **v6**: app **estable, completa y lista para escalar** a 3.000+ reparaciones, lista para publicar y captar clientes, con la app nativa como paso final.

**Premisa de volumen real:** ~40 equipos/mes hoy sin publicidad (~480/año). Con publicidad, los 3.000 registros llegan en 2-3 años. La app debe estar lista para ese volumen **antes** de que llegue.

**Plazo estimado:** 2-3 meses a ritmo tranquilo. Una versión por vez, probada en el taller antes de la siguiente.

**Prioridades (en orden):**
1. Estable y completa, lista para 3.000+ registros
2. Lista para publicar y captar clientes
3. App nativa funcionando

---

## Estado actual: v5.5

Ya hecho y validado (análisis profundo A-Z pasado):

**Funcionalidad (v5.3 → v5.5):**
- Mantenimientos programados + visita técnica rápida
- Bases y zonas configurables con costo de viaje por ciudad
- Campo ciudad en turnos (alimenta el cálculo de viaje)
- Fotos por trabajo (ING, OTT, OTE) con compresión automática
- Fotos accesibles también desde la tarjeta del panel
- Fotos incluidas en el PDF de la OTT
- QR de la etiqueta apunta a la ficha del equipo (cámara normal o lector interno)
- Datos de pago en PDF de OTT, OTE y PRE
- % de adelanto dinámico en PDF
- Recordatorio de mantenimientos al abrir la app

**Estabilidad (v5.5):**
- Reindexación de clientes antiguos (Config → Reconstruir índice)
- Validación de formularios antes de guardar (ING: nombre+tel+falla; OTT: nombre+total; OTE/PRE: nombre+servicio; PRE: al menos un ítem)
- Mensajes de error claros (traducción de errores técnicos)
- Fix de los modales de éxito de ING y OTT (mostraban sin resumen)

**Rendimiento (v5.5):**
- Paginación del panel (50 por página + "Ver más") — listo para cientos de registros
- Búsqueda incremental con debounce (número, cliente, equipo, marca, modelo, falla)

**Respaldo:**
- Backup export/import en JSON con fecha y hora en el nombre

**Preparado (dormido):**
- Workers (analytics, compresión, pdf) y virtual-list construidos
- Campos de Google Drive en Config

---

## Decisiones pendientes (definir con la app rodando)

- **Drive para fotos:** las fotos ya van en el PDF, así que para respaldo visual el PDF alcanza. Drive quedaría para evaluar después.
- **Drive para backup automático:** sería la protección real ante pérdida del teléfono. A definir más adelante.

---

## ✅ v5.5 — Estabilidad + rendimiento (COMPLETADA)

Cerrada con análisis profundo A-Z. Incluyó: reindexación de clientes, validaciones, mensajes de error claros, paginación, búsqueda incremental, fotos en PDF, recordatorio de mantenimientos, fix de modales de éxito.

---

## v5.6 — Índices de IndexedDB (cimiento para escala)

**Decisión técnica clave. Hacerla con pocos datos, mientras es trivial.**

- Definir bien los índices para búsquedas y filtros por año/estado.
- Cambiar índices con pocos registros es simple; con miles es una migración delicada.
- Requiere subir DB v13 → v14 con migración. **Backup fresco obligatorio antes.**
- Probar con cuidado antes de confiar.

---

## v5.7 — Organización de datos por año

**Llega pronto con 40/mes: el primer año completo de datos está a la vuelta.**

- Filtrar reparaciones por año en las consultas (año activo por defecto).
- Acceso al histórico de años anteriores cuando se necesite.
- Mantener solo el año activo en pantalla al iniciar.

**Nota técnica:** IndexedDB no carga todo en memoria — solo lo que se pide. Conviene filtrar por año en las consultas antes que separar físicamente los datos. La estructura de carpetas por año aplica a Drive, no a la base interna.

---

## v5.8 — Panel de métricas

**Con volumen real, las métricas se vuelven decisiones de negocio.**

Indicadores: reparaciones por mes, facturación (mensual/anual), garantías activas, clientes frecuentes, equipos más reparados, tiempo promedio de entrega, rentabilidad por base y tipo de servicio.

**Aprovecha:** el analytics.worker.js (dormido) y los datos que ya se guardan.

---

## v5.9 — Nube y respaldo robusto

- Activar Google Drive (subida de fotos y/o backups). Campos ya previstos.
- Backups automáticos a la nube.
- Carpetas por año en Drive.
- Recordatorios de mantenimientos por WhatsApp (el aviso en pantalla ya existe).

---

## v6.0 — App terminada + nativa

**La corona. Solo cuando todo lo anterior esté sólido y probado.**

- Revisión final de estabilidad con volumen real de datos.
- Calidad de código: módulos independientes (un módulo = una responsabilidad), sin duplicados, funciones documentadas, sin archivos gigantes.
- Conversión de PWA a **app nativa**: mejor acceso a cámara, GPS, notificaciones push, almacenamiento.
- Lista para publicar y captar clientes nuevos.

---

## Mejoras de motor pendientes (encajar donde corresponda)

Definidas en conversaciones previas, para sumar cuando la base esté estable:

- **Motor de viaje por período:** bolsa de gastos reales (costo diario × días + pasaje), repartida proporcional al ingreso entre los trabajos del viaje. Separar días productivos de muertos. Viático real (egreso) vs cobrado (ingreso). Mide conveniencia del viaje completo, no trabajo por trabajo.
- **Geolocalización asistida:** GPS propone (no impone) base activa y ciudad del trabajo, con confirmación y campo manual de respaldo. Detección de base funciona offline; sugerencia de ciudad necesita internet.
- **Botón "Ir a Maps":** abre Google Maps por coordenadas exactas o dirección. Captura de coordenadas por GPS o pegando link del cliente. Reutilizable en mantenimientos.
- **Fotos en los PDF:** antes/después de la reparación en el PDF de la OTT.

---

## Principios que sostienen el plan

1. **Una mejora por vez, probada en el taller antes de la siguiente.** Es lo que evita acumular bugs.
2. **Estabilizar antes de escalar.** Una base con bugs escala los bugs.
3. **Preparar para el volumen antes de que llegue.** Con 40+/mes, el volumen no espera.
4. **Subir siempre el ZIP completo** cuando cambia la base de datos, para evitar versiones mezcladas.
5. **Backup antes de cada actualización** que toque la estructura de datos.

---

*Documento vivo. Se actualiza al completar cada versión.*
