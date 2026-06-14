# 📋 ELECTROMEL — Mejoras pendientes (actualizado)

Estado actual: **v6.0** (base única SMA + zonas, completada y validada).

Este documento junta todo lo que fuimos viendo para mejorar, ordenado por tamaño y prioridad.

---

## ✅ Ya hecho en esta etapa

- Reindexación de clientes antiguos
- Validación de formularios (ING: nombre+tel+falla; OTT/OTE/PRE)
- Mensajes de error claros
- Paginación del panel + búsqueda incremental
- Fix de modales de éxito (resumen + botones que se cortaban)
- Rediseño completo a base única SMA + zonas (4 capas)
- Tipo de servicio del turno (servicios a domicilio)
- Mantenimiento con autocompletado de cliente + caso gimnasio (texto)
- QR de etiqueta → ficha del equipo
- Fotos desde el panel y en el PDF de OTT
- **Etiqueta y ticket como imagen PNG B/N** (para que la térmica los tome bien)

---

## 🔧 Pulido / próxima tanda (mejoras chicas, van juntas)

Estas tres son del mismo flujo "mantenimiento → turno/OTE con datos integrados":

1. **Cliente/equipo del mantenimiento integrado con Nuevo Turno**
   - Autocompletado al escribir (ya enganchado, falta alinear el pase de datos).
   - Un cliente se carga una vez y se reutiliza en todos los formularios.

2. **Agendar turno desde la ficha del mantenimiento**
   - El mantenimiento define la periodicidad (cada X meses).
   - Desde su ficha, botón "Agendar turno" que crea el turno en la agenda con los datos ya cargados (cliente, equipo, zona).
   - El mantenimiento define el "cada cuánto"; la agenda recibe el "cuándo concreto".

3. **Mejorar el pase de datos OTE-desde-mantenimiento**
   - Hoy genera OTE pero pasa `base` y no `zona` (quedó desalineado con el modelo v6).
   - Que arrastre la zona y el cliente vinculado.

---

## 🟡 Roadmap de crecimiento (medianas)

4. **Datos por año** — filtrar reparaciones por año (índices ya listos de la v6).
5. **Panel de métricas** — facturación, equipos más reparados, tiempo de entrega, clientes frecuentes, garantías activas.
6. **Nube y respaldo** — Google Drive para backup automático (protección ante pérdida del teléfono). Campos ya previstos en Config.
7. **App nativa** — la meta técnica.

---

## 💳 Sistema de ABONO (mejora grande — NECESIDAD ACTUAL)

**Ya es una necesidad real:** hay más de 10 clientes a los que se les cobra cuota mensual.

Modelo validado con prototipo:
- **Cuota fija** que el cliente paga use o no la visita (suscripción).
- **Cuota distinta por cliente** según lo que incluya el abono.
- **Periodicidad variable** (mensual, trimestral, etc. según el cliente).

El sistema debe:
- **Buscador** de clientes con abono (en vivo, por nombre/equipo/zona).
- **Control de cobros**: quién está al día, quién debe y cuánto, qué vence este mes.
- Resumen: total de clientes, a cobrar por mes, total adeudado.
- Por cliente: cuota, qué incluye, meses pagados/adeudados (vista de tira de meses).
- Acciones: registrar pago, agendar visita (conecta con agenda), ver historial.
- **Generación automática de visitas** según el período del abono.

**Tamaño:** es la función más grande de todas — toca clientes, finanzas, agenda y mantenimientos. Conviene su propia versión, construida por partes:
1. Registro de clientes con abono + buscador + control de cobros (la necesidad inmediata).
2. Conexión con agenda (agendar visita desde la ficha).
3. Generación automática de visitas según período.

---

## 🖨️ Otras mejoras anotadas

- **Caso gimnasio completo — FLOTA DE MÁQUINAS (mejora grande, modelo definido):**
  Para clientes con muchas máquinas (gimnasios, obras). Reemplaza el texto suelto "Gimnasio X — 6 máquinas" por una lista real de máquinas.
  - Al cargar el cliente, cada máquina es un **ítem**: marca, modelo y número/identificación.
  - Al hacer el mantenimiento, se genera un **OTE con la lista de máquinas**, cada una con:
    - **Tilde** (se le hizo el service o no)
    - **Estado**: OK / Observación / Baja
  - Las máquinas dadas de **baja salen de la lista** para el próximo mantenimiento (no reaparecen).
  - El cliente queda con ese OTE como **constancia** de qué se atendió y qué se dio de baja.
  - **Encaja con el sistema de abonos**: los gimnasios-flota suelen ser clientes de abono. El abono define el cobro; la flota define qué se mantiene en cada visita.
  - **Tamaño**: grande, del orden del módulo de abonos. Su propia versión, por partes, con backup.

---

## 🎯 Meta final — DOS VERSIONES

- **"ELECTROMEL"** — tu taller (versión propia, tu marca y datos).
- **"Real de 8"** — versión para talleres amigos (por la moneda de plata de la corona española, que circulaba por todo el mundo).

**Para que esto sea posible y limpio:** ir sacando del código lo que esté hardcodeado (nombre, logo, datos de empresa) y llevándolo a Config. Así "Real de 8" es la misma app base con otra identidad cargada, y mejorar una mejora las dos.

---

## Decisiones pendientes (a definir con la app rodando)

- Drive para fotos: probablemente innecesario (ya van en el PDF). Drive para backup sí aporta.
- Score en vivo del turno: usa costo por ciudad como estimación; el análisis preciso con bolsa va en el dashboard.

---

## Principios que mantenemos

1. Una mejora por vez, probada en el taller antes de la siguiente.
2. Estabilizar antes de escalar.
3. Cambios grandes → por capas, validando cada una.
4. Backup antes de cualquier cambio que toque la base de datos.
5. ZIP completo cuando cambia la estructura.

---

*Documento vivo. Actualizado en la sesión del rediseño v6.*
