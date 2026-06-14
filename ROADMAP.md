# 🛠️ ELECTROMEL ERP — Roadmap de mejoras

Estado actual: **v5.4** (mantenimientos programados, visita técnica rápida, bases y zonas configurables, costo de viaje por ciudad, fotos por trabajo, Google Drive previsto).

Principio rector: **una mejora por vez, probada en el taller antes de la siguiente.** Meter mucho junto es lo que genera bugs difíciles de rastrear.

---

## Etapa 1 — Estabilizar (AHORA)

Antes de sumar nada nuevo:

- Usar la v5.4 con trabajos reales unas semanas.
- Cargar las ciudades en Config → Bases y zonas (con sus costos de viaje).
- Confirmar que la base de datos migró bien y que los trabajos siguen todos.
- Aplicar la corrección del backup de pagos parciales (herramienta `corregir-backup.html`).
- Cuando todo esté confirmado estable: quitar el capturador de errores rojo del `index.html`.

---

## Etapa 2 — Recordatorios automáticos + WhatsApp

Los mantenimientos ya existen, pero hoy hay que entrar a mirarlos.

- Aviso automático en pantalla cuando un mantenimiento vence en ≤ 7 días.
- Botón para mandar el recordatorio al cliente por WhatsApp (ya existe `whatsapp.js` y plantillas configurables).
- Recordatorio de garantías por vencer (ya existe `garantia.js`).

**Valor:** genera trabajo recurrente sin esfuerzo.

---

## Etapa 3 — Fotos en los PDF

Ya se sacan fotos del equipo (v5.4).

- Que las fotos aparezcan en el PDF de la OTT (antes / después de la reparación).

**Valor:** profesionalismo y respaldo del trabajo entregado al cliente.

---

## Etapa 4 — Activar Google Drive

Los campos de conexión ya están previstos en Config (v5.4).

- Conectar de verdad la subida automática de fotos y backups.
- Las fotos ya guardan el campo `subida_drive` para saber cuáles faltan subir.

**Valor:** respaldo seguro aunque se pierda el teléfono.

---

## Etapa 5 — Botón "Ir a Maps" en el turno

Para ir manejando directo al trabajo.

- El turno muestra un botón que abre Google Maps:
  - Si hay **coordenadas guardadas** → abre el punto exacto.
  - Si solo hay **dirección de texto** → abre Maps buscando esa dirección.
- Cargar coordenadas de dos formas:
  - **"Usar mi ubicación actual"** (GPS, funciona sin internet).
  - **Pegar link de Maps** que pasa el cliente por WhatsApp.
- Las coordenadas guardadas se reutilizan en los mantenimientos del mismo cliente.

**Nota técnica:** de las más fáciles y robustas. Abrir Maps y capturar GPS funcionan sin señal. Solo "pegar link" depende de que el cliente lo mande.

---

## Etapa 6 — Geolocalización asistida

Para evitar cargar a mano dónde estás.

- El sistema **propone** (no impone) y vos **confirmás**:
  - Al abrir la app: "¿Estás operando desde NQN?" → detecta la base activa.
  - Al agendar: "¿El trabajo es en Cipolletti?" → sugiere la ciudad.
- Campo manual de respaldo siempre disponible.
- Si no hay GPS/señal, funciona como ahora (carga manual). Degradación elegante.

**Nota técnica:** detectar la base (estás en NQN sí/no) es matemática simple con un radio alrededor de cada base — **funciona offline**. Traducir GPS a nombre de ciudad necesita internet. Así que la detección de base anda siempre; la sugerencia de ciudad, solo con señal.

---

## Etapa 7 — Motor de viaje por período (la mejora grande del motor)

Reemplaza el cálculo actual (costo fijo por ciudad, contado por trabajo), que duplica el viaje cuando hacés varios trabajos en una misma salida.

### Cómo funciona

- Configurás un **costo diario** (hospedaje + comida) y el **pasaje/combustible** del viaje.
- El sistema calcula la **bolsa total del viaje**:

  ```
  Bolsa total = (costo diario × días totales del viaje) + pasaje/combustible
  ```

- La bolsa se reparte entre los trabajos del período, **proporcional al ingreso** de cada uno (el que más factura, más viaje absorbe).

### Días productivos vs días muertos

- El viaje se divide en días productivos (con trabajo) y días muertos (sin trabajo).
- Los días muertos **igual entran en la bolsa** — encarecen el viaje, los trabajos los absorben.
- El sistema muestra el **costo de los días muertos** como información para decidir si la próxima conviene quedarse menos días o agendar más trabajo.

### Dos viáticos separados

- **Viático real** (lo que VOS gastás) → se contabiliza como **egreso**. Es lo que se reparte.
- **Viático cobrado al cliente** → se contabiliza como **ingreso** al cobrarlo. NO entra en el reparto de costo.

### Métricas que muestra

- **Conveniencia del viaje:** total cobrado de todos los trabajos − bolsa total. ¿Valió la pena ir?
- **Costo de días muertos:** costo diario × días sin trabajo.

### Ejemplo

Viaje de 5 días a Aluminé, 2 trabajos, 2 días trabajados, 3 días muertos.
Costo diario $X, pasaje $Y → bolsa = X×5 + Y.
La bolsa se reparte entre los 2 trabajos según cuánto facturó cada uno.

**Por qué importa:** mide la rentabilidad del **viaje completo**, no trabajo por trabajo. Un trabajo solo capaz no paga el viaje; varios juntos sí. Es la decisión real que se toma.

**Nota:** cambio grande al motor. Toca cómo se cargan gastos, cómo se agrupan trabajos por período, y el cálculo de score. Va después de que todo lo anterior esté estable.

---

## Etapa 8 — Rendimiento

Solo cuando haya cientos de registros.

- Activar los workers que ya están preparados pero dormidos: `analytics.worker.js`, `image-compress.worker.js`, `pdf.worker.js`.
- Activar la `virtual-list` para que el panel vuele con mucho volumen.

**Valor:** optimización. No urgente hasta tener volumen real.

---

## Etapa 9 — App nativa (el gran paso)

Una vez que todo lo anterior esté sólido y probado en el taller.

- Convertir la PWA en app nativa.
- Mejor acceso a cámara, GPS, notificaciones, almacenamiento.

---

## Mejoras menores / pendientes sueltas

- Completar features no críticas que quedaron con `?.` (ej: `ott-es-garantia`, `pre-descuento`).
- Revisar y depurar el flujo de la base de fallas técnica.

---

*Documento de referencia. Se va actualizando a medida que se completan etapas.*
